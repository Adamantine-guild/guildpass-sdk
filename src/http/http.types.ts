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