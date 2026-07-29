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

describe('GuildsService.getGuildConfigBatch (#389)', () => {
  /** Service whose HTTP layer resolves or rejects per path. */
  function createBatchService(byPath: Record<string, unknown | Error>) {
    const get = vi.fn(async (path: string) => {
      const entry = byPath[path];
      if (entry instanceof Error) throw entry;
      if (entry === undefined) throw new Error(`Unexpected path ${path}`);
      return entry;
    });
    return { get, service: new GuildsService({ get } as unknown as HttpClient) };
  }

  const configFor = (id: string) => ({ ...getGuildConfigSuccess, id });

  it('returns one result per input, in input order', async () => {
    const { service } = createBatchService({
      '/guilds/guild_a/config': configFor('guild_a'),
      '/guilds/guild_b/config': configFor('guild_b'),
      '/guilds/guild_c/config': configFor('guild_c'),
    });

    const results = await service.getGuildConfigBatch({
      guildIds: ['guild_a', 'guild_b', 'guild_c'],
    });

    expect(results).toHaveLength(3);
    expect(results.map((r) => r.result?.id)).toEqual(['guild_a', 'guild_b', 'guild_c']);
    expect(results.every((r) => r.status === 'success')).toBe(true);
  });

  it('preserves order even when responses resolve out of order', async () => {
    // The first guild resolves last; index is claimed before awaiting, so its
    // result must still land in position 0.
    const get = vi.fn(async (path: string) => {
      if (path === '/guilds/slow/config') {
        await new Promise((resolve) => setTimeout(resolve, 20));
        return configFor('slow');
      }
      return configFor('fast');
    });
    const service = new GuildsService({ get } as unknown as HttpClient);

    const results = await service.getGuildConfigBatch({ guildIds: ['slow', 'fast'] });

    expect(results[0].result?.id).toBe('slow');
    expect(results[1].result?.id).toBe('fast');
  });

  it('isolates a single failing guild without failing the batch', async () => {
    const { service } = createBatchService({
      '/guilds/ok_1/config': configFor('ok_1'),
      '/guilds/missing/config': new Error('Guild not found'),
      '/guilds/ok_2/config': configFor('ok_2'),
    });

    const results = await service.getGuildConfigBatch({
      guildIds: ['ok_1', 'missing', 'ok_2'],
    });

    expect(results[0]).toMatchObject({ status: 'success' });
    expect(results[1]).toMatchObject({ status: 'error', error: 'Guild not found' });
    expect(results[1].result).toBeUndefined();
    expect(results[2]).toMatchObject({ status: 'success' });
  });

  it('throws INVALID_INPUT for an empty guildIds array', async () => {
    const { get, service } = createBatchService({});

    await expect(service.getGuildConfigBatch({ guildIds: [] })).rejects.toMatchObject({
      code: 'INVALID_INPUT',
    });
    expect(get).not.toHaveBeenCalled();
  });

  it('throws INVALID_INPUT for a missing or non-array guildIds', async () => {
    const { service } = createBatchService({});

    await expect(service.getGuildConfigBatch({} as any)).rejects.toBeInstanceOf(
      GuildPassConfigError,
    );
    await expect(
      service.getGuildConfigBatch({ guildIds: 'guild_1' } as any),
    ).rejects.toBeInstanceOf(GuildPassConfigError);
    await expect(service.getGuildConfigBatch(undefined as any)).rejects.toBeInstanceOf(
      GuildPassConfigError,
    );
  });

  it('rejects an out-of-range concurrency', async () => {
    const { get, service } = createBatchService({});

    await expect(
      service.getGuildConfigBatch({ guildIds: ['guild_1'] }, { concurrency: 0 }),
    ).rejects.toMatchObject({ code: 'INVALID_INPUT' });
    await expect(
      service.getGuildConfigBatch({ guildIds: ['guild_1'] }, { concurrency: 51 }),
    ).rejects.toMatchObject({ code: 'INVALID_INPUT' });
    await expect(
      service.getGuildConfigBatch({ guildIds: ['guild_1'] }, { concurrency: 1.5 }),
    ).rejects.toMatchObject({ code: 'INVALID_INPUT' });
    expect(get).not.toHaveBeenCalled();
  });

  it('bounds in-flight requests to the concurrency limit', async () => {
    let inFlight = 0;
    let peak = 0;
    const get = vi.fn(async () => {
      inFlight += 1;
      peak = Math.max(peak, inFlight);
      await new Promise((resolve) => setTimeout(resolve, 5));
      inFlight -= 1;
      return getGuildConfigSuccess;
    });
    const service = new GuildsService({ get } as unknown as HttpClient);

    await service.getGuildConfigBatch(
      { guildIds: Array.from({ length: 10 }, (_, i) => `guild_${i}`) },
      { concurrency: 3 },
    );

    expect(peak).toBeLessThanOrEqual(3);
    expect(get).toHaveBeenCalledTimes(10);
  });

  it('gives each duplicate ID its own result slot', async () => {
    const { get, service } = createBatchService({
      '/guilds/guild_1/config': configFor('guild_1'),
    });

    const results = await service.getGuildConfigBatch({ guildIds: ['guild_1', 'guild_1'] });

    expect(results).toHaveLength(2);
    expect(get).toHaveBeenCalledTimes(2);
  });

  it('rejects an invalid guild ID as a per-item error, not a thrown batch', async () => {
    const { service } = createBatchService({
      '/guilds/guild_1/config': configFor('guild_1'),
    });

    const results = await service.getGuildConfigBatch({ guildIds: ['guild_1', ''] });

    expect(results[0].status).toBe('success');
    expect(results[1].status).toBe('error');
  });
});
