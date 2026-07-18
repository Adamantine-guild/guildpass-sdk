// GuildPass SDK: Pull in package or module bindings.
import { GuildPassError } from '../../errors/GuildPassError';
import { GuildPassErrorCode } from '../../errors/errorCodes';
import { HttpClient } from '../../http/httpClient';
import { RequestOptions } from '../../types/common';
import { BatchItemResult } from '../contract.types';
import { ContractProvider, EthCallRequest } from './provider.types';

type JsonRpcSuccess = {
  result?: unknown;
};

type JsonRpcError = {
  error?: {
    code?: number;
    message?: string;
  };
};

type JsonRpcBatchResponseItem = {
  id?: number;
  result?: unknown;
  error?: {
    code?: number;
    message?: string;
  };
};

/**
 * Returns `true` when the error is a *transient* infrastructure failure —
 * meaning the same request may succeed on a different RPC node. Contract-level
 * errors (execution reverted, invalid parameters, etc.) are not transient and
 * should be surfaced to the caller immediately.
 *
 * Transient signals:
 * - Network / fetch-level errors (ECONNREFUSED, ETIMEDOUT, etc.)
 *   These may arrive either as raw `TypeError` or wrapped by HttpClient as
 *   `GuildPassError(HTTP_ERROR)` with a TypeError in `details`.
 * - HTTP 429 (rate-limited) and 5xx (server-side) responses
 * - SDK SERVER_ERROR / RATE_LIMITED / TIMEOUT codes
 *
 * Non-transient:
 * - Contract-level failures (execution reverted, bad params) arrive as
 *   `HTTP_ERROR` with a JSON-RPC error object in `details` that has a numeric
 *   `code` property — these will fail on every node.
 * - INVALID_RESPONSE (malformed reply format) — not recoverable by retrying.
 * - REQUEST_CANCELLED / ABORTED — honour the caller's intent immediately.
 */
function isTransientError(err: unknown): boolean {
  if (err instanceof GuildPassError) {
    // REQUEST_CANCELLED / ABORTED — never retry
    if (
      err.code === GuildPassErrorCode.REQUEST_CANCELLED ||
      err.code === GuildPassErrorCode.ABORTED
    ) {
      return false;
    }

    if (err.code === GuildPassErrorCode.HTTP_ERROR) {
      // Contract-level failures arrive as HTTP_ERROR with a JSON-RPC error
      // payload: an object with a numeric `code` field (e.g. { code: -32000, message: … }).
      if (
        err.details &&
        typeof err.details === 'object' &&
        'code' in err.details &&
        typeof (err.details as { code: unknown }).code === 'number'
      ) {
        return false;
      }

      // Network errors wrapped by HttpClient: TypeError stored in `details`
      // (or the error has no status — i.e. it's a raw network failure).
      const details = err.details as { constructor?: string; name?: string } | undefined;
      if (
        err.status === undefined &&
        details &&
        typeof details === 'object' &&
        (details.constructor === 'Function<TypeError>' ||
          details.name === 'TypeError' ||
          details.constructor === 'TypeError')
      ) {
        return true;
      }

      // Any other HTTP_ERROR with no status is likely a network issue
      if (err.status === undefined) {
        return true;
      }

      return false;
    }

    return (
      err.code === GuildPassErrorCode.SERVER_ERROR ||
      err.code === GuildPassErrorCode.RATE_LIMITED ||
      err.code === GuildPassErrorCode.TIMEOUT
    );
  }
  // Raw network-level errors (TypeError: Failed to fetch, ECONNREFUSED, etc.)
  if (err instanceof TypeError) return true;
  return false;
}

/**
 * The default {@link ContractProvider}: speaks raw JSON-RPC 2.0 over the SDK's
 * own HttpClient (fetch), keeping the core package dependency-free.
 *
 * When constructed with multiple `rpcUrls` it implements automatic failover:
 * if a transient error occurs on one URL the next URL in the list is tried
 * transparently. Non-transient errors (contract reverts, bad parameters) are
 * surfaced immediately without attempting other providers.
 *
 * This is the provider `ContractClient` constructs internally from `rpcUrl` /
 * `rpcUrls` when no `contractProvider` is configured.
 */
export class JsonRpcContractProvider implements ContractProvider {
  private readonly http: HttpClient;
  /** Ordered list of RPC endpoints; failover tries them in sequence. */
  private readonly rpcUrls: readonly string[];

  /**
   * @param http     - The SDK HttpClient instance.
   * @param rpcUrls  - One or more RPC endpoint URLs. Failover is applied when
   *                   multiple URLs are provided.
   */
  constructor(http: HttpClient, rpcUrls: string | string[]) {
    this.http = http;
    this.rpcUrls = Array.isArray(rpcUrls) ? rpcUrls : [rpcUrls];

    if (this.rpcUrls.length === 0) {
      throw new GuildPassError(
        'JsonRpcContractProvider requires at least one RPC URL',
        GuildPassErrorCode.INVALID_CONFIG,
      );
    }
  }

  /** The primary (first) RPC URL, kept for backwards-compatibility. */
  public get rpcUrl(): string {
    return this.rpcUrls[0];
  }

  // ---------------------------------------------------------------------------
  // Private helpers
  // ---------------------------------------------------------------------------

  /**
   * Attempts an `eth_call` against a single RPC endpoint URL and returns the
   * raw result. Throws on both transient and non-transient errors so the
   * caller can decide how to handle them.
   */
  private async attemptEthCall(
    url: string,
    request: EthCallRequest,
    options?: RequestOptions,
  ): Promise<unknown> {
    const callOptions = {
      retry: {
        allowMutatingRetry: true,
        ...options?.retry,
      },
      timeoutMs: options?.timeoutMs,
      signal: options?.signal,
    };

    const payload = (await (this.http.post as (
      path: string,
      body: unknown,
      opts?: unknown,
    ) => Promise<(JsonRpcSuccess & JsonRpcError) | undefined>)(
      url,
      {
        jsonrpc: '2.0',
        id: 1,
        method: 'eth_call',
        params: [{ to: request.to, data: request.data }, 'latest'],
      },
      callOptions,
    ));

    if (payload?.error) {
      throw new GuildPassError(
        payload.error.message ?? 'RPC provider returned an error',
        GuildPassErrorCode.HTTP_ERROR,
        undefined,
        payload.error,
      );
    }

    return payload?.result;
  }

  /**
   * Attempts a batch `eth_call` against a single RPC endpoint URL and
   * returns the ordered per-item results.
   */
  private async attemptBatchEthCall(
    url: string,
    requests: EthCallRequest[],
    options?: RequestOptions,
  ): Promise<BatchItemResult[]> {
    const batchPayload = requests.map((call, idx) => ({
      jsonrpc: '2.0' as const,
      id: idx + 1,
      method: 'eth_call' as const,
      params: [{ to: call.to, data: call.data }, 'latest'],
    }));

    const callOptions = {
      retry: {
        allowMutatingRetry: true,
        ...options?.retry,
      },
      timeoutMs: options?.timeoutMs,
      signal: options?.signal,
    };

    const payloads = (await (this.http.post as (
      path: string,
      body: unknown,
      opts?: unknown,
    ) => Promise<JsonRpcBatchResponseItem[]>)(url, batchPayload, callOptions));

    if (!Array.isArray(payloads)) {
      throw new GuildPassError(
        'Batch RPC response is not an array',
        GuildPassErrorCode.INVALID_RESPONSE,
      );
    }

    // Map responses back by their JSON-RPC id to preserve input order
    const responseMap = new Map<number, JsonRpcBatchResponseItem>();
    for (const p of payloads) {
      if (p && typeof p.id === 'number') {
        responseMap.set(p.id, p);
      }
    }

    const results: BatchItemResult[] = [];

    for (let i = 0; i < requests.length; i++) {
      const expectedId = i + 1;
      const payload = responseMap.get(expectedId);

      if (!payload) {
        results.push({
          status: 'error',
          error: `No response for batch item ${i} (id: ${expectedId})`,
        });
      } else if (payload.error) {
        results.push({
          status: 'error',
          error: payload.error.message ?? `RPC error (code: ${payload.error.code})`,
        });
      } else if (payload.result === undefined || payload.result === null) {
        results.push({
          status: 'error',
          error: `Empty result for batch item ${i}`,
        });
      } else if (typeof payload.result !== 'string') {
        results.push({
          status: 'error',
          error: `Unexpected result type for batch item ${i}`,
        });
      } else {
        results.push({
          status: 'success',
          result: payload.result,
        });
      }
    }

    return results;
  }

  // ---------------------------------------------------------------------------
  // ContractProvider interface
  // ---------------------------------------------------------------------------

  public async ethCall(request: EthCallRequest, options?: RequestOptions): Promise<unknown> {
    let lastError: unknown;

    for (const url of this.rpcUrls) {
      try {
        return await this.attemptEthCall(url, request, options);
      } catch (err) {
        if (isTransientError(err)) {
          lastError = err;
          // Try the next URL
          continue;
        }
        // Non-transient error — propagate immediately
        throw err;
      }
    }

    // All URLs failed with transient errors
    throw lastError;
  }

  public async batchEthCall(
    requests: EthCallRequest[],
    options?: RequestOptions,
  ): Promise<BatchItemResult[]> {
    let lastError: unknown;

    for (const url of this.rpcUrls) {
      try {
        return await this.attemptBatchEthCall(url, requests, options);
      } catch (err) {
        if (isTransientError(err)) {
          lastError = err;
          // Try the next URL
          continue;
        }
        // Non-transient error — propagate immediately
        throw err;
      }
    }

    // All URLs failed with transient errors
    throw lastError;
  }
}
