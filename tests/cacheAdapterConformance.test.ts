import { describe, expect, it } from 'vitest';
import type { CacheAdapter } from '../src/cache/cache.types';
import {
  createCacheAdapterConformanceTests,
  runCacheAdapterConformanceTests,
} from '../src/testing/cacheAdapterConformance';

class BrokenClearAdapter implements CacheAdapter {
  private readonly values = new Map<string, unknown>();

  async get<T>(key: string): Promise<T | null> {
    return (this.values.get(key) as T | undefined) ?? null;
  }

  async set<T>(key: string, value: T): Promise<void> {
    this.values.set(key, value);
  }

  async delete(key: string): Promise<void> {
    this.values.delete(key);
  }

  async clear(): Promise<void> {
    // Deliberately broken: a conformant clear() must empty the adapter.
  }
}

describe('CacheAdapter public conformance helper', () => {
  it('fails a deliberately broken clear() implementation', async () => {
    const cases = createCacheAdapterConformanceTests({
      factory: () => new BrokenClearAdapter(),
    });
    const clearCase = cases.find((testCase) => testCase.name === 'clear() removes every entry');

    expect(clearCase).toBeDefined();
    await expect(clearCase!.run()).rejects.toThrow('clear() left the first entry behind');
  });

  it('registers contract and error-isolation cases with an injected runner', () => {
    const registered: string[] = [];
    const suites: string[] = [];

    runCacheAdapterConformanceTests(
      {
        factory: () => new BrokenClearAdapter(),
        brokenFactory: () => new BrokenClearAdapter(),
      },
      {
        describe(name, suite) {
          suites.push(name);
          suite();
        },
        it(name) {
          registered.push(name);
        },
      },
    );

    expect(suites).toEqual(['CacheAdapter conformance', 'error isolation']);
    expect(registered).toContain('expires an entry after its TTL');
    expect(registered).toContain('deleteByPrefix() removes only matching keys');
    expect(registered).toContain('get() returns null when the store fails');
  });
});
