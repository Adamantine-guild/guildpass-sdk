import { describe, expect, it, vi } from 'vitest';
import { AccessService } from '../src/access/access.service';
import { getAccessSummary } from '../src/access/accessHelpers';
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

  it('passes per-request timeout options to the access check request', async () => {
    const accessResult: AccessCheckResult = {
      hasAccess: true,
      walletAddress: validAddress,
      guildId: 'guild_1',
      resourceId: 'resource_1',
      requiredRoles: [],
      matchedRoles: [],
    };
    const { get, service } = createService(accessResult);

    await service.checkAccess(
      {
        walletAddress: mixedCaseAddress,
        guildId: 'guild_1',
        resourceId: 'resource_1',
      },
      { timeoutMs: 250 },
    );

    expect(get).toHaveBeenCalledWith('/access/check', {
      timeoutMs: 250,
      params: {
        address: mixedCaseAddress.toLowerCase(),
        guildId: 'guild_1',
        resourceId: 'resource_1',
      },
    });
  });

  it('passes signal option to the access check request', async () => {
    const accessResult: AccessCheckResult = {
      hasAccess: true,
      walletAddress: validAddress,
      guildId: 'guild_1',
      resourceId: 'resource_1',
      requiredRoles: [],
      matchedRoles: [],
    };
    const { get, service } = createService(accessResult);
    const controller = new AbortController();

    await service.checkAccess(
      {
        walletAddress: mixedCaseAddress,
        guildId: 'guild_1',
        resourceId: 'resource_1',
      },
      { signal: controller.signal },
    );

    expect(get).toHaveBeenCalledWith('/access/check', {
      signal: controller.signal,
      params: {
        address: mixedCaseAddress.toLowerCase(),
        guildId: 'guild_1',
        resourceId: 'resource_1',
      },
    });
  });

  it('passes retry option to the access check request', async () => {
    const accessResult: AccessCheckResult = {
      hasAccess: true,
      walletAddress: validAddress,
      guildId: 'guild_1',
      resourceId: 'resource_1',
      requiredRoles: [],
      matchedRoles: [],
    };
    const { get, service } = createService(accessResult);

    await service.checkAccess(
      {
        walletAddress: mixedCaseAddress,
        guildId: 'guild_1',
        resourceId: 'resource_1',
      },
      { retry: { maxRetries: 2 } },
    );

    expect(get).toHaveBeenCalledWith('/access/check', {
      retry: { maxRetries: 2 },
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

  it('passes per-request timeout options to role access checks', async () => {
    const { get, service } = createService({ hasRole: true });

    await service.checkRoleAccess(
      {
        walletAddress: mixedCaseAddress,
        guildId: 'guild_1',
        roleId: 'role_1',
      },
      { timeoutMs: 300 },
    );

    expect(get).toHaveBeenCalledWith('/access/role-check', {
      timeoutMs: 300,
      params: {
        address: mixedCaseAddress.toLowerCase(),
        guildId: 'guild_1',
        roleId: 'role_1',
      },
    });
  });

  it('passes signal option to role access checks', async () => {
    const { get, service } = createService({ hasRole: true });
    const controller = new AbortController();

    await service.checkRoleAccess(
      {
        walletAddress: mixedCaseAddress,
        guildId: 'guild_1',
        roleId: 'role_1',
      },
      { signal: controller.signal },
    );

    expect(get).toHaveBeenCalledWith('/access/role-check', {
      signal: controller.signal,
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

  it('passes request options through batch access checks', async () => {
    const accessResult: AccessCheckResult = {
      hasAccess: true,
      walletAddress: validAddress,
      guildId: 'guild_1',
      resourceId: 'resource_1',
      requiredRoles: [],
      matchedRoles: [],
    };
    const { get, service } = createService(accessResult);

    await service.checkAccessBatch(
      [
        {
          walletAddress: mixedCaseAddress,
          guildId: 'guild_1',
          resourceId: 'resource_1',
        },
      ],
      { concurrency: 1, timeoutMs: 750, signal: undefined, retry: undefined },
    );

    expect(get).toHaveBeenCalledWith('/access/check', {
      timeoutMs: 750,
      signal: undefined,
      retry: undefined,
      params: {
        address: mixedCaseAddress.toLowerCase(),
        guildId: 'guild_1',
        resourceId: 'resource_1',
      },
    });
  });

  it('passes signal option through batch access checks', async () => {
    const accessResult: AccessCheckResult = {
      hasAccess: true,
      walletAddress: validAddress,
      guildId: 'guild_1',
      resourceId: 'resource_1',
      requiredRoles: [],
      matchedRoles: [],
    };
    const { get, service } = createService(accessResult);
    const controller = new AbortController();

    await service.checkAccessBatch(
      [
        {
          walletAddress: mixedCaseAddress,
          guildId: 'guild_1',
          resourceId: 'resource_1',
        },
      ],
      { concurrency: 1, signal: controller.signal },
    );

    expect(get).toHaveBeenCalledWith('/access/check', {
      signal: controller.signal,
      timeoutMs: undefined,
      retry: undefined,
      params: {
        address: mixedCaseAddress.toLowerCase(),
        guildId: 'guild_1',
        resourceId: 'resource_1',
      },
    });
  });
});

describe('getAccessSummary', () => {
  const baseResult: AccessCheckResult = {
    hasAccess: false,
    walletAddress: validAddress,
    guildId: 'guild_1',
    resourceId: 'resource_1',
    requiredRoles: [],
    matchedRoles: [],
  };

  it('summarizes allowed access', () => {
    expect(getAccessSummary({ ...baseResult, hasAccess: true })).toBe('Access granted.');
  });

  it('summarizes missing roles', () => {
    expect(
      getAccessSummary({
        ...baseResult,
        requiredRoles: ['moderator', 'vip'],
      }),
    ).toBe('Missing required roles: moderator, vip.');
  });

  it('summarizes inactive membership', () => {
    expect(getAccessSummary({ ...baseResult, reason: 'Membership is inactive' })).toBe(
      'Membership is inactive or expired.',
    );
  });

  it('summarizes an unknown denial with its reason', () => {
    expect(getAccessSummary({ ...baseResult, reason: 'Resource is unavailable' })).toBe(
      'Access denied: Resource is unavailable',
    );
  });

  it('uses a safe fallback for an unknown denial without a reason', () => {
    expect(getAccessSummary(baseResult)).toBe('Access denied.');
  });
});
