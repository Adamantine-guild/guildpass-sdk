import { CacheAdapter } from '@guildpass/sdk';
import { createClient, type RedisClientType } from 'redis';

export class RedisCacheAdapter implements CacheAdapter {
  private readonly client: RedisClientType;
  private readonly prefix: string;

  constructor(urlOrClient: string | RedisClientType, prefix = 'guildpass:') {
    if (typeof urlOrClient === 'string') {
      this.client = createClient({ url: urlOrClient }) as RedisClientType;
    } else {
      this.client = urlOrClient;
    }
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
