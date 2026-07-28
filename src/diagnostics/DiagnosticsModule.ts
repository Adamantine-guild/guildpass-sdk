import {
  CacheDiagnostics,
  CircuitBreakerDiagnostics,
  DiagnosticsEvents,
  DiagnosticsSnapshot,
  RateLimitDiagnostics,
} from './diagnostics.types';

export class DiagnosticsModule {
  private cacheStats: CacheDiagnostics = { hits: 0, misses: 0, errors: 0 };
  private listeners: Record<string, Set<any>> = {};

  private inFlightRequestsProvider?: () => number;
  private rateLimitProvider?: () => RateLimitDiagnostics | null;
  private circuitBreakersProvider?: () => Record<string, CircuitBreakerDiagnostics>;

  public on<K extends keyof DiagnosticsEvents>(event: K, handler: DiagnosticsEvents[K]): void {
    if (!this.listeners[event as string]) {
      this.listeners[event as string] = new Set();
    }
    this.listeners[event as string].add(handler);
  }

  public off<K extends keyof DiagnosticsEvents>(event: K, handler: DiagnosticsEvents[K]): void {
    if (this.listeners[event as string]) {
      this.listeners[event as string].delete(handler);
    }
  }

  public emit<K extends keyof DiagnosticsEvents>(
    event: K,
    ...args: Parameters<DiagnosticsEvents[K]>
  ): void {
    if (this.listeners[event as string]) {
      for (const handler of this.listeners[event as string]) {
        handler(...args);
      }
    }
  }

  public registerInFlightRequests(fn: () => number): void {
    this.inFlightRequestsProvider = fn;
  }

  public registerRateLimit(fn: () => RateLimitDiagnostics | null): void {
    this.rateLimitProvider = fn;
  }

  public registerCircuitBreakers(fn: () => Record<string, CircuitBreakerDiagnostics>): void {
    this.circuitBreakersProvider = fn;
  }

  public recordCacheHit(key: string): void {
    this.cacheStats.hits++;
    this.emit('cacheHit', { key });
  }

  public recordCacheMiss(key: string): void {
    this.cacheStats.misses++;
    this.emit('cacheMiss', { key });
  }

  public recordCacheError(): void {
    this.cacheStats.errors++;
  }

  public getSnapshot(): DiagnosticsSnapshot {
    return {
      inFlightRequests: this.inFlightRequestsProvider ? this.inFlightRequestsProvider() : 0,
      cache: { ...this.cacheStats },
      rateLimit: this.rateLimitProvider ? this.rateLimitProvider() : null,
      circuitBreakers: this.circuitBreakersProvider ? this.circuitBreakersProvider() : {},
    };
  }
}
