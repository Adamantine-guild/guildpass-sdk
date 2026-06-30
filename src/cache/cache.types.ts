/**
 * Pluggable cache backend for the SDK.
 *
 * Implement this interface to provide your own caching layer (Redis, LRU,
 * Cloudflare KV, etc.). Every method **must** be safe — errors must never
 * propagate; they are caught internally and routed to the optional
 * `onCacheError` hook so the cache never breaks API calls.
 *
 * Values are JSON-serialized before being passed to `set()` and
 * JSON-deserialized after `get()`. Adapters may store the raw JSON string as-is
 * (the SDK always passes round-trippable values), or apply their own encoding.
 *
 * @see {@link InMemoryCacheAdapter} for a reference implementation.
 */
export interface CacheAdapter {
  /**
   * Retrieve a cached value.
   *
   * Returns the deserialized value, or `null` when the key is missing, has
   * expired, or the stored JSON is malformed. Never throw — return `null`
   * for any error condition so the SDK falls through to the network.
   */
  get<T>(key: string): Promise<T | null>;

  /**
   * Persist a value with an optional TTL.
   *
   * @param key   Cache key (never contains secrets — only public identifiers
   *              like guild IDs, wallet addresses, and resource IDs).
   * @param value Arbitrary JSON-roundtrippable value.
   * @param ttl   Time-to-live **in milliseconds**. `undefined` or omitted
   *              means the entry should never expire (the adapter should store
   *              it until explicitly deleted or evicted by capacity limits).
   */
  set<T>(key: string, value: T, ttl?: number): Promise<void>;

  /** Remove a single entry. Must never throw. */
  delete(key: string): Promise<void>;

  /** Remove **all** entries from the cache. Must never throw. */
  clear(): Promise<void>;

  /**
   * Delete all entries whose key starts with the given prefix.
   *
   * **Optional** — the SDK falls back to a less efficient strategy when this
   * method is absent (e.g. deleting known exact keys or clearing the entire
   * cache). Implementing this enables granular per-guild and per-wallet cache
   * invalidation without flushing unrelated entries.
   *
   * Must never throw.
   */
  deleteByPrefix?(prefix: string): Promise<void>;
}

interface CacheEntry<T> {
  value: T;
  expiresAt: number | null;
}

/**
 * A lightweight, zero-dependency in-memory cache adapter backed by a `Map`.
 *
 * TTL values are expressed in **milliseconds**. Entries with no TTL never expire.
 *
 * @example
 * ```typescript
 * const client = new GuildPassClient({
 *   apiUrl: 'https://api.guildpass.xyz',
 *   cache: new InMemoryCacheAdapter(),
 *   cacheTtl: 60_000, // 60 seconds
 * });
 * ```
 */
export class InMemoryCacheAdapter implements CacheAdapter {
  private readonly store = new Map<string, CacheEntry<unknown>>();

  async get<T>(key: string): Promise<T | null> {
    const entry = this.store.get(key) as CacheEntry<T> | undefined;
    if (!entry) return null;
    if (entry.expiresAt !== null && Date.now() >= entry.expiresAt) {
      this.store.delete(key);
      return null;
    }
    return entry.value;
  }

  async set<T>(key: string, value: T, ttl?: number): Promise<void> {
    this.store.set(key, {
      value,
      expiresAt: ttl !== undefined ? Date.now() + ttl : null,
    });
  }

  async delete(key: string): Promise<void> {
    this.store.delete(key);
  }

  async clear(): Promise<void> {
    this.store.clear();
  }

  async deleteByPrefix(prefix: string): Promise<void> {
    for (const key of this.store.keys()) {
      if (key.startsWith(prefix)) {
        this.store.delete(key);
      }
    }
  }
}
