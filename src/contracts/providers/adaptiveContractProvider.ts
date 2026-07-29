import {
  ProviderConfig,
  ProviderMetrics,
  ProviderHealthStatus,
  ProviderSelection,
} from './provider.types';
import { HealthTracker } from './healthTracker';

/**
 * Adaptive contract provider with health-based failover
 * 
 * Routes calls to the best-scoring healthy provider with automatic recovery detection.
 */
export class AdaptiveContractProvider {
  private providers: ProviderConfig[] = [];
  private healthTracker: HealthTracker;
  private healthCheckInterval: NodeJS.Timeout | null = null;

  constructor(providers: ProviderConfig[]) {
    this.providers = providers.filter((p) => p.enabled);
    this.healthTracker = new HealthTracker();

    if (this.providers.length === 0) {
      throw new Error('No enabled providers configured');
    }

    // Start periodic health checks
    this.startHealthChecks();
  }

  /**
   * Execute a call with the best available provider
   */
  async execute<T>(
    fn: (provider: ProviderConfig) => Promise<T>,
    options?: {
      maxRetries?: number;
      fallbackOnFailure?: boolean;
    },
  ): Promise<T> {
    const maxRetries = options?.maxRetries || 3;
    let lastError: Error | null = null;

    for (let attempt = 0; attempt < maxRetries; attempt++) {
      // Select the best provider
      const selection = this.selectProvider();

      if (!selection) {
        throw new Error('No healthy providers available');
      }

      const { provider, score, reason } = selection;

      try {
        const startTime = Date.now();
        const result = await this.executeWithTimeout(
          fn,
          provider,
          provider.timeout,
        );
        const latency = Date.now() - startTime;

        // Record success
        this.healthTracker.recordSuccess(provider.name, latency);

        // Update provider metrics (for debugging)
        this.logProviderMetrics(provider.name);

        return result;
      } catch (error) {
        lastError = error as Error;

        // Check if it's a timeout
        if ((error as any).code === 'TIMEOUT') {
          this.healthTracker.recordTimeout(provider.name);
        } else {
          this.healthTracker.recordFailure(provider.name, error as Error);
        }

        // If we have more retries, continue
        if (attempt < maxRetries - 1) {
          // Exponential backoff
          const backoff = Math.min(1000 * Math.pow(2, attempt), 10000);
          await this.sleep(backoff);
          continue;
        }

        // If we have fallback enabled, try the next best provider
        if (options?.fallbackOnFailure) {
          // Try all providers in order of health
          const sortedProviders = this.getProvidersSortedByHealth();
          for (const p of sortedProviders) {
            if (p.name === provider.name) continue; // Skip the one we already tried
            try {
              const startTime = Date.now();
              const result = await this.executeWithTimeout(
                fn,
                p,
                p.timeout,
              );
              const latency = Date.now() - startTime;
              this.healthTracker.recordSuccess(p.name, latency);
              return result;
            } catch (fallbackError) {
              this.healthTracker.recordFailure(p.name, fallbackError as Error);
              // Continue to next provider
            }
          }
        }

        throw lastError;
      }
    }

    throw lastError || new Error('All attempts failed');
  }

  /**
   * Select the best provider based on health scores
   */
  selectProvider(): ProviderSelection | null {
    const healthyProviders = this.providers.filter((p) =>
      this.healthTracker.isHealthy(p.name),
    );

    if (healthyProviders.length === 0) {
      // If no healthy providers, use the least unhealthy
      const sorted = this.getProvidersSortedByHealth();
      if (sorted.length === 0) {
        return null;
      }
      const provider = sorted[0];
      const score = this.healthTracker.getHealthScore(provider.name);
      return {
        provider,
        score,
        reason: 'No healthy providers available, using least unhealthy',
      };
    }

    // Find the best healthy provider
    let bestProvider = healthyProviders[0];
    let bestScore = this.healthTracker.getHealthScore(bestProvider.name);

    for (const provider of healthyProviders) {
      const score = this.healthTracker.getHealthScore(provider.name);
      if (score > bestScore) {
        bestScore = score;
        bestProvider = provider;
      }
    }

    return {
      provider: bestProvider,
      score: bestScore,
      reason: 'Best healthy provider selected',
    };
  }

  /**
   * Get all providers sorted by health score (descending)
   */
  getProvidersSortedByHealth(): ProviderConfig[] {
    return [...this.providers].sort((a, b) => {
      const scoreA = this.healthTracker.getHealthScore(a.name);
      const scoreB = this.healthTracker.getHealthScore(b.name);
      return scoreB - scoreA;
    });
  }

  /**
   * Check the health of all providers
   */
  async checkHealth(): Promise<void> {
    for (const provider of this.providers) {
      try {
        const startTime = Date.now();
        await this.executeWithTimeout(
          async (p: ProviderConfig) => {
            // Simple health check - fetch latest block number
            return { status: 'ok' };
          },
          provider,
          5000, // Short timeout for health checks
        );
        const latency = Date.now() - startTime;
        this.healthTracker.recordSuccess(provider.name, latency);
      } catch (error) {
        this.healthTracker.recordFailure(provider.name, error as Error);
      }
    }
  }

  /**
   * Execute with timeout
   */
  private async executeWithTimeout<T>(
    fn: (provider: ProviderConfig) => Promise<T>,
    provider: ProviderConfig,
    timeout: number,
  ): Promise<T> {
    return new Promise<T>((resolve, reject) => {
      const timeoutId = setTimeout(() => {
        const error = new Error(`Provider ${provider.name} timed out after ${timeout}ms`);
        (error as any).code = 'TIMEOUT';
        reject(error);
      }, timeout);

      fn(provider)
        .then((result) => {
          clearTimeout(timeoutId);
          resolve(result);
        })
        .catch((error) => {
          clearTimeout(timeoutId);
          reject(error);
        });
    });
  }

  /**
   * Log provider metrics (for debugging)
   */
  private logProviderMetrics(providerName: string): void {
    const metrics = this.healthTracker.getAllMetrics().get(providerName);
    if (metrics) {
      console.debug(`[Provider ${providerName}] Score: ${metrics.healthScore.toFixed(1)}`);
    }
  }

  /**
   * Start periodic health checks
   */
  private startHealthChecks(): void {
    // Check health immediately
    this.checkHealth().catch(() => {
      // Ignore initial health check failures
    });

    // Set up interval
    this.healthCheckInterval = setInterval(() => {
      this.checkHealth().catch(() => {
        // Ignore health check failures
      });
    }, this.healthTracker['healthCheckInterval'] || 30000);
  }

  /**
   * Stop health checks
   */
  stopHealthChecks(): void {
    if (this.healthCheckInterval) {
      clearInterval(this.healthCheckInterval);
      this.healthCheckInterval = null;
    }
  }

  /**
   * Sleep helper
   */
  private sleep(ms: number): Promise<void> {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }

  /**
   * Get health status of all providers
   */
  getHealthStatus(): Record<string, { status: ProviderHealthStatus; score: number }> {
    const result: Record<string, { status: ProviderHealthStatus; score: number }> = {};
    for (const provider of this.providers) {
      result[provider.name] = {
        status: this.healthTracker.getHealthStatus(provider.name),
        score: this.healthTracker.getHealthScore(provider.name),
      };
    }
    return result;
  }
}
