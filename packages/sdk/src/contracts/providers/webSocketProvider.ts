// GuildPass SDK: WebSocket-based contract provider with eth_subscribe support.
import { GuildPassError } from '../../errors/GuildPassError';
import { GuildPassErrorCode } from '../../errors/errorCodes';
import {
  SubscribableContractProvider,
  TransferCallback,
  TransferEvent,
  WebSocketProviderConfig,
} from './provider.types';

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

/**
 * Keccak-256 of `Transfer(address,address,uint256)` — the canonical
 * ERC-20 Transfer event signature.
 */
const TRANSFER_TOPIC =
  '0xddf252ad1be2c89b69c2b068fc378daa952ba7f163c4a11628f55a4df523b3ef';

/** JSON-RPC id counter. */
let nextId = 1;

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

const topicToAddress = (topic: string): string => {
  // Topic is 32 bytes; the address lives in the lowest 20 bytes.
  return `0x${topic.slice(-40)}`.toLowerCase();
};

const hexToBigInt = (hex: string): bigint => {
  if (hex === '0x' || hex === '0x0') return 0n;
  return BigInt(hex);
};

// ---------------------------------------------------------------------------
// WebSocketContractProvider
// ---------------------------------------------------------------------------

/**
 * A {@link SubscribableContractProvider} that speaks `eth_subscribe` /
 * `eth_unsubscribe` over a native WebSocket connection.
 *
 * **Important:** This provider requires a WSS-capable RPC endpoint, which is
 * **separate** from the standard HTTP `rpcUrl` used by
 * `JsonRpcContractProvider`.  Many node providers expose WebSocket on a
 * different host or port — consult your provider's documentation.
 *
 * @example
 * ```typescript
 * import { WebSocketContractProvider } from '@guildpass/sdk';
 *
 * const provider = new WebSocketContractProvider({
 *   wssUrl: 'wss://mainnet.infura.io/ws/v3/YOUR_KEY',
 * });
 *
 * const unsubscribe = provider.onTokenTransfer(
 *   '0xContractAddress',
 *   (event) => {
 *     console.log(`${event.from} → ${event.to}  amount=${event.value}`);
 *     client.invalidateWalletCache(event.from);
 *     client.invalidateWalletCache(event.to);
 *   },
 * );
 *
 * // Later: unsubscribe();
 * ```
 */
export class WebSocketContractProvider implements SubscribableContractProvider {
  // -----------------------------------------------------------------------
  // Configuration
  // -----------------------------------------------------------------------

  private readonly wssUrl: string;
  private readonly maxReconnects: number;
  private readonly baseDelayMs: number;
  private readonly maxDelayMs: number;
  private readonly subscribeTimeoutMs: number;

  // -----------------------------------------------------------------------
  // State
  // -----------------------------------------------------------------------

  private ws: WebSocket | null = null;
  private reconnectAttempts = 0;
  private reconnectTimer: ReturnType<typeof setTimeout> | null = null;
  private destroyed = false;

  /** Subscriptions keyed by JSON-RPC subscription ID (hex string). */
  private readonly subscriptions = new Map<
    string,
    {
      contractAddress: string;
      callback: TransferCallback;
    }
  >();

  /** Map from contract address → subscription IDs watching it. */
  private readonly contractSubs = new Map<string, Set<string>>();

  /**
   * Subscriptions that have been requested but not yet confirmed by the
   * RPC endpoint. Keyed by the JSON-RPC request id so we can resolve the
   * real subscription id when the response arrives.
   */
  private readonly unconfirmedSubs = new Map<
    number,
    {
      contractAddress: string;
      callback: TransferCallback;
    }
  >();

  /** Pending requests awaiting a response. */
  private readonly pending = new Map<
    number,
    {
      resolve: (value: unknown) => void;
      reject: (reason: Error) => void;
      timer: ReturnType<typeof setTimeout>;
    }
  >();

  // -----------------------------------------------------------------------
  // Constructor
  // -----------------------------------------------------------------------

  constructor(config: WebSocketProviderConfig) {
    if (!config.wssUrl) {
      throw new GuildPassError(
        'wssUrl is required for WebSocketContractProvider',
        GuildPassErrorCode.INVALID_CONFIG,
      );
    }

    const url = new URL(config.wssUrl);
    if (url.protocol !== 'wss:' && url.protocol !== 'ws:') {
      throw new GuildPassError(
        `Invalid wssUrl protocol: "${url.protocol}". Expected ws:// or wss://`,
        GuildPassErrorCode.INVALID_CONFIG,
      );
    }

    this.wssUrl = config.wssUrl;
    this.maxReconnects = config.maxReconnects ?? 10;
    this.baseDelayMs = config.baseDelayMs ?? 1000;
    this.maxDelayMs = config.maxDelayMs ?? 30_000;
    this.subscribeTimeoutMs = config.subscribeTimeoutMs ?? 15_000;

    this.connect();
  }

  // -----------------------------------------------------------------------
  // ContractProvider: request()
  // -----------------------------------------------------------------------

  /** Send a JSON-RPC request over the WebSocket. */
  public request(method: string, params: unknown[]): Promise<unknown> {
    if (this.destroyed) {
      return Promise.reject(
        new GuildPassError(
          'WebSocket provider has been destroyed',
          GuildPassErrorCode.WS_CONNECTION_ERROR,
        ),
      );
    }

    const id = nextId++;
    const payload = JSON.stringify({
      jsonrpc: '2.0',
      id,
      method,
      params,
    });

    return new Promise<unknown>((resolve, reject) => {
      const timer = setTimeout(() => {
        this.pending.delete(id);
        reject(
          new GuildPassError(
            `RPC request "${method}" timed out`,
            GuildPassErrorCode.TIMEOUT,
          ),
        );
      }, 30_000);

      this.pending.set(id, { resolve, reject, timer });

      try {
        this.sendRaw(payload);
      } catch (err) {
        clearTimeout(timer);
        this.pending.delete(id);
        reject(err);
      }
    });
  }

  // -----------------------------------------------------------------------
  // SubscribableContractProvider: onTokenTransfer()
  // -----------------------------------------------------------------------

  /**
   * Subscribe to ERC-20/ERC-721 `Transfer` events for a specific contract.
   *
   * Returns an unsubscribe function. Calling it will send `eth_unsubscribe`
   * and clean up internal state.
   */
  public onTokenTransfer(
    contractAddress: string,
    callback: TransferCallback,
  ): () => void {
    if (this.destroyed) {
      throw new GuildPassError(
        'WebSocket provider has been destroyed',
        GuildPassErrorCode.WS_CONNECTION_ERROR,
      );
    }

    const normalizedAddress = contractAddress.toLowerCase();

    /** Register the subscription intent; returns the JSON-RPC request id. */
    const sendSubscribeRequest = (): number => {
      const params = [
        {
          address: normalizedAddress,
          topics: [TRANSFER_TOPIC],
        },
      ];

      // We must know the request id so we can correlate the response.
      const id = nextId;
      const payload = JSON.stringify({
        jsonrpc: '2.0',
        id,
        method: 'eth_subscribe',
        params: ['logs', params],
      });

      // Register the callback *before* the response arrives so that
      // notifications dispatched before the Promise microtask runs
      // are still routed correctly.
      this.unconfirmedSubs.set(id, {
        contractAddress: normalizedAddress,
        callback,
      });

      const timer = setTimeout(() => {
        this.pending.delete(id);
        this.unconfirmedSubs.delete(id);
      }, this.subscribeTimeoutMs);

      this.pending.set(id, {
        resolve: (subId: unknown) => {
          clearTimeout(timer);
          this.pending.delete(id);
          this.unconfirmedSubs.delete(id);

          if (typeof subId !== 'string') {
            return;
          }

          this.subscriptions.set(subId, {
            contractAddress: normalizedAddress,
            callback,
          });

          const subs = this.contractSubs.get(normalizedAddress) ?? new Set();
          subs.add(subId);
          this.contractSubs.set(normalizedAddress, subs);
        },
        reject: (err: Error) => {
          clearTimeout(timer);
          this.pending.delete(id);
          this.unconfirmedSubs.delete(id);
          // Swallow — caller's catch will handle notification.
        },
        timer,
      });

      try {
        this.sendRaw(payload);
      } catch (err) {
        clearTimeout(timer);
        this.pending.delete(id);
        this.unconfirmedSubs.delete(id);
      }

      return id;
    };

    // If the socket is open, subscribe immediately; otherwise queue for
    // reconnection.
    if (this.ws?.readyState === WebSocket.OPEN) {
      sendSubscribeRequest();
    } else {
      this._pendingContractSubs.set(normalizedAddress, callback);
    }

    // Return unsubscribe function.
    let unsubscribed = false;
    return () => {
      if (unsubscribed || this.destroyed) return;
      unsubscribed = true;

      // Remove from pending queue if not yet subscribed.
      this._pendingContractSubs.delete(normalizedAddress);

      // Remove any unconfirmed subscription for this contract.
      for (const [reqId, sub] of this.unconfirmedSubs) {
        if (sub.contractAddress === normalizedAddress) {
          this.unconfirmedSubs.delete(reqId);
          // Also clean up the pending request.
          const pendingEntry = this.pending.get(reqId);
          if (pendingEntry) {
            clearTimeout(pendingEntry.timer);
            this.pending.delete(reqId);
          }
        }
      }

      // Unsubscribe all confirmed subscriptions for this contract.
      const subIds = this.contractSubs.get(normalizedAddress);
      if (subIds) {
        for (const subId of subIds) {
          this.subscriptions.delete(subId);
          this.request('eth_unsubscribe', [subId]).catch(() => {
            // Best-effort unsub — socket may already be closed.
          });
        }
        this.contractSubs.delete(normalizedAddress);
      }
    };
  }

  // -----------------------------------------------------------------------
  // Lifecycle: destroy()
  // -----------------------------------------------------------------------

  /** Permanently close the WebSocket and reject all pending requests. */
  public destroy(): void {
    if (this.destroyed) return;
    this.destroyed = true;

    if (this.reconnectTimer !== null) {
      clearTimeout(this.reconnectTimer);
      this.reconnectTimer = null;
    }

    // Reject all pending requests.
    const destroyError = new GuildPassError(
      'WebSocket provider destroyed',
      GuildPassErrorCode.WS_CONNECTION_ERROR,
    );
    for (const [, entry] of this.pending) {
      clearTimeout(entry.timer);
      entry.reject(destroyError);
    }
    this.pending.clear();
    this.subscriptions.clear();
    this.contractSubs.clear();
    this.unconfirmedSubs.clear();
    this._pendingContractSubs.clear();

    if (this.ws) {
      this.ws.onopen = null;
      this.ws.onclose = null;
      this.ws.onerror = null;
      this.ws.onmessage = null;
      this.ws.close();
      this.ws = null;
    }
  }

  // =======================================================================
  // PRIVATE
  // =======================================================================

  /** Pending subscriptions waiting for the socket to open. */
  private readonly _pendingContractSubs = new Map<string, TransferCallback>();

  // -----------------------------------------------------------------------
  // Connection management
  // -----------------------------------------------------------------------

  private connect(): void {
    if (this.destroyed) return;

    let ws: WebSocket;
    try {
      ws = new WebSocket(this.wssUrl);
    } catch (err) {
      this.handleConnectionFailure(
        new GuildPassError(
          'Failed to create WebSocket',
          GuildPassErrorCode.WS_CONNECTION_ERROR,
          undefined,
          err,
        ),
      );
      return;
    }

    this.ws = ws;

    ws.onopen = (): void => {
      this.reconnectAttempts = 0;

      // Resubscribe any contracts that were registered before the socket
      // opened (or after a reconnect).
      this.resubscribeAll();
    };

    ws.onmessage = (event: MessageEvent): void => {
      this.handleMessage(event.data as string);
    };

    ws.onerror = (): void => {
      // The `onclose` handler will fire next, so we just note the error.
      // If there's no onclose (unlikely), we trigger reconnect here.
    };

    ws.onclose = (): void => {
      // Clear the WebSocket reference to prevent double-handling.
      this.ws = null;

      // Reject any pending requests.
      const closeError = new GuildPassError(
        'WebSocket connection closed',
        GuildPassErrorCode.WS_CONNECTION_ERROR,
      );
      for (const [, entry] of this.pending) {
        clearTimeout(entry.timer);
        entry.reject(closeError);
      }
      this.pending.clear();
      this.unconfirmedSubs.clear();

      if (this.destroyed) return;

      this.scheduleReconnect();
    };
  }

  private scheduleReconnect(): void {
    if (this.reconnectAttempts >= this.maxReconnects) {
      // Notify active subscriptions that they're dead by passing a
      // synthetic "disconnected" event (all zero-ish fields so consumers
      // can distinguish it from a real transfer).
      // For now, subscriptions simply stop firing — the consumer can
      // inspect provider state if needed.
      return;
    }

    const delay = Math.min(
      this.baseDelayMs * 2 ** this.reconnectAttempts,
      this.maxDelayMs,
    );

    // Add jitter: ±25% to avoid thundering herd.
    const jitter = delay * 0.25 * (Math.random() * 2 - 1);
    const actualDelay = Math.round(delay + jitter);

    this.reconnectAttempts++;

    this.reconnectTimer = setTimeout(() => {
      this.reconnectTimer = null;
      this.connect();
    }, actualDelay);
  }

  private handleConnectionFailure(err: Error): void {
    if (this.destroyed) return;

    // Reject all pending.
    for (const [, entry] of this.pending) {
      clearTimeout(entry.timer);
      entry.reject(err);
    }
    this.pending.clear();

    this.scheduleReconnect();
  }

  // -----------------------------------------------------------------------
  // Message handling
  // -----------------------------------------------------------------------

  private handleMessage(raw: string): void {
    let payload: Record<string, unknown>;
    try {
      payload = JSON.parse(raw);
    } catch {
      return; // Ignore malformed messages.
    }

    // eth_subscription notification
    if (
      payload.method === 'eth_subscription' &&
      payload.params &&
      typeof payload.params === 'object'
    ) {
      const params = payload.params as {
        subscription: string;
        result: unknown;
      };
      this.handleSubscriptionNotification(params.subscription, params.result);
      return;
    }

    // Response to a pending request
    if (typeof payload.id === 'number' || typeof payload.id === 'string') {
      const id =
        typeof payload.id === 'number' ? payload.id : Number(payload.id);
      const entry = this.pending.get(id);
      if (!entry) return; // Stale or already resolved.

      clearTimeout(entry.timer);
      this.pending.delete(id);

      if (payload.error) {
        const err = payload.error as { code?: number; message?: string };
        entry.reject(
          new GuildPassError(
            err.message ?? 'JSON-RPC error',
            GuildPassErrorCode.HTTP_ERROR,
            err.code,
            err,
          ),
        );
      } else {
        entry.resolve(payload.result);
      }
    }
  }

  // -----------------------------------------------------------------------
  // Subscription notification → TransferEvent parsing
  // -----------------------------------------------------------------------

  private handleSubscriptionNotification(
    subId: string,
    rawResult: unknown,
  ): void {
    const sub = this.subscriptions.get(subId);
    if (!sub) return;

    const log = rawResult as {
      address?: string;
      topics?: string[];
      data?: string;
      blockNumber?: string;
      transactionHash?: string;
      logIndex?: string;
    };

    // Validate structure: we need topics[1] (from) and topics[2] (to).
    if (!log.topics || log.topics.length < 3) return;
    if (log.topics[0]?.toLowerCase() !== TRANSFER_TOPIC.toLowerCase()) return;

    const contractAddress = (log.address ?? sub.contractAddress).toLowerCase();
    const from = topicToAddress(log.topics[1]);
    const to = topicToAddress(log.topics[2]);

    // For ERC-20 the value is in `data` (uint256).
    // For ERC-721 the tokenId is in topics[3].
    let value: string;
    if (log.topics.length === 4) {
      // ERC-721: tokenId is topics[3]
      value = hexToBigInt(log.topics[3]).toString(10);
    } else {
      // ERC-20: amount is in data
      value = hexToBigInt(log.data ?? '0x0').toString(10);
    }

    const event: TransferEvent = {
      contractAddress,
      from,
      to,
      value,
      blockNumber: log.blockNumber ?? '0x0',
      transactionHash: log.transactionHash ?? '0x0',
      logIndex: log.logIndex ?? '0x0',
    };

    try {
      sub.callback(event);
    } catch {
      // Swallow callback errors to prevent breaking the provider.
    }
  }

  // -----------------------------------------------------------------------
  // Re-subscription after reconnect
  // -----------------------------------------------------------------------

  private resubscribeAll(): void {
    // Re-subscribe active subscriptions by contract.
    for (const [oldSubId, sub] of this.subscriptions) {
      const params = [
        {
          address: sub.contractAddress,
          topics: [TRANSFER_TOPIC],
        },
      ];

      const id = nextId++;
      const payload = JSON.stringify({
        jsonrpc: '2.0',
        id,
        method: 'eth_subscribe',
        params: ['logs', params],
      });

      // Register synchronously so that notifications arriving before the
      // Promise microtask runs are still routed.
      this.unconfirmedSubs.set(id, {
        contractAddress: sub.contractAddress,
        callback: sub.callback,
      });

      const timer = setTimeout(() => {
        this.pending.delete(id);
        this.unconfirmedSubs.delete(id);
      }, this.subscribeTimeoutMs);

      this.pending.set(id, {
        resolve: (newSubId: unknown) => {
          clearTimeout(timer);
          this.pending.delete(id);
          this.unconfirmedSubs.delete(id);

          if (typeof newSubId !== 'string') return;

          // Replace old sub ID with new one.
          this.subscriptions.delete(oldSubId);
          this.subscriptions.set(newSubId, sub);

          const subs =
            this.contractSubs.get(sub.contractAddress) ?? new Set();
          subs.delete(oldSubId);
          subs.add(newSubId);
          this.contractSubs.set(sub.contractAddress, subs);
        },
        reject: () => {
          clearTimeout(timer);
          this.pending.delete(id);
          this.unconfirmedSubs.delete(id);
        },
        timer,
      });

      try {
        this.sendRaw(payload);
      } catch {
        clearTimeout(timer);
        this.pending.delete(id);
        this.unconfirmedSubs.delete(id);
      }
    }

    // Subscribe pending contracts that were registered while disconnected.
    for (const [contractAddress, callback] of this._pendingContractSubs) {
      const params = [
        {
          address: contractAddress,
          topics: [TRANSFER_TOPIC],
        },
      ];

      const id = nextId++;
      const payload = JSON.stringify({
        jsonrpc: '2.0',
        id,
        method: 'eth_subscribe',
        params: ['logs', params],
      });

      this.unconfirmedSubs.set(id, { contractAddress, callback });

      const timer = setTimeout(() => {
        this.pending.delete(id);
        this.unconfirmedSubs.delete(id);
      }, this.subscribeTimeoutMs);

      this.pending.set(id, {
        resolve: (subId: unknown) => {
          clearTimeout(timer);
          this.pending.delete(id);
          this.unconfirmedSubs.delete(id);

          if (typeof subId !== 'string') return;

          this.subscriptions.set(subId, { contractAddress, callback });

          const subs = this.contractSubs.get(contractAddress) ?? new Set();
          subs.add(subId);
          this.contractSubs.set(contractAddress, subs);
        },
        reject: () => {
          clearTimeout(timer);
          this.pending.delete(id);
          this.unconfirmedSubs.delete(id);
        },
        timer,
      });

      try {
        this.sendRaw(payload);
      } catch {
        clearTimeout(timer);
        this.pending.delete(id);
        this.unconfirmedSubs.delete(id);
      }
    }

    this._pendingContractSubs.clear();
  }

  // -----------------------------------------------------------------------
  // Raw send helper
  // -----------------------------------------------------------------------

  private sendRaw(data: string): void {
    if (!this.ws || this.ws.readyState !== WebSocket.OPEN) {
      throw new GuildPassError(
        'WebSocket is not connected',
        GuildPassErrorCode.WS_CONNECTION_ERROR,
      );
    }
    this.ws.send(data);
  }
}
