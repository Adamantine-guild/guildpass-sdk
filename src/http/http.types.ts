import { GuildPassError } from '../errors/GuildPassError';
import type { AccessCheckParams, AccessCheckResult } from '../access/access.types';
import type { AccessRequirement } from '../types/common';
import { GuildPassErrorCode } from '../errors/errorCodes';
import type { ResponseMeta } from '../types/common';

export type HttpMethod = 'GET' | 'POST' | 'PUT' | 'DELETE' | 'PATCH';

export type RateLimitConfig = {
  requestsPerSecond: number;
  burst?: number;
};

export type RetryConfig = {
  maxRetries?: number;
  baseDelayMs?: number;
  maxDelayMs?: number;
  retryableStatuses?: number[];
  allowMutatingRetry?: boolean;
};

export type DiscrepancyHookPayload = {
  params: AccessCheckParams;
  requirement: AccessRequirement;
  apiResult: AccessCheckResult | null;
  onChainResult: boolean | null;
  reason: string;
};

export type FetchLike = (
  input: string | URL | Request,
  init?: RequestInit,
) => Promise<Response>;

export type ClientMetadata = {
  sdkVersion?: string;
  clientName?: string;
  clientVersion?: string;
  sendClientMetadata?: boolean;
};

export type HttpClientConfig = {
  retry?: RetryConfig;
  hooks?: HttpHooks;
  fetch?: FetchLike;
  metadata?: ClientMetadata;
  rateLimit?: RateLimitConfig;
};

export type HttpRequestOptions<TBody = unknown> = {
  method?: HttpMethod;
  headers?: Record<string, string>;
  body?: TBody;
  params?: Record<string, string | number | boolean>;
  timeoutMs?: number;
  retry?: RetryConfig;
  signal?: AbortSignal;
  includeMeta?: boolean;
  /**
   * Client-provided idempotency key.
   * If omitted and `retry.allowMutatingRetry` is true for a mutating request,
   * the SDK will auto-generate one.
   */
  idempotencyKey?: string;
};

export type HttpResponse<T = any> = {
  data: T;
  status: number;
  headers: Headers;
  meta?: ResponseMeta;
};

export type ResponseMetadata = {
  requestId?: string;
  correlationId?: string;
  traceId?: string;
  status: number;
  durationMs: number;
};

export type RequestHookPayload = {
  method: HttpMethod;
  path: string;
  headers: Record<string, string>;
};

export type ResponseHookPayload = RequestHookPayload & {
  status: number;
  durationMs: number;
  responseHeaders: Record<string, string>;
};

export type ErrorHookPayload = RequestHookPayload & {
  error: Error;
  durationMs: number;
};

export type CacheErrorHookPayload = {
  operation: 'get' | 'set' | 'delete' | 'clear';
  key?: string;
  error: Error;
};

export type RpcFailoverHookPayload = {
  chainId?: number;
  failedUrl: string;
  nextUrl: string;
  error: unknown;
};

export interface HttpHooks {
  onRequest?: (payload: RequestHookPayload) => void | Promise<void>;
  onResponse?: (payload: ResponseHookPayload) => void | Promise<void>;
  onError?: (payload: ErrorHookPayload) => void | Promise<void>;
  onCacheError?: (payload: CacheErrorHookPayload) => void | Promise<void>;
  onRpcFailover?: (payload: RpcFailoverHookPayload) => void | Promise<void>;
  /** Fires when checkAccessVerified detects a mismatch between API and on-chain results. */
  onDiscrepancy?: (payload: DiscrepancyHookPayload) => void | Promise<void>;
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