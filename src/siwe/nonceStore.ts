// GuildPass SDK: Pull in package or module bindings.

/**
 * Pluggable store for tracking SIWE nonce consumption, mirroring the
 * {@link CacheAdapter} design so callers can swap the in-memory reference
 * implementation for a shared backend (Redis, Cloudflare KV, etc.) in
 * multi-instance deployments.
 *
 * A nonce store answers one question atomically: "has this nonce been used
 * before, and if not, mark it used now?" This single-call check-and-consume is
 * what makes replay protection safe under concurrency — two simultaneous
 * verifications of the same message cannot both succeed.
 *
 * Implementations should treat `consume` as the authoritative gate:
 * - Return `true` when the nonce was previously unused and is now marked used.
 * - Return `false` when the nonce was already consumed (a replay).
 *
 * Unlike {@link CacheAdapter}, `consume` is security-critical and therefore
 * MAY throw on backend failure: a store that cannot guarantee the atomic
 * check must not silently report success, since that would open the very
 * replay window this interface exists to close.
 */
export interface NonceStore {
  /**
   * Atomically check whether `nonce` is unused and, if so, mark it consumed.
   *
   * @param nonce - The SIWE nonce to check and consume.
   * @param ttl   - Optional time-to-live **in milliseconds** for the consumed
   *                marker. Once elapsed the nonce may be pruned; callers should
   *                align this with the SIWE message's `expirationTime` so a
   *                nonce cannot be pruned before the message it protects has
   *                itself expired. `undefined` means "keep until evicted".
   * @returns `true` if the nonce was unused (verification may proceed),
   *          `false` if it was already consumed (a replay).
   */
  consume(nonce: string, ttl?: number): Promise<boolean>;

  /**
   * Optional: report whether a nonce has already been consumed without
   * consuming it. Provided for diagnostics and testing; the SDK never relies
   * on it for the replay gate (only `consume` is authoritative).
   */
  has?(nonce: string): Promise<boolean>;

  /** Optional: remove all tracked nonces. Intended for tests and teardown. */
  clear?(): Promise<void>;
}

/** Internal record: the epoch-millis expiry for a consumed nonce, or null. */
type NonceEntry = {
  expiresAt: number | null;
};

/**
 * In-memory reference {@link NonceStore}. Suitable for single-instance servers,
 * local development, and tests. It is NOT appropriate for multi-instance
 * production deployments: each process holds its own map, so a nonce consumed
 * on one instance is unknown to the others, leaving a replay window across the
 * fleet. For those deployments, back the same {@link NonceStore} interface with
 * a shared store such as Redis.
 *
 * Expired entries are pruned lazily on access and, optionally, on a periodic
 * timer so a burst of short-TTL nonces cannot grow memory without bound.
 */
export class InMemoryNonceStore implements NonceStore {
  private readonly consumed = new Map<string, NonceEntry>();
  private sweepTimer: ReturnType<typeof setInterval> | undefined;

  /**
   * @param options.sweepIntervalMs - When set, a background timer prunes
   *   expired nonces on this cadence (in milliseconds), bounding memory even
   *   if `consume` is never called again. Omit to rely solely on lazy pruning.
   */
  constructor(options: { sweepIntervalMs?: number } = {}) {
    if (options.sweepIntervalMs && options.sweepIntervalMs > 0) {
      this.sweepTimer = setInterval(() => this.sweepExpired(), options.sweepIntervalMs);
      // Do not keep the Node event loop alive solely for the sweep timer.
      if (typeof this.sweepTimer === 'object' && 'unref' in this.sweepTimer) {
        (this.sweepTimer as { unref: () => void }).unref();
      }
    }
  }

  /** True when an entry exists and has not passed its expiry. */
  private isLive(entry: NonceEntry | undefined, now: number): boolean {
    if (!entry) return false;
    return entry.expiresAt === null || entry.expiresAt > now;
  }

  public async consume(nonce: string, ttl?: number): Promise<boolean> {
    const now = Date.now();
    const existing = this.consumed.get(nonce);

    if (this.isLive(existing, now)) {
      // Already consumed and still within its lifetime: this is a replay.
      return false;
    }

    // Either never seen, or the previous marker has expired: mark it used now.
    this.consumed.set(nonce, {
      expiresAt: ttl !== undefined && ttl > 0 ? now + ttl : null,
    });
    return true;
  }

  public async has(nonce: string): Promise<boolean> {
    return this.isLive(this.consumed.get(nonce), Date.now());
  }

  public async clear(): Promise<void> {
    this.consumed.clear();
  }

  /** Removes every entry whose expiry has passed. Safe to call at any time. */
  public sweepExpired(now: number = Date.now()): void {
    for (const [nonce, entry] of this.consumed) {
      if (entry.expiresAt !== null && entry.expiresAt <= now) {
        this.consumed.delete(nonce);
      }
    }
  }

  /** Current number of tracked (not yet pruned) nonces. For tests/metrics. */
  public get size(): number {
    return this.consumed.size;
  }

  /**
   * Stops the background sweep timer, if one was started. Call on shutdown so
   * the process can exit cleanly. Lazy pruning still applies afterward.
   */
  public dispose(): void {
    if (this.sweepTimer) {
      clearInterval(this.sweepTimer);
      this.sweepTimer = undefined;
    }
  }
}
