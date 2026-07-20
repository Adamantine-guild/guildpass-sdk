// ---------------------------------------------------------------------------
// Provider interface types for GuildPass SDK contract interactions.
// ---------------------------------------------------------------------------

/**
 * Minimal JSON-RPC request/response provider interface.
 *
 * The SDK ships with {@link JsonRpcContractProvider} (HTTP fetch-based).
 * Advanced consumers can supply a custom provider (e.g. WebSocket, IPC).
 */
export interface ContractProvider {
  /**
   * Send a JSON-RPC request and return the raw result.
   *
   * @param method  - RPC method name (e.g. `eth_call`).
   * @param params  - Positional parameters for the method.
   * @returns The `result` field from a successful JSON-RPC response.
   * @throws {GuildPassError} On transport or RPC-level errors.
   */
  request(method: string, params: unknown[]): Promise<unknown>;

  /** Gracefully tear down the provider (close connections, timers, etc.). */
  destroy(): void;
}

// ---------------------------------------------------------------------------
// Subscription-aware provider
// ---------------------------------------------------------------------------

/** A single `Transfer` event decoded from an ERC-20 / ERC-721 log. */
export type TransferEvent = {
  /** The contract that emitted the event. */
  contractAddress: string;
  /** `from` address (indexed topic). */
  from: string;
  /** `to` address (indexed topic). */
  to: string;
  /** Token amount or token ID (decoded from `data` for ERC-20, topic for ERC-721). */
  value: string;
  /** Block number where the event was mined (hex string). */
  blockNumber: string;
  /** Transaction hash (hex string). */
  transactionHash: string;
  /** Log index within the block (hex string). */
  logIndex: string;
};

/** Callback invoked for every parsed `Transfer` event. */
export type TransferCallback = (event: TransferEvent) => void;

/**
 * Extension of {@link ContractProvider} that adds real-time event subscriptions.
 *
 * Implementations (e.g. {@link WebSocketContractProvider}) speak `eth_subscribe`
 * / `eth_unsubscribe` over a WebSocket transport.
 */
export interface SubscribableContractProvider extends ContractProvider {
  /**
   * Subscribe to ERC-20/ERC-721 `Transfer` events for a given contract.
   *
   * @param contractAddress - The contract to watch.
   * @param callback        - Invoked on every decoded `Transfer` event.
   * @returns An unsubscribe function. Call it to stop receiving events and
   *          clean up the underlying `eth_subscription`.
   */
  onTokenTransfer(
    contractAddress: string,
    callback: TransferCallback,
  ): () => void;
}

// ---------------------------------------------------------------------------
// WebSocket provider configuration
// ---------------------------------------------------------------------------

/** Configuration options for {@link WebSocketContractProvider}. */
export type WebSocketProviderConfig = {
  /**
   * WebSocket RPC endpoint (must start with `wss://` or `ws://`).
   *
   * **Note:** This is separate from the HTTP `rpcUrl` used for
   * `eth_call` / `eth_getBalance` etc. Many RPC providers expose
   * WebSocket endpoints on a different host or port.
   */
  wssUrl: string;

  /**
   * Maximum number of reconnect attempts before giving up.
   * @default 10
   */
  maxReconnects?: number;

  /**
   * Base delay (ms) for exponential backoff on reconnect.
   * The actual delay is `baseDelayMs * 2^attempt` capped at `maxDelayMs`.
   * @default 1000
   */
  baseDelayMs?: number;

  /**
   * Maximum delay (ms) between reconnect attempts.
   * @default 30_000
   */
  maxDelayMs?: number;

  /**
   * Time in ms after which a subscription request is considered timed out.
   * @default 15_000
   */
  subscribeTimeoutMs?: number;
};
