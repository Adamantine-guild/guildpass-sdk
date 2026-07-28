// GuildPass SDK: Pull in package or module bindings.
import { GuildPassError } from '../errors/GuildPassError';
import { GuildPassErrorCode } from '../errors/errorCodes';
import { RequestOptions } from '../types/common';
import { BatchItemResult } from '../contracts/contract.types';
import { batchItemError } from '../contracts/batchErrors';
import { ContractProvider, EthCallRequest } from '../contracts/providers/provider.types';

/**
 * Structural subset of an ethers v6 `Provider` that the adapter needs. Typed
 * structurally (rather than importing ethers) so ethers stays an optional
 * peer dependency: any real `Provider` (e.g. `JsonRpcProvider`) satisfies
 * this shape.
 */
export type EthersProviderLike = {
  call(tx: { to: string; data: string }): Promise<string>;
};

/**
 * Wraps an existing ethers `Provider` as a {@link ContractProvider}.
 *
 * Error semantics mirror the default raw JSON-RPC provider: provider-level
 * failures throw `GuildPassError` with code `HTTP_ERROR`; malformed call
 * results surface as `INVALID_RESPONSE` when the SDK decodes them.
 *
 * @example
 * import { JsonRpcProvider } from 'ethers';
 * import { ethersContractProvider } from '@guildpass/sdk/adapters/ethers';
 *
 * const client = new GuildPassClient({
 *   apiUrl: '...',
 *   contractProvider: ethersContractProvider(new JsonRpcProvider(url)),
 * });
 */
export function ethersContractProvider(provider: EthersProviderLike): ContractProvider {
  if (!provider || typeof provider.call !== 'function') {
    throw new GuildPassError(
      'ethersContractProvider requires an ethers Provider with a call() method',
      GuildPassErrorCode.INVALID_CONFIG,
    );
  }

  const ethCall = async (request: EthCallRequest): Promise<unknown> => {
    try {
      return await provider.call({ to: request.to, data: request.data });
    } catch (err: any) {
      throw new GuildPassError(
        err?.shortMessage ?? err?.message ?? 'RPC provider returned an error',
        GuildPassErrorCode.HTTP_ERROR,
        undefined,
        err,
      );
    }
  };

  const batchEthCall = async (requests: EthCallRequest[]): Promise<BatchItemResult[]> =>
    Promise.all(
      requests.map(async (request, i): Promise<BatchItemResult> => {
        try {
          const result = await ethCall(request);
          if (typeof result !== 'string') {
            return batchItemError(
              `Unexpected result type for batch item ${i}`,
              GuildPassErrorCode.INVALID_RESPONSE,
            );
          }
          return { status: 'success', result };
        } catch (err: any) {
          // `ethCall` above wraps every ethers failure as a GuildPassError, so
          // propagate whatever code it chose rather than hardcoding one here.
          // `instanceof` is sufficient and exact: the error was constructed by
          // this same module, so it can never have crossed a realm boundary.
          return batchItemError(
            err?.message ?? `RPC error for batch item ${i}`,
            err instanceof GuildPassError ? err.code : GuildPassErrorCode.HTTP_ERROR,
          );
        }
      }),
    );

  return {
    ethCall: (request: EthCallRequest, _options?: RequestOptions) => ethCall(request),
    batchEthCall: (requests: EthCallRequest[], _options?: RequestOptions) =>
      batchEthCall(requests),
  };
}
