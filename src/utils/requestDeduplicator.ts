/**
 * Configuration options for {@link RequestDeduplicator}.
 */
export interface RequestDeduplicatorOptions {
  /**
   * Maximum number of concurrent in-flight requests.
   * When exceeded, new requests throw a {@link CapacityExceededError}.
   * @default 100
   */
  readonly maxInFlight?: number;

  /**
   * Optional retention time in milliseconds for completed results.
   * If set, successful results are cached for this duration after completion.
   * This is separate from in-flight deduplication and does not affect failure handling.
   * Set to 0 (default) to disable retention and remove entries immediately after completion.
   * @default 0
   */
  readonly retentionMs?: number;
}

/**
 * An asynchronous producer function that generates a result.
 */
export type AsyncProducer<T> = () => Promise<T>;

/**
 * Error thrown when the deduplicator exceeds its configured capacity.
 */
export class CapacityExceededError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "CapacityExceededError";
  }
}

/**
 * A generic in-flight request deduplication primitive.
 *
 * Ensures concurrent callers using the same deduplication key share one underlying
 * asynchronous execution. Entries are removed after completion (success or failure)
 * unless retention is configured.
 *
 * @example
 * ```ts
 * const deduplicator = new RequestDeduplicator<string>();
 *
 * // Both calls share the same execution
 * const [result1, result2] = await Promise.all([
 *   deduplicator.execute("user:123", () => fetchUser("123")),
 *   deduplicator.execute("user:123", () => fetchUser("123")),
 * ]);
 * ```
 *
 * @typeParam T - The type of value produced by the async producer.
 */
export class RequestDeduplicator<T> {
  private readonly inFlight = new Map<string, Promise<T>>();
  private readonly retainedResults = new Map<string, { result: T; expiresAt: number }>();
  private readonly maxInFlight: number;
  private readonly retentionMs: number;

  constructor(options: RequestDeduplicatorOptions = {}) {
    this.maxInFlight = options.maxInFlight ?? 100;
    this.retentionMs = options.retentionMs ?? 0;

    if (this.maxInFlight <= 0 || !Number.isInteger(this.maxInFlight)) {
      throw new Error("maxInFlight must be a positive integer");
    }

    if (this.retentionMs < 0 || !Number.isInteger(this.retentionMs)) {
      throw new Error("retentionMs must be a non-negative integer");
    }
  }

  /**
   * Executes the producer for the given key, deduplicating concurrent calls.
   *
   * If a request with the same key is already in-flight, the existing promise
   * is returned. Otherwise, a new promise is created and stored.
   *
   * @param key - A deterministic string key identifying the logical operation.
   * @param producer - An async function that produces the result.
   * @returns A promise that resolves to the producer's result.
   * @throws {CapacityExceededError} When maxInFlight capacity is exceeded.
   */
  async execute(key: string, producer: AsyncProducer<T>): Promise<T> {
    // Check for retained result first
    const retained = this.retainedResults.get(key);
    if (retained) {
      if (Date.now() < retained.expiresAt) {
        return retained.result;
      }
      this.retainedResults.delete(key);
    }

    // Check for existing in-flight request
    const existing = this.inFlight.get(key);
    if (existing) {
      return existing;
    }

    // Check capacity before creating new entry
    if (this.inFlight.size >= this.maxInFlight) {
      throw new CapacityExceededError(
        `Maximum in-flight capacity (${this.maxInFlight}) exceeded for key "${key}"`,
      );
    }

    // Create and store the new promise
    const promise = producer()
      .then((result) => {
        this.inFlight.delete(key);

        // Schedule retention if configured
        if (this.retentionMs > 0) {
          this.retainedResults.set(key, {
            result,
            expiresAt: Date.now() + this.retentionMs,
          });
        }

        return result;
      })
      .catch((error) => {
        // Always clean up on failure to allow retries
        this.inFlight.delete(key);
        throw error;
      });

    this.inFlight.set(key, promise);
    return promise;
  }

  /**
   * Returns the current number of in-flight requests.
   *
   * This is useful for diagnostics and monitoring.
   */
  getInFlightCount(): number {
    return this.inFlight.size;
  }

  /**
   * Returns the current number of retained results.
   *
   * This is useful for diagnostics when retention is enabled.
   */
  getRetainedCount(): number {
    // Clean up expired entries before reporting
    this.cleanupExpiredRetained();
    return this.retainedResults.size;
  }

  /**
   * Clears all in-flight requests and retained results.
   *
   * In-flight promises are not cancelled, but their entries are removed.
   * This should be used with caution as it may lead to duplicate executions.
   */
  clear(): void {
    this.inFlight.clear();
    this.retainedResults.clear();
  }

  /**
   * Cleans up expired retained entries.
   * This is called automatically by getRetainedCount() and can be called manually.
   */
  private cleanupExpiredRetained(): void {
    const now = Date.now();
    for (const [key, entry] of this.retainedResults) {
      if (now >= entry.expiresAt) {
        this.retainedResults.delete(key);
      }
    }
  }
}
