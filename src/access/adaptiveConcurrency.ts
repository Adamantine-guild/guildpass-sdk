import { GuildPassErrorCode } from '../errors/errorCodes';

export type AdaptiveConcurrencyOptions = {
  /** Starting limit for in-flight requests. Also acts as the maximum the limit can recover to. */
  initialLimit: number;
  /** Floor the limit can decay to under sustained failures. Defaults to 1. */
  minLimit?: number;
};

/**
 * AIMD (additive-increase, multiplicative-decrease) concurrency controller,
 * the same family of algorithm TCP uses for congestion control.
 *
 * - On a throttling signal (HTTP 429 or 5xx) the limit is halved, floored at `minLimit`.
 * - On sustained success the limit grows by one after every `currentLimit`
 *   consecutive successes, capped at `initialLimit`.
 * - Non-throttling failures (4xx input errors, network errors) do not shrink
 *   the limit — they say nothing about backend capacity.
 *
 * Slots are handed out via `acquire()`/`release()`; when the limit has shrunk
 * below the number of in-flight requests, new acquires park until enough
 * slots free up.
 */
export class AdaptiveConcurrencyController {
  private limit: number;
  private readonly maxLimit: number;
  private readonly minLimit: number;
  private inFlight = 0;
  private successesSinceIncrease = 0;
  private readonly waiters: Array<() => void> = [];

  constructor(options: AdaptiveConcurrencyOptions) {
    this.limit = options.initialLimit;
    this.maxLimit = options.initialLimit;
    this.minLimit = options.minLimit ?? 1;
  }

  /** The current effective concurrency limit. */
  public get currentLimit(): number {
    return this.limit;
  }

  /** The number of slots currently checked out. */
  public get currentInFlight(): number {
    return this.inFlight;
  }

  /** Resolves once a slot is available under the current limit and takes it. */
  public async acquire(): Promise<void> {
    while (this.inFlight >= this.limit) {
      await new Promise<void>((resolve) => this.waiters.push(resolve));
    }
    this.inFlight++;
  }

  /** Returns a slot, waking one parked acquirer if the limit now allows it. */
  public release(): void {
    this.inFlight--;
    if (this.inFlight < this.limit) {
      const next = this.waiters.shift();
      if (next) next();
    }
  }

  /** Records one successful request, growing the limit additively. */
  public recordSuccess(): void {
    this.successesSinceIncrease++;
    if (this.successesSinceIncrease >= this.limit) {
      this.successesSinceIncrease = 0;
      if (this.limit < this.maxLimit) {
        this.limit++;
      }
    }
  }

  /**
   * Records one failed request. Only throttling signals (HTTP 429 / 5xx)
   * shrink the limit; all other failures are ignored.
   */
  public recordFailure(error: unknown): void {
    if (!AdaptiveConcurrencyController.isThrottlingError(error)) return;
    this.successesSinceIncrease = 0;
    this.limit = Math.max(this.minLimit, Math.floor(this.limit / 2));
  }

  /** True when the error signals backend overload (HTTP 429 or 5xx). */
  public static isThrottlingError(error: unknown): boolean {
    const status = (error as { status?: unknown } | null | undefined)?.status;
    if (typeof status === 'number') {
      return status === 429 || (status >= 500 && status < 600);
    }
    const code = (error as { code?: unknown } | null | undefined)?.code;
    return code === GuildPassErrorCode.RATE_LIMITED || code === GuildPassErrorCode.SERVER_ERROR;
  }
}
