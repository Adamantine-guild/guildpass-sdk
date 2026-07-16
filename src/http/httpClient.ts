// GuildPass SDK: Pull in package or module bindings.
import { GuildPassError } from '../errors/GuildPassError';
// GuildPass SDK: Import external module dependencies.
import { GuildPassErrorCode } from '../errors/errorCodes';
import type { ResponseMeta } from '../types/common';
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

/** Safe diagnostic headers to expose in response metadata. */
const META_HEADERS: Array<{ headerName: string; metaKey: keyof ResponseMeta }> = [
  { headerName: 'x-request-id', metaKey: 'requestId' },
  { headerName: 'x-correlation-id', metaKey: 'correlationId' },
  { headerName: 'traceparent', metaKey: 'traceparent' },
  { headerName: 'x-trace-id', metaKey: 'traceId' },
];

/**
 * Extracts safe response metadata from a fetch Response object.
 * Only includes non-sensitive headers and timing/status info.
 */
function extractResponseMeta(response: Response, durationMs: number): ResponseMeta {
  const meta: ResponseMeta = {
    status: response.status,
    durationMs,
  };

  for (const { headerName, metaKey } of META_HEADERS) {
    const value = response.headers.get(headerName);
    if (value) {
      (meta as unknown as Record<string, unknown>)[metaKey] = value;
    }
  }

  return meta;
}

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
  const contentType = response.headers.get('Content-Type');
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
  if (response.status === 204 || response.status === 205 || response.headers.get('Content-Length') === '0') {
    return undefined as T;
  }

  if (!isJsonContentType(response.headers.get('Content-Type'))) {
    throw buildInvalidResponseError(response, 'unexpected_content_type');
  }

  return parseJsonResponse<T>(response);
}

async function parseErrorResponse(response: Response): Promise<unknown> {
  if (response.status === 204 || response.status === 205 || response.headers.get('Content-Length') === '0') {
    return null;
  }

  if (!isJsonContentType(response.headers.get('Content-Type'))) {
    return {
      code: GuildPassErrorCode.INVALID_RESPONSE,
      message: 'Endpoint returned a non-JSON error response',
      meta: {
        contentType: response.headers.get('Content-Type'),
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
        contentType: response.headers.get('Content-Type'),
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
    options?: Omit<HttpRequestOptions, 'method' | 'body'> & { includeMeta?: false | undefined },
  ): Promise<T>;
  public async get<T>(
    path: string,
    options: Omit<HttpRequestOptions, 'method' | 'body'> & { includeMeta: true },
  ): Promise<{ data: T; meta: ResponseMeta }>;
  public async get<T>(
    path: string,
    options?: Omit<HttpRequestOptions, 'method' | 'body'>,
  ): Promise<T | { data: T; meta: ResponseMeta }> {
    const result = await this.request<T>(path, { ...options, method: 'GET' });
    return options?.includeMeta ? { data: result.data, meta: result.meta! } : result.data;
  }

  // GuildPass SDK: Class member structure property or constructor.
  public async post<T>(
    path: string,
    body?: any,
    options?: Omit<HttpRequestOptions, 'method' | 'body'> & { includeMeta?: false | undefined },
  ): Promise<T>;
  public async post<T>(
    path: string,
    body: any,
    options: Omit<HttpRequestOptions, 'method' | 'body'> & { includeMeta: true },
  ): Promise<{ data: T; meta: ResponseMeta }>;
  public async post<T>(
    path: string,
    body?: any,
    options?: Omit<HttpRequestOptions, 'method' | 'body'>,
  ): Promise<T | { data: T; meta: ResponseMeta }> {
    const result = await this.request<T>(path, { ...options, method: 'POST', body });
    return options?.includeMeta ? { data: result.data, meta: result.meta! } : result.data;
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

        const meta = options.includeMeta
          ? extractResponseMeta(response, durationMs)
          : undefined;

        return {
          data,
          status: response.status,
          headers: response.headers,
          meta,
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
