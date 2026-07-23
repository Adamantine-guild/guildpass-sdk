import type { CacheAdapter } from '../cache/cache.types';

export interface CacheAdapterConformanceOptions {
  /**
   * Return a fresh, empty adapter for each conformance case.
   */
  factory: () => CacheAdapter | Promise<CacheAdapter>;

  /**
   * Return an adapter whose underlying store is unavailable, while the adapter
   * itself still honours the never-throw contract.
   *
   * When omitted, store-failure isolation cases are not registered.
   */
  brokenFactory?: () => CacheAdapter | Promise<CacheAdapter>;

  /** Run before each conformance case. */
  setup?: () => void | Promise<void>;

  /** Run after each conformance case, including failed cases. */
  teardown?: () => void | Promise<void>;

  /**
   * Advance time for TTL cases. Test suites using fake timers should provide
   * their timer advancement function. The default waits in real time.
   */
  advanceTime?: (ms: number) => void | Promise<void>;
}

export interface CacheAdapterConformanceRunner {
  describe: (name: string, suite: () => void) => unknown;
  it: (name: string, test: () => void | Promise<void>) => unknown;
}

export interface CacheAdapterConformanceCase {
  name: string;
  group: 'contract' | 'error isolation';
  run: () => Promise<void>;
}

const TTL_MS = 100;

function wait(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function printable(value: unknown): string {
  if (value === undefined) return 'undefined';
  try {
    return JSON.stringify(value);
  } catch {
    return String(value);
  }
}

function deepEqual(
  actual: unknown,
  expected: unknown,
  seen: WeakMap<object, object> = new WeakMap(),
): boolean {
  if (Object.is(actual, expected)) return true;
  if (
    typeof actual !== 'object' ||
    actual === null ||
    typeof expected !== 'object' ||
    expected === null
  ) {
    return false;
  }

  const previousExpected = seen.get(actual);
  if (previousExpected) return previousExpected === expected;
  seen.set(actual, expected);

  if (actual instanceof Date || expected instanceof Date) {
    return (
      actual instanceof Date && expected instanceof Date && actual.getTime() === expected.getTime()
    );
  }

  if (Array.isArray(actual) || Array.isArray(expected)) {
    return (
      Array.isArray(actual) &&
      Array.isArray(expected) &&
      actual.length === expected.length &&
      actual.every((value, index) => deepEqual(value, expected[index], seen))
    );
  }

  const actualKeys = Object.keys(actual).sort();
  const expectedKeys = Object.keys(expected).sort();
  return (
    actualKeys.length === expectedKeys.length &&
    actualKeys.every(
      (key, index) =>
        key === expectedKeys[index] &&
        deepEqual(
          (actual as Record<string, unknown>)[key],
          (expected as Record<string, unknown>)[key],
          seen,
        ),
    )
  );
}

function assert(condition: unknown, message: string): asserts condition {
  if (!condition) throw new Error(message);
}

function assertSame(actual: unknown, expected: unknown, message: string): void {
  assert(
    deepEqual(actual, expected),
    `${message}. Expected ${printable(expected)}, received ${printable(actual)}`,
  );
}

async function assertDoesNotThrow(
  operation: string,
  action: () => void | Promise<void>,
): Promise<void> {
  try {
    await action();
  } catch (error) {
    const detail = error instanceof Error ? error.message : String(error);
    throw new Error(`${operation} violated the never-throw contract: ${detail}`);
  }
}

function conformanceCase(
  options: CacheAdapterConformanceOptions,
  name: string,
  run: () => void | Promise<void>,
  group: CacheAdapterConformanceCase['group'] = 'contract',
): CacheAdapterConformanceCase {
  return {
    name,
    group,
    run: async () => {
      try {
        await options.setup?.();
        await run();
      } finally {
        await options.teardown?.();
      }
    },
  };
}

/**
 * Build the adapter-agnostic cases without registering them with a test
 * framework. This is useful for custom runners and for selecting a focused
 * conformance case in a regression test.
 */
export function createCacheAdapterConformanceTests(
  options: CacheAdapterConformanceOptions,
): CacheAdapterConformanceCase[] {
  const advanceTime = options.advanceTime ?? wait;
  const cases: CacheAdapterConformanceCase[] = [
    conformanceCase(options, 'returns null for a cold key', async () => {
      const adapter = await options.factory();
      assertSame(await adapter.get('missing'), null, 'A missing key must return null');
    }),

    conformanceCase(options, 'stores and retrieves a typed value', async () => {
      const adapter = await options.factory();
      await adapter.set('typed', { score: 42 });
      assertSame(
        await adapter.get<{ score: number }>('typed'),
        { score: 42 },
        'The stored value must round-trip',
      );
    }),

    conformanceCase(options, 'expires an entry after its TTL', async () => {
      const adapter = await options.factory();
      await adapter.set('ttl', 'alive', TTL_MS);

      await advanceTime(TTL_MS - 10);
      assertSame(await adapter.get('ttl'), 'alive', 'The entry expired before its TTL');

      await advanceTime(20);
      assertSame(await adapter.get('ttl'), null, 'The entry remained after its TTL');
    }),

    conformanceCase(options, 'keeps an entry when no TTL is supplied', async () => {
      const adapter = await options.factory();
      await adapter.set('permanent', 'alive');
      await advanceTime(TTL_MS * 2);
      assertSame(
        await adapter.get('permanent'),
        'alive',
        'An entry without a TTL must remain available',
      );
    }),

    conformanceCase(options, 'deletes one entry without affecting another', async () => {
      const adapter = await options.factory();
      await adapter.set('delete-me', 1);
      await adapter.set('keep-me', 2);
      await adapter.delete('delete-me');

      assertSame(await adapter.get('delete-me'), null, 'delete() must remove its key');
      assertSame(await adapter.get('keep-me'), 2, 'delete() must not remove another key');
    }),

    conformanceCase(options, 'clear() removes every entry', async () => {
      const adapter = await options.factory();
      await adapter.set('first', 1);
      await adapter.set('second', 2);
      await adapter.clear();

      assertSame(await adapter.get('first'), null, 'clear() left the first entry behind');
      assertSame(await adapter.get('second'), null, 'clear() left the second entry behind');
    }),

    conformanceCase(options, 'deleting a missing key is a no-op', async () => {
      const adapter = await options.factory();
      await assertDoesNotThrow('delete()', () => adapter.delete('missing'));
    }),

    conformanceCase(options, 'deleteByPrefix() removes only matching keys', async () => {
      const adapter = await options.factory();
      if (!adapter.deleteByPrefix) return;

      await adapter.set('access:g1:first', 1);
      await adapter.set('access:g1:second', 2);
      await adapter.set('access:g2:first', 3);
      await adapter.set('unrelated', 4);
      await adapter.deleteByPrefix('access:g1:');

      assertSame(
        await adapter.get('access:g1:first'),
        null,
        'deleteByPrefix() left a matching key behind',
      );
      assertSame(
        await adapter.get('access:g1:second'),
        null,
        'deleteByPrefix() left a second matching key behind',
      );
      assertSame(
        await adapter.get('access:g2:first'),
        3,
        'deleteByPrefix() removed a non-matching prefix',
      );
      assertSame(await adapter.get('unrelated'), 4, 'deleteByPrefix() removed an unrelated key');
    }),

    conformanceCase(options, 'deleteByPrefix() is a no-op when nothing matches', async () => {
      const adapter = await options.factory();
      if (!adapter.deleteByPrefix) return;

      await adapter.set('first', 1);
      await adapter.set('second', 2);
      await adapter.deleteByPrefix('missing:');

      assertSame(await adapter.get('first'), 1, 'A non-matching prefix removed the first key');
      assertSame(await adapter.get('second'), 2, 'A non-matching prefix removed the second key');
    }),

    conformanceCase(options, 'TTL 0 expires immediately', async () => {
      const adapter = await options.factory();
      await adapter.set('instant', 'value', 0);
      await advanceTime(1);
      assertSame(await adapter.get('instant'), null, 'TTL 0 must expire immediately');
    }),

    conformanceCase(options, 'a positive TTL is alive immediately after set()', async () => {
      const adapter = await options.factory();
      await adapter.set('fresh', 'value', TTL_MS);
      assertSame(await adapter.get('fresh'), 'value', 'A positive TTL expired immediately');
    }),

    conformanceCase(options, 'overwriting a key resets its TTL', async () => {
      const adapter = await options.factory();
      await adapter.set('reset', 'first', TTL_MS);
      await advanceTime(50);
      await adapter.set('reset', 'second', TTL_MS * 2);

      await advanceTime(80);
      assertSame(
        await adapter.get('reset'),
        'second',
        'The previous TTL incorrectly expired the replacement value',
      );

      await advanceTime(130);
      assertSame(await adapter.get('reset'), null, 'The replacement TTL did not expire');
    }),

    conformanceCase(options, 'overwriting without a TTL removes the previous expiry', async () => {
      const adapter = await options.factory();
      await adapter.set('reset', 'expiring', TTL_MS);
      await advanceTime(50);
      await adapter.set('reset', 'permanent');
      await advanceTime(TTL_MS * 2);

      assertSame(
        await adapter.get('reset'),
        'permanent',
        'The previous TTL leaked into the replacement value',
      );
    }),

    conformanceCase(options, 'the latest set() value wins', async () => {
      const adapter = await options.factory();
      await adapter.set('latest', 'first', TTL_MS);
      await adapter.set('latest', 'second', TTL_MS);
      assertSame(await adapter.get('latest'), 'second', 'set() did not replace the prior value');
    }),

    conformanceCase(options, 'independent keys have independent TTLs', async () => {
      const adapter = await options.factory();
      await adapter.set('short', 'first', 50);
      await adapter.set('long', 'second', TTL_MS * 2);
      await advanceTime(80);

      assertSame(await adapter.get('short'), null, 'The short TTL did not expire');
      assertSame(await adapter.get('long'), 'second', 'The long TTL expired too early');
    }),

    conformanceCase(options, 'concurrent writes do not interfere', async () => {
      const adapter = await options.factory();
      await Promise.all([
        adapter.set('first', 1, TTL_MS),
        adapter.set('second', 2, TTL_MS * 2),
        adapter.set('third', 3, 50),
      ]);
      await advanceTime(80);

      assertSame(await adapter.get('first'), 1, 'The first concurrent write was lost');
      assertSame(await adapter.get('second'), 2, 'The second concurrent write was lost');
      assertSame(await adapter.get('third'), null, 'The third concurrent write did not expire');
    }),

    conformanceCase(options, 'clear() removes live and expired entries', async () => {
      const adapter = await options.factory();
      await adapter.set('live', 'yes', TTL_MS * 2);
      await adapter.set('expired', 'no', 20);
      await advanceTime(30);
      await adapter.clear();

      assertSame(await adapter.get('live'), null, 'clear() left a live entry behind');
      assertSame(await adapter.get('expired'), null, 'clear() left an expired entry behind');
    }),
  ];

  if (options.brokenFactory) {
    const brokenFactory = options.brokenFactory;
    cases.push(
      conformanceCase(
        options,
        'get() returns null when the store fails',
        async () => {
          const adapter = await brokenFactory();
          await assertDoesNotThrow('get()', async () => {
            assertSame(await adapter.get('key'), null, 'A failed get() must return null');
          });
        },
        'error isolation',
      ),
      conformanceCase(
        options,
        'set() does not throw when the store fails',
        async () => {
          const adapter = await brokenFactory();
          await assertDoesNotThrow('set()', () => adapter.set('key', 'value', TTL_MS));
        },
        'error isolation',
      ),
      conformanceCase(
        options,
        'delete() does not throw when the store fails',
        async () => {
          const adapter = await brokenFactory();
          await assertDoesNotThrow('delete()', () => adapter.delete('key'));
        },
        'error isolation',
      ),
      conformanceCase(
        options,
        'clear() does not throw when the store fails',
        async () => {
          const adapter = await brokenFactory();
          await assertDoesNotThrow('clear()', () => adapter.clear());
        },
        'error isolation',
      ),
      conformanceCase(
        options,
        'deleteByPrefix() does not throw when the store fails',
        async () => {
          const adapter = await brokenFactory();
          if (!adapter.deleteByPrefix) return;
          await assertDoesNotThrow('deleteByPrefix()', () => adapter.deleteByPrefix!('prefix:'));
        },
        'error isolation',
      ),
    );
  }

  return cases;
}

function globalRunner(): CacheAdapterConformanceRunner {
  const globals = globalThis as typeof globalThis & {
    describe?: CacheAdapterConformanceRunner['describe'];
    it?: CacheAdapterConformanceRunner['it'];
  };

  if (typeof globals.describe !== 'function' || typeof globals.it !== 'function') {
    throw new Error(
      'No global test runner found. Enable Vitest/Jest globals or pass { describe, it } as the second argument.',
    );
  }

  return { describe: globals.describe, it: globals.it };
}

/**
 * Register the complete CacheAdapter contract against Vitest, Jest, or another
 * runner exposing compatible `describe` and `it` functions.
 */
export function runCacheAdapterConformanceTests(
  options: CacheAdapterConformanceOptions,
  testRunner?: CacheAdapterConformanceRunner,
): void {
  const runner = testRunner ?? globalRunner();
  const cases = createCacheAdapterConformanceTests(options);
  const contractCases = cases.filter((testCase) => testCase.group === 'contract');
  const errorCases = cases.filter((testCase) => testCase.group === 'error isolation');

  runner.describe('CacheAdapter conformance', () => {
    for (const testCase of contractCases) {
      runner.it(testCase.name, testCase.run);
    }

    if (errorCases.length > 0) {
      runner.describe('error isolation', () => {
        for (const testCase of errorCases) {
          runner.it(testCase.name, testCase.run);
        }
      });
    }
  });
}
