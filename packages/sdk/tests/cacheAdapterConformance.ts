import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import type { CacheAdapter } from '../src/cache/cache.types';

export interface CacheAdapterConformanceOptions {
/**
* Factory function that returns a fresh, empty CacheAdapter instance.
*/
factory: () => CacheAdapter | Promise<CacheAdapter>;

  /**
   * Factory function that returns a broken CacheAdapter instance (e.g., disconnected from its backend).
   * Used to verify the "never throws" contract.
   * If omitted, the error handling tests are skipped.
   */
  brokenFactory?: () => CacheAdapter | Promise<CacheAdapter>;

  /**
   * Optional setup function to run before each test.
   */
  setup?: () => void | Promise<void>;

  /**
   * Optional teardown function to run after each test.
   */
  teardown?: () => void | Promise<void>;

  /**
   * Custom time advancement function for TTL tests.
   * If not provided, defaults to Vitest's fake timers (`vi.advanceTimersByTime`).
   * When testing a real backend (e.g., Redis), provide a function that uses `setTimeout`
   * or a similar real-time delay.
   */
  advanceTime?: (ms: number) => Promise<void>;
}

export function runCacheAdapterConformanceTests(
  options: CacheAdapterConformanceOptions,
  describeFn = describe
) {
  describeFn('CacheAdapter Conformance Suite', () => {
    let advanceTime: (ms: number) => Promise<void>;
    let usingFakeTimers = false;

    beforeEach(async () => {
      if (options.advanceTime) {
        advanceTime = options.advanceTime;
      } else {
        vi.useFakeTimers();
        usingFakeTimers = true;
        advanceTime = async (ms) => {
          vi.advanceTimersByTime(ms);
        };
      }
      if (options.setup) {
        await options.setup();
      }
    });

    afterEach(async () => {
      if (options.teardown) {
        await options.teardown();
      }
      if (usingFakeTimers) {
        vi.useRealTimers();
        usingFakeTimers = false;
      }
    });

    it('returns null for a cold key', async () => {
      const adapter = await options.factory();
      expect(await adapter.get('missing')).toBeNull();
    });

    it('stores and retrieves a typed value', async () => {
      const adapter = await options.factory();
      await adapter.set('k', { score: 42 });
      expect(await adapter.get<{ score: number }>('k')).toEqual({ score: 42 });
    });

    it('returns null after TTL expires', async () => {
      const adapter = await options.factory();
      await adapter.set('k', 'hello', 100);

      await advanceTime(90);
      expect(await adapter.get('k')).toBe('hello');

      await advanceTime(20);
      expect(await adapter.get('k')).toBeNull();
    });

    it('keeps an entry alive when no TTL is set', async () => {
      const adapter = await options.factory();
      await adapter.set('k', 'forever');
      await advanceTime(1_000_000);
      expect(await adapter.get('k')).toBe('forever');
    });

    it('deletes a single entry', async () => {
      const adapter = await options.factory();
      await adapter.set('k', 1);
      await adapter.delete('k');
      expect(await adapter.get('k')).toBeNull();
    });

    it('clears all entries', async () => {
      const adapter = await options.factory();
      await adapter.set('a', 1);
      await adapter.set('b', 2);
      await adapter.clear();
      expect(await adapter.get('a')).toBeNull();
      expect(await adapter.get('b')).toBeNull();
    });

    it('ignores delete of a non-existent key', async () => {
      const adapter = await options.factory();
      await expect(adapter.delete('ghost')).resolves.toBeUndefined();
    });

    it('deleteByPrefix removes all keys starting with the prefix', async () => {
      const adapter = await options.factory();
      if (!adapter.deleteByPrefix) return;

      await adapter.set('access:checkAccess:g1:res1:0xabc', { hasAccess: true });
      await adapter.set('access:checkAccess:g1:res2:0xdef', { hasAccess: false });
      await adapter.set('access:checkAccess:g2:res1:0xabc', { hasAccess: true });
      await adapter.set('unrelated:key', 'keep');

      await adapter.deleteByPrefix('access:checkAccess:g1:');

      expect(await adapter.get('access:checkAccess:g1:res1:0xabc')).toBeNull();
      expect(await adapter.get('access:checkAccess:g1:res2:0xdef')).toBeNull();
      expect(await adapter.get('access:checkAccess:g2:res1:0xabc')).toEqual({ hasAccess: true });
      expect(await adapter.get('unrelated:key')).toBe('keep');
    });

    it('deleteByPrefix with no matching keys is a no-op', async () => {
      const adapter = await options.factory();
      if (!adapter.deleteByPrefix) return;

      await adapter.set('a', 1);
      await adapter.set('b', 2);
      await adapter.deleteByPrefix('nonexistent:');
      expect(await adapter.get('a')).toBe(1);
      expect(await adapter.get('b')).toBe(2);
    });

    // ---------------------------------------------------------------------------
    // TTL edge cases
    // ---------------------------------------------------------------------------

    it('TTL=0: entry expires immediately — get returns null', async () => {
      const adapter = await options.factory();
      await adapter.set('k', 'instant', 0);
      await advanceTime(1);
      expect(await adapter.get('k')).toBeNull();
    });

    it('TTL>0: entry is still alive immediately after set', async () => {
      const adapter = await options.factory();
      await adapter.set('k', 'alive', 50);
      expect(await adapter.get('k')).toBe('alive');
    });

    it('TTL>0: entry expires after advancing past the TTL', async () => {
      const adapter = await options.factory();
      await adapter.set('k', 'short', 50);
      await advanceTime(60);
      expect(await adapter.get('k')).toBeNull();
    });

    it('overwriting a key with a new TTL resets the expiry clock', async () => {
      const adapter = await options.factory();
      await adapter.set('k', 'first', 100);

      await advanceTime(50);
      await adapter.set('k', 'second', 200);

      await advanceTime(120);
      // first would have expired (50 + 120 = 170 > 100), but second is 200, so still alive
      expect(await adapter.get('k')).toBe('second');

      await advanceTime(100);
      expect(await adapter.get('k')).toBeNull();
    });

    it('overwriting a key with no TTL removes expiry (entry lives forever)', async () => {
      const adapter = await options.factory();
      await adapter.set('k', 'expiring', 100);

      await advanceTime(50);
      await adapter.set('k', 'permanent');

      await advanceTime(1_000_000);
      expect(await adapter.get('k')).toBe('permanent');
    });

    it('setting the same key twice keeps only the latest value', async () => {
      const adapter = await options.factory();
      await adapter.set('k', 'v1', 5_000);
      await adapter.set('k', 'v2', 5_000);
      expect(await adapter.get('k')).toBe('v2');
    });

    it('independent keys have independent TTLs', async () => {
      const adapter = await options.factory();
      await adapter.set('short', 'a', 50);
      await adapter.set('long', 'b', 200);

      await advanceTime(80);

      expect(await adapter.get('short')).toBeNull();
      expect(await adapter.get('long')).toBe('b');
    });

    it('large TTL value keeps entry alive well into the future', async () => {
      const adapter = await options.factory();
      const ONE_YEAR_MS = 365 * 24 * 60 * 60 * 1_000;
      await adapter.set('k', 'future', ONE_YEAR_MS);

      await advanceTime(ONE_YEAR_MS - 1000);
      expect(await adapter.get('k')).toBe('future');

      await advanceTime(2000);
      expect(await adapter.get('k')).toBeNull();
    });

    it('concurrent sets for different keys do not interfere', async () => {
      const adapter = await options.factory();
      await Promise.all([
        adapter.set('a', 1, 100),
        adapter.set('b', 2, 200),
        adapter.set('c', 3, 50),
      ]);

      await advanceTime(80);
      expect(await adapter.get('a')).toBe(1);
      expect(await adapter.get('b')).toBe(2);
      expect(await adapter.get('c')).toBeNull();
    });

    it('clear removes entries regardless of TTL state', async () => {
      const adapter = await options.factory();
      await adapter.set('alive', 'yes', 10_000);
      await adapter.set('dead', 'no', 10);

      await advanceTime(20);

      await adapter.clear();

      expect(await adapter.get('alive')).toBeNull();
      expect(await adapter.get('dead')).toBeNull();
    });

    describe('Error Handling (never throws contract)', () => {
      if (options.brokenFactory) {
        it('get() returns null on failure', async () => {
          const adapter = await options.brokenFactory!();
          await expect(adapter.get('key')).resolves.toBeNull();
        });

        it('set() swallows errors', async () => {
          const adapter = await options.brokenFactory!();
          await expect(adapter.set('key', 'val', 100)).resolves.toBeUndefined();
        });

        it('delete() swallows errors', async () => {
          const adapter = await options.brokenFactory!();
          await expect(adapter.delete('key')).resolves.toBeUndefined();
        });

        it('clear() swallows errors', async () => {
          const adapter = await options.brokenFactory!();
          await expect(adapter.clear()).resolves.toBeUndefined();
        });

        it('deleteByPrefix() swallows errors (if implemented)', async () => {
          const adapter = await options.brokenFactory!();
          if (adapter.deleteByPrefix) {
            await expect(adapter.deleteByPrefix('prefix:')).resolves.toBeUndefined();
          }
        });
      } else {
        it.skip('Error Handling tests skipped (no brokenFactory provided)', () => {});
      }
    });
  });
}