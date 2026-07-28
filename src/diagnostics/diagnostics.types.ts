export interface CacheDiagnostics {
  hits: number;
  misses: number;
  errors: number;
}

export interface CircuitBreakerDiagnostics {
  circuitOpen: boolean;
  consecutiveFailures: number;
  latencyEmaMs: number;
  openUntil: number;
}

export interface RateLimitDiagnostics {
  throttlingUntil: number;
  currentRate: number;
}

export interface DiagnosticsSnapshot {
  inFlightRequests: number;
  cache: CacheDiagnostics;
  rateLimit: RateLimitDiagnostics | null;
  circuitBreakers: Record<string, CircuitBreakerDiagnostics>;
}

export interface DiagnosticsEvents {
  circuitOpen: (data: { url: string; openUntil: number }) => void;
  circuitClosed: (data: { url: string }) => void;
  rateLimitThrottled: (data: { throttlingUntil: number }) => void;
  cacheHit: (data: { key: string }) => void;
  cacheMiss: (data: { key: string }) => void;
}
