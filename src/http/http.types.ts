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

// GuildPass SDK: Exported function execution unit.
export type HttpRequestOptions = {
  method?: HttpMethod;
  headers?: Record<string, string>;
  body?: any;
  params?: Record<string, string | number | boolean>;
  timeoutMs?: number;
  /** Per-request retry overrides. Merged over the global retry config. */
  retry?: RetryConfig;
  // GuildPass SDK: End of logic containment structure block.
};

// GuildPass SDK: Exported component definition.
export type HttpResponse<T = any> = {
  data: T;
  status: number;
  headers: Headers;
  // GuildPass SDK: End of logic containment structure block.
};

// GuildPass SDK: Hook payloads for observability integration.
export type RequestHookPayload = {
  method: HttpMethod;
  path: string;
};

export type ResponseHookPayload = RequestHookPayload & {
  status: number;
  durationMs: number;
};

export type ErrorHookPayload = RequestHookPayload & {
  error: Error;
  durationMs: number;
};

// GuildPass SDK: Lifecycle hooks interface.
export interface HttpHooks {
  onRequest?: (payload: RequestHookPayload) => void | Promise<void>;
  onResponse?: (payload: ResponseHookPayload) => void | Promise<void>;
  onError?: (payload: ErrorHookPayload) => void | Promise<void>;
}
