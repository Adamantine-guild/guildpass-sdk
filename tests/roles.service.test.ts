import { describe, expect, it, vi, beforeEach } from 'vitest';
import { RolesService } from '../src/roles/roles.service';
import type { HttpClient } from '../src/http/httpClient';
import { GuildPassErrorCode } from '../src/errors/errorCodes';

const validAddress = '0x1234567890123456789012345678901234567890';

function createService(response: unknown) {
  const get = vi.fn().mockResolvedValue(response);
  const http = { get } as unknown as HttpClient;
  return { get, service: new RolesService(http) };
}

describe('RolesService request options forwarding', () => {
  it('forwards timeoutMs option to getRoles', async () => {
    const { get, service } = createService([{ id: '1', name: 'Role 1' }]);

    await service.getRoles({ guildId: 'guild_1' }, { timeoutMs: 300 });

    expect(get).toHaveBeenCalledWith('/guilds/guild_1/roles', {
      timeoutMs: 300,
    });
  });

  it('forwards signal option to getRoles', async () => {
    const { get, service } = createService([{ id: '1', name: 'Role 1' }]);
    const controller = new AbortController();

    await service.getRoles({ guildId: 'guild_1' }, { signal: controller.signal });

    expect(get).toHaveBeenCalledWith('/guilds/guild_1/roles', {
      signal: controller.signal,
    });
  });

  it('forwards retry option to getRoles', async () => {
    const { get, service } = createService([{ id: '1', name: 'Role 1' }]);

    await service.getRoles({ guildId: 'guild_1' }, { retry: { maxRetries: 2 } });

    expect(get).toHaveBeenCalledWith('/guilds/guild_1/roles', {
      retry: { maxRetries: 2 },
    });
  });

  it('forwards timeoutMs option to getUserRoles', async () => {
    const { get, service } = createService([{ id: '1', name: 'Role 1' }]);

    await service.getUserRoles({ walletAddress: validAddress, guildId: 'guild_1' }, { timeoutMs: 400 });

    expect(get).toHaveBeenCalledWith(
      expect.stringContaining('/members/'),
      { timeoutMs: 400 },
    );
  });

  it('forwards signal option to getUserRoles', async () => {
    const { get, service } = createService([{ id: '1', name: 'Role 1' }]);
    const controller = new AbortController();

    await service.getUserRoles({ walletAddress: validAddress, guildId: 'guild_1' }, { signal: controller.signal });

    expect(get).toHaveBeenCalledWith(
      expect.stringContaining('/members/'),
      { signal: controller.signal },
    );
  });

  it('forwards retry option to getUserRoles', async () => {
    const { get, service } = createService([{ id: '1', name: 'Role 1' }]);

    await service.getUserRoles({ walletAddress: validAddress, guildId: 'guild_1' }, { retry: { maxRetries: 3 } });

    expect(get).toHaveBeenCalledWith(
      expect.stringContaining('/members/'),
      { retry: { maxRetries: 3 } },
    );
  });

  it('forwards all options together to getUserRoles', async () => {
    const { get, service } = createService([{ id: '1', name: 'Role 1' }]);
    const controller = new AbortController();

    await service.getUserRoles(
      { walletAddress: validAddress, guildId: 'guild_1' },
      { timeoutMs: 400, signal: controller.signal, retry: { maxRetries: 3 } },
    );

    expect(get).toHaveBeenCalledWith(
      expect.stringContaining('/members/'),
      {
        timeoutMs: 400,
        signal: controller.signal,
        retry: { maxRetries: 3 },
      },
    );
  });
});