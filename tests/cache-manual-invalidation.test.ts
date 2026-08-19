import { describe, it, expect, vi } from 'vitest';
import { GuildPassClient } from '../src/client/GuildPassClient';
import { InMemoryCacheAdapter } from '../src/cache/cache.types';

describe('client.cache.invalidate', () => {
  it('invalidates a single known key', async () => {
    const adapter = new InMemoryCacheAdapter();
    await adapter.set('guilds:getGuild:alpha', { id: 'alpha' });

    const client = new GuildPassClient({
      apiUrl: 'https://api.guildpass.xyz',
      cache: adapter,
    });

    await client.cache.invalidate({ key: 'guilds:getGuild:alpha' });

    const value = await adapter.get('guilds:getGuild:alpha');
    expect(value).toBeNull();
  });

  it('invalidates by prefix when adapter supports deleteByPrefix', async () => {
    const adapter = new InMemoryCacheAdapter();
    await adapter.set('wallet:0xabc:access:1', { ok: true });
    await adapter.set('wallet:0xabc:roles:1', { ok: true });
    await adapter.set('wallet:0xdef:access:1', { ok: true });

    const client = new GuildPassClient({
      apiUrl: 'https://api.guildpass.xyz',
      cache: adapter,
    });

    await client.cache.invalidate({ prefix: 'wallet:0xabc:' });

    expect(await adapter.get('wallet:0xabc:access:1')).toBeNull();
    expect(await adapter.get('wallet:0xabc:roles:1')).toBeNull();
    expect(await adapter.get('wallet:0xdef:access:1')).toEqual({ ok: true });
  });

  it('falls back to clear() when prefix invalidation is requested and adapter lacks deleteByPrefix', async () => {
    const store = new Map<string, unknown>();

    const adapter = {
      get: vi.fn(async (key: string) => (store.has(key) ? store.get(key) : null)),
      set: vi.fn(async (key: string, value: unknown) => {
        store.set(key, value);
      }),
      delete: vi.fn(async (key: string) => {
        store.delete(key);
      }),
      clear: vi.fn(async () => {
        store.clear();
      }),
    };

    await adapter.set('wallet:0xabc:access:1', { ok: true });
    await adapter.set('wallet:0xdef:access:1', { ok: true });

    const client = new GuildPassClient({
      apiUrl: 'https://api.guildpass.xyz',
      cache: adapter,
    });

    await client.cache.invalidate({ pattern: 'wallet:0xabc:' });

    expect(adapter.clear).toHaveBeenCalledTimes(1);
    expect(await adapter.get('wallet:0xabc:access:1')).toBeNull();
    expect(await adapter.get('wallet:0xdef:access:1')).toBeNull();
  });

  it('is a no-op when cache is not configured', async () => {
    const client = new GuildPassClient({
      apiUrl: 'https://api.guildpass.xyz',
    });

    await expect(client.cache.invalidate({ key: 'anything' })).resolves.toBeUndefined();
    await expect(client.cache.invalidate({ prefix: 'anything:' })).resolves.toBeUndefined();
  });

  it('accepts string shorthand as a single key', async () => {
    const adapter = new InMemoryCacheAdapter();
    await adapter.set('guilds:getGuild:alpha', { id: 'alpha' });

    const client = new GuildPassClient({
      apiUrl: 'https://api.guildpass.xyz',
      cache: adapter,
    });

    await client.cache.invalidate('guilds:getGuild:alpha');

    expect(await adapter.get('guilds:getGuild:alpha')).toBeNull();
  });
});
