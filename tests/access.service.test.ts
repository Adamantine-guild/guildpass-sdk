import { describe, expect, it, vi } from 'vitest';
import { AccessService } from '../src/access/access.service';
import { getAccessSummary } from '../src/access/accessHelpers';
import type { AccessCheckResult } from '../src/access/access.types';
import { GuildPassErrorCode } from '../src/errors/errorCodes';
import { GuildPassConfigError } from '../src/errors/errorTypes';
import type { HttpClient } from '../src/http/httpClient';
import checkAccessSuccess from './fixtures/access/check-access-success.json';
import checkRoleAccessSuccess from './fixtures/access/check-role-access-success.json';

const validAddress = '0x1234567890123456789012345678901234567890';
// Mixed case on purpose, to prove the service lowercases it before building a
// request. The value must carry a valid EIP-55 checksum, since validateAddress
// verifies the checksum of any mixed-case address it is given.
const mixedCaseAddress = '0xf39Fd6e51aad88F6F4ce6aB8827279cffFb92266';

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
    const { get, service } = createService(checkAccessSuccess);

    const result = await service.checkAccess({
      walletAddress: mixedCaseAddress,
      guildId: 'guild_1',
      resourceId: 'resource_1',
    });

    expect(result).toEqual(checkAccessSuccess);
    expect(get).toHaveBeenCalledWith('/access/check', {
      params: {
        address: mixedCaseAddress.toLowerCase(),
        guildId: 'guild_1',
        resourceId: 'resource_1',
      },
    });
  });

  it('passes per-request timeout options to the access check request', async () => {
    const { get, service } = createService(checkAccessSuccess);

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
    const { get, service } = createService(checkAccessSuccess);
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
    const { get, service } = createService(checkAccessSuccess);

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
    const { get, service } = createService(checkRoleAccessSuccess);

    const result = await service.checkRoleAccess({
      walletAddress: mixedCaseAddress,
      guildId: 'guild_1',
      roleId: 'role_1',
    });

    expect(result).toEqual(checkRoleAccessSuccess.hasRole);
    expect(get).toHaveBeenCalledWith('/access/role-check', {
      params: {
        address: mixedCaseAddress.toLowerCase(),
        guildId: 'guild_1',
        roleId: 'role_1',
      },
    });
  });

  it('passes per-request timeout options to role access checks', async () => {
    const { get, service } = createService(checkRoleAccessSuccess);

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
    const { get, service } = createService(checkRoleAccessSuccess);
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

  it('throws a GuildPassConfigError instance for invalid wallet addresses', async () => {
    const { service } = createService({});

    await expect(
      service.checkAccess({
        walletAddress: 'invalid-address',
        guildId: 'guild_1',
        resourceId: 'resource_1',
      }),
    ).rejects.toBeInstanceOf(GuildPassConfigError);
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
    const { get, service } = createService(checkAccessSuccess);

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
    const { get, service } = createService(checkAccessSuccess);
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

  describe('checkAccessBatch by-resource form', () => {
    const buildResult = (resourceId: string): AccessCheckResult => ({
      hasAccess: true,
      walletAddress: validAddress,
      guildId: 'guild_1',
      resourceId,
      requiredRoles: [],
      matchedRoles: [],
    });

    it('returns results keyed by resourceId', async () => {
      const get = vi.fn().mockImplementation((_url: string, opts: any) =>
        Promise.resolve(buildResult(opts.params.resourceId)),
      );
      const service = new AccessService({ get } as unknown as HttpClient);

      const result = await service.checkAccessBatch({
        walletAddress: mixedCaseAddress,
        guildId: 'guild_1',
        resourceIds: ['resource_1', 'resource_2'],
      });

      expect(Object.keys(result).sort()).toEqual(['resource_1', 'resource_2']);
      expect(result.resource_1).toEqual({ status: 'fulfilled', value: buildResult('resource_1') });
      expect(result.resource_2).toEqual({ status: 'fulfilled', value: buildResult('resource_2') });
      expect(get).toHaveBeenCalledTimes(2);
    });

    it('collapses duplicate resourceIds into a single request', async () => {
      const get = vi.fn().mockImplementation((_url: string, opts: any) =>
        Promise.resolve(buildResult(opts.params.resourceId)),
      );
      const service = new AccessService({ get } as unknown as HttpClient);

      const result = await service.checkAccessBatch({
        walletAddress: validAddress,
        guildId: 'guild_1',
        resourceIds: ['resource_1', 'resource_1', 'resource_1'],
      });

      expect(get).toHaveBeenCalledTimes(1);
      expect(Object.keys(result)).toEqual(['resource_1']);
    });

    it('keeps per-resource failures isolated in the keyed map', async () => {
      const get = vi.fn().mockImplementation((_url: string, opts: any) =>
        opts.params.resourceId === 'bad'
          ? Promise.reject(new Error('upstream boom'))
          : Promise.resolve(buildResult(opts.params.resourceId)),
      );
      const service = new AccessService({ get } as unknown as HttpClient);

      const result = await service.checkAccessBatch({
        walletAddress: validAddress,
        guildId: 'guild_1',
        resourceIds: ['good', 'bad'],
      });

      expect(result.good.status).toBe('fulfilled');
      expect(result.bad.status).toBe('rejected');
      expect((result.bad as { status: 'rejected'; error: Error }).error.message).toBe('upstream boom');
    });

    it('rejects an empty resourceIds array without network calls', async () => {
      const { get, service } = createService(buildResult('resource_1'));

      await expect(
        service.checkAccessBatch({
          walletAddress: validAddress,
          guildId: 'guild_1',
          resourceIds: [],
        }),
      ).rejects.toMatchObject({ code: GuildPassErrorCode.INVALID_INPUT });
      expect(get).not.toHaveBeenCalled();
    });

    it('rejects invalid wallet or guild before any network call', async () => {
      const { get, service } = createService(buildResult('resource_1'));

      await expect(
        service.checkAccessBatch({
          walletAddress: 'not-an-address',
          guildId: 'guild_1',
          resourceIds: ['resource_1'],
        }),
      ).rejects.toMatchObject({ code: GuildPassErrorCode.INVALID_ADDRESS });

      await expect(
        service.checkAccessBatch({
          walletAddress: validAddress,
          guildId: '',
          resourceIds: ['resource_1'],
        }),
      ).rejects.toMatchObject({ code: GuildPassErrorCode.INVALID_INPUT });
      expect(get).not.toHaveBeenCalled();
    });

    it('passes request options through the by-resource form', async () => {
      const get = vi.fn().mockImplementation((_url: string, opts: any) =>
        Promise.resolve(buildResult(opts.params.resourceId)),
      );
      const service = new AccessService({ get } as unknown as HttpClient);
      const controller = new AbortController();

      await service.checkAccessBatch(
        {
          walletAddress: mixedCaseAddress,
          guildId: 'guild_1',
          resourceIds: ['resource_1'],
        },
        { concurrency: 1, timeoutMs: 750, signal: controller.signal },
      );

      expect(get).toHaveBeenCalledWith('/access/check', {
        timeoutMs: 750,
        signal: controller.signal,
        retry: undefined,
        params: {
          address: mixedCaseAddress.toLowerCase(),
          guildId: 'guild_1',
          resourceId: 'resource_1',
        },
      });
    });
  });

  describe('checkAccess request schema validation', () => {
    it('rejects null params with an actionable GuildPassConfigError', async () => {
      const { get, service } = createService(checkAccessSuccess);

      await expect(service.checkAccess(null as any)).rejects.toMatchObject({
        code: GuildPassErrorCode.INVALID_INPUT,
      });
      expect(get).not.toHaveBeenCalled();
    });

    it('rejects a non-object params value', async () => {
      const { get, service } = createService(checkAccessSuccess);

      await expect(service.checkAccess('not-an-object' as any)).rejects.toBeInstanceOf(
        GuildPassConfigError,
      );
      expect(get).not.toHaveBeenCalled();
    });

    it('names the malformed field and the endpoint in the error message', async () => {
      const { service } = createService(checkAccessSuccess);

      await expect(
        service.checkAccess({ walletAddress: mixedCaseAddress, guildId: 'guild_1' } as any),
      ).rejects.toMatchObject({
        message: expect.stringContaining('GET /access/check'),
      });
    });

    it('still surfaces the specific INVALID_ADDRESS code for a malformed-but-present address (schema check is structural only)', async () => {
      const { get, service } = createService(checkAccessSuccess);

      await expect(
        service.checkAccess({
          walletAddress: 'invalid-address',
          guildId: 'guild_1',
          resourceId: 'resource_1',
        }),
      ).rejects.toMatchObject({ code: GuildPassErrorCode.INVALID_ADDRESS });
      expect(get).not.toHaveBeenCalled();
    });
  });

  describe('checkRoleAccess request schema validation', () => {
    it('rejects a non-object params value', async () => {
      const { get, service } = createService(checkRoleAccessSuccess);

      await expect(service.checkRoleAccess(null as any)).rejects.toBeInstanceOf(GuildPassConfigError);
      expect(get).not.toHaveBeenCalled();
    });

    it('still surfaces the specific INVALID_INPUT code for an empty roleId (schema check is structural only)', async () => {
      const { get, service } = createService(checkRoleAccessSuccess);

      await expect(
        service.checkRoleAccess({ walletAddress: validAddress, guildId: 'guild_1', roleId: '' }),
      ).rejects.toMatchObject({ code: GuildPassErrorCode.INVALID_INPUT });
      expect(get).not.toHaveBeenCalled();
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
