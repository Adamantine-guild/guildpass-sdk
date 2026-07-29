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
