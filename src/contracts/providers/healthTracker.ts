import {
  ProviderConfig,
  ProviderMetrics,
  ProviderHealthStatus,
  HealthWeights,
} from './provider.types';

/**
 * Default health scoring weights
 */
const DEFAULT_WEIGHTS: HealthWeights = {
  latencyWeight: 0.3,
  errorWeight: 0.3,
  timeoutWeight: 0.3,
  successWeight: 0.1,
};

/**
 * Health tracker for providers
 * 
 * Maintains rolling health scores per provider based on:
 * - Latency
 * - Error rate
 * - Timeout frequency
 * - Success rate
 */
export class HealthTracker {
  private metrics: Map<string, ProviderMetrics> = new Map();
  private weights: HealthWeights;
  private decayFactor: number = 0.9; // Exponential moving average decay
  private healthCheckInterval: number = 30000; // 30 seconds

  constructor(weights?: Partial<HealthWeights>) {
    this.weights = {
      ...DEFAULT_WEIGHTS,
      ...weights,
    };
  }

  /**
   * Record a successful request
   */
  recordSuccess(
    providerName: string,
    latency: number,
  ): void {
    const metrics = this.getOrCreateMetrics(providerName);
    metrics.totalRequests++;
    metrics.successfulRequests++;
    metrics.latestLatency = latency;
    metrics.averageLatency = this.updateMovingAverage(
      metrics.averageLatency,
      latency,
      this.decayFactor,
    );
    metrics.lastUpdated = Date.now();
    this.updateHealthScore(metrics);
  }

  /**
   * Record a failed request
   */
  recordFailure(
    providerName: string,
    error: Error,
  ): void {
    const metrics = this.getOrCreateMetrics(providerName);
    metrics.totalRequests++;
    metrics.failedRequests++;
    metrics.lastUpdated = Date.now();
    this.updateHealthScore(metrics);
  }

  /**
   * Record a timeout
   */
  recordTimeout(
    providerName: string,
  ): void {
    const metrics = this.getOrCreateMetrics(providerName);
    metrics.totalRequests++;
    metrics.timedOutRequests++;
    metrics.lastUpdated = Date.now();
    this.updateHealthScore(metrics);
  }

  /**
   * Get provider health score
   */
  getHealthScore(providerName: string): number {
    const metrics = this.metrics.get(providerName);
    if (!metrics) {
      return 0;
    }
    return metrics.healthScore;
  }

  /**
   * Get provider health status
   */
  getHealthStatus(providerName: string): ProviderHealthStatus {
    const score = this.getHealthScore(providerName);
    if (score >= 70) {
      return ProviderHealthStatus.HEALTHY;
    } else if (score >= 40) {
      return ProviderHealthStatus.DEGRADED;
    } else if (score > 0) {
      return ProviderHealthStatus.UNHEALTHY;
    }
    return ProviderHealthStatus.UNKNOWN;
  }

  /**
   * Get all provider metrics
   */
  getAllMetrics(): Map<string, ProviderMetrics> {
    return this.metrics;
  }

  /**
   * Check if a provider is healthy
   */
  isHealthy(providerName: string): boolean {
    const status = this.getHealthStatus(providerName);
    return status === ProviderHealthStatus.HEALTHY;
  }

  /**
   * Check if a provider is degraded
   */
  isDegraded(providerName: string): boolean {
    const status = this.getHealthStatus(providerName);
    return status === ProviderHealthStatus.DEGRADED;
  }

  /**
   * Check if a provider is unhealthy
   */
  isUnhealthy(providerName: string): boolean {
    const status = this.getHealthStatus(providerName);
    return status === ProviderHealthStatus.UNHEALTHY;
  }

  /**
   * Reset metrics for a provider
   */
  resetMetrics(providerName: string): void {
    this.metrics.delete(providerName);
  }

  /**
   * Update health score for a provider
   */
  private updateHealthScore(metrics: ProviderMetrics): void {
    // Calculate rates
    const errorRate = metrics.totalRequests > 0
      ? metrics.failedRequests / metrics.totalRequests
      : 0;
    const timeoutRate = metrics.totalRequests > 0
      ? metrics.timedOutRequests / metrics.totalRequests
      : 0;
    const successRate = metrics.totalRequests > 0
      ? metrics.successfulRequests / metrics.totalRequests
      : 0;

    metrics.errorRate = errorRate;
    metrics.timeoutRate = timeoutRate;

    // Calculate score components (0-100)
    // Lower latency = higher score
    const latencyScore = Math.max(0, 100 - metrics.averageLatency / 10);
    
    // Lower error rate = higher score
    const errorScore = Math.max(0, 100 - (errorRate * 100));
    
    // Lower timeout rate = higher score
    const timeoutScore = Math.max(0, 100 - (timeoutRate * 100));
    
    // Higher success rate = higher score
    const successScore = successRate * 100;

    // Weighted sum
    const rawScore = (
      latencyScore * this.weights.latencyWeight +
      errorScore * this.weights.errorWeight +
      timeoutScore * this.weights.timeoutWeight +
      successScore * this.weights.successWeight
    );

    // Apply decay to smooth score changes
    const previousScore = metrics.healthScore || 50;
    metrics.healthScore = this.updateMovingAverage(
      previousScore,
      rawScore,
      this.decayFactor,
    );

    // Clamp to 0-100
    metrics.healthScore = Math.max(0, Math.min(100, metrics.healthScore));
  }

  /**
   * Get or create metrics for a provider
   */
  private getOrCreateMetrics(providerName: string): ProviderMetrics {
    if (!this.metrics.has(providerName)) {
      this.metrics.set(providerName, {
        totalRequests: 0,
        successfulRequests: 0,
        failedRequests: 0,
        timedOutRequests: 0,
        averageLatency: 0,
        latestLatency: 0,
        errorRate: 0,
        timeoutRate: 0,
        healthScore: 50, // Start at neutral
        lastUpdated: Date.now(),
        lastHealthCheck: Date.now(),
      });
    }
    return this.metrics.get(providerName)!;
  }

  /**
   * Update moving average with exponential decay
   */
  private updateMovingAverage(
    current: number,
    newValue: number,
    decay: number,
  ): number {
    return current * decay + newValue * (1 - decay);
  }
}
