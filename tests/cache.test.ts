import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { GuildPassClient } from '../src/client/GuildPassClient';
import { InMemoryCacheAdapter, CacheAdapter } from '../src/cache/cache.types';
import { runCacheAdapterConformanceTests } from './cacheAdapterConformance';

const BASE_CONFIG = { apiUrl: 'https://api.guildpass.xyz' };

// ---------------------------------------------------------------------------
// InMemoryCacheAdapter Conformance tests
// ---------------------------------------------------------------------------
runCacheAdapterConformanceTests({
  factory: () => new InMemoryCacheAdapter(),
});

// ---------------------------------------------------------------------------
// InMemoryCacheAdapter specific details
// ---------------------------------------------------------------------------
describe('InMemoryCacheAdapter specific details', () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('expired entry is evicted from internal store on get (lazy eviction)', async () => {
    const adapter = new InMemoryCacheAdapter();
    await adapter.set('k', 'value', 100);

    vi.advanceTimersByTime(101);

    // First get evicts the entry; second confirms it is gone
    expect(await adapter.get('k')).toBeNull();
    expect(await adapter.get('k')).toBeNull();
  });
});

// ---------------------------------------------------------------------------
// GuildPassClient cache integration
// ---------------------------------------------------------------------------
describe('GuildPassClient – cache integration', () => {
  const mockGuild = {
    id: 'prime-guild',
    name: 'Prime Guild',
    ownerAddress: '0xowner',
    chainId: 1,
  };
  const mockAccess = { hasAccess: true, reason: null };

  function buildMockAdapter(): CacheAdapter & { _store: Map<string, unknown> } {
    const store = new Map<string, { value: unknown; expiresAt: number | null }>();
    return {
      _store: store as unknown as Map<string, unknown>,
      async get<T>(key: string): Promise<T | null> {
        const entry = store.get(key);
        if (!entry) return null;
        if (entry.expiresAt !== null && Date.now() > entry.expiresAt) {
          store.delete(key);
          return null;
        }
        return entry.value as T;
      },
      async set<T>(key: string, value: T, ttl?: number): Promise<void> {
        store.set(key, { value, expiresAt: ttl !== undefined ? Date.now() + ttl : null });
      },
      async delete(key: string): Promise<void> {
        store.delete(key);
      },
      async clear(): Promise<void> {
        store.clear();
      },
    };
  }

  it('does not cache when no adapter is provided', () => {
    const client = new GuildPassClient(BASE_CONFIG);
    // No error; services are the raw instances.
    expect(client.guilds).toBeDefined();
  });

  it('uses the adapter on a cache miss and populates the cache', async () => {
    const adapter = buildMockAdapter();
    const getSpy = vi.spyOn(adapter, 'get');
    const setSpy = vi.spyOn(adapter, 'set');

    const client = new GuildPassClient({ ...BASE_CONFIG, cache: adapter });

    // Stub the underlying HTTP call.
    vi.spyOn(client['http'] as any, 'get').mockResolvedValue(mockGuild);

    const result = await client.guilds.getGuild({ guildId: 'prime-guild' });

    expect(result).toEqual(mockGuild);
    expect(getSpy).toHaveBeenCalledWith('guilds:getGuild:prime-guild');
    expect(setSpy).toHaveBeenCalledWith('guilds:getGuild:prime-guild', mockGuild, undefined);
  });

  it('returns the cached value on a cache hit without hitting the network', async () => {
    const adapter = new InMemoryCacheAdapter();
    await adapter.set('guilds:getGuild:prime-guild', mockGuild);

    const client = new GuildPassClient({ ...BASE_CONFIG, cache: adapter });
    const httpSpy = vi.spyOn(client['http'] as any, 'get');

    const result = await client.guilds.getGuild({ guildId: 'prime-guild' });

    expect(result).toEqual(mockGuild);
    expect(httpSpy).not.toHaveBeenCalled();
  });

  it('re-fetches from the network after TTL expiry', async () => {
    vi.useFakeTimers();

    const adapter = new InMemoryCacheAdapter();
    const client = new GuildPassClient({ ...BASE_CONFIG, cache: adapter, cacheTtl: 1_000 });

    const httpGet = vi
      .spyOn(client['http'] as any, 'get')
      .mockResolvedValue(mockGuild);

    await client.guilds.getGuild({ guildId: 'prime-guild' });
    expect(httpGet).toHaveBeenCalledTimes(1);

    vi.advanceTimersByTime(1_001);

    await client.guilds.getGuild({ guildId: 'prime-guild' });
    expect(httpGet).toHaveBeenCalledTimes(2);

    vi.useRealTimers();
  });

  it('caches access checks with the correct composite key (normalised to lowercase)', async () => {
    const adapter = buildMockAdapter();
    const setSpy = vi.spyOn(adapter, 'set');

    const client = new GuildPassClient({ ...BASE_CONFIG, cache: adapter });
    vi.spyOn(client['http'] as any, 'get').mockResolvedValue(mockAccess);

    await client.access.checkAccess({
      walletAddress: '0xd8dA6BF26964aF9D7eEd9e03E53415D37aA96045',
      guildId: 'g1',
      resourceId: 'res1',
    });

    expect(setSpy).toHaveBeenCalledWith(
      'access:checkAccess:g1:res1:0xd8da6bf26964af9d7eed9e03e53415d37aa96045',
      mockAccess,
      undefined,
    );
  });

  it('mixed-case and lowercase wallet produce the same cache key (cache hit)', async () => {
    const adapter = new InMemoryCacheAdapter();
    const client = new GuildPassClient({ ...BASE_CONFIG, cache: adapter });
    const httpGet = vi.spyOn(client['http'] as any, 'get').mockResolvedValue(mockAccess);

    await client.access.checkAccess({
      walletAddress: '0xd8dA6BF26964aF9D7eEd9e03E53415D37aA96045',
      guildId: 'g1',
      resourceId: 'res1',
    });

    // Second call with the same address but different casing — must be a cache hit
    await client.access.checkAccess({
      walletAddress: '0xd8da6bf26964af9d7eed9e03e53415d37aa96045',
      guildId: 'g1',
      resourceId: 'res1',
    });

    expect(httpGet).toHaveBeenCalledTimes(1);
  });

  it('invalidateWalletCache normalises the address before building the deletion prefix', async () => {
    const adapter = new InMemoryCacheAdapter();
    const addr1 = '0xd8da6bf26964af9d7eed9e03e53415d37aa96045';
    const addr2 = '0xabcdef1234567890abcdef1234567890abcdef12';
    // Store entries under the normalised (lowercase) prefix
    await adapter.set(`wallet:${addr1}:balance`, 100);
    await adapter.set(`wallet:${addr1}:nonce`, 5);
    await adapter.set(`wallet:${addr2}:balance`, 200);

    const client = new GuildPassClient({ ...BASE_CONFIG, cache: adapter });
    // Invalidate with mixed-case address — should still find the normalised keys
    await client.invalidateWalletCache('0xd8dA6BF26964aF9D7eEd9e03E53415D37aA96045');

    expect(await adapter.get(`wallet:${addr1}:balance`)).toBeNull();
    expect(await adapter.get(`wallet:${addr1}:nonce`)).toBeNull();
    expect(await adapter.get(`wallet:${addr2}:balance`)).toBe(200);
  });

  it('invalidateWalletCache throws for an invalid address', async () => {
    const client = new GuildPassClient(BASE_CONFIG);
    await expect(client.invalidateWalletCache('not-an-address')).rejects.toThrow();
  });

  it('invalidateGuildCache removes all guild-scoped keys', async () => {
    const adapter = new InMemoryCacheAdapter();
    await adapter.set('guilds:getGuild:prime-guild', mockGuild);
    await adapter.set('roles:getRoles:prime-guild', []);

    const client = new GuildPassClient({ ...BASE_CONFIG, cache: adapter });
    await client.invalidateGuildCache('prime-guild');

    expect(await adapter.get('guilds:getGuild:prime-guild')).toBeNull();
    expect(await adapter.get('roles:getRoles:prime-guild')).toBeNull();
  });

  it('invalidateGuildCache removes composite-key entries via deleteByPrefix', async () => {
    const adapter = new InMemoryCacheAdapter();
    // Composite keys with wallet/resource suffixes (the actual bug)
    await adapter.set('access:checkAccess:prime-guild:premium-docs:0xabc', { hasAccess: true });
    await adapter.set('access:checkAccess:prime-guild:basic-docs:0xdef', { hasAccess: false });
    await adapter.set('access:checkAccess:other-guild:premium-docs:0xabc', { hasAccess: true });
    await adapter.set('membership:getMembership:prime-guild:0xabc', { member: true });
    await adapter.set('unrelated:key', 'keep');

    const client = new GuildPassClient({ ...BASE_CONFIG, cache: adapter });
    await client.invalidateGuildCache('prime-guild');

    // All prime-guild entries with nested keys should be removed
    expect(await adapter.get('access:checkAccess:prime-guild:premium-docs:0xabc')).toBeNull();
    expect(await adapter.get('access:checkAccess:prime-guild:basic-docs:0xdef')).toBeNull();
    expect(await adapter.get('membership:getMembership:prime-guild:0xabc')).toBeNull();
    // Other guild should NOT be removed
    expect(await adapter.get('access:checkAccess:other-guild:premium-docs:0xabc')).toEqual({ hasAccess: true });
    // Unrelated key should NOT be removed
    expect(await adapter.get('unrelated:key')).toBe('keep');
  });

  it('invalidateWalletCache uses deleteByPrefix when adapter supports it', async () => {
    const adapter = new InMemoryCacheAdapter();
    const addrA = '0xaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa';
    const addrB = '0xbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb';
    await adapter.set(`wallet:${addrA}:balance`, 100);
    await adapter.set(`wallet:${addrA}:nonce`, 5);
    await adapter.set(`wallet:${addrB}:balance`, 200);
    await adapter.set('guilds:getGuild:g1', { id: 'g1' });

    const client = new GuildPassClient({ ...BASE_CONFIG, cache: adapter });
    await client.invalidateWalletCache(addrA);

    // addrA wallet entries removed
    expect(await adapter.get(`wallet:${addrA}:balance`)).toBeNull();
    expect(await adapter.get(`wallet:${addrA}:nonce`)).toBeNull();
    // addrB wallet entries preserved
    expect(await adapter.get(`wallet:${addrB}:balance`)).toBe(200);
    // Guild cache preserved
    expect(await adapter.get('guilds:getGuild:g1')).toEqual({ id: 'g1' });
  });

  it('invalidateGuildCache falls back to exact delete for adapters without deleteByPrefix', async () => {
    const adapter = buildMockAdapter();
    // Only set exact-prefix keys (legacy behavior)
    await adapter.set('guilds:getGuild:prime-guild', mockGuild);
    await adapter.set('roles:getRoles:prime-guild', []);

    const client = new GuildPassClient({ ...BASE_CONFIG, cache: adapter });
    await client.invalidateGuildCache('prime-guild');

    expect(await adapter.get('guilds:getGuild:prime-guild')).toBeNull();
    expect(await adapter.get('roles:getRoles:prime-guild')).toBeNull();
  });

  it('invalidateGuildCache is a no-op when no adapter is configured', async () => {
    const client = new GuildPassClient(BASE_CONFIG);
    await expect(client.invalidateGuildCache('any')).resolves.toBeUndefined();
  });

  it('clearCache clears the entire adapter store', async () => {
    const adapter = new InMemoryCacheAdapter();
    await adapter.set('a', 1);
    await adapter.set('b', 2);

    const client = new GuildPassClient({ ...BASE_CONFIG, cache: adapter });
    await client.clearCache();

    expect(await adapter.get('a')).toBeNull();
    expect(await adapter.get('b')).toBeNull();
  });

  it('accepts a custom CacheAdapter (e.g. Redis stub)', async () => {
    let internalStore: Record<string, unknown> = {};

    const redisStub: CacheAdapter = {
      async get<T>(key: string): Promise<T | null> {
        return (internalStore[key] ?? null) as T | null;
      },
      async set<T>(key: string, value: T): Promise<void> {
        internalStore[key] = value;
      },
      async delete(key: string): Promise<void> {
        delete internalStore[key];
      },
      async clear(): Promise<void> {
        internalStore = {};
      },
    };

    const client = new GuildPassClient({ ...BASE_CONFIG, cache: redisStub });
    vi.spyOn(client['http'] as any, 'get').mockResolvedValue(mockGuild);

    await client.guilds.getGuild({ guildId: 'prime-guild' });
    expect(internalStore['guilds:getGuild:prime-guild']).toEqual(mockGuild);

    // Second call: stub returns same; HTTP should still not be hit a second time.
    const httpSpy = vi.spyOn(client['http'] as any, 'get');
    await client.guilds.getGuild({ guildId: 'prime-guild' });
    expect(httpSpy).not.toHaveBeenCalled();
  });

  describe('Resilience - cache failures', () => {
    const mockGuild = { id: 'g1', name: 'G1', ownerAddress: '0x1', chainId: 1 };

    it('falls back to network if cache.get() fails', async () => {
      const adapter = buildMockAdapter();
      vi.spyOn(adapter, 'get').mockRejectedValue(new Error('Cache Get Failure'));

      const onCacheError = vi.fn();
      const client = new GuildPassClient({
        ...BASE_CONFIG,
        cache: adapter,
        hooks: { onCacheError }
      });

      const httpSpy = vi.spyOn(client['http'] as any, 'get').mockResolvedValue(mockGuild);

      const result = await client.guilds.getGuild({ guildId: 'g1' });

      expect(result).toEqual(mockGuild);
      expect(httpSpy).toHaveBeenCalledTimes(1);
      expect(onCacheError).toHaveBeenCalledWith(expect.objectContaining({
        operation: 'get',
        key: 'guilds:getGuild:g1',
        error: expect.any(Error)
      }));
    });

    it('still returns response if cache.set() fails', async () => {
      const adapter = buildMockAdapter();
      vi.spyOn(adapter, 'set').mockRejectedValue(new Error('Cache Set Failure'));

      const onCacheError = vi.fn();
      const client = new GuildPassClient({
        ...BASE_CONFIG,
        cache: adapter,
        hooks: { onCacheError }
      });

      vi.spyOn(client['http'] as any, 'get').mockResolvedValue(mockGuild);

      const result = await client.guilds.getGuild({ guildId: 'g1' });

      expect(result).toEqual(mockGuild);
      expect(onCacheError).toHaveBeenCalledWith(expect.objectContaining({
        operation: 'set',
        key: 'guilds:getGuild:g1',
        error: expect.any(Error)
      }));
    });

    it('isolates failures in invalidateGuildCache', async () => {
      const adapter = buildMockAdapter();
      vi.spyOn(adapter, 'delete').mockRejectedValue(new Error('Cache Delete Failure'));

      const onCacheError = vi.fn();
      const client = new GuildPassClient({
        ...BASE_CONFIG,
        cache: adapter,
        hooks: { onCacheError }
      });

      await expect(client.invalidateGuildCache('g1')).resolves.toBeUndefined();
      expect(onCacheError).toHaveBeenCalledWith(expect.objectContaining({
        operation: 'delete',
        error: expect.any(Error)
      }));
    });
  });
});

describe('GuildPassClient – cache-key collision resistance', () => {
  const mockAccess = { hasAccess: true, reason: null };
  const wallet = '0xd8dA6BF26964aF9D7eEd9e03E53415D37aA96045';

  it('does not collide when a guildId/resourceId split shifts across the delimiter', async () => {
    const adapter = new InMemoryCacheAdapter();
    const client = new GuildPassClient({ ...BASE_CONFIG, cache: adapter });
    const httpGet = vi.spyOn(client['http'] as any, 'get').mockResolvedValue(mockAccess);

    // guildId "guild:1" + resourceId "a" previously produced the same raw
    // string as guildId "guild" + resourceId "1:a".
    await client.access.checkAccess({ walletAddress: wallet, guildId: 'guild:1', resourceId: 'a' });
    await client.access.checkAccess({ walletAddress: wallet, guildId: 'guild', resourceId: '1:a' });

    expect(httpGet).toHaveBeenCalledTimes(2);
  });

  it('still cache-hits repeat calls when IDs contain the delimiter', async () => {
    const adapter = new InMemoryCacheAdapter();
    const client = new GuildPassClient({ ...BASE_CONFIG, cache: adapter });
    const httpGet = vi.spyOn(client['http'] as any, 'get').mockResolvedValue(mockAccess);

    await client.access.checkAccess({ walletAddress: wallet, guildId: 'guild:1', resourceId: 'a' });
    await client.access.checkAccess({ walletAddress: wallet, guildId: 'guild:1', resourceId: 'a' });

    expect(httpGet).toHaveBeenCalledTimes(1);
  });

  it('invalidateGuildCache clears encoded composite keys for a guildId containing the delimiter', async () => {
    const adapter = new InMemoryCacheAdapter();
    const client = new GuildPassClient({ ...BASE_CONFIG, cache: adapter });
    const httpGet = vi.spyOn(client['http'] as any, 'get').mockResolvedValue(mockAccess);

    await client.access.checkAccess({ walletAddress: wallet, guildId: 'guild:1', resourceId: 'a' });
    expect(httpGet).toHaveBeenCalledTimes(1);

    await client.invalidateGuildCache('guild:1');

    await client.access.checkAccess({ walletAddress: wallet, guildId: 'guild:1', resourceId: 'a' });
    expect(httpGet).toHaveBeenCalledTimes(2);
  });

  it('invalidateGuildCache does not over-delete entries from an unrelated guild', async () => {
    const adapter = new InMemoryCacheAdapter();
    const client = new GuildPassClient({ ...BASE_CONFIG, cache: adapter });
    const httpGet = vi.spyOn(client['http'] as any, 'get').mockResolvedValue(mockAccess);

    await client.access.checkAccess({ walletAddress: wallet, guildId: 'guild:1', resourceId: 'a' });
    await client.access.checkAccess({ walletAddress: wallet, guildId: 'guild', resourceId: '1:a' });
    expect(httpGet).toHaveBeenCalledTimes(2);

    await client.invalidateGuildCache('guild:1');

    // 'guild:1' entry was invalidated -> network hit again.
    await client.access.checkAccess({ walletAddress: wallet, guildId: 'guild:1', resourceId: 'a' });
    expect(httpGet).toHaveBeenCalledTimes(3);

    // 'guild' entry must be untouched -> still a cache hit.
    await client.access.checkAccess({ walletAddress: wallet, guildId: 'guild', resourceId: '1:a' });
    expect(httpGet).toHaveBeenCalledTimes(3);
  });
});
