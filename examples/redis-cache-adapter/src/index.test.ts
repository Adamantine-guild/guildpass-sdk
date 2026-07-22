import { describe, expect, it } from 'vitest';
import { RedisCacheAdapter } from './index';
import { runCacheAdapterConformanceTests } from '../../../tests/cacheAdapterConformance';
import type { RedisClientType } from 'redis';

/**
 * A simple in-memory mock for the redis v4 client to allow testing
 * the adapter without needing a real Redis instance.
 */
class MockRedisClient {
  public isOpen = true;
  private store = new Map<string, { value: string; expiresAt: number | null }>();

  async connect() {
    this.isOpen = true;
  }

  async quit() {
    this.isOpen = false;
  }

  async get(key: string) {
    if (!this.isOpen) throw new Error('Client is closed');
    const entry = this.store.get(key);
    if (!entry) return null;
    if (entry.expiresAt !== null && Date.now() >= entry.expiresAt) {
      this.store.delete(key);
      return null;
    }
    return entry.value;
  }

  async set(key: string, value: string, options?: { PX?: number }) {
    if (!this.isOpen) throw new Error('Client is closed');
    const expiresAt = options?.PX !== undefined ? Date.now() + options.PX : null;
    this.store.set(key, { value, expiresAt });
  }

  async del(keys: string | string[]) {
    if (!this.isOpen) throw new Error('Client is closed');
    const kArray = Array.isArray(keys) ? keys : [keys];
    for (const k of kArray) this.store.delete(k);
  }

  async unlink(keys: string | string[]) {
    return this.del(keys);
  }

  async flushDb() {
    if (!this.isOpen) throw new Error('Client is closed');
    this.store.clear();
  }

  async *scanIterator(options: { MATCH: string; COUNT?: number }) {
    if (!this.isOpen) throw new Error('Client is closed');
    const pattern = options.MATCH;
    const prefix = pattern.endsWith('*') ? pattern.slice(0, -1) : pattern;
    for (const [key, entry] of this.store.entries()) {
      if (entry.expiresAt !== null && Date.now() >= entry.expiresAt) {
        this.store.delete(key);
        continue;
      }
      if (key.startsWith(prefix)) {
        yield key;
      }
    }
  }
}

describe('RedisCacheAdapter', () => {
  it('instantiates correctly', () => {
    const adapter = new RedisCacheAdapter('redis://localhost:6379');
    expect(adapter).toBeDefined();
  });

  runCacheAdapterConformanceTests({
    factory: async () => {
      const mockClient = new MockRedisClient() as unknown as RedisClientType;
      const adapter = new RedisCacheAdapter(mockClient);
      await adapter.connect();
      return adapter;
    },
    brokenFactory: async () => {
      const mockClient = new MockRedisClient() as unknown as RedisClientType;
      const adapter = new RedisCacheAdapter(mockClient);
      await mockClient.quit();
      return adapter;
    },
  });
});
