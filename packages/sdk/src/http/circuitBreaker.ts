import { GuildPassError } from '../errors/GuildPassError';
import { GuildPassErrorCode } from '../errors/errorCodes';
import type { CircuitBreakerConfig, CircuitState } from './http.types';

export class CircuitBreaker {
  public state: CircuitState = 'CLOSED';
  private failureCount = 0;
  private nextAttemptMs = 0;

  private readonly failureThreshold: number;
  private readonly coolDownPeriodMs: number;

  constructor(config?: CircuitBreakerConfig) {
    this.failureThreshold = config?.failureThreshold ?? 5;
    this.coolDownPeriodMs = config?.coolDownPeriodMs ?? 30000;
  }

  public async execute<T>(fn: () => Promise<T>): Promise<T> {
    if (this.state === 'OPEN') {
      if (Date.now() >= this.nextAttemptMs) {
        this.state = 'HALF_OPEN';
      } else {
        throw new GuildPassError(
          'Service is currently unavailable due to repeated failures',
          GuildPassErrorCode.SERVICE_UNAVAILABLE
        );
      }
    }

    try {
      const result = await fn();
      this.onSuccess();
      return result;
    } catch (error: any) {
      this.onError(error);
      throw error;
    }
  }

  private onSuccess(): void {
    if (this.state === 'HALF_OPEN') {
      this.state = 'CLOSED';
      this.failureCount = 0;
    } else if (this.state === 'CLOSED') {
      this.failureCount = 0;
    }
  }

  private onError(error: any): void {
    let isTransient = false;
    
    if (error instanceof GuildPassError) {
      const transientCodes = [
        GuildPassErrorCode.HTTP_ERROR,
        GuildPassErrorCode.TIMEOUT,
        GuildPassErrorCode.SERVER_ERROR,
        GuildPassErrorCode.RATE_LIMITED
      ];
      if (transientCodes.includes(error.code)) {
        isTransient = true;
      }
    } else if (error instanceof Error) {
      // Fallback for native errors not wrapped yet
      isTransient = true;
    }

    if (!isTransient) {
      return; // Ignore non-transient errors (e.g. 400 Bad Request, 401 Unauthorized)
    }

    if (this.state === 'HALF_OPEN') {
      this.trip();
    } else if (this.state === 'CLOSED') {
      this.failureCount++;
      if (this.failureCount >= this.failureThreshold) {
        this.trip();
      }
    }
  }

  private trip(): void {
    this.state = 'OPEN';
    this.nextAttemptMs = Date.now() + this.coolDownPeriodMs;
  }
}

export class CircuitBreakerManager {
  private readonly breakers = new Map<string, CircuitBreaker>();
  private readonly config?: CircuitBreakerConfig;

  constructor(config?: CircuitBreakerConfig) {
    this.config = config;
  }

  public getBreaker(endpointKey: string): CircuitBreaker {
    let breaker = this.breakers.get(endpointKey);
    if (!breaker) {
      breaker = new CircuitBreaker(this.config);
      this.breakers.set(endpointKey, breaker);
    }
    return breaker;
  }

  public async execute<T>(endpointKey: string, fn: () => Promise<T>): Promise<T> {
    const breaker = this.getBreaker(endpointKey);
    return breaker.execute(fn);
  }

  public getDiagnostics(): Record<string, CircuitState> {
    const diagnostics: Record<string, CircuitState> = {};
    for (const [key, breaker] of this.breakers.entries()) {
      // If the state is OPEN but coolDown has elapsed, logically it's HALF_OPEN
      // so we evaluate state before returning to give accurate diagnosis
      if (breaker.state === 'OPEN' && Date.now() >= (breaker as any).nextAttemptMs) {
        diagnostics[key] = 'HALF_OPEN';
      } else {
        diagnostics[key] = breaker.state;
      }
    }
    return diagnostics;
  }
}
