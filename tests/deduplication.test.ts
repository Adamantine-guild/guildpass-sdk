import { describe, it, expect, vi } from 'vitest';
import { GuildPassClient } from '../src/client/GuildPassClient';
import { InMemoryCacheAdapter } from '../src/cache/cache.types';

const BASE_CONFIG = { apiUrl: 'https://api.guildpass.xyz' };

describe('GuildPassClient – request deduplication', () => {
  const mockGuild = {
    id: 'prime-guild',
    name: 'Prime Guild',
    ownerAddress: '0xowner',
    chainId: 1,
  };

  it('deduplicates concurrent identical guild reads', async () => {
    const adapter = new InMemoryCacheAdapter();
    const client = new GuildPassClient({ ...BASE_CONFIG, cache: adapter });

    // Mock HTTP GET to return a promise that we can control
    let resolveFirst: (value: any) => void;
    const firstRequestPromise = new Promise((resolve) => {
      resolveFirst = resolve;
    });

    const httpGetSpy = vi.spyOn(client['http'] as any, 'get').mockImplementation(() => firstRequestPromise);

    // Issue two identical requests concurrently
    const p1 = client.guilds.getGuild({ guildId: 'prime-guild' });
    const p2 = client.guilds.getGuild({ guildId: 'prime-guild' });

    // Resolve the first request
    resolveFirst!(mockGuild);

    const [r1, r2] = await Promise.all([p1, p2]);

    expect(r1).toEqual(mockGuild);
    expect(r2).toEqual(mockGuild);

    // Without deduplication, this would be 2
    expect(httpGetSpy).toHaveBeenCalledTimes(1);
  });

  it('removes failed requests from the deduplication map', async () => {
    const adapter = new InMemoryCacheAdapter();
    const client = new GuildPassClient({ ...BASE_CONFIG, cache: adapter });

    let rejectFirst: (reason: any) => void;
    const firstRequestPromise = new Promise((_, reject) => {
      rejectFirst = reject;
    });

    const httpGetSpy = vi.spyOn(client['http'] as any, 'get').mockImplementation(() => firstRequestPromise);

    const p1 = client.guilds.getGuild({ guildId: 'prime-guild' });
    const p2 = client.guilds.getGuild({ guildId: 'prime-guild' });

    rejectFirst!(new Error('Network error'));

    await expect(p1).rejects.toThrow('Network error');
    await expect(p2).rejects.toThrow('Network error');
    expect(httpGetSpy).toHaveBeenCalledTimes(1);

    // After failure, a new request should hit the network again
    httpGetSpy.mockResolvedValue(mockGuild);
    const r3 = await client.guilds.getGuild({ guildId: 'prime-guild' });
    expect(r3).toEqual(mockGuild);
    expect(httpGetSpy).toHaveBeenCalledTimes(2);
  });
});
