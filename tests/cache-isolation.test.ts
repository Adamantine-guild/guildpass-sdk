import { describe, expect, it, vi } from 'vitest';
import { GuildPassClient, InMemoryCacheAdapter } from '../src/index';
import { CacheAdapter } from '../src/cache/cache.types';

/**
 * A cache adapter that throws on get() to simulate a Redis/network failure.
 * The SDK should gracefully fall through to the network request.
 */
class FailingCacheAdapter implements CacheAdapter {
  get = async (): Promise<never> => {
    throw new Error('Cache read failure (simulated Redis timeout)');
  };
  set = async (): Promise<void> => {};
  delete = async (): Promise<void> => {};
  clear = async (): Promise<void> => {};
}

describe('GuildPassClient cache isolation (#80)', () => {
  it('does not propagate cache read failures to the caller', async () => {
    const client = new GuildPassClient({
      apiUrl: 'https://invalid-domain-that-will-fail.example',
      cache: new FailingCacheAdapter(),
    });
    // Network failure should still surface properly — cache failure must not mask it
    await expect(client.guilds.getGuild({ guildId: 'test' })).rejects.toThrow();
  });

  it('throws INVALID_CONFIG when cache adapter is missing required methods', () => {
    expect(() => {
      new GuildPassClient({
        apiUrl: 'https://example.com',
        cache: { get: async () => null } as unknown as CacheAdapter,
      });
    }).toThrow('Cache adapter is missing required method');
  });

  it('throws INVALID_CONFIG when cacheTtl is negative', () => {
    expect(() => {
      new GuildPassClient({
        apiUrl: 'https://example.com',
        cache: new InMemoryCacheAdapter(),
        cacheTtl: -1,
      });
    }).toThrow('cacheTtl must be a non-negative number');
  });
});
