// GuildPass SDK: Pull in package or module bindings.
import { GuildPassError } from '../errors/GuildPassError';
// GuildPass SDK: Import external module dependencies.
import { GuildPassErrorCode } from '../errors/errorCodes';
// GuildPass SDK: Pull in package or module bindings.
import {
  FetchLike,
  HttpClientConfig,
  HttpHooks,
  HttpRequestOptions,
  HttpResponse,
  RequestHookPayload,
  RetryConfig,
} from './http.types';

const IDEMPOTENT_METHODS = new Set(['GET', 'HEAD', 'OPTIONS', 'PUT', 'DELETE']);
const DEFAULT_RETRYABLE_STATUSES = [429, 500, 502, 503, 504];
const SENSITIVE_HEADERS = new Set(['authorization', 'x-api-key', 'cookie', 'set-cookie']);

export function redactHeaders(headers: Headers | Record<string, string>): Record<string, string> {
  const redacted: Record<string, string> = {};
  
  if (headers instanceof Headers) {
    headers.forEach((value, key) => {
      redacted[key] = SENSITIVE_HEADERS.has(key.toLowerCase()) ? '[REDACTED]' : value;
    });
  } else {
    Object.entries(headers).forEach(([key, value]) => {
      redacted[key] = SENSITIVE_HEADERS.has(key.toLowerCase()) ? '[REDACTED]' : value;
    });
  }
  return redacted;
}

function resolveRetry(global: RetryConfig | undefined, local: RetryConfig | undefined): Required<RetryConfig> {
  const merged = { ...global, ...local };
  return {
    maxRetries: merged.maxRetries ?? 0,
    baseDelayMs: merged.baseDelayMs ?? 200,
    maxDelayMs: merged.maxDelayMs ?? 5000,
    retryableStatuses: merged.retryableStatuses ?? DEFAULT_RETRYABLE_STATUSES,
    allowMutatingRetry: merged.allowMutatingRetry ?? false,
  };
}

function getRetryAfterMs(headers: Headers): number | null {
  const header = headers.get('Retry-After');
  if (!header) return null;
  const seconds = Number(header);
  if (!isNaN(seconds)) return seconds * 1000;
  const date = Date.parse(header);
  if (!isNaN(date)) return Math.max(0, date - Date.now());
  return null;
}

function delay(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function isEmptyJsonBodyError(error: unknown): boolean {
  return error instanceof SyntaxError && /unexpected end of json input/i.test(error.message);
}

function isRetryConfig(config: RetryConfig | HttpHooks | HttpClientConfig): config is RetryConfig {
  return 'maxRetries' in config ||
    'baseDelayMs' in config ||
    'retryableStatuses' in config ||
    'allowMutatingRetry' in config;
}

function isHooksConfig(config: RetryConfig | HttpHooks | HttpClientConfig): config is HttpHooks {
  return 'onRequest' in config || 'onResponse' in config || 'onError' in config;
}

/**
 * Inspect the Content-Type header and parse the response body accordingly.
 * For successful responses: return parsed JSON if content type is JSON, undefined for empty/no-content, or throw INVALID_CONTENT_TYPE for non-JSON.
 * For error responses: return parsed JSON if available, or null with a descriptive INVALID_CONTENT_TYPE error.
 */
function getContentTypeCategory(headers: Headers): 'json' | 'other' {
  const contentType = headers.get('Content-Type');
  if (!contentType) return 'other'; // No content-type header — treat as unknown
  if (contentType.includes('application/json')) return 'json';
  return 'other';
}

async function parseSuccessResponse<T>(response: Response): Promise<T> {
  if (response.status === 204 || response.status === 205 || response.headers.get('Content-Length') === '0') {
    return undefined as T;
  }

  const contentTypeCategory = getContentTypeCategory(response.headers);

  // Content-Type indicates JSON — parse normally
  if (contentTypeCategory === 'json') {
    try {
      return await response.json() as T;
    } catch (error) {
      if (isEmptyJsonBodyError(error)) {
        return undefined as T;
      }
      throw new GuildPassError(
        `Response declared application/json but body could not be parsed: ${error instanceof Error ? error.message : String(error)}`,
        GuildPassErrorCode.INVALID_RESPONSE,
        response.status,
      );
    }
  }

  // Content-Type is something other than JSON (HTML, text, etc.)
  if (contentTypeCategory === 'other') {
    const contentType = response.headers.get('Content-Type') || 'missing';
    // Try parsing as JSON anyway — some servers send JSON with wrong content-type
    try {
      const data = await response.json() as T;
      // Parsed OK despite wrong content-type — return data but this is a server issue
      return data;
    } catch {
      // Not JSON — throw a clear error
      throw new GuildPassError(
        `Expected application/json response but received Content-Type: ${contentType}`,
        GuildPassErrorCode.INVALID_CONTENT_TYPE,
        response.status,
      );
    }
  }

  return undefined as T;
}

/**
 * Parse an error response body, respecting Content-Type.
 * Returns the parsed JSON if available, or null with a descriptive INVALID_CONTENT_TYPE error thrown.
 */
async function parseErrorResponse(response: Response): Promise<any> {
  const contentTypeCategory = getContentTypeCategory(response.headers);

  if (contentTypeCategory === 'json') {
    try {
      return await response.json();
    } catch {
      return null;
    }
  }

  if (contentTypeCategory === 'other') {
    const contentType = response.headers.get('Content-Type') || 'missing';
    // Not JSON — return null so fromHttpError produces a generic message
    // but include content-type info in the details
    try {
      return await response.json();
    } catch {
      return null;
    }
  }

  return null;
}

// GuildPass SDK: Exposed interface structure.
export class HttpClient {
  // GuildPass SDK: Class member structure property or constructor.
  private readonly baseUrl: string;
  // GuildPass SDK: Class member structure property or constructor.
  private readonly apiKey?: string;
  // GuildPass SDK: Class member structure property or constructor.
  private readonly timeoutMs: number;
  // GuildPass SDK: Class member structure property or constructor.
  private readonly globalRetry?: RetryConfig;
  // GuildPass SDK: Class member structure property or constructor.
  private readonly hooks?: HttpHooks;
  private readonly fetchTransport?: FetchLike;

  // GuildPass SDK: Class member structure property or constructor.
  constructor(
    baseUrl: string,
    apiKey?: string,
    timeoutMs = 10000,
    configOrHooks?: RetryConfig | HttpHooks | HttpClientConfig,
  ) {
    this.baseUrl = baseUrl.endsWith('/') ? baseUrl.slice(0, -1) : baseUrl;
    this.apiKey = apiKey;
    this.timeoutMs = timeoutMs;

    // Discriminate between RetryConfig and HttpHooks
    if (configOrHooks) {
      if ('fetch' in configOrHooks || 'retry' in configOrHooks || 'hooks' in configOrHooks) {
        this.globalRetry = configOrHooks.retry;
        this.hooks = configOrHooks.hooks;
        this.fetchTransport = configOrHooks.fetch;
      } else if (isRetryConfig(configOrHooks)) {
        this.globalRetry = configOrHooks;
      } else if (isHooksConfig(configOrHooks)) {
        this.hooks = configOrHooks;
      }
    }
  }

  // GuildPass SDK: Class member structure property or constructor.
  public async get<T>(
    path: string,
    options?: Omit<HttpRequestOptions, 'method' | 'body'>,
  ): Promise<T> {
    const response = await this.request<T>(path, { ...options, method: 'GET' });
    return response.data;
  }

  // GuildPass SDK: Class member structure property or constructor.
  public async post<T>(
    path: string,
    body?: any,
    options?: Omit<HttpRequestOptions, 'method' | 'body'>,
  ): Promise<T> {
    const response = await this.request<T>(path, { ...options, method: 'POST', body });
    return response.data;
  }

  // GuildPass SDK: Class member structure property or constructor.
  private async request<T>(
    path: string,
    options: HttpRequestOptions = {},
  ): Promise<HttpResponse<T>> {
    const { method = 'GET', headers = {}, body, params, timeoutMs = this.timeoutMs, retry, signal } = options;

    const requestHeaders: Record<string, string> = {
      'Content-Type': 'application/json',
      ...(this.apiKey ? { 'X-API-Key': this.apiKey } : {}),
      ...headers,
    };

    const retryConfig = resolveRetry(this.globalRetry, retry);
    const canRetry =
      retryConfig.maxRetries > 0 &&
      (IDEMPOTENT_METHODS.has(method) || retryConfig.allowMutatingRetry);

    if (signal?.aborted) {
      throw new GuildPassError('Request cancelled by caller', GuildPassErrorCode.REQUEST_CANCELLED);
    }

    const startTime = Date.now();
    const hookPayload: RequestHookPayload = { 
      method, 
      path,
      headers: redactHeaders(requestHeaders),
    };

    if (this.hooks?.onRequest) {
      try {
        await this.hooks.onRequest(hookPayload);
      } catch (err) {
        console.error('GuildPass SDK: onRequest hook failed', err);
      }
    }

    if (signal?.aborted) {
      throw new GuildPassError('Request cancelled by caller', GuildPassErrorCode.REQUEST_CANCELLED);
    }

    const url = new URL(`${this.baseUrl}${path.startsWith('/') ? path : `/${path}`}`);
    if (params) {
      Object.entries(params).forEach(([key, value]) => {
        url.searchParams.append(key, String(value));
      });
    }

    let attempt = 0;

    while (true) {
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), timeoutMs);

      let onAbort: (() => void) | undefined;
      if (signal) {
        onAbort = () => controller.abort();
        signal.addEventListener('abort', onAbort);
      }

      try {
        const transport = this.fetchTransport ?? globalThis.fetch;
        if (typeof transport !== 'function') {
          throw new GuildPassError(
            'A fetch-compatible transport is required.',
            GuildPassErrorCode.INVALID_CONFIG,
          );
        }

        const response = await transport(url.toString(), {
          method,
          headers: requestHeaders,
          body: body ? JSON.stringify(body) : undefined,
          signal: controller.signal,
        });

        clearTimeout(timeoutId);
        if (onAbort) signal!.removeEventListener('abort', onAbort);

        if (!response.ok) {
          const isRetryable = canRetry && retryConfig.retryableStatuses.includes(response.status);
          if (isRetryable && attempt < retryConfig.maxRetries) {
            const retryAfter = getRetryAfterMs(response.headers);
            const backoff = Math.min(retryConfig.baseDelayMs * 2 ** attempt, retryConfig.maxDelayMs);
            await delay(retryAfter ?? backoff);
            attempt++;
            continue;
          }

          let errorData;
          try {
            errorData = await parseErrorResponse(response);
          } catch (ctError: any) {
            // Content-type validation threw — use it directly
            throw ctError;
          }
          throw GuildPassError.fromHttpError(response.status, errorData);
        }

        const data = await parseSuccessResponse<T>(response);
        const durationMs = Date.now() - startTime;

        if (this.hooks?.onResponse) {
          try {
            await this.hooks.onResponse({ 
              ...hookPayload, 
              status: response.status, 
              durationMs,
              responseHeaders: redactHeaders(response.headers)
            });
          } catch (err) {
            console.error('GuildPass SDK: onResponse hook failed', err);
          }
        }

        return {
          data,
          status: response.status,
          headers: response.headers,
        };

      } catch (error: any) {
        clearTimeout(timeoutId);
        if (onAbort) signal!.removeEventListener('abort', onAbort);

        let finalError = error;

        if (error.name === 'AbortError') {
          finalError = signal?.aborted
            ? new GuildPassError('Request cancelled by caller', GuildPassErrorCode.REQUEST_CANCELLED)
            : new GuildPassError(`Request timed out after ${timeoutMs}ms`, GuildPassErrorCode.TIMEOUT);
        } else if (!(error instanceof GuildPassError)) {
          if (canRetry && attempt < retryConfig.maxRetries) {
            const backoff = Math.min(retryConfig.baseDelayMs * 2 ** attempt, retryConfig.maxDelayMs);
            await delay(backoff);
            attempt++;
            continue;
          }

          finalError = new GuildPassError(
            error.message || 'Unknown network error',
            GuildPassErrorCode.HTTP_ERROR,
            undefined,
            error,
          );
        } else if (canRetry && attempt < retryConfig.maxRetries && retryConfig.retryableStatuses.includes(finalError.status)) {
          const backoff = Math.min(retryConfig.baseDelayMs * 2 ** attempt, retryConfig.maxDelayMs);
          await delay(backoff);
          attempt++;
          continue;
        }

        const durationMs = Date.now() - startTime;
        if (this.hooks?.onError) {
          try {
            await this.hooks.onError({ ...hookPayload, error: finalError, durationMs });
          } catch (hookErr) {
            console.error('GuildPass SDK: onError hook failed', hookErr);
          }
        }

        throw finalError;
      }
    }
  }
}
