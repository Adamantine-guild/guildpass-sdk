# Cache Adapters

The SDK uses a pluggable `CacheAdapter` interface to cache read responses. Any object that satisfies the interface works — in-memory, Redis, Cloudflare KV, or your own custom backend.

## Interface

```typescript
interface CacheAdapter {
  get<T>(key: string): Promise<T | null>;
  set<T>(key: string, value: T, ttl?: number): Promise<void>;
  delete(key: string): Promise<void>;
  clear(): Promise<void>;
  deleteByPrefix?(prefix: string): Promise<void>;
}
```

### `get<T>(key)`

- Returns the deserialized value or **`null`** when the key is missing or expired.
- **Never throw.** Return `null` for any error (malformed data, connection failure) so the SDK falls through to the network.

### `set<T>(key, value, ttl?)`

- **TTL is in milliseconds.** `undefined` or omitted means the entry should never expire (store until explicitly deleted).
- The SDK always passes JSON-roundtrippable values. Adapters may store the raw JSON string or apply their own encoding.

### `delete(key)`

- Remove a single entry. **Must never throw.**

### `clear()`

- Remove **all** entries. **Must never throw.**

### `deleteByPrefix(prefix)` (optional)

- Remove all entries whose key starts with `prefix`.
- **Implement this for efficient invalidation.** Without it:
  - `invalidateGuildCache()` falls back to deleting known exact keys (may miss entries with dynamic suffixes).
  - `invalidateWalletCache()` falls back to clearing the **entire** cache.
- **Must never throw.**

## TTL Semantics

| `ttl` parameter | Behaviour                                                       |
| :-------------- | :-------------------------------------------------------------- |
| `undefined`     | Never expire. Store until explicitly deleted or evicted by LRU (see [`maxEntries`](#maxentries)). |
| `0`             | Expires immediately — effectively disables caching.             |
| `> 0`           | Expire after `ttl` milliseconds.                                |

> **Note:** `cacheTtl: 0` is a valid config value (`sdkConfig` accepts any
> `ttl >= 0`), but it is **not** a "never expire" sentinel — it behaves as a
> zero-millisecond TTL. Since `expiresAt` is computed as `Date.now() + ttl`,
> an entry written with `ttl: 0` is already expired by the time the next
> `get()` checks it. In practice this means **every read becomes a cache
> miss and triggers a fresh network call**, silently disabling caching
> without any error. If you intend for entries to never expire, omit
> `cacheTtl` (or pass `undefined`) — only an _absent_ TTL means "no
> expiration."

The SDK passes `cacheTtl` (from client config) as the `ttl` argument. Methods that accept a per-call override subtract elapsed time from the deadline before storing.

## Error Isolation

Cache adapter errors **never** propagate to the caller. The SDK catches every error and routes it to the optional `onCacheError` hook:

```typescript
const client = new GuildPassClient({
  apiUrl: 'https://api.guildpass.xyz',
  cache: myAdapter,
  hooks: {
    onCacheError: ({ operation, key, error }) => {
      console.error(`Cache ${operation} failed for key ${key}`, error);
    },
  },
});
```

If a hook throws or the hook itself is absent, the error is swallowed silently. The SDK continues to make network requests as if no cache was configured.

## Serialisation

- Values passed to `set()` are always JSON-roundtrippable (no `undefined`, `BigInt`, or circular references).
- The SDK does **not** serialize/deserialize automatically — each adapter is responsible for its own encoding.
- For Redis-style stores, `JSON.stringify()` / `JSON.parse()` is the standard approach.
- For binary stores, `Buffer` or `MessagePack` can be used as long as `get()` returns the original shape.

## Distributed Cache Considerations

- **Key namespaces**: Cache keys are prefixed (`access:`, `membership:`, `roles:`, `guilds:`, `wallet:`) and contain only public identifiers. No secrets are stored.
- **TTL accuracy**: Rely on the adapter's native TTL mechanism (e.g. Redis `PX`). Do not implement application-level expiry.
- **Consistency**: The SDK does not require strong consistency. Stale data is acceptable — it will be overwritten on the next successful API call.
- **Connection errors**: Handle reconnection internally or let the adapter throw (the SDK catches it). Consider using a client with built-in retry and failover.
- **Prefix deletion**: For Redis, use `SCAN` + `DEL` or the built-in `UNLINK`. For DynamoDB, query by GSIK. Do not use `KEYS *` in production.

## Examples

### Redis (production-ready)

> **Note:** A complete, runnable project for this Redis adapter — including integration tests — is available in the [`examples/redis-cache-adapter`](../examples/redis-cache-adapter/) directory.

```typescript
import { CacheAdapter } from '@guildpass/sdk';
import { createClient, type RedisClientType } from 'redis';

export class RedisCacheAdapter implements CacheAdapter {
  private readonly client: RedisClientType;
  private readonly prefix: string;

  constructor(url: string, prefix = 'guildpass:') {
    this.client = createClient({ url });
    this.prefix = prefix;
  }

  async connect(): Promise<void> {
    if (!this.client.isOpen) {
      await this.client.connect();
    }
  }

  async disconnect(): Promise<void> {
    if (this.client.isOpen) {
      await this.client.quit();
    }
  }

  private prefixed(key: string): string {
    return this.prefix + key;
  }

  async get<T>(key: string): Promise<T | null> {
    try {
      const raw = await this.client.get(this.prefixed(key));
      if (raw === null) return null;
      return JSON.parse(raw) as T;
    } catch {
      return null;
    }
  }

  async set<T>(key: string, value: T, ttl?: number): Promise<void> {
    try {
      const k = this.prefixed(key);
      const serialised = JSON.stringify(value);
      if (ttl !== undefined) {
        await this.client.set(k, serialised, { PX: ttl });
      } else {
        await this.client.set(k, serialised);
      }
    } catch {
      // swallowed by SDK
    }
  }

  async delete(key: string): Promise<void> {
    try {
      await this.client.del(this.prefixed(key));
    } catch {
      // swallowed by SDK
    }
  }

  async clear(): Promise<void> {
    try {
      await this.client.flushDb();
    } catch {
      // swallowed by SDK
    }
  }

  async deleteByPrefix(prefix: string): Promise<void> {
    try {
      const pattern = this.prefixed(prefix) + '*';
      const batchSize = 100;
      let keysToDelete: string[] = [];

      for await (const key of this.client.scanIterator({ MATCH: pattern, COUNT: batchSize })) {
        keysToDelete.push(key);
        if (keysToDelete.length >= batchSize) {
          await this.client.unlink(keysToDelete);
          keysToDelete = [];
        }
      }

      if (keysToDelete.length > 0) {
        await this.client.unlink(keysToDelete);
      }
    } catch {
      // swallowed by SDK
    }
  }
}
```

### In-memory (built-in reference)

```typescript
import { CacheAdapter } from '@guildpass/sdk';

interface CacheEntry<T> {
  value: T;
  expiresAt: number | null;
}

export class MyMemoryAdapter implements CacheAdapter {
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
```

### `maxEntries`

The built-in `InMemoryCacheAdapter` is **unbounded by default**. Pass `maxEntries` to cap
it; once the cap would be exceeded, the least-recently-used entry is evicted on the next
write.

```typescript
import { GuildPassClient, InMemoryCacheAdapter } from '@guildpass/sdk';

const client = new GuildPassClient({
  apiUrl: 'https://api.guildpass.xyz',
  cache: new InMemoryCacheAdapter({ maxEntries: 5_000 }),
  cacheTtl: 60_000,
});
```

- **Recency is refreshed on read as well as on write.** A key that keeps being read
  survives even if it was inserted first — eviction order is LRU, not FIFO.
- **`size()`** reports how many entries are currently held, *including* entries whose TTL
  has already elapsed but which have not been swept yet. Expiry is lazy: an untouched
  expired entry keeps its slot until it is read, overwritten, or evicted.
- **`maxEntries` must be a positive integer.** Anything else throws `INVALID_CONFIG` at
  construction rather than being silently ignored.
- Omitting `maxEntries` keeps the previous unbounded behaviour exactly; the recency
  bookkeeping is skipped entirely in that mode.

This matters most in long-lived processes whose keys are per-wallet or per-guild (see
[Invalidation](#invalidation)): the key space grows with your user base, so an unbounded
map is effectively a slow memory leak.

## Using a custom adapter

```typescript
import { GuildPassClient } from '@guildpass/sdk';
import { RedisCacheAdapter } from './adapters/RedisCacheAdapter';

const cache = new RedisCacheAdapter('redis://localhost:6379');
await cache.connect();

const client = new GuildPassClient({
  apiUrl: 'https://api.guildpass.xyz',
  cache,
  cacheTtl: 30_000, // 30 second default TTL
});
```

## Invalidation

Call the following methods on the client instance:

```typescript
// Evict entries scoped to a guild (uses deleteByPrefix when available)
await client.invalidateGuildCache('prime-guild');

// Evict entries scoped to a wallet address (uses deleteByPrefix when available)
await client.invalidateWalletCache('0x1234...5678');

// Wipe the entire cache
await client.clearCache();
```

See the [SDK Guide](./sdk-guide.md#caching-and-request-deduplication) for more on the caching layer.

## Conformance Testing

Custom adapters should run the exported conformance suite. It covers value
round-tripping, TTL semantics, deletion, complete clearing, optional prefix
deletion, concurrent writes, and store-failure isolation.

```typescript
import { describe, it } from 'vitest';
import { runCacheAdapterConformanceTests } from '@guildpass/sdk/testing';
import { MyCustomAdapter } from './MyCustomAdapter';

runCacheAdapterConformanceTests(
  {
    // Each case must receive a fresh, empty adapter.
    factory: async () => {
      const adapter = new MyCustomAdapter('redis://localhost:6379');
      await adapter.connect();
      await adapter.clear();
      return adapter;
    },

    // Strongly recommended: exercise the never-throw contract while the
    // underlying store is unavailable.
    brokenFactory: async () => {
      const adapter = new MyCustomAdapter('redis://localhost:6379');
      await adapter.connect();
      await adapter.disconnect();
      return adapter;
    },

    // Omit this to use real timers. A real store may need a longer wait or
    // a backend-specific clock hook.
    advanceTime: async (ms) => new Promise((resolve) => setTimeout(resolve, ms)),
  },
  { describe, it },
);
```

Vitest and Jest projects with global `describe` and `it` functions may omit
the second argument. Other test frameworks can pass compatible registration
functions. For custom orchestration, `createCacheAdapterConformanceTests()`
returns the same cases without registering them.

If `brokenFactory` is omitted, store-failure cases are not registered. Passing
it is the recommended way to verify that `get()` falls back to `null` and that
write, delete, clear, and prefix-delete failures never escape the adapter.
