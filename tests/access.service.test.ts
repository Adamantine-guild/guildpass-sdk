import { describe, expect, it, vi } from 'vitest';
import { AccessService } from '../src/access/access.service';
import type { AccessCheckResult } from '../src/access/access.types';
import { GuildPassErrorCode } from '../src/errors/errorCodes';
import type { HttpClient } from '../src/http/httpClient';

const validAddress = '0x1234567890123456789012345678901234567890';
const mixedCaseAddress = '0xAbCdEf1234567890AbCdEf1234567890AbCdEf12';

function createService(response: unknown) {
  const get = vi.fn().mockResolvedValue(response);
  const http = { get } as unknown as HttpClient;

  return {
    get,
    service: new AccessService(http),
  };
}

describe('AccessService', () => {
  it('calls the access check endpoint with expected query parameters', async () => {
    const accessResult: AccessCheckResult = {
      hasAccess: true,
      walletAddress: validAddress,
      guildId: 'guild_1',
      resourceId: 'resource_1',
      requiredRoles: ['member'],
      matchedRoles: ['member'],
      reason: 'matched required role',
    };
    const { get, service } = createService(accessResult);

    const result = await service.checkAccess({
      walletAddress: mixedCaseAddress,
      guildId: 'guild_1',
      resourceId: 'resource_1',
    });

    expect(result).toEqual(accessResult);
    expect(get).toHaveBeenCalledWith('/access/check', {
      params: {
        address: mixedCaseAddress.toLowerCase(),
        guildId: 'guild_1',
        resourceId: 'resource_1',
      },
    });
  });

  it('calls the role access endpoint with expected query parameters', async () => {
    const { get, service } = createService({ hasRole: true });

    const result = await service.checkRoleAccess({
      walletAddress: mixedCaseAddress,
      guildId: 'guild_1',
      roleId: 'role_1',
    });

    expect(result).toBe(true);
    expect(get).toHaveBeenCalledWith('/access/role-check', {
      params: {
        address: mixedCaseAddress.toLowerCase(),
        guildId: 'guild_1',
        roleId: 'role_1',
      },
    });
  });

  it('rejects invalid wallet addresses before checking access', async () => {
    const { get, service } = createService({});

    await expect(
      service.checkAccess({
        walletAddress: 'invalid-address',
        guildId: 'guild_1',
        resourceId: 'resource_1',
      }),
    ).rejects.toMatchObject({ code: GuildPassErrorCode.INVALID_ADDRESS });
    expect(get).not.toHaveBeenCalled();
  });

  it('rejects invalid guild IDs before checking access', async () => {
    const { get, service } = createService({});

    await expect(
      service.checkAccess({
        walletAddress: validAddress,
        guildId: '   ',
        resourceId: 'resource_1',
      }),
    ).rejects.toMatchObject({ code: GuildPassErrorCode.INVALID_INPUT });
    expect(get).not.toHaveBeenCalled();
  });

  it('rejects invalid resource IDs before checking access', async () => {
    const { get, service } = createService({});

    await expect(
      service.checkAccess({
        walletAddress: validAddress,
        guildId: 'guild_1',
        resourceId: '',
      }),
    ).rejects.toMatchObject({ code: GuildPassErrorCode.INVALID_INPUT });
    expect(get).not.toHaveBeenCalled();
  });

  it('rejects invalid role IDs before checking role access', async () => {
    const { get, service } = createService({});

    await expect(
      service.checkRoleAccess({
        walletAddress: validAddress,
        guildId: 'guild_1',
        roleId: '',
      }),
    ).rejects.toMatchObject({ code: GuildPassErrorCode.INVALID_INPUT });
    expect(get).not.toHaveBeenCalled();
  });
});
