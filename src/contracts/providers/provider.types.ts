// GuildPass SDK: Import external module dependencies.
import { RequestOptions } from '../../types/common';
import { BatchItemResult } from '../contract.types';

/** A single read-only contract call request (pre-encoded calldata). */
export type EthCallRequest = {
  /** The contract address to call. */
  to: string;
  /** The 4-byte selector + ABI-encoded arguments (pre-encoded hex string). */
  data: string;
};

/**
 * Abstraction over "how an eth_call reaches a chain". The SDK ships a default
 * implementation that speaks raw JSON-RPC over fetch, and optional adapters
 * (subpath exports `@guildpass/sdk/adapters/viem` and
 * `@guildpass/sdk/adapters/ethers`) that translate an existing viem
 * `PublicClient` or ethers `Provider` into this interface.
 *
 * Implementations must preserve the SDK's error semantics: provider-level
 * failures throw `GuildPassError` with code `HTTP_ERROR`; malformed results
 * surface as `INVALID_RESPONSE` when decoded by the caller.
 */
export interface ContractProvider {
  /**
   * Executes a single read-only `eth_call` and resolves with the raw
   * (undecoded) hex result.
   */
  ethCall(request: EthCallRequest, options?: RequestOptions): Promise<unknown>;

  /**
   * Executes multiple read-only `eth_call`s and resolves with ordered
   * per-item results. Individual failures are reported per item and must not
   * reject the whole batch.
   */
  batchEthCall(requests: EthCallRequest[], options?: RequestOptions): Promise<BatchItemResult[]>;
}
