// GuildPass SDK: Core operational type definition.
export type HttpMethod = 'GET' | 'POST' | 'PUT' | 'DELETE' | 'PATCH';

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

export type HttpClientConfig = {
  retry?: RetryConfig;
  hooks?: HttpHooks;
  fetch?: FetchLike;
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
   * When `true`, the HTTP method returns `{ data, meta }` instead of the raw
   * `data` value. The `meta` object contains safe diagnostic headers
   * (request ID, correlation ID, trace context) plus status and duration.
   */
  includeMeta?: boolean;
  // GuildPass SDK: End of logic containment structure block.
};

// GuildPass SDK: Simplified options for service methods.
export type RequestOptions = Pick<HttpRequestOptions, 'timeoutMs' | 'signal'>;

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

// GuildPass SDK: Lifecycle hooks interface.
export interface HttpHooks {
  onRequest?: (payload: RequestHookPayload) => void | Promise<void>;
  onResponse?: (payload: ResponseHookPayload) => void | Promise<void>;
  onError?: (payload: ErrorHookPayload) => void | Promise<void>;
  /** Called when a cache adapter operation fails. Cache failures are non-fatal. */
  onCacheError?: (payload: CacheErrorHookPayload) => void | Promise<void>;
}
