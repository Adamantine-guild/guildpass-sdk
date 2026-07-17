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
 * The default {@link ContractProvider}: speaks raw JSON-RPC 2.0 over the SDK's
 * own HttpClient (fetch), keeping the core package dependency-free. This is
 * the provider `ContractClient` constructs internally from `rpcUrl` when no
 * `contractProvider` is configured.
 */
export class JsonRpcContractProvider implements ContractProvider {
  private readonly http: HttpClient;
  private readonly rpcUrl: string;

  constructor(http: HttpClient, rpcUrl: string) {
    this.http = http;
    this.rpcUrl = rpcUrl;
  }

  public async ethCall(request: EthCallRequest, options?: RequestOptions): Promise<unknown> {
    const payload = await this.http.post<(JsonRpcSuccess & JsonRpcError) | undefined>(
      this.rpcUrl,
      {
        jsonrpc: '2.0',
        id: 1,
        method: 'eth_call',
        params: [{ to: request.to, data: request.data }, 'latest'],
      },
      {
        ...options,
        retry: {
          allowMutatingRetry: true,
          ...options?.retry,
        },
      },
    );

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

  public async batchEthCall(
    requests: EthCallRequest[],
    options?: RequestOptions,
  ): Promise<BatchItemResult[]> {
    // Build the JSON-RPC batch payload
    const batchPayload = requests.map((call, idx) => ({
      jsonrpc: '2.0' as const,
      id: idx + 1,
      method: 'eth_call' as const,
      params: [
        {
          to: call.to,
          data: call.data,
        },
        'latest',
      ],
    }));

    const payloads = await this.http.post<JsonRpcBatchResponseItem[]>(this.rpcUrl, batchPayload, {
      ...options,
      retry: {
        allowMutatingRetry: true,
        ...options?.retry,
      },
    });

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
}
