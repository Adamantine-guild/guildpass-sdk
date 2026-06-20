// GuildPass SDK: Pull in package or module bindings.
import { GuildPassError } from '../errors/GuildPassError';
// GuildPass SDK: Import external module dependencies.
import { GuildPassErrorCode } from '../errors/errorCodes';
// GuildPass SDK: Pull in package or module bindings.
import { HttpRequestOptions, HttpResponse, RetryConfig, HttpHooks, RequestHookPayload } from './http.types';

const IDEMPOTENT_METHODS = new Set(['GET', 'HEAD', 'OPTIONS', 'PUT', 'DELETE']);
const DEFAULT_RETRYABLE_STATUSES = [429, 500, 502, 503, 504];

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

async function parseSuccessResponse<T>(response: Response): Promise<T> {
  if (response.status === 204 || response.status === 205 || response.headers.get('Content-Length') === '0') {
    return undefined as T;
  }

  try {
    return await response.json() as T;
  } catch (error) {
    if (isEmptyJsonBodyError(error)) {
      return undefined as T;
    }
    throw error;
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

  // GuildPass SDK: Class member structure property or constructor.
  constructor(baseUrl: string, apiKey?: string, timeoutMs = 10000, configOrHooks?: RetryConfig | HttpHooks) {
    this.baseUrl = baseUrl.endsWith('/') ? baseUrl.slice(0, -1) : baseUrl;
    this.apiKey = apiKey;
    this.timeoutMs = timeoutMs;

    // Discriminate between RetryConfig and HttpHooks
    if (configOrHooks && ('maxRetries' in configOrHooks || 'baseDelayMs' in configOrHooks || 'retryableStatuses' in configOrHooks || 'allowMutatingRetry' in configOrHooks)) {
      this.globalRetry = configOrHooks as RetryConfig;
    } else if (configOrHooks && ('onRequest' in configOrHooks || 'onResponse' in configOrHooks || 'onError' in configOrHooks)) {
      this.hooks = configOrHooks as HttpHooks;
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
    const { method = 'GET', headers = {}, body, params, timeoutMs = this.timeoutMs, retry } = options;

    const retryConfig = resolveRetry(this.globalRetry, retry);
    const canRetry =
      retryConfig.maxRetries > 0 &&
      (IDEMPOTENT_METHODS.has(method) || retryConfig.allowMutatingRetry);

    // GuildPass SDK: Variable binding initialization.
    const startTime = Date.now();
    const hookPayload: RequestHookPayload = { method, path };

    if (this.hooks?.onRequest) {
      try {
        await this.hooks.onRequest(hookPayload);
      } catch (err) {
        console.error('GuildPass SDK: onRequest hook failed', err);
      }
    }

    // GuildPass SDK: Variable binding initialization.
    const url = new URL(`${this.baseUrl}${path.startsWith('/') ? path : `/${path}`}`);
    if (params) {
      Object.entries(params).forEach(([key, value]) => {
        url.searchParams.append(key, String(value));
      });
    }

    const requestHeaders: Record<string, string> = {
      'Content-Type': 'application/json',
      ...headers,
    };
    if (this.apiKey) {
      requestHeaders['X-API-Key'] = this.apiKey;
    }

    let attempt = 0;

    while (true) {
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), timeoutMs);

      try {
        const response = await fetch(url.toString(), {
          method,
          headers: requestHeaders,
          body: body ? JSON.stringify(body) : undefined,
          signal: controller.signal,
        });

        clearTimeout(timeoutId);

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
            errorData = await response.json();
          } catch {
            errorData = null;
          }
          throw GuildPassError.fromHttpError(response.status, errorData);
        }

        // Success case
        const data = await parseSuccessResponse<T>(response);
        const durationMs = Date.now() - startTime;

        if (this.hooks?.onResponse) {
          try {
            await this.hooks.onResponse({ ...hookPayload, status: response.status, durationMs });
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

        let finalError = error;

        if (error.name === 'AbortError') {
          finalError = new GuildPassError(
            `Request timed out after ${timeoutMs}ms`,
            GuildPassErrorCode.TIMEOUT,
          );
        } else if (!(error instanceof GuildPassError)) {
          // Network-level errors (fetch rejection) are safe to retry on idempotent methods.
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
          // GuildPassError with retryable status
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
