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

// ─── WebSocket provider types ─────────────────────────────────────────────

/** A decoded ERC-20 Transfer event log. */
export type TransferEvent = {
  from: string;
  to: string;
  value: bigint;
  transactionHash: string;
  blockNumber: number;
};

/** Callback invoked for each Transfer event received via subscription. */
export type TransferCallback = (event: TransferEvent) => void;

/** Configuration for the WebSocket-based contract event provider. */
export type WebSocketProviderConfig = {
  /** WebSocket endpoint URL (ws:// or wss://). */
  wssUrl: string;

  /** Maximum number of reconnection attempts before giving up. Default: 10. */
  maxReconnects?: number;

  /** Initial backoff delay in milliseconds for reconnection. Default: 1000. */
  baseDelayMs?: number;

  /** Maximum backoff delay in milliseconds. Default: 30_000. */
  maxDelayMs?: number;

  /**
   * Timeout in milliseconds for individual `eth_subscribe` confirmations.
   * Default: 15_000.
   */
  subscribeTimeoutMs?: number;

  /**
   * Per-request timeout in milliseconds for JSON-RPC calls over the
   * WebSocket transport. When exceeded the request is rejected with a
   * TIMEOUT error but the underlying persistent socket is NOT closed.
   * Default: 10_000.
   */
  requestTimeoutMs?: number;
};

/**
 * Extension of {@link ContractProvider} that adds real-time event
 * subscriptions via WebSocket.
 */
export interface SubscribableContractProvider extends ContractProvider {
  /** Subscribe to Transfer events for a contract address. */
  subscribe(contractAddress: string, callback: TransferCallback): Promise<() => void>;

  /** Cleanly tear down the provider and all active subscriptions. */
  destroy(): void;
}
