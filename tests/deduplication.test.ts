import { describe, it, expect, vi } from 'vitest';
import { GuildPassClient } from '../src/client/GuildPassClient';
import { InMemoryCacheAdapter } from '../src/cache/cache.types';
import { GuildPassConfigError } from '../src/errors/errorTypes';

const BASE_CONFIG = { apiUrl: 'https://api.guildpass.xyz' };
const ADDR = '0x1234567890123456789012345678901234567890';
const mockAccess = {
  hasAccess: true,
  walletAddress: ADDR,
  guildId: 'g1',
  resourceId: 'r1',
  requiredRoles: ['member'],
  matchedRoles: ['member'],
  reason: null,
};
const mockGuild = {
  id: 'g1',
  name: 'Guild One',
  ownerAddress: ADDR,
  chainId: 1,
};

describe('request coalescing without cache adapter', () => {
  it('coalesces 5 concurrent identical checkAccess calls into 1 HTTP request', async () => {
    const client = new GuildPassClient(BASE_CONFIG);
    const httpSpy = vi.spyOn(client['http'] as any, 'get').mockResolvedValue(mockAccess);

    const promises = Array.from({ length: 5 }, () =>
      client.access.checkAccess({ walletAddress: ADDR, guildId: 'g1', resourceId: 'r1' }),
    );
    const results = await Promise.all(promises);

    expect(results).toHaveLength(5);
    results.forEach((r) => expect(r).toEqual(mockAccess));
    expect(httpSpy).toHaveBeenCalledTimes(1);
  });

  it('does not coalesce calls with different params', async () => {
    const client = new GuildPassClient(BASE_CONFIG);
    const httpSpy = vi.spyOn(client['http'] as any, 'get').mockResolvedValue(mockAccess);

    const [a, b] = await Promise.all([
      client.access.checkAccess({ walletAddress: ADDR, guildId: 'g1', resourceId: 'r1' }),
      client.access.checkAccess({ walletAddress: ADDR, guildId: 'g1', resourceId: 'r2' }),
    ]);

    expect(a).toEqual(mockAccess);
    expect(b).toEqual(mockAccess);
    expect(httpSpy).toHaveBeenCalledTimes(2);
  });

  it('makes a fresh request after the in-flight call resolves', async () => {
    const client = new GuildPassClient(BASE_CONFIG);
    const httpSpy = vi.spyOn(client['http'] as any, 'get').mockResolvedValue(mockAccess);

    await client.access.checkAccess({ walletAddress: ADDR, guildId: 'g1', resourceId: 'r1' });
    expect(httpSpy).toHaveBeenCalledTimes(1);

    await client.access.checkAccess({ walletAddress: ADDR, guildId: 'g1', resourceId: 'r1' });
    expect(httpSpy).toHaveBeenCalledTimes(2);
  });

  it('coalesces concurrent checkRoleAccess calls', async () => {
    const client = new GuildPassClient(BASE_CONFIG);
    const httpSpy = vi.spyOn(client['http'] as any, 'get').mockResolvedValue({ hasRole: true });

    const promises = Array.from({ length: 3 }, () =>
      client.access.checkRoleAccess({
        walletAddress: ADDR,
        guildId: 'g1',
        roleId: 'role1',
      }),
    );
    const results = await Promise.all(promises);

    expect(results).toEqual([true, true, true]);
    expect(httpSpy).toHaveBeenCalledTimes(1);
  });

  it('coalesces concurrent getGuild calls', async () => {
    const client = new GuildPassClient(BASE_CONFIG);
    const httpSpy = vi.spyOn(client['http'] as any, 'get').mockResolvedValue(mockGuild);

    const promises = Array.from({ length: 3 }, () =>
      client.guilds.getGuild({ guildId: 'g1' }),
    );
    const results = await Promise.all(promises);

    expect(results).toHaveLength(3);
    results.forEach((r) => expect(r).toEqual(mockGuild));
    expect(httpSpy).toHaveBeenCalledTimes(1);
  });

  it('coalesces calls to different services independently', async () => {
    const client = new GuildPassClient(BASE_CONFIG);
    const httpSpy = vi.spyOn(client['http'] as any, 'get').mockImplementation(
      () => Promise.resolve({ ...mockAccess, hasRole: true }),
    );

    const promises = Array.from({ length: 3 }, () =>
      client.access.checkAccess({ walletAddress: ADDR, guildId: 'g1', resourceId: 'r1' }),
    );
    const promises2 = Array.from({ length: 3 }, () =>
      client.access.checkRoleAccess({
        walletAddress: ADDR,
        guildId: 'g1',
        roleId: 'role1',
      }),
    );

    const [results1, results2] = await Promise.all([
      Promise.all(promises),
      Promise.all(promises2),
    ]);

    expect(results1).toHaveLength(3);
    expect(results2).toHaveLength(3);
    expect(httpSpy).toHaveBeenCalledTimes(2);
  });
});

describe('request coalescing failure handling', () => {
  it('rejects all concurrent callers with the same error and does not poison the key', async () => {
    const client = new GuildPassClient(BASE_CONFIG);
    const networkError = new Error('network down');
    const httpSpy = vi
      .spyOn(client['http'] as any, 'get')
      .mockRejectedValueOnce(networkError)
      .mockResolvedValueOnce(mockAccess);

    // Several concurrent callers share the single in-flight (failing) request.
    const promises = Array.from({ length: 5 }, () =>
      client.access.checkAccess({ walletAddress: ADDR, guildId: 'g1', resourceId: 'r1' }),
    );
    const results = await Promise.allSettled(promises);

    expect(httpSpy).toHaveBeenCalledTimes(1);
    results.forEach((r) => {
      expect(r.status).toBe('rejected');
      expect((r as PromiseRejectedResult).reason).toBe(networkError);
    });

    // The failed request must not poison the key: a later legitimate retry
    // hits the network again and succeeds.
    const retryResult = await client.access.checkAccess({
      walletAddress: ADDR,
      guildId: 'g1',
      resourceId: 'r1',
    });
    expect(retryResult).toEqual(mockAccess);
    expect(httpSpy).toHaveBeenCalledTimes(2);
  });

  it('does not cache a rejected in-flight result', async () => {
    const adapter = new InMemoryCacheAdapter();
    const client = new GuildPassClient({ ...BASE_CONFIG, cache: adapter, cacheTtl: 10_000 });
    const networkError = new Error('network down');
    const httpSpy = vi
      .spyOn(client['http'] as any, 'get')
      .mockRejectedValueOnce(networkError)
      .mockResolvedValueOnce(mockAccess);

    const promises = Array.from({ length: 3 }, () =>
      client.access.checkAccess({ walletAddress: ADDR, guildId: 'g1', resourceId: 'r1' }),
    );
    const results = await Promise.allSettled(promises);

    expect(httpSpy).toHaveBeenCalledTimes(1);
    results.forEach((r) => expect(r.status).toBe('rejected'));

    const cachedValue = await adapter.get(`access:checkAccess:g1:r1:${ADDR}`);
    expect(cachedValue).toBeNull();

    // Later legitimate retry is a fresh network call and gets cached normally.
    const retryResult = await client.access.checkAccess({
      walletAddress: ADDR,
      guildId: 'g1',
      resourceId: 'r1',
    });
    expect(retryResult).toEqual(mockAccess);
    expect(httpSpy).toHaveBeenCalledTimes(2);

    await client.access.checkAccess({ walletAddress: ADDR, guildId: 'g1', resourceId: 'r1' });
    expect(httpSpy).toHaveBeenCalledTimes(2);
  });
});

describe('request coalescing with cache adapter', () => {
  it('coalesces concurrent calls and caches the result', async () => {
    const adapter = new InMemoryCacheAdapter();
    const client = new GuildPassClient({ ...BASE_CONFIG, cache: adapter, cacheTtl: 10_000 });
    const httpSpy = vi.spyOn(client['http'] as any, 'get').mockResolvedValue(mockAccess);

    // 5 concurrent calls → 1 HTTP request
    const promises = Array.from({ length: 5 }, () =>
      client.access.checkAccess({ walletAddress: ADDR, guildId: 'g1', resourceId: 'r1' }),
    );
    const results = await Promise.all(promises);

    expect(results).toHaveLength(5);
    results.forEach((r) => expect(r).toEqual(mockAccess));
    expect(httpSpy).toHaveBeenCalledTimes(1);

    // Subsequent call → cache hit (no HTTP request)
    await client.access.checkAccess({ walletAddress: ADDR, guildId: 'g1', resourceId: 'r1' });
    expect(httpSpy).toHaveBeenCalledTimes(1);
  });

  it('re-fetches from network after cache TTL expiry', async () => {
    vi.useFakeTimers();

    const adapter = new InMemoryCacheAdapter();
    const client = new GuildPassClient({ ...BASE_CONFIG, cache: adapter, cacheTtl: 1_000 });
    const httpSpy = vi.spyOn(client['http'] as any, 'get').mockResolvedValue(mockAccess);

    await client.access.checkAccess({ walletAddress: ADDR, guildId: 'g1', resourceId: 'r1' });
    expect(httpSpy).toHaveBeenCalledTimes(1);

    // Cache hit
    await client.access.checkAccess({ walletAddress: ADDR, guildId: 'g1', resourceId: 'r1' });
    expect(httpSpy).toHaveBeenCalledTimes(1);

    vi.advanceTimersByTime(1_001);

    // TTL expired → fresh request
    await client.access.checkAccess({ walletAddress: ADDR, guildId: 'g1', resourceId: 'r1' });
    expect(httpSpy).toHaveBeenCalledTimes(2);

    vi.useRealTimers();
  });
});

describe('deduplication opt-out', () => {
  it('issues independent requests for every call when deduplication: false', async () => {
    const client = new GuildPassClient({ ...BASE_CONFIG, deduplication: false });
    const httpSpy = vi.spyOn(client['http'] as any, 'get').mockResolvedValue(mockAccess);

    const promises = Array.from({ length: 5 }, () =>
      client.access.checkAccess({ walletAddress: ADDR, guildId: 'g1', resourceId: 'r1' }),
    );
    const results = await Promise.all(promises);

    expect(results).toHaveLength(5);
    results.forEach((r) => expect(r).toEqual(mockAccess));
    expect(httpSpy).toHaveBeenCalledTimes(5);
  });

  it('still caches results when deduplication: false and a cache adapter is set', async () => {
    const adapter = new InMemoryCacheAdapter();
    const client = new GuildPassClient({
      ...BASE_CONFIG,
      cache: adapter,
      cacheTtl: 10_000,
      deduplication: false,
    });
    const httpSpy = vi.spyOn(client['http'] as any, 'get').mockResolvedValue(mockAccess);

    const promises = Array.from({ length: 5 }, () =>
      client.access.checkAccess({ walletAddress: ADDR, guildId: 'g1', resourceId: 'r1' }),
    );
    await Promise.all(promises);
    expect(httpSpy).toHaveBeenCalledTimes(5);

    // Every concurrent call populated the same cache entry; the next call hits it.
    await client.access.checkAccess({ walletAddress: ADDR, guildId: 'g1', resourceId: 'r1' });
    expect(httpSpy).toHaveBeenCalledTimes(5);
  });

  it('per-call deduplicate: false bypasses an identical in-flight request', async () => {
    const client = new GuildPassClient(BASE_CONFIG);
    const httpSpy = vi.spyOn(client['http'] as any, 'get').mockResolvedValue(mockAccess);

    const params = { walletAddress: ADDR, guildId: 'g1', resourceId: 'r1' };
    const results = await Promise.all([
      ...Array.from({ length: 4 }, () => client.access.checkAccess(params)),
      client.access.checkAccess(params, { deduplicate: false }),
    ]);

    expect(results).toHaveLength(5);
    results.forEach((r) => expect(r).toEqual(mockAccess));
    // 4 coalesced into 1 + 1 opted-out call = 2 HTTP requests.
    expect(httpSpy).toHaveBeenCalledTimes(2);
  });

  it('per-call deduplicate: true re-enables coalescing when disabled globally', async () => {
    const client = new GuildPassClient({ ...BASE_CONFIG, deduplication: false });
    const httpSpy = vi.spyOn(client['http'] as any, 'get').mockResolvedValue(mockAccess);

    const params = { walletAddress: ADDR, guildId: 'g1', resourceId: 'r1' };
    const results = await Promise.all(
      Array.from({ length: 3 }, () => client.access.checkAccess(params, { deduplicate: true })),
    );

    expect(results).toHaveLength(3);
    expect(httpSpy).toHaveBeenCalledTimes(1);
  });

  it('rejects a non-boolean deduplication config value', () => {
    expect(
      () => new GuildPassClient({ ...BASE_CONFIG, deduplication: 'yes' as any }),
    ).toThrow(GuildPassConfigError);
  });
});

describe('non-idempotent and uncached paths are never deduplicated', () => {
  it('does not coalesce concurrent identical checkAccessBatch calls', async () => {
    const client = new GuildPassClient(BASE_CONFIG);
    const httpSpy = vi.spyOn(client['http'] as any, 'get').mockResolvedValue(mockAccess);

    const batch = [{ walletAddress: ADDR, guildId: 'g1', resourceId: 'r1' }];
    const [a, b] = await Promise.all([
      client.access.checkAccessBatch(batch),
      client.access.checkAccessBatch(batch),
    ]);

    expect(a).toHaveLength(1);
    expect(b).toHaveLength(1);
    expect(httpSpy).toHaveBeenCalledTimes(2);
  });

  it('does not coalesce concurrent isMember calls with includeMeta', async () => {
    const client = new GuildPassClient(BASE_CONFIG);
    const httpSpy = vi
      .spyOn(client['http'] as any, 'get')
      .mockResolvedValue({ isActive: true, joinedAt: '2026-01-01T00:00:00Z' });

    const params = { walletAddress: ADDR, guildId: 'g1' };
    await Promise.all([
      client.membership.isMember(params, { includeMeta: true }),
      client.membership.isMember(params, { includeMeta: true }),
    ]);

    expect(httpSpy).toHaveBeenCalledTimes(2);
  });
});
