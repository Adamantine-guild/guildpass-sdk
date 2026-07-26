import { describe, expect, it, vi } from 'vitest';
import { GuildsService } from '../src/guilds/guilds.service';
import { GuildPassConfigError } from '../src/errors/errorTypes';
import type { HttpClient } from '../src/http/httpClient';
import getGuildSuccess from './fixtures/guilds/get-guild-success.json';
import getGuildConfigSuccess from './fixtures/guilds/get-guild-config-success.json';

function createService(response: unknown) {
  const get = vi.fn().mockResolvedValue(response);
  const http = { get } as unknown as HttpClient;
  return { get, service: new GuildsService(http) };
}

describe('GuildsService validation errors', () => {
  it('throws a GuildPassConfigError for an invalid guild ID', async () => {
    const { get, service } = createService(getGuildSuccess);

    await expect(service.getGuild({ guildId: '' })).rejects.toBeInstanceOf(GuildPassConfigError);
    expect(get).not.toHaveBeenCalled();
  });

  it('rejects a non-object params value for getGuild via the request schema', async () => {
    const { get, service } = createService(getGuildSuccess);

    await expect(service.getGuild(undefined as any)).rejects.toBeInstanceOf(GuildPassConfigError);
    expect(get).not.toHaveBeenCalled();
  });

  it('rejects a non-object params value for getGuildConfig via the request schema', async () => {
    const { get, service } = createService(getGuildConfigSuccess);

    await expect(service.getGuildConfig(undefined as any)).rejects.toBeInstanceOf(GuildPassConfigError);
    expect(get).not.toHaveBeenCalled();
  });
});

describe('GuildsService request options forwarding', () => {
  it('forwards timeoutMs option to getGuild', async () => {
    const { get, service } = createService(getGuildSuccess);

    await service.getGuild({ guildId: 'guild_1' }, { timeoutMs: 200 });

    expect(get).toHaveBeenCalledWith('/guilds/guild_1', {
      timeoutMs: 200,
    });
  });

  it('forwards signal option to getGuild', async () => {
    const { get, service } = createService(getGuildSuccess);
    const controller = new AbortController();

    await service.getGuild({ guildId: 'guild_1' }, { signal: controller.signal });

    expect(get).toHaveBeenCalledWith('/guilds/guild_1', {
      signal: controller.signal,
    });
  });

  it('forwards retry option to getGuild', async () => {
    const { get, service } = createService(getGuildSuccess);

    await service.getGuild({ guildId: 'guild_1' }, { retry: { maxRetries: 2 } });

    expect(get).toHaveBeenCalledWith('/guilds/guild_1', {
      retry: { maxRetries: 2 },
    });
  });

  it('forwards all options together to getGuild', async () => {
    const { get, service } = createService(getGuildSuccess);
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
    const { get, service } = createService(getGuildConfigSuccess);

    await service.getGuildConfig({ guildId: 'guild_1' }, { timeoutMs: 250 });

    expect(get).toHaveBeenCalledWith('/guilds/guild_1/config', {
      timeoutMs: 250,
    });
  });

  it('forwards signal option to getGuildConfig', async () => {
    const { get, service } = createService(getGuildConfigSuccess);
    const controller = new AbortController();

    await service.getGuildConfig({ guildId: 'guild_1' }, { signal: controller.signal });

    expect(get).toHaveBeenCalledWith('/guilds/guild_1/config', {
      signal: controller.signal,
    });
  });

  it('forwards retry option to getGuildConfig', async () => {
    const { get, service } = createService(getGuildConfigSuccess);

    await service.getGuildConfig({ guildId: 'guild_1' }, { retry: { maxRetries: 2 } });

    expect(get).toHaveBeenCalledWith('/guilds/guild_1/config', {
      retry: { maxRetries: 2 },
    });
  });
});