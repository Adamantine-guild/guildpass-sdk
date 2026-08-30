/**
 * Cache policy configuration with stale-while-revalidate semantics.
 */
export interface CachePolicy {
  /** Time-to-live in milliseconds before the entry is considered stale */
  ttlMs: number;
  /** Additional time in milliseconds during which stale entries can be served while revalidating */
  staleWhileRevalidateMs: number;
}

/**
 * Metadata for a cache entry.
 */
export interface CacheEntryMetadata {
  /** Timestamp when the entry was stored (milliseconds since epoch) */
  storedAt: number;
}

/**
 * Decision result from cache policy evaluation.
 */
export interface CacheDecision {
  /** The state of the cache entry */
  state: "fresh" | "stale" | "expired";
  /** Whether the entry can be served from cache */
  canServe: boolean;
  /** Whether the entry requires revalidation */
  requiresRevalidation: boolean;
}

/**
 * Pure, deterministic cache policy evaluator with stale-while-revalidate semantics.
 * 
 * This evaluator does not perform any actual caching or storage operations.
 * It only evaluates whether a cache entry is fresh, stale, or expired based on
 * the provided policy and metadata.
 * 
 * @example
 * ```ts
 * const policy: CachePolicy = { ttlMs: 60000, staleWhileRevalidateMs: 30000 };
 * const metadata: CacheEntryMetadata = { storedAt: Date.now() - 30000 };
 * const decision = CachePolicyEvaluator.evaluate(policy, metadata);
 * // decision.state === 'fresh'
 * // decision.canServe === true
 * // decision.requiresRevalidation === false
 * ```
 */
export class CachePolicyEvaluator {
  /**
   * Evaluates a cache entry against a policy to determine its state.
   * 
   * @param policy - The cache policy to evaluate against
   * @param metadata - The cache entry metadata
   * @param nowMs - Current timestamp in milliseconds (defaults to Date.now())
   * @returns The cache decision
   * @throws Error if policy values are negative
   */
  static evaluate(
    policy: CachePolicy,
    metadata: CacheEntryMetadata,
    nowMs: number = Date.now()
  ): CacheDecision {
    // Validate policy values
    if (policy.ttlMs < 0) {
      throw new Error("CachePolicy.ttlMs must be non-negative");
    }
    if (policy.staleWhileRevalidateMs < 0) {
      throw new Error("CachePolicy.staleWhileRevalidateMs must be non-negative");
    }

    // Calculate age of the entry
    const age = nowMs - metadata.storedAt;

    // Handle future timestamps (clock skew)
    if (age < 0) {
      return {
        state: "expired",
        canServe: false,
        requiresRevalidation: true,
      };
    }

    // Fresh: age is within TTL
    if (age <= policy.ttlMs) {
      return {
        state: "fresh",
        canServe: true,
        requiresRevalidation: false,
      };
    }

    // Stale: age is within the stale-while-revalidate window
    const staleWindowEnd = policy.ttlMs + policy.staleWhileRevalidateMs;
    if (age <= staleWindowEnd) {
      return {
        state: "stale",
        canServe: true,
        requiresRevalidation: true,
      };
    }

    // Expired: age is beyond the stale-while-revalidate window
    return {
      state: "expired",
      canServe: false,
      requiresRevalidation: true,
    };
  }
}
