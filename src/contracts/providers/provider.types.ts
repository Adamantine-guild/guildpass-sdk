/**
 * Provider health status
 */
export enum ProviderHealthStatus {
  HEALTHY = 'healthy',
  DEGRADED = 'degraded',
  UNHEALTHY = 'unhealthy',
  UNKNOWN = 'unknown',
}

/**
 * Provider metrics for health scoring
 */
export interface ProviderMetrics {
  /** Total number of requests */
  totalRequests: number;
  /** Number of successful requests */
  successfulRequests: number;
  /** Number of failed requests */
  failedRequests: number;
  /** Number of timed-out requests */
  timedOutRequests: number;
  /** Average latency in milliseconds */
  averageLatency: number;
  /** Latest latency in milliseconds */
  latestLatency: number;
  /** Error rate (0-1) */
  errorRate: number;
  /** Timeout rate (0-1) */
  timeoutRate: number;
  /** Health score (0-100) */
  healthScore: number;
  /** Last update timestamp */
  lastUpdated: number;
  /** Last health check timestamp */
  lastHealthCheck: number;
}

/**
 * Provider configuration
 */
export interface ProviderConfig {
  /** Provider name/identifier */
  name: string;
  /** Provider URL */
  url: string;
  /** Timeout in milliseconds */
  timeout: number;
  /** Maximum retries */
  maxRetries: number;
  /** Health check interval in milliseconds */
  healthCheckInterval: number;
  /** Whether the provider is enabled */
  enabled: boolean;
  /** Weight for provider selection (higher = preferred) */
  weight: number;
}

/**
 * Health scoring weights
 */
export interface HealthWeights {
  /** Weight for latency (0-1) */
  latencyWeight: number;
  /** Weight for error rate (0-1) */
  errorWeight: number;
  /** Weight for timeout rate (0-1) */
  timeoutWeight: number;
  /** Weight for success rate (0-1) */
  successWeight: number;
}

/**
 * Provider selection result
 */
export interface ProviderSelection {
  /** Selected provider */
  provider: ProviderConfig;
  /** Selected provider's health score */
  score: number;
  /** Reason for selection */
  reason: string;
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
