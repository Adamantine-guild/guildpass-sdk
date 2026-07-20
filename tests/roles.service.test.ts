import { describe, expect, it, vi, beforeEach } from 'vitest';
import { RolesService } from '../src/roles/roles.service';
import type { HttpClient } from '../src/http/httpClient';
import type { AccessService } from '../src/access/access.service';
import { GuildPassErrorCode } from '../src/errors/errorCodes';

const validAddress = '0x1234567890123456789012345678901234567890';

function createService(response: unknown) {
  const get = vi.fn().mockResolvedValue(response);
  const http = { get } as unknown as HttpClient;
  return { get, service: new RolesService(http) };
}

function createServiceWithAccess(accessReturnValue: boolean) {
  const get = vi.fn();
  const http = { get } as unknown as HttpClient;
  const checkRoleAccess = vi.fn().mockResolvedValue(accessReturnValue);
  const access = { checkRoleAccess } as unknown as AccessService;
  return { get, checkRoleAccess, service: new RolesService(http, false, access) };
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

describe('RolesService pagination', () => {
  it('forwards cursor and limit to getRoles as params', async () => {
    const { get, service } = createService({ items: [{ id: '1', name: 'Role 1' }], hasMore: false });

    await service.getRoles({ guildId: 'guild_1', cursor: 'abc', limit: 10 });

    expect(get).toHaveBeenCalledWith('/guilds/guild_1/roles', {
      params: { cursor: 'abc', limit: 10 },
    });
  });

  it('returns PaginatedResult for getRoles when pagination requested but API returns array', async () => {
    const { get, service } = createService([{ id: '1', name: 'Role 1' }]);

    const result = await service.getRoles({ guildId: 'guild_1', cursor: 'abc' });

    expect(result).toEqual({ items: [{ id: '1', name: 'Role 1' }], hasMore: false });
  });

  it('forwards cursor and limit to getUserRoles as params', async () => {
    const { get, service } = createService({ items: [{ id: '1', name: 'Role 1' }], hasMore: false });

    await service.getUserRoles({ walletAddress: validAddress, guildId: 'guild_1', cursor: 'abc', limit: 5 });

    expect(get).toHaveBeenCalledWith(
      expect.stringContaining('/members/'),
      { params: { cursor: 'abc', limit: 5 } },
    );
  });
});

describe('RolesService.hasRole', () => {
  it('returns true when the wallet holds the role', async () => {
    const { checkRoleAccess, service } = createServiceWithAccess(true);

    const result = await service.hasRole({
      walletAddress: validAddress,
      guildId: 'guild_1',
      roleId: 'role_1',
    });

    expect(result).toBe(true);
    expect(checkRoleAccess).toHaveBeenCalledOnce();
    expect(checkRoleAccess).toHaveBeenCalledWith(
      { walletAddress: validAddress, guildId: 'guild_1', roleId: 'role_1' },
      undefined,
    );
  });

  it('returns false when the wallet does not hold the role', async () => {
    const { checkRoleAccess, service } = createServiceWithAccess(false);

    const result = await service.hasRole({
      walletAddress: validAddress,
      guildId: 'guild_1',
      roleId: 'role_1',
    });

    expect(result).toBe(false);
    expect(checkRoleAccess).toHaveBeenCalledOnce();
  });

  it('forwards RequestOptions to AccessService.checkRoleAccess', async () => {
    const { checkRoleAccess, service } = createServiceWithAccess(true);
    const controller = new AbortController();

    await service.hasRole(
      { walletAddress: validAddress, guildId: 'guild_1', roleId: 'role_1' },
      { timeoutMs: 500, signal: controller.signal, retry: { maxRetries: 2 } },
    );

    expect(checkRoleAccess).toHaveBeenCalledWith(
      { walletAddress: validAddress, guildId: 'guild_1', roleId: 'role_1' },
      { timeoutMs: 500, signal: controller.signal, retry: { maxRetries: 2 } },
    );
  });

  it('throws if no AccessService was injected', async () => {
    const { service } = createService([]);

    await expect(
      service.hasRole({ walletAddress: validAddress, guildId: 'guild_1', roleId: 'role_1' }),
    ).rejects.toThrow('hasRole() requires an AccessService instance');
  });

  it('propagates errors thrown by AccessService.checkRoleAccess', async () => {
    const get = vi.fn();
    const http = { get } as unknown as HttpClient;
    const checkRoleAccess = vi.fn().mockRejectedValue(new Error('network error'));
    const access = { checkRoleAccess } as unknown as AccessService;
    const service = new RolesService(http, false, access);

    await expect(
      service.hasRole({ walletAddress: validAddress, guildId: 'guild_1', roleId: 'role_1' }),
    ).rejects.toThrow('network error');
  });
});
