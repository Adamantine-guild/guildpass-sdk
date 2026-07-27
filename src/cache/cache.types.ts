// GuildPass SDK: Pull in package or module bindings.
import { GuildPassConfigError } from '../errors/errorTypes';
import { GuildPassErrorCode } from '../errors/errorCodes';

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
   * **Optional, by design** — kept off the required contract so minimal
   * custom adapters (a plain object, a single-key KV store) still satisfy
   * `CacheAdapter` without implementing prefix scanning.
   *
   * Strongly recommended: without it, {@link GuildPassClient.invalidateGuildCache}
   * and {@link GuildPassClient.invalidateWalletCache} fall back to exact-key
   * deletion or a full {@link CacheAdapter.clear}, which is slower and can
   * evict unrelated entries. `InMemoryCacheAdapter` implements it below.
   *
   * Must never throw.
   */
  deleteByPrefix?(prefix: string): Promise<void>;
}

interface CacheEntry<T> {
  value: T;
  expiresAt: number | null;
}

/** Options accepted by {@link InMemoryCacheAdapter}. */
export interface InMemoryCacheAdapterOptions {
  /**
   * Maximum number of entries to retain. Once the cap would be exceeded, the
   * least-recently-used entry is evicted — recency being driven by `get`/`set`
   * access, not by insertion order.
   *
   * Omit for the default unbounded behaviour, which is byte-for-byte the
   * previous behaviour of this adapter.
   */
  maxEntries?: number;
}

/**
 * A lightweight, zero-dependency in-memory cache adapter backed by a `Map`.
 *
 * TTL values are expressed in **milliseconds**. Entries with no TTL never expire.
 *
 * Unbounded by default. Pass `maxEntries` to cap the cache: once full, the
 * least-recently-used entry is evicted on the next write. Recency is refreshed
 * by both `get` and `set`, so a hot key survives even if it was inserted first.
 *
 * @example
 * ```typescript
 * const client = new GuildPassClient({
 *   apiUrl: 'https://api.guildpass.xyz',
 *   cache: new InMemoryCacheAdapter({ maxEntries: 5_000 }),
 *   cacheTtl: 60_000, // 60 seconds
 * });
 * ```
 */
export class InMemoryCacheAdapter implements CacheAdapter {
  private readonly store = new Map<string, CacheEntry<unknown>>();
  private readonly maxEntries?: number;

  constructor(options?: InMemoryCacheAdapterOptions) {
    const maxEntries = options?.maxEntries;
    if (maxEntries !== undefined) {
      if (!Number.isInteger(maxEntries) || maxEntries < 1) {
        throw new GuildPassConfigError(
          'maxEntries must be a positive integer',
          GuildPassErrorCode.INVALID_CONFIG,
        );
      }
      this.maxEntries = maxEntries;
    }
  }

  /**
   * Number of entries currently held.
   *
   * Includes entries whose TTL has elapsed but which have not been swept yet:
   * expiry is lazy and happens on read, so an untouched expired entry still
   * occupies a slot until it is read, overwritten, or evicted.
   */
  size(): number {
    return this.store.size;
  }

  async get<T>(key: string): Promise<T | null> {
    const entry = this.store.get(key) as CacheEntry<T> | undefined;
    if (!entry) return null;
    // The TTL sweep must run before any recency refresh, so an expired entry is
    // dropped rather than promoted to most-recently-used.
    if (entry.expiresAt !== null && Date.now() >= entry.expiresAt) {
      this.store.delete(key);
      return null;
    }
    if (this.maxEntries !== undefined) {
      // `Map.set` on an existing key keeps its original insertion position, so
      // refreshing recency with a plain `set` would silently leave the eviction
      // order as FIFO. Deleting first is what actually moves the key to the end.
      this.store.delete(key);
      this.store.set(key, entry);
    }
    return entry.value;
  }

  async set<T>(key: string, value: T, ttl?: number): Promise<void> {
    // Delete first for the same reason as in `get`: overwriting a key counts as
    // recent use, and only a re-insert moves it to the end of the iteration order.
    this.store.delete(key);
    this.store.set(key, {
      value,
      expiresAt: ttl !== undefined ? Date.now() + ttl : null,
    });
    this.evictIfNeeded();
  }

  /**
   * Drops least-recently-used entries until the cap is respected.
   *
   * Never throws: eviction runs on the write path, where a failure would break
   * an API call that the cache is only meant to accelerate.
   */
  private evictIfNeeded(): void {
    if (this.maxEntries === undefined) return;
    while (this.store.size > this.maxEntries) {
      const oldest = this.store.keys().next();
      if (oldest.done) return;
      this.store.delete(oldest.value);
    }
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
