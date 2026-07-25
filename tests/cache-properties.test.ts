import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import * as fc from 'fast-check';
import { GuildPassClient } from '../src/client/GuildPassClient';
import { InMemoryCacheAdapter } from '../src/cache/cache.types';
import { normaliseAddress } from '../src/utils/address';
import {
  resolveAccessCacheTtl,
  RECOMMENDED_ACCESS_CACHE_TTL_MS,
  MAX_ACCESS_CACHE_TTL_MS,
} from '../src/config/securityLimits';
import { encodePathSegment } from '../src/utils/formatting';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

const BASE_CONFIG = { apiUrl: 'https://api.guildpass.xyz' };

function makeClient(cacheTtl?: number) {
  const adapter = new InMemoryCacheAdapter();
  const client = new GuildPassClient({ ...BASE_CONFIG, cache: adapter, cacheTtl });
  vi.spyOn(client['http'] as any, 'get').mockResolvedValue({ ok: true });
  return { client, adapter };
}

// ---------------------------------------------------------------------------
// Generators
// ---------------------------------------------------------------------------

const walletAddress = fc.hexaString({ minLength: 40, maxLength: 40 }).map((h) => `0x${h}`);
const guildId = fc.hexaString({ minLength: 1, maxLength: 40 }).filter((s) => s.trim().length > 0);
const resourceId = fc.hexaString({ minLength: 1, maxLength: 40 }).filter((s) => s.trim().length > 0);
const roleId = fc.hexaString({ minLength: 1, maxLength: 40 }).filter((s) => s.trim().length > 0);
const paginationCursor = fc.oneof(
  fc.constant(undefined),
  fc.hexaString({ minLength: 1, maxLength: 20 }).map((h) => `cursor_${h}`),
);
const paginationLimit = fc.oneof(
  fc.constant(undefined),
  fc.integer({ min: 1, max: 100 }),
);

// ---------------------------------------------------------------------------
// 1. Cache-key uniqueness (no collision for distinct inputs)
// ---------------------------------------------------------------------------

describe('Property: cache-key uniqueness across distinct inputs', () => {
  // checkAccess: different guildId OR resourceId OR wallet → different key
  it('checkAccess — distinct inputs yield distinct keys', () => {
    const { client, adapter } = makeClient();
    const getSpy = vi.spyOn(adapter, 'get').mockResolvedValue(null);

    const seen = new Set<string>();
    let collision = false;

    fc.assert(
      fc.asyncProperty(
        fc.tuple(guildId, resourceId, walletAddress),
        async ([g, r, w]) => {
          getSpy.mockClear();
          await client.access.checkAccess({ guildId: g, resourceId: r, walletAddress: w });
          const key = getSpy.mock.calls[0]?.[0] as string;
          if (seen.has(key)) {
            collision = true;
          }
          seen.add(key);
        },
      ),
      { numRuns: 500, endOnFailure: true },
    );

    expect(collision).toBe(false);
  });

  // checkRoleAccess: different guildId OR roleId OR wallet → different key
  it('checkRoleAccess — distinct inputs yield distinct keys', () => {
    const { client, adapter } = makeClient();
    const getSpy = vi.spyOn(adapter, 'get').mockResolvedValue(null);

    const seen = new Set<string>();
    let collision = false;

    fc.assert(
      fc.asyncProperty(
        fc.tuple(guildId, roleId, walletAddress),
        async ([g, rid, w]) => {
          getSpy.mockClear();
          await client.access.checkRoleAccess({ guildId: g, roleId: rid, walletAddress: w });
          const key = getSpy.mock.calls[0]?.[0] as string;
          if (seen.has(key)) {
            collision = true;
          }
          seen.add(key);
        },
      ),
      { numRuns: 500, endOnFailure: true },
    );

    expect(collision).toBe(false);
  });

  // getMembership: different guildId OR wallet → different key
  it('getMembership — distinct inputs yield distinct keys', () => {
    const { client, adapter } = makeClient();
    const getSpy = vi.spyOn(adapter, 'get').mockResolvedValue(null);

    const seen = new Set<string>();
    let collision = false;

    fc.assert(
      fc.asyncProperty(
        fc.tuple(guildId, walletAddress),
        async ([g, w]) => {
          getSpy.mockClear();
          await client.membership.getMembership({ guildId: g, walletAddress: w });
          const key = getSpy.mock.calls[0]?.[0] as string;
          if (seen.has(key)) {
            collision = true;
          }
          seen.add(key);
        },
      ),
      { numRuns: 500, endOnFailure: true },
    );

    expect(collision).toBe(false);
  });

  // getRoles: different guildId OR cursor OR limit → different key
  it('getRoles — distinct inputs yield distinct keys', () => {
    const { client, adapter } = makeClient();
    const getSpy = vi.spyOn(adapter, 'get').mockResolvedValue(null);

    const seen = new Set<string>();
    let collision = false;

    fc.assert(
      fc.asyncProperty(
        fc.tuple(guildId, paginationCursor, paginationLimit),
        async ([g, cursor, limit]) => {
          getSpy.mockClear();
          await client.roles.getRoles({ guildId: g, cursor, limit });
          const key = getSpy.mock.calls[0]?.[0] as string;
          if (seen.has(key)) {
            collision = true;
          }
          seen.add(key);
        },
      ),
      { numRuns: 500, endOnFailure: true },
    );

    expect(collision).toBe(false);
  });

  // getUserRoles: different guildId OR wallet OR cursor OR limit → different key
  it('getUserRoles — distinct inputs yield distinct keys', () => {
    const { client, adapter } = makeClient();
    const getSpy = vi.spyOn(adapter, 'get').mockResolvedValue(null);

    const seen = new Set<string>();
    let collision = false;

    fc.assert(
      fc.asyncProperty(
        fc.tuple(guildId, walletAddress, paginationCursor, paginationLimit),
        async ([g, w, cursor, limit]) => {
          getSpy.mockClear();
          await client.roles.getUserRoles({
            guildId: g,
            walletAddress: w,
            cursor,
            limit,
          });
          const key = getSpy.mock.calls[0]?.[0] as string;
          if (seen.has(key)) {
            collision = true;
          }
          seen.add(key);
        },
      ),
      { numRuns: 500, endOnFailure: true },
    );

    expect(collision).toBe(false);
  });

  // getGuild: different guildId → different key
  it('getGuild — distinct guildIds yield distinct keys', () => {
    const { client, adapter } = makeClient();
    const getSpy = vi.spyOn(adapter, 'get').mockResolvedValue(null);

    const seen = new Set<string>();
    let collision = false;

    fc.assert(
      fc.asyncProperty(guildId, async (g) => {
        getSpy.mockClear();
        await client.guilds.getGuild({ guildId: g });
        const key = getSpy.mock.calls[0]?.[0] as string;
        if (seen.has(key)) {
          collision = true;
        }
        seen.add(key);
      }),
      { numRuns: 500, endOnFailure: true },
    );

    expect(collision).toBe(false);
  });

  // getGuildConfig: different guildId → different key
  it('getGuildConfig — distinct guildIds yield distinct keys', () => {
    const { client, adapter } = makeClient();
    const getSpy = vi.spyOn(adapter, 'get').mockResolvedValue(null);

    const seen = new Set<string>();
    let collision = false;

    fc.assert(
      fc.asyncProperty(guildId, async (g) => {
        getSpy.mockClear();
        await client.guilds.getGuildConfig({ guildId: g });
        const key = getSpy.mock.calls[0]?.[0] as string;
        if (seen.has(key)) {
          collision = true;
        }
        seen.add(key);
      }),
      { numRuns: 500, endOnFailure: true },
    );

    expect(collision).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// 2. Cross-service uniqueness (same params in different services → different key)
// ---------------------------------------------------------------------------

describe('Property: cross-service key uniqueness', () => {
  it('checkAccess and getMembership never collide for same guildId + wallet', () => {
    const { client, adapter } = makeClient();
    const getSpy = vi.spyOn(adapter, 'get').mockResolvedValue(null);

    fc.assert(
      fc.asyncProperty(
        fc.tuple(guildId, walletAddress),
        async ([g, w]) => {
          getSpy.mockClear();
          await client.access.checkAccess({
            guildId: g,
            resourceId: 'res',
            walletAddress: w,
          });
          const accessKey = getSpy.mock.calls[0]?.[0] as string;

          getSpy.mockClear();
          await client.membership.getMembership({
            guildId: g,
            walletAddress: w,
          });
          const membershipKey = getSpy.mock.calls[0]?.[0] as string;

          expect(accessKey).not.toBe(membershipKey);
        },
      ),
      { numRuns: 200, endOnFailure: true },
    );
  });

  it('checkRoleAccess and getUserRoles never collide for same guildId + roleId + wallet', () => {
    const { client, adapter } = makeClient();
    const getSpy = vi.spyOn(adapter, 'get').mockResolvedValue(null);

    fc.assert(
      fc.asyncProperty(
        fc.tuple(guildId, roleId, walletAddress),
        async ([g, rid, w]) => {
          getSpy.mockClear();
          await client.access.checkRoleAccess({
            guildId: g,
            roleId: rid,
            walletAddress: w,
          });
          const roleAccessKey = getSpy.mock.calls[0]?.[0] as string;

          getSpy.mockClear();
          await client.roles.getUserRoles({
            guildId: g,
            walletAddress: w,
          });
          const userRolesKey = getSpy.mock.calls[0]?.[0] as string;

          expect(roleAccessKey).not.toBe(userRolesKey);
        },
      ),
      { numRuns: 200, endOnFailure: true },
    );
  });

  it('getGuild and getGuildConfig never collide for same guildId', () => {
    const { client, adapter } = makeClient();
    const getSpy = vi.spyOn(adapter, 'get').mockResolvedValue(null);

    fc.assert(
      fc.asyncProperty(guildId, async (g) => {
        getSpy.mockClear();
        await client.guilds.getGuild({ guildId: g });
        const guildKey = getSpy.mock.calls[0]?.[0] as string;

        getSpy.mockClear();
        await client.guilds.getGuildConfig({ guildId: g });
        const configKey = getSpy.mock.calls[0]?.[0] as string;

        expect(guildKey).not.toBe(configKey);
      }),
      { numRuns: 200, endOnFailure: true },
    );
  });
});

// ---------------------------------------------------------------------------
// 3. Address normalization consistency
// ---------------------------------------------------------------------------

describe('Property: address normalization consistency', () => {
  it('mixed-case wallet always normalises to the same cache key', () => {
    const { client, adapter } = makeClient();
    const getSpy = vi.spyOn(adapter, 'get').mockResolvedValue(null);

    fc.assert(
      fc.property(walletAddress, (addr) => {
        getSpy.mockClear();
        client.access.checkAccess({
          guildId: 'g',
          resourceId: 'r',
          walletAddress: addr,
        });
        const key1 = getSpy.mock.calls[0]?.[0] as string;

        // Uppercase some hex chars but keep the 0x prefix lowercase
        const mixed = addr.slice(0, 2) + addr.slice(2).toUpperCase();

        getSpy.mockClear();
        client.access.checkAccess({
          guildId: 'g',
          resourceId: 'r',
          walletAddress: mixed,
        });
        const key2 = getSpy.mock.calls[0]?.[0] as string;

        expect(key1).toBe(key2);
      }),
      { numRuns: 300, endOnFailure: true },
    );
  });

  it('wallet with leading/trailing whitespace normalises identically', () => {
    const { client, adapter } = makeClient();
    const getSpy = vi.spyOn(adapter, 'get').mockResolvedValue(null);

    fc.assert(
      fc.property(walletAddress, (addr) => {
        getSpy.mockClear();
        client.access.checkAccess({
          guildId: 'g',
          resourceId: 'r',
          walletAddress: addr,
        });
        const key1 = getSpy.mock.calls[0]?.[0] as string;

        getSpy.mockClear();
        client.access.checkAccess({
          guildId: 'g',
          resourceId: 'r',
          walletAddress: `  ${addr}  `,
        });
        const key2 = getSpy.mock.calls[0]?.[0] as string;

        expect(key1).toBe(key2);
      }),
      { numRuns: 300, endOnFailure: true },
    );
  });

  it('normaliseAddress is idempotent: normalise(normalise(x)) === normalise(x)', () => {
    fc.assert(
      fc.property(walletAddress, (addr) => {
        const once = normaliseAddress(addr);
        const twice = normaliseAddress(once);
        expect(twice).toBe(once);
      }),
      { numRuns: 300, endOnFailure: true },
    );
  });

  it('wallet normalisation affects getMembership key (not just access)', () => {
    const { client, adapter } = makeClient();
    const getSpy = vi.spyOn(adapter, 'get').mockResolvedValue(null);

    fc.assert(
      fc.property(walletAddress, (addr) => {
        getSpy.mockClear();
        client.membership.getMembership({
          guildId: 'g',
          walletAddress: addr,
        });
        const key1 = getSpy.mock.calls[0]?.[0] as string;

        const mixed = addr.slice(0, 2) + addr.slice(2).toUpperCase();

        getSpy.mockClear();
        client.membership.getMembership({
          guildId: 'g',
          walletAddress: mixed,
        });
        const key2 = getSpy.mock.calls[0]?.[0] as string;

        expect(key1).toBe(key2);
      }),
      { numRuns: 300, endOnFailure: true },
    );
  });
});

// ---------------------------------------------------------------------------
// 4. Delimiter-confusion prevention (encodePathSegment)
// ---------------------------------------------------------------------------

describe('Property: delimiter-confusion prevention', () => {
  // Inputs containing ':' must be URL-encoded so they cannot shift across
  // the colon-delimited key segments.
  it('values containing ":" are encoded and do not create segment ambiguity', () => {
    fc.assert(
      fc.property(
        fc.string({ minLength: 1, maxLength: 20 }).filter((s) => s.length > 0),
        fc.string({ minLength: 1, maxLength: 20 }).filter((s) => s.length > 0),
        fc.string({ minLength: 1, maxLength: 20 }).filter((s) => s.length > 0),
        (a, b, c) => {
          const encodedA = encodePathSegment(a);
          const encodedB = encodePathSegment(b);
          const encodedC = encodePathSegment(c);

          // The encoded parts must not contain unencoded ':'
          expect(encodedA).not.toContain(':');
          expect(encodedB).not.toContain(':');
          expect(encodedC).not.toContain(':');

          // The encoded parts must differ from each other if inputs differ
          if (a !== b) expect(encodedA).not.toBe(encodedB);
          if (b !== c) expect(encodedB).not.toBe(encodedC);
          if (a !== c) expect(encodedA).not.toBe(encodedC);
        },
      ),
      { numRuns: 300, endOnFailure: true },
    );
  });

  // Two tuples that differ in any position must produce different raw key strings
  // even if naive concatenation without encoding would collide.
  it('encodeURIComponent prevents segment-boundary collisions for arbitrary strings', () => {
    fc.assert(
      fc.property(
        fc.tuple(
          fc.string({ minLength: 1, maxLength: 15 }).filter((s) => s.length > 0),
          fc.string({ minLength: 1, maxLength: 15 }).filter((s) => s.length > 0),
        ),
        fc.tuple(
          fc.string({ minLength: 1, maxLength: 15 }).filter((s) => s.length > 0),
          fc.string({ minLength: 1, maxLength: 15 }).filter((s) => s.length > 0),
        ),
        ([a1, b1], [a2, b2]) => {
          fc.pre(a1 !== a2 || b1 !== b2);

          const key1 = [a1, b1].map(encodePathSegment).join(':');
          const key2 = [a2, b2].map(encodePathSegment).join(':');

          expect(key1).not.toBe(key2);
        },
      ),
      { numRuns: 500, endOnFailure: true },
    );
  });
});

// ---------------------------------------------------------------------------
// 5. TTL resolution properties (resolveAccessCacheTtl)
// ---------------------------------------------------------------------------

describe('Property: resolveAccessCacheTtl', () => {
  it('returns RECOMMENDED_ACCESS_CACHE_TTL_MS when cacheTtl is undefined', () => {
    expect(resolveAccessCacheTtl(undefined)).toBe(RECOMMENDED_ACCESS_CACHE_TTL_MS);
  });

  it('returns 0 when cacheTtl is 0 (disabled)', () => {
    expect(resolveAccessCacheTtl(0)).toBe(0);
  });

  it('caps positive values at MAX_ACCESS_CACHE_TTL_MS', () => {
    fc.assert(
      fc.property(fc.integer({ min: 1, max: 10_000_000 }), (ttl) => {
        const result = resolveAccessCacheTtl(ttl);
        expect(result).toBeLessThanOrEqual(MAX_ACCESS_CACHE_TTL_MS);
        expect(result).toBeGreaterThan(0);
      }),
      { numRuns: 200, endOnFailure: true },
    );
  });

  it('preserves small positive values (below cap)', () => {
    fc.assert(
      fc.property(fc.integer({ min: 1, max: MAX_ACCESS_CACHE_TTL_MS - 1 }), (ttl) => {
        expect(resolveAccessCacheTtl(ttl)).toBe(ttl);
      }),
      { numRuns: 200, endOnFailure: true },
    );
  });

  it('non-negative inputs always produce non-negative output', () => {
    fc.assert(
      fc.property(fc.integer({ min: 0, max: 10_000_000 }), (ttl) => {
        const result = resolveAccessCacheTtl(ttl);
        expect(result).toBeGreaterThanOrEqual(0);
      }),
      { numRuns: 200, endOnFailure: true },
    );
  });

  it('output is always an integer when input is a non-negative integer', () => {
    fc.assert(
      fc.property(fc.integer({ min: 0, max: 10_000_000 }), (ttl) => {
        const result = resolveAccessCacheTtl(ttl);
        expect(Number.isInteger(result)).toBe(true);
      }),
      { numRuns: 200, endOnFailure: true },
    );
  });

  it('idempotent: resolveAccessCacheTtl(resolveAccessCacheTtl(x)) === resolveAccessCacheTtl(x) for non-negative values', () => {
    fc.assert(
      fc.property(fc.integer({ min: 0, max: MAX_ACCESS_CACHE_TTL_MS }), (ttl) => {
        const once = resolveAccessCacheTtl(ttl);
        const twice = resolveAccessCacheTtl(once);
        expect(twice).toBe(once);
      }),
      { numRuns: 200, endOnFailure: true },
    );
  });
});

// ---------------------------------------------------------------------------
// 6. InMemoryCacheAdapter TTL behaviour properties
// ---------------------------------------------------------------------------

describe('Property: InMemoryCacheAdapter TTL behaviour', () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('value is retrievable before TTL expires', async () => {
    const adapter = new InMemoryCacheAdapter();

    await fc.assert(
      fc.asyncProperty(
        fc.hexaString({ minLength: 1, maxLength: 20 }).map((h) => `key_${h}`),
        fc.integer({ min: 100, max: 60_000 }),
        fc.integer({ min: 1, max: 99 }),
        async (key, ttl, deltaBeforeExpiry) => {
          vi.useFakeTimers();
          await adapter.set(key, 'val', ttl);
          vi.advanceTimersByTime(deltaBeforeExpiry);
          const result = await adapter.get(key);
          expect(result).toBe('val');
          vi.useRealTimers();
        },
      ),
      { numRuns: 100, endOnFailure: true },
    );
  });

  it('value expires after TTL', async () => {
    const adapter = new InMemoryCacheAdapter();

    await fc.assert(
      fc.asyncProperty(
        fc.hexaString({ minLength: 1, maxLength: 20 }).map((h) => `key_${h}`),
        fc.integer({ min: 1, max: 60_000 }),
        async (key, ttl) => {
          vi.useFakeTimers();
          await adapter.set(key, 'val', ttl);
          vi.advanceTimersByTime(ttl + 1);
          const result = await adapter.get(key);
          expect(result).toBeNull();
          vi.useRealTimers();
        },
      ),
      { numRuns: 100, endOnFailure: true },
    );
  });

  it('TTL 0 causes immediate expiry', async () => {
    const adapter = new InMemoryCacheAdapter();

    await fc.assert(
      fc.asyncProperty(
        fc.hexaString({ minLength: 1, maxLength: 20 }).map((h) => `key_${h}`),
        async (key) => {
          vi.useFakeTimers();
          await adapter.set(key, 'val', 0);
          const result = await adapter.get(key);
          expect(result).toBeNull();
          vi.useRealTimers();
        },
      ),
      { numRuns: 100, endOnFailure: true },
    );
  });

  it('no TTL means no expiry (value persists)', async () => {
    const adapter = new InMemoryCacheAdapter();

    await fc.assert(
      fc.asyncProperty(
        fc.hexaString({ minLength: 1, maxLength: 20 }).map((h) => `key_${h}`),
        fc.integer({ min: 1, max: 365 * 24 * 60 * 60 * 1000 }),
        async (key, largeDelta) => {
          vi.useFakeTimers();
          await adapter.set(key, 'val');
          vi.advanceTimersByTime(largeDelta);
          const result = await adapter.get(key);
          expect(result).toBe('val');
          vi.useRealTimers();
        },
      ),
      { numRuns: 100, endOnFailure: true },
    );
  });

  it('overwrite resets TTL (new TTL starts from now)', async () => {
    const adapter = new InMemoryCacheAdapter();

    await fc.assert(
      fc.asyncProperty(
        fc.hexaString({ minLength: 1, maxLength: 20 }).map((h) => `key_${h}`),
        fc.integer({ min: 100, max: 5000 }),
        fc.integer({ min: 100, max: 5000 }),
        async (key, ttl1, ttl2) => {
          vi.useFakeTimers();
          await adapter.set(key, 'v1', ttl1);
          vi.advanceTimersByTime(ttl1 - 10);
          await adapter.set(key, 'v2', ttl2);
          vi.advanceTimersByTime(20);
          const result = await adapter.get(key);
          expect(result).toBe('v2');
          vi.useRealTimers();
        },
      ),
      { numRuns: 100, endOnFailure: true },
    );
  });

  it('distinct keys are independently TTL-governed', async () => {
    const adapter = new InMemoryCacheAdapter();

    await fc.assert(
      fc.asyncProperty(
        fc.hexaString({ minLength: 1, maxLength: 20 }).map((h) => `k1_${h}`),
        fc.hexaString({ minLength: 1, maxLength: 20 }).map((h) => `k2_${h}`),
        fc.integer({ min: 100, max: 5000 }),
        fc.integer({ min: 100, max: 5000 }),
        async (key1, key2, ttl1, ttl2) => {
          fc.pre(key1 !== key2);
          vi.useFakeTimers();
          await adapter.set(key1, 'v1', ttl1);
          await adapter.set(key2, 'v2', ttl2);
          vi.advanceTimersByTime(Math.max(ttl1, ttl2) + 1);
          const r1 = await adapter.get(key1);
          const r2 = await adapter.get(key2);
          expect(r1).toBeNull();
          expect(r2).toBeNull();
          vi.useRealTimers();
        },
      ),
      { numRuns: 100, endOnFailure: true },
    );
  });
});

// ---------------------------------------------------------------------------
// 7. Cache miss → network → cache populate → cache hit cycle (property)
// ---------------------------------------------------------------------------

describe('Property: cache-hit cycle properties', () => {
  it('second identical call always returns cached value (no network)', async () => {
    const { client, adapter } = makeClient();

    fc.assert(
      fc.asyncProperty(
        fc.tuple(guildId, resourceId, walletAddress),
        async ([g, r, w]) => {
          // Spy on set to capture the key and value from the first call
          const setSpy = vi.spyOn(adapter, 'set');

          // First call: cache miss → network → set
          await client.access.checkAccess({
            guildId: g,
            resourceId: r,
            walletAddress: w,
          });
          expect(setSpy).toHaveBeenCalledTimes(1);

          const capturedKey = setSpy.mock.calls[0]?.[0] as string;

          // Now use a fresh adapter (no spy interference) for the second call
          const freshAdapter = new InMemoryCacheAdapter();
          await freshAdapter.set(capturedKey, { hasAccess: true });
          const freshClient = new GuildPassClient({
            ...BASE_CONFIG,
            cache: freshAdapter,
          });
          vi.spyOn(freshClient['http'] as any, 'get');

          const result = await freshClient.access.checkAccess({
            guildId: g,
            resourceId: r,
            walletAddress: w,
          });
          expect(result).toEqual({ hasAccess: true });
          // Network should NOT have been called (cache hit)
          expect((freshClient['http'] as any).get).not.toHaveBeenCalled();
        },
      ),
      { numRuns: 200, endOnFailure: true },
    );
  });

  it('different wallets for the same guild+resource are independent cache entries', async () => {
    const { client, adapter } = makeClient();
    const getSpy = vi.spyOn(adapter, 'get').mockResolvedValue(null);

    fc.assert(
      fc.asyncProperty(
        fc.tuple(guildId, resourceId, walletAddress, walletAddress),
        async ([g, r, w1, w2]) => {
          fc.pre(normaliseAddress(w1) !== normaliseAddress(w2));

          getSpy.mockClear();
          await client.access.checkAccess({
            guildId: g,
            resourceId: r,
            walletAddress: w1,
          });
          const key1 = getSpy.mock.calls[0]?.[0] as string;

          getSpy.mockClear();
          await client.access.checkAccess({
            guildId: g,
            resourceId: r,
            walletAddress: w2,
          });
          const key2 = getSpy.mock.calls[0]?.[0] as string;

          expect(key1).not.toBe(key2);
        },
      ),
      { numRuns: 200, endOnFailure: true },
    );
  });
});

// ---------------------------------------------------------------------------
// 8. Deliberate collision-bug detection
// ---------------------------------------------------------------------------

describe('Property: deliberately introduced collision bug is caught', () => {
  /**
   * A broken key builder that naively concatenates without encoding.
   * This means 'guild:a' + 'res' === 'guild' + 'a:res' when both produce
   * the same flat string after join(':').
   */
  function brokenBuildKey(...parts: string[]): string {
    return parts.join(':');
  }

  /**
   * The correct key builder mirrors the SDK's actual implementation.
   */
  function correctBuildKey(...parts: string[]): string {
    return parts.map(encodePathSegment).join(':');
  }

  it('fast-check finds a collision in the broken builder', () => {
    let foundCollision = false;

    // Strings containing ':' so naive join(':') creates ambiguous boundaries.
    // e.g. brokenBuildKey('ns', 'a:b', 'c') === 'ns:a:b:c'
    //      brokenBuildKey('ns', 'a', 'b:c') === 'ns:a:b:c'  ← collision!
    const colonPart = fc.constantFrom('a:b', 'b:c', 'x:y', 'g:1');
    const plainPart = fc.constantFrom('a', 'b', 'c', 'x');

    try {
      fc.assert(
        fc.property(
          fc.tuple(colonPart, plainPart),
          fc.tuple(plainPart, colonPart),
          ([a1, b1], [a2, b2]) => {
            const key1 = brokenBuildKey('ns', a1, b1);
            const key2 = brokenBuildKey('ns', a2, b2);
            if (key1 === key2 && (a1 !== a2 || b1 !== b2)) {
              foundCollision = true;
              throw new Error('collision found');
            }
          },
        ),
        { numRuns: 5000, endOnFailure: true },
      );
    } catch {
      // Expected — we threw to stop the search
    }

    expect(foundCollision).toBe(true);
  });

  it('the correct builder never produces the same collision pattern', () => {
    let foundCollision = false;
    const colonPart = fc.constantFrom('a:b', 'b:c', 'x:y', 'g:1');
    const plainPart = fc.constantFrom('a', 'b', 'c', 'x');

    try {
      fc.assert(
        fc.property(
          fc.tuple(colonPart, plainPart),
          fc.tuple(plainPart, colonPart),
          ([a1, b1], [a2, b2]) => {
            fc.pre(a1 !== a2 || b1 !== b2);
            const key1 = correctBuildKey('ns', a1, b1);
            const key2 = correctBuildKey('ns', a2, b2);
            if (key1 === key2) {
              foundCollision = true;
              throw new Error('collision found in correct builder');
            }
          },
        ),
        { numRuns: 5000, endOnFailure: true },
      );
    } catch {
      // Expected only if collision found
    }

    expect(foundCollision).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// 9. Cross-service key namespace isolation
// ---------------------------------------------------------------------------

describe('Property: key namespace isolation', () => {
  it('getGuild and getMembership with same guildId produce different key prefixes', () => {
    const { client, adapter } = makeClient();
    const getSpy = vi.spyOn(adapter, 'get').mockResolvedValue(null);

    fc.assert(
      fc.asyncProperty(
        fc.tuple(guildId, walletAddress),
        async ([g, w]) => {
          getSpy.mockClear();
          await client.guilds.getGuild({ guildId: g });
          const guildKey = getSpy.mock.calls[0]?.[0] as string;

          getSpy.mockClear();
          await client.membership.getMembership({ guildId: g, walletAddress: w });
          const membershipKey = getSpy.mock.calls[0]?.[0] as string;

          expect(guildKey).not.toEqual(membershipKey);
          // Verify namespace prefixes are different
          expect(guildKey.startsWith('guilds:')).toBe(true);
          expect(membershipKey.startsWith('membership:')).toBe(true);
        },
      ),
      { numRuns: 200, endOnFailure: true },
    );
  });

  it('all access methods start with "access:" prefix', () => {
    const { client, adapter } = makeClient();
    const getSpy = vi.spyOn(adapter, 'get').mockResolvedValue(null);

    fc.assert(
      fc.asyncProperty(
        fc.tuple(guildId, resourceId, roleId, walletAddress),
        async ([g, r, rid, w]) => {
          getSpy.mockClear();
          await client.access.checkAccess({
            guildId: g,
            resourceId: r,
            walletAddress: w,
          });
          const accessKey = getSpy.mock.calls[0]?.[0] as string;
          expect(accessKey.startsWith('access:checkAccess:')).toBe(true);

          getSpy.mockClear();
          await client.access.checkRoleAccess({
            guildId: g,
            roleId: rid,
            walletAddress: w,
          });
          const roleAccessKey = getSpy.mock.calls[0]?.[0] as string;
          expect(roleAccessKey.startsWith('access:checkRoleAccess:')).toBe(true);
        },
      ),
      { numRuns: 200, endOnFailure: true },
    );
  });
});

// ---------------------------------------------------------------------------
// 10. hasRole and checkRoleAccess share the same cache key
// ---------------------------------------------------------------------------

describe('Property: hasRole and checkRoleAccess key equivalence', () => {
  it('hasRole and checkRoleAccess with identical params produce the same cache key', () => {
    const { client, adapter } = makeClient();
    const getSpy = vi.spyOn(adapter, 'get').mockResolvedValue(null);

    fc.assert(
      fc.asyncProperty(
        fc.tuple(guildId, roleId, walletAddress),
        async ([g, rid, w]) => {
          getSpy.mockClear();
          await client.access.checkRoleAccess({
            guildId: g,
            roleId: rid,
            walletAddress: w,
          });
          const roleAccessKey = getSpy.mock.calls[0]?.[0] as string;

          getSpy.mockClear();
          await client.roles.hasRole({
            guildId: g,
            roleId: rid,
            walletAddress: w,
          });
          const hasRoleKey = getSpy.mock.calls[0]?.[0] as string;

          expect(hasRoleKey).toBe(roleAccessKey);
        },
      ),
      { numRuns: 200, endOnFailure: true },
    );
  });
});

// ---------------------------------------------------------------------------
// 11. Roles pagination cache-key isolation
// ---------------------------------------------------------------------------

describe('Property: roles pagination cache-key isolation', () => {
  it('getRoles with pagination produces different keys than without', () => {
    const { client, adapter } = makeClient();
    const getSpy = vi.spyOn(adapter, 'get').mockResolvedValue(null);

    fc.assert(
      fc.asyncProperty(
        fc.tuple(guildId, paginationCursor, paginationLimit),
        async ([g, cursor, limit]) => {
          fc.pre(cursor !== undefined || limit !== undefined);

          getSpy.mockClear();
          await client.roles.getRoles({ guildId: g });
          const baseKey = getSpy.mock.calls[0]?.[0] as string;

          getSpy.mockClear();
          await client.roles.getRoles({ guildId: g, cursor, limit });
          const paginatedKey = getSpy.mock.calls[0]?.[0] as string;

          expect(paginatedKey).not.toBe(baseKey);
        },
      ),
      { numRuns: 200, endOnFailure: true },
    );
  });

  it('different limit values produce different cache keys', () => {
    const { client, adapter } = makeClient();
    const getSpy = vi.spyOn(adapter, 'get').mockResolvedValue(null);

    fc.assert(
      fc.asyncProperty(
        fc.tuple(
          guildId,
          fc.integer({ min: 1, max: 50 }),
          fc.integer({ min: 51, max: 100 }),
        ),
        async ([g, limit1, limit2]) => {
          getSpy.mockClear();
          await client.roles.getRoles({ guildId: g, limit: limit1 });
          const key1 = getSpy.mock.calls[0]?.[0] as string;

          getSpy.mockClear();
          await client.roles.getRoles({ guildId: g, limit: limit2 });
          const key2 = getSpy.mock.calls[0]?.[0] as string;

          expect(key1).not.toBe(key2);
        },
      ),
      { numRuns: 200, endOnFailure: true },
    );
  });

  it('getUserRoles wallet normalization is independent of pagination params', () => {
    const { client, adapter } = makeClient();
    const getSpy = vi.spyOn(adapter, 'get').mockResolvedValue(null);

    fc.assert(
      fc.asyncProperty(
        fc.tuple(guildId, walletAddress, paginationCursor, paginationLimit),
        async ([g, w, cursor, limit]) => {
          fc.pre(cursor !== undefined || limit !== undefined);

          const mixed = w.slice(0, 2) + w.slice(2).toUpperCase();

          getSpy.mockClear();
          await client.roles.getUserRoles({
            guildId: g,
            walletAddress: w,
            cursor,
            limit,
          });
          const key1 = getSpy.mock.calls[0]?.[0] as string;

          getSpy.mockClear();
          await client.roles.getUserRoles({
            guildId: g,
            walletAddress: mixed,
            cursor,
            limit,
          });
          const key2 = getSpy.mock.calls[0]?.[0] as string;

          expect(key1).toBe(key2);
        },
      ),
      { numRuns: 200, endOnFailure: true },
    );
  });
});
