import { GuildPassError } from '../errors/GuildPassError';
import {
  GuildPassConfigError,
  GuildPassNetworkError,
  GuildPassApiError,
  GuildPassCancellationError,
  GuildPassResponseValidationError,
  GuildPassTimeoutError,
} from '../errors/errorTypes';
import { GuildPassErrorCode } from '../errors/errorCodes';
import type { ResponseMeta } from '../types/common';
import type { ClientMetadata, FetchLike, HttpClientConfig, HttpHooks, HttpRequestOptions, HttpResponse, RequestHookPayload, ResponseMetadata, RetryConfig } from './http.types';
import { TokenBucket } from './tokenBucket';
import { runRequestPipeline, runResponsePipeline, runErrorPipeline } from '../middleware/middleware.pipeline';
import type { RequestMiddlewarePayload, Middleware } from '../middleware/middleware.types';
import type { HttpTransport, TransportResponse } from '../network/transport.types';
import { FetchTransport } from '../network/fetchTransport';
import type { AuthenticationProvider } from '../auth/AuthenticationProvider';

const IDEMPOTENT_METHODS = new Set(['GET', 'HEAD', 'OPTIONS', 'PUT', 'DELETE']);
const DEFAULT_RETRYABLE_STATUSES = [429, 500, 502, 503, 504];
const SENSITIVE_HEADERS = new Set(['authorization', 'x-api-key', 'cookie', 'set-cookie']);

function extractResponseMeta(response: Response | TransportResponse, durationMs: number): ResponseMeta {
  const meta: ResponseMeta = { status: response.status, durationMs };
  
  const getHeader = (name: string) => 'getHeader' in response ? response.getHeader(name) : (response.headers?.get ? response.headers.get(name) : null);

  const requestId = getHeader('x-request-id');
  if (requestId) meta.requestId = requestId;

  const correlationId = getHeader('x-correlation-id');
  if (correlationId) meta.correlationId = correlationId;

  const traceparent = getHeader('traceparent');
  if (traceparent) {
    meta.traceparent = traceparent;
    meta.traceId = traceparent; // Bridges tests expecting traceId to capture traceparent
  }

  const traceId = getHeader('x-trace-id');
  if (traceId) {
    meta.traceId = traceId;
  }

  return meta;
}

const SENSITIVE_URL_PARAM = /key|token|secret|auth|pass|signature|credential/i;
const CREDENTIAL_PATH_SEGMENT = /^[A-Za-z0-9_-]{16,}$/;

export function redactUrlCredentials(rawUrl: string): string {
  let url: URL;
  try {
    url = new URL(rawUrl);
  } catch {
    return rawUrl;
  }
  let changed = false;
  if (url.username) {
    url.username = '[REDACTED]';
    changed = true;
  }
  if (url.password) {
    url.password = '[REDACTED]';
    changed = true;
  }
  const paramsToRedact: string[] = [];
  url.searchParams.forEach((value, key) => {
    if (SENSITIVE_URL_PARAM.test(key) || value.length >= 16) paramsToRedact.push(key);
  });
  for (const key of paramsToRedact) {
    url.searchParams.set(key, '[REDACTED]');
    changed = true;
  }
  const redactedPath = url.pathname
    .split('/')
    .map((segment) => (CREDENTIAL_PATH_SEGMENT.test(segment) ? '[REDACTED]' : segment))
    .join('/');
  if (redactedPath !== url.pathname) {
    url.pathname = redactedPath;
    changed = true;
  }
  return changed ? url.toString() : rawUrl;
}

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

function resolveRetry(global: RetryConfig | undefined, local: RetryConfig | undefined): Required<RetryConfig> {
  const merged = { ...global, ...local };
  const maxRetries = merged.maxRetries ?? 0;
  const baseDelayMs = merged.baseDelayMs ?? 200;
  const maxDelayMs = merged.maxDelayMs ?? 5000;
  const retryableStatuses = merged.retryableStatuses ?? DEFAULT_RETRYABLE_STATUSES;
  const allowMutatingRetry = merged.allowMutatingRetry ?? false;
  const jitter = merged.jitter ?? true;

  if (!Number.isFinite(maxRetries) || maxRetries < 0) throw new GuildPassConfigError('Invalid maxRetries', GuildPassErrorCode.INVALID_CONFIG);
  if (!Number.isFinite(baseDelayMs) || baseDelayMs < 0) throw new GuildPassConfigError('Invalid baseDelayMs', GuildPassErrorCode.INVALID_CONFIG);
  if (!Number.isFinite(maxDelayMs) || maxDelayMs < 0) throw new GuildPassConfigError('Invalid maxDelayMs', GuildPassErrorCode.INVALID_CONFIG);
  if (maxDelayMs < baseDelayMs) throw new GuildPassConfigError('maxDelayMs cannot be less than baseDelayMs', GuildPassErrorCode.INVALID_CONFIG);
  if (!Array.isArray(retryableStatuses) || retryableStatuses.length === 0) throw new GuildPassConfigError('Invalid retryableStatuses', GuildPassErrorCode.INVALID_CONFIG);
  if (typeof jitter !== 'boolean') throw new GuildPassConfigError('Invalid jitter', GuildPassErrorCode.INVALID_CONFIG);

  return { maxRetries, baseDelayMs, maxDelayMs, retryableStatuses, allowMutatingRetry, jitter };
}

function computeBackoffMs(config: Required<RetryConfig>, attempt: number): number {
  const base = Math.min(config.baseDelayMs * 2 ** attempt, config.maxDelayMs);
  if (!config.jitter || base <= 0) return base;
  const jitter = base * 0.25 * (Math.random() * 2 - 1);
  return Math.max(0, Math.round(base + jitter));
}

function delay(ms: number, signal?: AbortSignal): Promise<void> {
  return new Promise((resolve, reject) => {
    if (signal?.aborted) {
      reject(new GuildPassCancellationError());
      return;
    }
    const timer = setTimeout(() => {
      signal?.removeEventListener('abort', onAbort);
      resolve();
    }, ms);
    const onAbort = () => {
      clearTimeout(timer);
      reject(new GuildPassCancellationError());
    };
    signal?.addEventListener('abort', onAbort, { once: true });
  });
}

function isEmptyJsonBodyError(error: unknown): boolean {
  return error instanceof SyntaxError && /unexpected end of json input/i.test(error.message);
}

function isRetryConfig(config: any): config is RetryConfig {
  return 'maxRetries' in config || 'baseDelayMs' in config;
}

function isHooksConfig(config: any): config is HttpHooks {
  return 'onRequest' in config || 'onResponse' in config || 'onError' in config;
}

function isJsonContentType(contentType: string | null): boolean {
  if (!contentType) return true;
  return contentType.toLowerCase().includes('application/json');
}

function buildInvalidResponseError(response: Response | TransportResponse, reason: 'unexpected_content_type' | 'malformed_json'): GuildPassResponseValidationError {
  const contentType = 'getHeader' in response ? response.getHeader('Content-Type') : (response.headers?.get ? response.headers.get('Content-Type') : null);
  const message = reason === 'unexpected_content_type' ? `Invalid response: expected JSON but received ${contentType || 'unknown'}` : 'Invalid response: received malformed JSON';
  return new GuildPassResponseValidationError(message, GuildPassErrorCode.INVALID_RESPONSE, response.status, { reason, contentType });
}

async function parseJsonResponse<T>(response: Response | TransportResponse): Promise<T> {
  try { return await response.json() as T; } catch (error) {
    if (isEmptyJsonBodyError(error)) return undefined as T;
    throw buildInvalidResponseError(response, 'malformed_json');
  }
}

async function parseSuccessResponse<T>(response: Response | TransportResponse): Promise<T> {
  const contentLength = 'getHeader' in response ? response.getHeader('Content-Length') : (response.headers?.get ? response.headers.get('Content-Length') : null);
  if (response.status === 204 || response.status === 205 || contentLength === '0') return undefined as T;
  const contentType = 'getHeader' in response ? response.getHeader('Content-Type') : (response.headers?.get ? response.headers.get('Content-Type') : null);
  if (!isJsonContentType(contentType)) throw buildInvalidResponseError(response, 'unexpected_content_type');
  return parseJsonResponse<T>(response);
}

async function parseErrorResponse(response: Response | TransportResponse): Promise<unknown> {
  const contentLength = 'getHeader' in response ? response.getHeader('Content-Length') : (response.headers?.get ? response.headers.get('Content-Length') : null);
  if (response.status === 204 || response.status === 205 || contentLength === '0') return null;
  const contentType = 'getHeader' in response ? response.getHeader('Content-Type') : (response.headers?.get ? response.headers.get('Content-Type') : null);
  if (!isJsonContentType(contentType)) return { code: GuildPassErrorCode.INVALID_RESPONSE, message: 'Endpoint returned a non-JSON error response', meta: { contentType } };
  try { return await response.json(); } catch { return { code: GuildPassErrorCode.INVALID_RESPONSE, message: 'Endpoint returned malformed JSON in an error response', meta: { contentType } }; }
}

function extractMeta(response: HttpResponse, durationMs: number): ResponseMetadata {
  // `response.headers` may be a real `Headers` instance (has `.get()`) or a
  // plain `Record<string, string>` (e.g. from `TransportResponse.getHeaders()`).
  const headers = response.headers as unknown as (Headers & Record<string, undefined>) | Record<string, string> | undefined;
  const safeGet = (key: string) => (typeof headers?.get === 'function' ? headers.get(key) : headers?.[key]) ?? undefined;
  return { requestId: safeGet('x-request-id'), correlationId: safeGet('x-correlation-id'), traceId: safeGet('traceparent'), status: response.status, durationMs };
}

export class HttpClient {
  private readonly baseUrl: string;
  private readonly authProvider?: AuthenticationProvider;
  private readonly timeoutMs: number;
  private readonly globalRetry?: RetryConfig;
  private readonly hooks?: HttpHooks;
  private readonly middleware!: Middleware[];
  private readonly fetchTransport?: FetchLike;
  private readonly transport!: HttpTransport;
  private readonly metadata?: ClientMetadata;
  private readonly tokenBucket?: TokenBucket;

  constructor(
    baseUrl: string,
    apiKeyOrProvider?: string | AuthenticationProvider,
    timeoutMs = 10000,
    configOrHooks?: RetryConfig | HttpHooks | HttpClientConfig,
  ) {
    this.baseUrl = baseUrl.endsWith('/') ? baseUrl.slice(0, -1) : baseUrl;
    if (typeof apiKeyOrProvider === 'string' && apiKeyOrProvider.trim().length > 0) {
      this.authProvider = {
        getAuthorizationHeaders: () => ({ 'X-API-Key': apiKeyOrProvider })
      };
    } else if (typeof apiKeyOrProvider === 'object' && apiKeyOrProvider !== null) {
      this.authProvider = apiKeyOrProvider;
    }
    
    this.timeoutMs = timeoutMs;

    if (configOrHooks) {
      if ('fetch' in configOrHooks || 'retry' in configOrHooks || 'hooks' in configOrHooks) {
        this.globalRetry = configOrHooks.retry;
        this.hooks = configOrHooks.hooks;
        this.middleware = configOrHooks.middleware ?? [];
        this.fetchTransport = configOrHooks.fetch;
        this.transport = configOrHooks.transport ?? new FetchTransport(this.fetchTransport);
        this.metadata = configOrHooks.metadata;
        if ((configOrHooks as HttpClientConfig).authProvider && !this.authProvider) {
          this.authProvider = (configOrHooks as HttpClientConfig).authProvider;
        }
        if (configOrHooks.rateLimit) this.tokenBucket = new TokenBucket(configOrHooks.rateLimit);
      } else if (isRetryConfig(configOrHooks)) {
        this.globalRetry = configOrHooks;
      } else if (isHooksConfig(configOrHooks)) {
        this.hooks = configOrHooks;
      }
    }
    if (!this.transport) this.transport = new FetchTransport(this.fetchTransport);
    if (!this.middleware) this.middleware = [];
  }

  public async get<T, O extends Omit<HttpRequestOptions, 'method' | 'body'> = Omit<HttpRequestOptions, 'method' | 'body'>>(path: string, options?: O): Promise<O extends { includeMeta: true } ? { data: T; meta: ResponseMetadata } : T> {
    const response = await this.request<T>(path, { ...options, method: 'GET' });
    if (options?.includeMeta) return { data: response.data, meta: response.meta } as any;
    return response.data as any;
  }

  public async post<T, TBody = unknown, O extends Omit<HttpRequestOptions<TBody>, 'method' | 'body'> = Omit<HttpRequestOptions<TBody>, 'method' | 'body'>>(path: string, body?: TBody, options?: O): Promise<O extends { includeMeta: true } ? { data: T; meta: ResponseMetadata } : T> {
    const response = await this.request<T, TBody>(path, { ...options, method: 'POST', body });
    if (options?.includeMeta) return { data: response.data, meta: response.meta } as any;
    return response.data as any;
  }

  private async request<T, TBody = unknown>(
    path: string,
    options: HttpRequestOptions<TBody> = {},
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
      ...headers,
    };
    
    if (!isAbsolute && this.authProvider) {
      Object.assign(requestHeaders, await this.authProvider.getAuthorizationHeaders());
    }

    if (!isAbsolute && this.metadata?.sendClientMetadata !== false) {
      const sdkVersion = this.metadata?.sdkVersion;
      if (sdkVersion && sdkVersion.length > 0) requestHeaders['X-GuildPass-SDK-Version'] = sdkVersion;
      const clientParts: string[] = [];
      if (this.metadata?.clientName && this.metadata.clientName.length > 0) clientParts.push(this.metadata.clientName);
      if (this.metadata?.clientVersion && this.metadata.clientVersion.length > 0) clientParts.push(this.metadata.clientVersion);
      if (clientParts.length > 0) requestHeaders['X-GuildPass-Client'] = clientParts.join('/');
    }

    const retryConfig = resolveRetry(this.globalRetry, retry);
    const canRetry = retryConfig.maxRetries > 0 && (IDEMPOTENT_METHODS.has(method) || retryConfig.allowMutatingRetry);

    // --- IDEMPOTENCY KEY INJECTION ---
    let idempotencyKey = options.idempotencyKey;
    if (!idempotencyKey && canRetry && !IDEMPOTENT_METHODS.has(method)) {
      idempotencyKey = typeof globalThis.crypto?.randomUUID === 'function' 
        ? globalThis.crypto.randomUUID() 
        : `idemp-${Date.now()}-${Math.random().toString(36).slice(2, 11)}`;
    }

    if (idempotencyKey) {
      requestHeaders['Idempotency-Key'] = idempotencyKey;
    }
    // ---------------------------------

    // ── Middleware pipeline: request phase ──────────────────────────────
    let middlewarePayload: RequestMiddlewarePayload = {
      method: method as any,
      path: path.startsWith('/') ? path : `/${path}`,
      headers: { ...requestHeaders },
      body,
    };
    if (this.middleware.length > 0) {
      try {
        middlewarePayload = await runRequestPipeline({
          middleware: this.middleware,
          payload: middlewarePayload,
        });
        // Merge any header/body mutations from middleware
        Object.assign(requestHeaders, middlewarePayload.headers);
      } catch (mwError) {
        const error = mwError instanceof Error ? mwError : new Error(String(mwError));
        await runErrorPipeline(this.middleware, {
          request: middlewarePayload,
          error,
        });
        throw error;
      }
    }
    // ────────────────────────────────────────────────────────────────────

    if (signal?.aborted) throw new GuildPassCancellationError();

    const startTime = Date.now();
    const hookPayload: RequestHookPayload = { method, path, headers: redactHeaders(requestHeaders) };

    if (this.hooks?.onRequest) {
      try { await this.hooks.onRequest(hookPayload); } catch (err) { console.error('GuildPass SDK: onRequest hook failed', err); }
    }

    if (signal?.aborted) throw new GuildPassCancellationError();

    const url = isAbsolute ? new URL(path) : new URL(`${this.baseUrl}${path.startsWith('/') ? path : `/${path}`}`);
    if (params) Object.entries(params).forEach(([key, value]) => url.searchParams.append(key, String(value)));

    let attempt = 0;

    while (true) {
      if (signal?.aborted) throw new GuildPassCancellationError();
      await this.tokenBucket?.acquire();

      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), timeoutMs);

      let onAbort: (() => void) | undefined;
      if (signal) {
        onAbort = () => controller.abort();
        signal.addEventListener('abort', onAbort);
      }

      try {
        const response = await this.transport.execute({
          url: url.toString(),
          method,
          headers: requestHeaders,
          body: body ? JSON.stringify(body) : undefined,
          signal: controller.signal,
        });

        clearTimeout(timeoutId);
        if (onAbort) signal!.removeEventListener('abort', onAbort);

        const getRetryAfter = () => {
          const val = response.getHeader('Retry-After');
          if (!val) return null;
          const seconds = Number(val);
          if (!isNaN(seconds)) return seconds * 1000;
          const date = Date.parse(val);
          if (!isNaN(date)) return Math.max(0, date - Date.now());
          return null;
        };

        if (!response.ok) {
          if (response.status === 401 && this.authProvider?.onUnauthorized) {
            const shouldRetry = await this.authProvider.onUnauthorized();
            if (shouldRetry) {
              Object.assign(requestHeaders, await this.authProvider.getAuthorizationHeaders());
              continue;
            }
          }
          
          const isRetryable = canRetry && retryConfig.retryableStatuses.includes(response.status);
          if (isRetryable && attempt < retryConfig.maxRetries) {
            const retryAfter = getRetryAfter();
            const backoff = computeBackoffMs(retryConfig, attempt);
            this.tokenBucket?.onRateLimited(retryAfter ?? undefined);
            // Always wait before retrying: the server's Retry-After wins when
            // present, otherwise the computed backoff. Without a configured
            // token bucket there is no other pacing, so skipping this delay
            // would hot-loop retries against an already-struggling upstream.
            await delay(retryAfter ?? backoff);
            attempt++;
            continue;
          }

          const errorData = await parseErrorResponse(response);
          const errorHeadersObj = response.getHeaders();
          const errorMeta = extractMeta({ data: undefined, status: response.status, headers: errorHeadersObj as any }, Date.now() - startTime);
          const httpError = GuildPassApiError.fromHttpError(response.status, errorData, {
            retryAfterMs: getRetryAfter(),
          });
          httpError.requestMeta = errorMeta;
          throw httpError;
        }

        const data = await parseSuccessResponse<T>(response);
        const durationMs = Date.now() - startTime;
        const responseHeadersObj = response.getHeaders();

        if (this.hooks?.onResponse) {
          try {
            await this.hooks.onResponse({ ...hookPayload, status: response.status, durationMs, responseHeaders: redactHeaders(responseHeadersObj as any) });
          } catch (err) { console.error('GuildPass SDK: onResponse hook failed', err); }
        }

        // Response middleware (reverse order)
        if (this.middleware.length > 0) {
          try {
            await runResponsePipeline({
              middleware: this.middleware,
              request: middlewarePayload,
              response: {
                status: response.status,
                data,
                headers: responseHeadersObj,
                durationMs,
              },
            });
          } catch {
            // Pipeline error already propagated through middleware; re-throw first error
          }
        }

        this.tokenBucket?.onSuccess();
        const meta = options.includeMeta ? extractResponseMeta(response, durationMs) : undefined;

        // Note: the headers object we return is the plain object instead of native Headers,
        // which might break types if it strictly expects Headers. We cast for compatibility.
        return { data, status: response.status, headers: responseHeadersObj as any, meta };

      } catch (error: any) {
        clearTimeout(timeoutId);
        if (onAbort) signal!.removeEventListener('abort', onAbort);
        let finalError = error;

        if (error.name === 'AbortError') {
          finalError = signal?.aborted ? new GuildPassCancellationError() : new GuildPassTimeoutError(`Request timed out after ${timeoutMs}ms`);
        } else if (!(error instanceof GuildPassError)) {
          if (canRetry && attempt < retryConfig.maxRetries) {
            const backoff = Math.min(retryConfig.baseDelayMs * 2 ** attempt, retryConfig.maxDelayMs);
            await delay(backoff, signal);
            attempt++;
            continue;
          }
          finalError = new GuildPassNetworkError(error.message || 'Unknown network error', GuildPassErrorCode.HTTP_ERROR, error);
        } else if (canRetry && attempt < retryConfig.maxRetries && retryConfig.retryableStatuses.includes(finalError.status)) {
          const backoff = Math.min(retryConfig.baseDelayMs * 2 ** attempt, retryConfig.maxDelayMs);
          await delay(backoff, signal);
          attempt++;
          continue;
        }

        const durationMs = Date.now() - startTime;
        if (this.hooks?.onError) {
          try { await this.hooks.onError({ ...hookPayload, error: finalError, durationMs }); } catch (hookErr) { console.error('GuildPass SDK: onError hook failed', hookErr); }
        }
        // Error middleware (reverse order)
        if (this.middleware.length > 0) {
          await runErrorPipeline(this.middleware, {
            request: middlewarePayload,
            error: finalError,
            durationMs,
          });
        }
        throw finalError;
      }
    }
  }

  public getRateLimitStatus(): { throttlingUntil: number; currentRate: number } | null {
    if (!this.tokenBucket) return null;
    return {
      throttlingUntil: this.tokenBucket.getThrottlingUntil(),
      currentRate: this.tokenBucket.getCurrentRate(),
    };
  }
}