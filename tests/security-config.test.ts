import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { GuildPassClient } from '../src/client/GuildPassClient';
import { InMemoryCacheAdapter } from '../src/cache/cache.types';
import {
  MAX_ACCESS_CACHE_TTL_MS,
  RECOMMENDED_ACCESS_CACHE_TTL_MS,
  resolveAccessCacheTtl,
} from '../src/config/securityLimits';

const BASE_CONFIG = { apiUrl: 'https://api.guildpass.xyz' };
const WALLET = '0x1234567890123456789012345678901234567890';

describe('resolveAccessCacheTtl', () => {
  it('returns 0 when cacheTtl is 0', () => {
    expect(resolveAccessCacheTtl(0)).toBe(0);
  });

  it('defaults undefined cacheTtl to the recommended access TTL', () => {
    expect(resolveAccessCacheTtl(undefined)).toBe(RECOMMENDED_ACCESS_CACHE_TTL_MS);
  });

  it('caps cacheTtl above the access maximum', () => {
    expect(resolveAccessCacheTtl(600_000)).toBe(MAX_ACCESS_CACHE_TTL_MS);
  });

  it('passes through cacheTtl within the access maximum', () => {
    expect(resolveAccessCacheTtl(30_000)).toBe(30_000);
  });
});

describe('emitSecurityConfigWarnings', () => {
  beforeEach(() => {
    vi.spyOn(console, 'warn').mockImplementation(() => {});
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('warns when cache is enabled without cacheTtl', () => {
    new GuildPassClient({
      ...BASE_CONFIG,
      cache: new InMemoryCacheAdapter(),
    });

    expect(console.warn).toHaveBeenCalledWith(
      expect.stringContaining('cache is enabled without cacheTtl'),
    );
  });

  it('warns when cacheTtl exceeds the access maximum', () => {
    new GuildPassClient({
      ...BASE_CONFIG,
      cache: new InMemoryCacheAdapter(),
      cacheTtl: 600_000,
    });

    expect(console.warn).toHaveBeenCalledWith(
      expect.stringContaining('cacheTtl exceeds the recommended maximum for access decisions'),
    );
  });

  it('does not warn for a conservative cacheTtl', () => {
    new GuildPassClient({
      ...BASE_CONFIG,
      cache: new InMemoryCacheAdapter(),
      cacheTtl: 60_000,
    });

    expect(console.warn).not.toHaveBeenCalled();
  });
});

describe('access cache TTL enforcement', () => {
  const mockAccess = { hasAccess: true, reason: null };

  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.restoreAllMocks();
  });

  it('re-fetches access checks after the capped TTL even when global cacheTtl is longer', async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      headers: new Headers({ 'Content-Type': 'application/json' }),
      json: () => Promise.resolve(mockAccess),
    });

    const client = new GuildPassClient({
      ...BASE_CONFIG,
      cache: new InMemoryCacheAdapter(),
      cacheTtl: 600_000,
      fetch: fetchMock as unknown as typeof fetch,
    });

    const params = {
      walletAddress: WALLET,
      guildId: 'prime-guild',
      resourceId: 'premium-docs',
    };

    await client.access.checkAccess(params);
    await client.access.checkAccess(params);
    expect(fetchMock).toHaveBeenCalledTimes(1);

    vi.advanceTimersByTime(MAX_ACCESS_CACHE_TTL_MS + 1);

    await client.access.checkAccess(params);
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it('still uses the global cacheTtl for guild metadata', async () => {
    const mockGuild = {
      id: 'prime-guild',
      name: 'Prime Guild',
      ownerAddress: '0xowner',
      chainId: 1,
    };

    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      headers: new Headers({ 'Content-Type': 'application/json' }),
      json: () => Promise.resolve(mockGuild),
    });

    const client = new GuildPassClient({
      ...BASE_CONFIG,
      cache: new InMemoryCacheAdapter(),
      cacheTtl: 600_000,
      fetch: fetchMock as unknown as typeof fetch,
    });

    await client.guilds.getGuild({ guildId: 'prime-guild' });
    vi.advanceTimersByTime(MAX_ACCESS_CACHE_TTL_MS + 1);
    await client.guilds.getGuild({ guildId: 'prime-guild' });

    expect(fetchMock).toHaveBeenCalledTimes(1);
  });
});
