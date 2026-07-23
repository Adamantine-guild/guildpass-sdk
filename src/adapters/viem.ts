// GuildPass SDK: Pull in package or module bindings.
import { GuildPassErrorCode } from '../errors/errorCodes';
import { GuildPassConfigError } from '../errors/GuildPassConfigError';
import { GuildPassNetworkError } from '../errors/GuildPassNetworkError';
import { RequestOptions } from '../types/common';
import { BatchItemResult } from '../contracts/contract.types';
import { ContractProvider, EthCallRequest } from '../contracts/providers/provider.types';

/**
 * Structural subset of a viem `PublicClient` that the adapter needs. Typed
 * structurally (rather than importing viem) so viem stays an optional peer
 * dependency: any real `PublicClient` satisfies this shape.
 */
export type ViemPublicClientLike = {
  call(args: { to: string; data: string }): Promise<{ data?: string }>;
};

/**
 * Wraps an existing viem `PublicClient` as a {@link ContractProvider}.
 *
 * Error semantics mirror the default raw JSON-RPC provider: provider-level
 * failures throw `GuildPassError` with code `HTTP_ERROR`; malformed call
 * results surface as `INVALID_RESPONSE` when the SDK decodes them.
 *
 * @example
 * import { createPublicClient, http } from 'viem';
 * import { viemContractProvider } from '@guildpass/sdk/adapters/viem';
 *
 * const client = new GuildPassClient({
 *   apiUrl: '...',
 *   contractProvider: viemContractProvider(createPublicClient({ transport: http(url) })),
 * });
 */
export function viemContractProvider(client: ViemPublicClientLike): ContractProvider {
  if (!client || typeof client.call !== 'function') {
    throw new GuildPassConfigError('viemContractProvider requires a viem PublicClient with a call() method');
  }

  const ethCall = async (request: EthCallRequest): Promise<unknown> => {
    let response: { data?: string };
    try {
      response = await client.call({ to: request.to, data: request.data });
    } catch (err: any) {
      throw new GuildPassNetworkError(
        err?.shortMessage ?? err?.message ?? 'RPC provider returned an error',
        GuildPassErrorCode.HTTP_ERROR,
        undefined,
        err,
      );
    }
    // viem omits `data` for empty results; raw JSON-RPC returns '0x'.
    return response?.data ?? '0x';
  };

  const batchEthCall = async (requests: EthCallRequest[]): Promise<BatchItemResult[]> =>
    Promise.all(
      requests.map(async (request, i): Promise<BatchItemResult> => {
        try {
          const result = await ethCall(request);
          if (typeof result !== 'string') {
            return { status: 'error', error: `Unexpected result type for batch item ${i}` };
          }
          return { status: 'success', result };
        } catch (err: any) {
          return { status: 'error', error: err?.message ?? `RPC error for batch item ${i}` };
        }
      }),
    );

  return {
    ethCall: (request: EthCallRequest, _options?: RequestOptions) => ethCall(request),
    batchEthCall: (requests: EthCallRequest[], _options?: RequestOptions) =>
      batchEthCall(requests),
  };
}
