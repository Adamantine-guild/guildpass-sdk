import { GuildPassError } from '../errors/GuildPassError';
import { GuildPassErrorCode } from '../errors/errorCodes';
import {
ClientMetadata,
FetchLike,
HttpClientConfig,
HttpHooks,
HttpRequestOptions,
HttpResponse,
RequestHookPayload,
ResponseMetadata,
RetryConfig,
Middleware,
RequestContext,
} from './http.types';

const IDEMPOTENT_METHODS = new Set(['GET', 'HEAD', 'OPTIONS', 'PUT', 'DELETE']);
const DEFAULT_RETRYABLE_STATUSES = [429, 500, 502, 503, 504];
const SENSITIVE_HEADERS = new Set(['authorization', 'x-api-key', 'cookie', 'set-cookie']);

// ... (Redact, ResolveRetry, Delay, etc. helper functions remain unchanged)
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
  return {
    maxRetries: merged.maxRetries ?? 0,
    baseDelayMs: merged.baseDelayMs ?? 200,
    maxDelayMs: merged.maxDelayMs ?? 5000,
    retryableStatuses: merged.retryableStatuses ?? DEFAULT_RETRYABLE_STATUSES,
    allowMutatingRetry: merged.allowMutatingRetry ?? false,
  };
}

function delay(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
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

function isRetryConfig(config: any): config is RetryConfig {
  return 'maxRetries' in config || 'baseDelayMs' in config;
}

function isHooksConfig(config: any): config is HttpHooks {
  return 'onRequest' in config || 'onResponse' in config || 'onError' in config;
}

async function parseSuccessResponse<T>(response: Response): Promise<T> {
  const contentLength = response.headers?.get ? response.headers.get('Content-Length') : null;
  if (response.status === 204 || response.status === 205 || contentLength === '0') return undefined as T;
  return await response.json();
}

async function parseErrorResponse(response: Response): Promise<unknown> {
  try { return await response.json(); } catch { return null; }
}

function extractMeta(response: HttpResponse, durationMs: number): ResponseMetadata {
  const safeGet = (key: string) => response.headers?.get?.(key) ?? undefined;
  return {
    requestId: safeGet('x-request-id'),
    correlationId: safeGet('x-correlation-id'),
    traceId: safeGet('traceparent'),
    status: response.status,
    durationMs,
  };
// GuildPass SDK: Core operational type definition.
export type HttpMethod = 'GET' | 'POST' | 'PUT' | 'DELETE' | 'PATCH';

export type RateLimitConfig = {
  requestsPerSecond: number;
  burst?: number;
};

export type RetryConfig = {
  /** Maximum number of retry attempts (default: 0). */
  maxRetries?: number;
  /** Base delay in ms between retries (default: 200). Doubles with each attempt. */
  baseDelayMs?: number;
  /** Maximum delay cap in ms (default: 5000). */
  maxDelayMs?: number;
  /** HTTP status codes that trigger a retry (default: [429, 500, 502, 503, 504]). */
  retryableStatuses?: number[];
  /**
   * Allow retrying non-idempotent methods (POST, PUT, PATCH, DELETE).
   * Off by default — only enable when you know the operation is safe to repeat.
   */
  allowMutatingRetry?: boolean;
};

export type FetchLike = (
  input: string | URL | Request,
  init?: RequestInit,
) => Promise<Response>;

export type ClientMetadata = {
  /**
   * SDK version to send in the `X-GuildPass-SDK-Version` header.
   * Defaults to the bundled SDK version. Set to an empty string to omit
   * only the version header (client name will still be sent if provided).
   */
  sdkVersion?: string;
  /**
   * Optional client or integration name (e.g. `"my-dapp"`, `"discord-bot"`).
   * Sent as `X-GuildPass-Client` alongside the SDK version.
   */
  clientName?: string;
  /**
   * Optional client version string sent as part of `X-GuildPass-Client`.
   * When omitted, only the client name is sent (if provided).
   */
  clientVersion?: string;
  /**
   * Whether to send client metadata headers (`X-GuildPass-SDK-Version`,
   * `X-GuildPass-Client`) on GuildPass API-relative requests.
   * Defaults to `true`. Set to `false` to disable all metadata headers.
   */
  sendClientMetadata?: boolean;
};

export type HttpClientConfig = {
  retry?: RetryConfig;
  hooks?: HttpHooks;
  fetch?: FetchLike;
  /** Optional client metadata attached as headers on API-relative requests. */
  metadata?: ClientMetadata;
  /** Optional token-bucket rate limiter to proactively pace outgoing requests. */
  rateLimit?: RateLimitConfig;
};

// GuildPass SDK: Exported function execution unit.
export type HttpRequestOptions = {
  method?: HttpMethod;
  headers?: Record<string, string>;
  body?: any;
  params?: Record<string, string | number | boolean>;
  timeoutMs?: number;
  /** Per-request retry overrides. Merged over the global retry config. */
  retry?: RetryConfig;
  /** External AbortSignal. Aborts the underlying fetch when fired; composes with the timeout. */
  signal?: AbortSignal;
  /**
   * When `true`, the HTTP client returns `{ data, meta }` instead of just `data`.
   * The `meta` object contains safe diagnostic headers (request ID, correlation ID,
   * trace ID), the HTTP status code, and round-trip duration.
   * Defaults to `false` to preserve the existing ergonomic API.
   */
  includeMeta?: boolean;
  // GuildPass SDK: End of logic containment structure block.
};

// The public, service-method request options live in ../types/common
// (`RequestOptions`, which also carries `retry`). This module intentionally does
// NOT redeclare a second `RequestOptions` type — having two same-named types in
// different modules is the import conflict this removal resolves (see #83).

import type { ResponseMeta } from '../types/common';

// GuildPass SDK: Exported component definition.
export type HttpResponse<T = any> = {
  data: T;
  status: number;
  headers: Headers;
  /**
   * Safe response metadata captured when `includeMeta: true` is set on the
   * request. Contains diagnostic headers (request ID, correlation ID, trace
   * context) plus status and duration. `undefined` when metadata was not
   * requested.
   */
  meta?: ResponseMeta;
  // GuildPass SDK: End of logic containment structure block.
};

/**
 * Safe response metadata captured from response headers.
 * Contains only non-sensitive diagnostic values suitable for logging,
 * support tickets, and correlating client-side errors with backend traces.
 */
export type ResponseMetadata = {
  /** Value of the `X-Request-ID` response header, if present. */
  requestId?: string;
  /** Value of the `X-Correlation-ID` response header, if present. */
  correlationId?: string;
  /** Value of the `Traceparent` (W3C) response header, if present. */
  traceId?: string;
  /** HTTP status code of the response. */
  status: number;
  /** Round-trip duration in milliseconds. */
  durationMs: number;
};

// GuildPass SDK: Hook payloads for observability integration.
export type RequestHookPayload = {
  method: HttpMethod;
  path: string;
  /** Safely redacted headers. Sensitive values are replaced with '[REDACTED]'. */
  headers: Record<string, string>;
};

export type ResponseHookPayload = RequestHookPayload & {
  status: number;
  durationMs: number;
  /** Safely redacted response headers. Sensitive values are replaced with '[REDACTED]'. */
  responseHeaders: Record<string, string>;
};

export type ErrorHookPayload = RequestHookPayload & {
  error: Error;
  durationMs: number;
};

export type CacheErrorHookPayload = {
  /** The cache operation that failed. */
  operation: 'get' | 'set' | 'delete' | 'clear';
  /** The cache key involved, if applicable. */
  key?: string;
  /** The error thrown by the cache adapter. */
  error: Error;
};

/**
 * Payload delivered to `onRpcFailover` when the SDK attempts the next RPC
 * endpoint in the failover list. Useful for logging, metrics, and alerting
 * on degrading infrastructure providers.
 */
export type RpcFailoverHookPayload = {
  /** The chain ID the contract call was targeting, if known. */
  chainId?: number;
  /** The URL that just failed with a transient error. */
  failedUrl: string;
  /** The next URL that will be attempted. */
  nextUrl: string;
  /** The error that triggered the failover (may be a GuildPassError or a raw TypeError). */
  error: unknown;
};

// GuildPass SDK: Lifecycle hooks interface.
export interface HttpHooks {
  onRequest?: (payload: RequestHookPayload) => void | Promise<void>;
  onResponse?: (payload: ResponseHookPayload) => void | Promise<void>;
  onError?: (payload: ErrorHookPayload) => void | Promise<void>;
  /** Called when a cache adapter operation fails. Cache failures are non-fatal. */
  onCacheError?: (payload: CacheErrorHookPayload) => void | Promise<void>;
  /**
   * Called when the SDK fails over from one RPC endpoint to the next due to a
   * transient error (network failure, rate-limit, 5xx). Not invoked for
   * contract-level errors (execution reverted, bad parameters) or when all
   * endpoints are exhausted.
   *
   * Hook failures are silently caught — they never affect the failover flow.
   */
  onRpcFailover?: (payload: RpcFailoverHookPayload) => void | Promise<void>;
}

export class HttpClient {
  private readonly baseUrl: string;
  private readonly apiKey?: string;
  private readonly timeoutMs: number;
  private readonly globalRetry?: RetryConfig;
  private readonly hooks?: HttpHooks;
  private readonly middleware: Middleware[];
  private readonly fetchTransport?: FetchLike;
  private readonly metadata?: ClientMetadata;

  constructor(
    baseUrl: string,
    apiKey?: string,
    timeoutMs = 10000,
    configOrHooks?: RetryConfig | HttpHooks | HttpClientConfig,
  ) {
    this.baseUrl = baseUrl.endsWith('/') ? baseUrl.slice(0, -1) : baseUrl;
    this.apiKey = apiKey;
    this.timeoutMs = timeoutMs;
    this.middleware = [];

    if (configOrHooks) {
      if ('fetch' in configOrHooks || 'retry' in configOrHooks || 'hooks' in configOrHooks || 'middleware' in configOrHooks) {
        this.globalRetry = configOrHooks.retry;
        this.hooks = configOrHooks.hooks;
        this.middleware = configOrHooks.middleware ?? [];
        this.fetchTransport = configOrHooks.fetch;
        this.metadata = configOrHooks.metadata;
      } else if (isRetryConfig(configOrHooks)) {
        this.globalRetry = configOrHooks;
      } else if (isHooksConfig(configOrHooks)) {
        this.hooks = configOrHooks;
      }
    }
  }

  public async get<T>(path: string, options?: any): Promise<any> {
    const startTime = Date.now();
    const response = await this.executePipeline({ options: { ...options, method: 'GET' }, path });
    if (options?.includeMeta) return { data: response.data, meta: extractMeta(response, Date.now() - startTime) };
    return response.data;
  }

  public async post<T>(path: string, body?: any, options?: any): Promise<any> {
    const startTime = Date.now();
    const response = await this.executePipeline({ options: { ...options, method: 'POST', body }, path });
    if (options?.includeMeta) return { data: response.data, meta: extractMeta(response, Date.now() - startTime) };
    return response.data;
  }

  private async executePipeline(context: RequestContext): Promise<HttpResponse> {
    const pipeline = [...this.middleware];

    // Add legacy hooks as middleware (at the edges)
    if (this.hooks) {
      pipeline.unshift(this.createHookMiddleware(this.hooks));
    }

    let i = 0;
    const dispatch = async (): Promise<HttpResponse> => {
      if (i < pipeline.length) {
        const fn = pipeline[i++];
        return fn(context, dispatch);
      }
      return this.executeTerminal(context);
    };

    return dispatch();
  }

  private createHookMiddleware(hooks: HttpHooks): Middleware {
    return async (context, next) => {
      const payload: RequestHookPayload = {
        method: context.options.method || 'GET',
        path: context.path,
        headers: redactHeaders(context.options.headers || {}),
      };

      if (hooks.onRequest) await hooks.onRequest(payload).catch(console.error);

      try {
        const response = await next();
        if (hooks.onResponse) {
          await hooks.onResponse({
            ...payload,
            status: response.status,
            durationMs: 0, // Duration handled separately
            responseHeaders: redactHeaders(response.headers)
          }).catch(console.error);
        }
        return response;
      } catch (err: any) {
        if (hooks.onError) await hooks.onError({ ...payload, error: err, durationMs: 0 }).catch(console.error);
        throw err;
      }
    };
  }

  private async executeTerminal(context: RequestContext): Promise<HttpResponse> {
    // This is the original fetch + retry loop
    const { path, options } = context;
    const { method = 'GET', body, params, timeoutMs = this.timeoutMs, retry, signal } = options;
    const isAbsolute = path.startsWith('http://') || path.startsWith('https://');
    const retryConfig = resolveRetry(this.globalRetry, retry);
    const canRetry = retryConfig.maxRetries > 0 && (IDEMPOTENT_METHODS.has(method) || retryConfig.allowMutatingRetry);

    const url = isAbsolute ? new URL(path) : new URL(`${this.baseUrl}${path.startsWith('/') ? path : `/${path}`}`);
    if (params) Object.entries(params).forEach(([k, v]) => url.searchParams.append(k, String(v)));

    let attempt = 0;
    while (true) {
        const controller = new AbortController();
        const timeoutId = setTimeout(() => controller.abort(), timeoutMs);

        try {
            const transport = this.fetchTransport ?? globalThis.fetch;
            const response = await transport(url.toString(), {
                method,
                headers: { 'Content-Type': 'application/json', ...(options.headers || {}) },
                body: body ? JSON.stringify(body) : undefined,
                signal: controller.signal
            });
            clearTimeout(timeoutId);

            if (!response.ok) {
                if (canRetry && attempt < retryConfig.maxRetries && retryConfig.retryableStatuses.includes(response.status)) {
                    await delay(getRetryAfterMs(response.headers) ?? retryConfig.baseDelayMs);
                    attempt++; continue;
                }
                throw GuildPassError.fromHttpError(response.status, await parseErrorResponse(response));
            }
            return { data: await parseSuccessResponse(response), status: response.status, headers: response.headers };
        } catch (error: any) {
            clearTimeout(timeoutId);
            if (canRetry && attempt < retryConfig.maxRetries) {
                await delay(retryConfig.baseDelayMs);
                attempt++; continue;
            }
            throw error;
        }
    }
  }
}