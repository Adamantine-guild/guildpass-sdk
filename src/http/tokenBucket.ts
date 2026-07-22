export type RateLimitConfig = {
  requestsPerSecond: number;
  burst?: number;
};

function delay(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

export class TokenBucket {
  private tokens: number;
  private capacity: number;
  private baseRate: number;
  private currentRate: number;
  private refillRate: number;
  private lastRefill: number;
  private retryUntil: number = 0; // Timestamp until which requests are throttled

  constructor(config: RateLimitConfig) {
    const { requestsPerSecond, burst } = config;
    this.baseRate = requestsPerSecond;
    this.currentRate = requestsPerSecond;
    this.capacity = burst ?? requestsPerSecond;
    if (this.capacity < 1) this.capacity = 1;
    this.tokens = this.capacity;
    this.refillRate = requestsPerSecond / 1000;
    this.lastRefill = Date.now();
  }

  private refill(): void {
    const now = Date.now();
    const elapsed = now - this.lastRefill;
    if (elapsed <= 0) return;
    const newTokens = elapsed * this.refillRate;
    this.tokens = Math.min(this.capacity, this.tokens + newTokens);
    this.lastRefill = now;
  }

  async acquire(): Promise<void> {
    const now = Date.now();
    if (now < this.retryUntil) {
      await delay(this.retryUntil - now);
    }

    this.refill();
    if (this.tokens >= 1) {
      this.tokens -= 1;
      return;
    }
    const waitMs = Math.ceil((1 - this.tokens) / this.refillRate);
    if (waitMs > 0) {
      await delay(waitMs);
    }
    return this.acquire();
  }

  onRateLimited(retryAfterMs?: number): void {
    if (retryAfterMs && retryAfterMs > 0) {
      this.retryUntil = Date.now() + retryAfterMs;
      // Also adjust the rate for future pacing after the hard throttle
      const impliedRate = 1000 / retryAfterMs;
      this.currentRate = Math.min(this.currentRate, impliedRate * 0.8);
    } else {
      this.currentRate *= 0.8;
    }
    if (this.currentRate < 0.01) this.currentRate = 0.01;
    this.refillRate = this.currentRate / 1000;
    this.tokens = Math.min(this.tokens, this.capacity);
  }

  onSuccess(): void {
    if (this.currentRate < this.baseRate) {
      this.currentRate = Math.min(this.baseRate, this.currentRate * 1.05);
      this.refillRate = this.currentRate / 1000;
    }
  }

  public getThrottlingUntil(): number {
    return this.retryUntil;
  }
}