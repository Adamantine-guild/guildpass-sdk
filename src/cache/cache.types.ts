export interface CacheAdapter {
  get<T>(key: string): Promise<T | null>;
  set<T>(key: string, value: T, ttl?: number): Promise<void>;
  delete(key: string): Promise<void>;
  clear(): Promise<void>;
  /** Returns all keys currently in the cache. Optional — adapters may omit this for performance. */
  keys?(): Promise<string[]> | string[];
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

  /**
   * Returns all keys currently in the cache.
   * Used by GuildPassClient.invalidateGuildCache() for prefix-based invalidation.
   */
  async keys(): Promise<string[]> {
    return Array.from(this.store.keys());
  }
}
