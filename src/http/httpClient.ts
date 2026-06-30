// GuildPass SDK: Pull in package or module bindings.
import { GuildPassError } from '../errors/GuildPassError';
// GuildPass SDK: Import external module dependencies.
import { GuildPassErrorCode } from '../errors/errorCodes';
// GuildPass SDK: Pull in package or module bindings.
import {
  ClientMetadata,
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

  if (!headers) return redacted;

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

function resolveRetry(
  global: RetryConfig | undefined,
  local: RetryConfig | undefined,
): Required<RetryConfig> {
  const merged = { ...global, ...local };

  const maxRetries = merged.maxRetries ?? 0;
  const baseDelayMs = merged.baseDelayMs ?? 200;
  const maxDelayMs = merged.maxDelayMs ?? 5000;
  const retryableStatuses = merged.retryableStatuses ?? DEFAULT_RETRYABLE_STATUSES;
  const allowMutatingRetry = merged.allowMutatingRetry ?? false;

  // FAIL FAST VALIDATION 
  if (!Number.isFinite(maxRetries) || maxRetries < 0) {
    throw new GuildPassError(
      'Invalid retry config: maxRetries must be a non-negative finite number',
      GuildPassErrorCode.INVALID_CONFIG,
    );
  }

  if (!Number.isFinite(baseDelayMs) || baseDelayMs < 0) {
    throw new GuildPassError(
      'Invalid retry config: baseDelayMs must be a non-negative finite number',
      GuildPassErrorCode.INVALID_CONFIG,
    );
  }

  if (!Number.isFinite(maxDelayMs) || maxDelayMs < 0) {
    throw new GuildPassError(
      'Invalid retry config: maxDelayMs must be a non-negative finite number',
      GuildPassErrorCode.INVALID_CONFIG,
    );
  }

  if (maxDelayMs < baseDelayMs) {
    throw new GuildPassError(
      'Invalid retry config: maxDelayMs cannot be less than baseDelayMs',
      GuildPassErrorCode.INVALID_CONFIG,
    );
  }

  if (
    !Array.isArray(retryableStatuses) ||
    retryableStatuses.length === 0 ||
    retryableStatuses.some((s) => typeof s !== 'number')
  ) {
    throw new GuildPassError(
      'Invalid retry config: retryableStatuses must be a non-empty array of status codes',
      GuildPassErrorCode.INVALID_CONFIG,
    );
  }

  return {
    maxRetries,
    baseDelayMs,
    maxDelayMs,
    retryableStatuses,
    allowMutatingRetry,
  };
}

function getRetryAfterMs(headers: Headers): number | null {
  if (!headers || typeof headers.get !== 'function') return null;
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

function isJsonContentType(contentType: string | null): boolean {
  if (!contentType) return true;
  return contentType.toLowerCase().includes('application/json');
}

function buildInvalidResponseError(
  response: Response,
  reason: 'unexpected_content_type' | 'malformed_json',
): GuildPassError {
  const contentType = response.headers?.get ? response.headers.get('Content-Type') : null;
  const message = reason === 'unexpected_content_type'
    ? `Invalid response: expected JSON but received ${contentType || 'unknown content type'}`
    : 'Invalid response: received malformed JSON';

  return new GuildPassError(
    message,
    GuildPassErrorCode.INVALID_RESPONSE,
    response.status,
    {
      reason,
      contentType,
    },
  );
}

async function parseJsonResponse<T>(response: Response): Promise<T> {
  try {
    return await response.json() as T;
  } catch (error) {
    if (isEmptyJsonBodyError(error)) {
      return undefined as T;
    }
    throw buildInvalidResponseError(response, 'malformed_json');
  }
}

async function parseSuccessResponse<T>(response: Response): Promise<T> {
  const contentLength = response.headers?.get ? response.headers.get('Content-Length') : null;
  if (response.status === 204 || response.status === 205 || contentLength === '0') {
    return undefined as T;
  }

  const contentType = response.headers?.get ? response.headers.get('Content-Type') : null;
  if (!isJsonContentType(contentType)) {
    throw buildInvalidResponseError(response, 'unexpected_content_type');
  }

  return parseJsonResponse<T>(response);
}

async function parseErrorResponse(response: Response): Promise<unknown> {
  const contentLength = response.headers?.get ? response.headers.get('Content-Length') : null;
  if (response.status === 204 || response.status === 205 || contentLength === '0') {
    return null;
  }

  const contentType = response.headers?.get ? response.headers.get('Content-Type') : null;
  if (!isJsonContentType(contentType)) {
    return {
      code: GuildPassErrorCode.INVALID_RESPONSE,
      message: 'Endpoint returned a non-JSON error response',
      meta: {
        contentType,
      },
    };
  }

  try {
    return await response.json();
  } catch {
    return {
      code: GuildPassErrorCode.INVALID_RESPONSE,
      message: 'Endpoint returned malformed JSON in an error response',
      meta: {
        contentType,
      },
    };
  }
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
  private readonly metadata?: ClientMetadata;

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
        this.metadata = configOrHooks.metadata;
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
    const {
      method = 'GET',
      headers = {},
      body,
      params,
      timeoutMs = this.timeoutMs,
      retry,
      signal,
    } = options;

    const isAbsolute = path.startsWith('http://') || path.startsWith('https://');

    const requestHeaders: Record<string, string> = {
      'Content-Type': 'application/json',
      ...(this.apiKey && !isAbsolute ? { 'X-API-Key': this.apiKey } : {}),
      ...headers,
    };

    // Attach client metadata headers only for GuildPass API-relative requests.
    // Absolute external URLs never receive metadata headers.
    if (!isAbsolute && this.metadata?.sendClientMetadata !== false) {
      const sdkVersion = this.metadata?.sdkVersion;
      if (sdkVersion && sdkVersion.length > 0) {
        requestHeaders['X-GuildPass-SDK-Version'] = sdkVersion;
      }

      const clientParts: string[] = [];
      if (this.metadata?.clientName && this.metadata.clientName.length > 0) {
        clientParts.push(this.metadata.clientName);
      }
      if (this.metadata?.clientVersion && this.metadata.clientVersion.length > 0) {
        clientParts.push(this.metadata.clientVersion);
      }
      if (clientParts.length > 0) {
        requestHeaders['X-GuildPass-Client'] = clientParts.join('/');
      }
    }

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

    const url = isAbsolute
      ? new URL(path)
      : new URL(`${this.baseUrl}${path.startsWith('/') ? path : `/${path}`}`);

    if (params) {
      Object.entries(params).forEach(([key, value]) => {
        url.searchParams.append(key, String(value));
      });
    }

    let attempt = 0;

    while (true) {
      const controller = new AbortController();
      const timeoutId = setTimeout(() => {
        controller.abort();
      }, timeoutMs);

      let onAbort: (() => void) | undefined;
      if (signal) {
        onAbort = () => {
          controller.abort();
        };
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

          const errorData = await parseErrorResponse(response);
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
