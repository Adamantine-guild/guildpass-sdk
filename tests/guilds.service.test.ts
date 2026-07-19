import { describe, expect, it, vi, beforeEach } from 'vitest';
import { GuildsService } from '../src/guilds/guilds.service';
import type { HttpClient } from '../src/http/httpClient';

function createService(response: unknown) {
  const get = vi.fn().mockResolvedValue(response);
  const http = { get } as unknown as HttpClient;
  return { get, service: new GuildsService(http) };
}

describe('GuildsService request options forwarding', () => {
  it('fetches a paginated guild list', async () => {
    const result = {
      guilds: [
        {
          id: 'guild_1',
          name: 'Test Guild',
          ownerAddress: '0xaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa',
          chainId: 1,
        },
      ],
      nextCursor: 'cursor_2',
    };
    const { get, service } = createService(result);

    await expect(
      service.listGuilds({
        limit: 20,
        cursor: 'cursor_1',
        ownerAddress: '0xAaaaaAaaAaAaAaaAaAAAAAAAAaaaAaAaAaaAaaAa',
      }),
    ).resolves.toEqual(result);

    expect(get).toHaveBeenCalledWith('/guilds', {
      params: {
        limit: 20,
        cursor: 'cursor_1',
        ownerAddress: '0xaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa',
      },
    });
  });

  it('returns an empty guild list result', async () => {
    const result = { guilds: [] };
    const { get, service } = createService(result);

    await expect(service.listGuilds()).resolves.toEqual(result);

    expect(get).toHaveBeenCalledWith('/guilds', {
      params: {},
    });
  });

  it('propagates listGuilds HTTP errors', async () => {
    const error = new Error('network unavailable');
    const get = vi.fn().mockRejectedValue(error);
    const service = new GuildsService({ get } as unknown as HttpClient);

    await expect(service.listGuilds({ limit: 10 })).rejects.toThrow(error);
    expect(get).toHaveBeenCalledWith('/guilds', {
      params: { limit: 10 },
    });
  });

  it('forwards timeoutMs option to getGuild', async () => {
    const { get, service } = createService({ id: 'guild_1', name: 'Test Guild' });

    await service.getGuild({ guildId: 'guild_1' }, { timeoutMs: 200 });

    expect(get).toHaveBeenCalledWith('/guilds/guild_1', {
      timeoutMs: 200,
    });
  });

  it('forwards signal option to getGuild', async () => {
    const { get, service } = createService({ id: 'guild_1', name: 'Test Guild' });
    const controller = new AbortController();

    await service.getGuild({ guildId: 'guild_1' }, { signal: controller.signal });

    expect(get).toHaveBeenCalledWith('/guilds/guild_1', {
      signal: controller.signal,
    });
  });

  it('forwards retry option to getGuild', async () => {
    const { get, service } = createService({ id: 'guild_1', name: 'Test Guild' });

    await service.getGuild({ guildId: 'guild_1' }, { retry: { maxRetries: 2 } });

    expect(get).toHaveBeenCalledWith('/guilds/guild_1', {
      retry: { maxRetries: 2 },
    });
  });

  it('forwards all options together to getGuild', async () => {
    const { get, service } = createService({ id: 'guild_1', name: 'Test Guild' });
    const controller = new AbortController();

    await service.getGuild(
      { guildId: 'guild_1' },
      { timeoutMs: 200, signal: controller.signal, retry: { maxRetries: 3 } },
    );

    expect(get).toHaveBeenCalledWith('/guilds/guild_1', {
      timeoutMs: 200,
      signal: controller.signal,
      retry: { maxRetries: 3 },
    });
  });

  it('forwards timeoutMs option to getGuildConfig', async () => {
    const { get, service } = createService({ id: 'guild_1', theme: 'dark' });

    await service.getGuildConfig({ guildId: 'guild_1' }, { timeoutMs: 250 });

    expect(get).toHaveBeenCalledWith('/guilds/guild_1/config', {
      timeoutMs: 250,
    });
  });

  it('forwards signal option to getGuildConfig', async () => {
    const { get, service } = createService({ id: 'guild_1', theme: 'dark' });
    const controller = new AbortController();

    await service.getGuildConfig({ guildId: 'guild_1' }, { signal: controller.signal });

    expect(get).toHaveBeenCalledWith('/guilds/guild_1/config', {
      signal: controller.signal,
    });
  });

  it('forwards retry option to getGuildConfig', async () => {
    const { get, service } = createService({ id: 'guild_1', theme: 'dark' });

    await service.getGuildConfig({ guildId: 'guild_1' }, { retry: { maxRetries: 2 } });

    expect(get).toHaveBeenCalledWith('/guilds/guild_1/config', {
      retry: { maxRetries: 2 },
    });
  });
});
