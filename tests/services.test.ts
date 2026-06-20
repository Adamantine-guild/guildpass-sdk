import { describe, it, expect, vi, beforeEach } from 'vitest';
import { GuildPassClient } from '../src/client/GuildPassClient';
import { GuildPassError } from '../src/errors/GuildPassError';
import { GuildPassErrorCode } from '../src/errors/errorCodes';
import apiContract from './fixtures/api-contract.json';

function mockJsonResponse(body: unknown) {
  (fetch as any).mockResolvedValue({
    ok: true,
    status: 200,
    json: () => Promise.resolve(body),
    headers: new Headers(),
  });
}

describe('Service Modules', () => {
  let client: GuildPassClient;

  beforeEach(() => {
    client = new GuildPassClient({ apiUrl: 'https://api.test.com' });
    vi.stubGlobal('fetch', vi.fn());
  });

  describe('AccessService', () => {
    it('should call checkAccess endpoint', async () => {
      const mockResult = { hasAccess: true, matchedRoles: ['admin'] };
      (fetch as any).mockResolvedValue({
        ok: true,
        status: 200,
        json: () => Promise.resolve(mockResult),
        headers: new Headers(),
      });

      const result = await client.access.checkAccess({
        walletAddress: '0x1234567890123456789012345678901234567890',
        guildId: 'guild_1',
        resourceId: 'res_1',
      });

      expect(result).toEqual(mockResult);
      expect(fetch).toHaveBeenCalledWith(
        expect.stringContaining('/access/check'),
        expect.objectContaining({
          method: 'GET',
        }),
      );
    });

    it('should normalise wallet address in query parameters', async () => {
      const mockResult = { hasAccess: true, matchedRoles: ['admin'] };
      (fetch as any).mockResolvedValue({
        ok: true,
        status: 200,
        json: () => Promise.resolve(mockResult),
        headers: new Headers(),
      });

      const mixedCaseAddress = '0xAbCdEf1234567890AbCdEf1234567890AbCdEf12';
      await client.access.checkAccess({
        walletAddress: mixedCaseAddress,
        guildId: 'guild_1',
        resourceId: 'res_1',
      });

      expect(fetch).toHaveBeenCalledWith(
        expect.stringContaining(`address=${mixedCaseAddress.toLowerCase()}`),
        expect.any(Object),
      );
    });

    describe('checkAccessBatch', () => {
      it('should process multiple access checks and preserve order', async () => {
        const mockResult = { hasAccess: true, matchedRoles: ['admin'] };
        (fetch as any).mockResolvedValue({
          ok: true,
          status: 200,
          json: () => Promise.resolve(mockResult),
          headers: new Headers(),
        });

        const inputs = [
          { walletAddress: '0x1234567890123456789012345678901234567890', guildId: 'g1', resourceId: 'r1' },
          { walletAddress: '0x1234567890123456789012345678901234567890', guildId: 'g2', resourceId: 'r2' },
        ];

        const results = await client.access.checkAccessBatch(inputs);

        expect(results.length).toBe(2);
        expect(results[0]).toEqual({ input: inputs[0], status: 'fulfilled', value: mockResult });
        expect(results[1]).toEqual({ input: inputs[1], status: 'fulfilled', value: mockResult });
        expect(fetch).toHaveBeenCalledTimes(2);
      });

      it('should handle partial failures without discarding successes', async () => {
        const mockResult = { hasAccess: true, matchedRoles: ['admin'] };
        let callCount = 0;
        (fetch as any).mockImplementation(() => {
          callCount++;
          if (callCount === 2) {
            return Promise.resolve({
              ok: false,
              status: 500,
              text: () => Promise.resolve('Internal Server Error'),
              headers: new Headers(),
            });
          }
          return Promise.resolve({
            ok: true,
            status: 200,
            json: () => Promise.resolve(mockResult),
            headers: new Headers(),
          });
        });

        const inputs = [
          { walletAddress: '0x1234567890123456789012345678901234567890', guildId: 'g1', resourceId: 'r1' },
          { walletAddress: '0x1234567890123456789012345678901234567890', guildId: 'g2', resourceId: 'r2' },
        ];

        const results = await client.access.checkAccessBatch(inputs);

        expect(results.length).toBe(2);
        expect(results[0].status).toBe('fulfilled');
        expect(results[1].status).toBe('rejected');
        expect(results[1].error).toBeDefined();
      });

      it('should fail fast if configured', async () => {
        const mockResult = { hasAccess: true, matchedRoles: ['admin'] };
        let callCount = 0;
        (fetch as any).mockImplementation(() => {
          callCount++;
          if (callCount === 1) {
            return Promise.resolve({
              ok: false,
              status: 500,
              text: () => Promise.resolve('Internal Server Error'),
              headers: new Headers(),
            });
          }
          return Promise.resolve({
            ok: true,
            status: 200,
            json: () => Promise.resolve(mockResult),
            headers: new Headers(),
          });
        });

        const inputs = [
          { walletAddress: '0x1234567890123456789012345678901234567890', guildId: 'g1', resourceId: 'r1' },
          { walletAddress: '0x1234567890123456789012345678901234567890', guildId: 'g2', resourceId: 'r2' },
        ];

        await expect(client.access.checkAccessBatch(inputs, { failFast: true, concurrency: 1 })).rejects.toThrow();
        expect(callCount).toBe(1); // Should have stopped after first failure
      });

      it('should catch validation errors per item', async () => {
        const mockResult = { hasAccess: true, matchedRoles: ['admin'] };
        (fetch as any).mockResolvedValue({
          ok: true,
          status: 200,
          json: () => Promise.resolve(mockResult),
          headers: new Headers(),
        });

        const inputs = [
          { walletAddress: 'invalid-address', guildId: 'g1', resourceId: 'r1' },
          { walletAddress: '0x1234567890123456789012345678901234567890', guildId: 'g2', resourceId: 'r2' },
        ];

        const results = await client.access.checkAccessBatch(inputs);
        expect(results.length).toBe(2);
        expect(results[0].status).toBe('rejected'); // validation fails
        expect(results[1].status).toBe('fulfilled'); // fetch succeeds
      });
    });
  });

  describe('MembershipService', () => {
    it('should call membership endpoint', async () => {
      const mockMembership = { isActive: true, roles: ['member'] };
      (fetch as any).mockResolvedValue({
        ok: true,
        status: 200,
        json: () => Promise.resolve(mockMembership),
        headers: new Headers(),
      });

      const result = await client.membership.getMembership({
        walletAddress: '0x1234567890123456789012345678901234567890',
        guildId: 'guild_1',
      });

      expect(result).toEqual(mockMembership);
    });
  });

  describe('RolesService', () => {
    it('should fetch roles for a guild', async () => {
      const mockRoles = [{ id: '1', name: 'Role 1' }];
      (fetch as any).mockResolvedValue({
        ok: true,
        status: 200,
        json: () => Promise.resolve(mockRoles),
        headers: new Headers(),
      });

      const result = await client.roles.getRoles({ guildId: 'guild_1' });
      expect(result).toEqual(mockRoles);
      expect(fetch).toHaveBeenCalledWith(
        expect.stringContaining('/guilds/guild_1/roles'),
        expect.any(Object),
      );
    });

    it('should fetch roles for a wallet in a guild', async () => {
      const mockRoles = [{ id: '1', name: 'Role 1' }];
      const validAddress = '0x1234567890123456789012345678901234567890';
      (fetch as any).mockResolvedValue({
        ok: true,
        status: 200,
        json: () => Promise.resolve(mockRoles),
        headers: new Headers(),
      });

      const result = await client.roles.getUserRoles({
        guildId: 'guild_1',
        walletAddress: validAddress,
      });

      expect(result).toEqual(mockRoles);
      expect(fetch).toHaveBeenCalledWith(
        expect.stringContaining(`/guilds/guild_1/members/${validAddress}/roles`),
        expect.any(Object),
      );
    });

    it('should URL-encode guild IDs in role endpoint paths', async () => {
      const mockRoles = [{ id: '1', name: 'Role 1' }];
      (fetch as any).mockResolvedValue({
        ok: true,
        status: 200,
        json: () => Promise.resolve(mockRoles),
        headers: new Headers(),
      });

      const result = await client.roles.getRoles({ guildId: 'guild/1' });
      expect(result).toEqual(mockRoles);
      expect(fetch).toHaveBeenCalledWith(
        expect.stringContaining('/guilds/guild%2F1/roles'),
        expect.any(Object),
      );
    });

    it('should URL-encode guild IDs in user roles endpoint paths', async () => {
      const mockRoles = [{ id: '1', name: 'Role 1' }];
      (fetch as any).mockResolvedValue({
        ok: true,
        status: 200,
        json: () => Promise.resolve(mockRoles),
        headers: new Headers(),
      });

      const validAddress = '0x1234567890123456789012345678901234567890';
      const result = await client.roles.getUserRoles({ guildId: 'guild/1', walletAddress: validAddress });
      expect(result).toEqual(mockRoles);
      expect(fetch).toHaveBeenCalledWith(
        expect.stringContaining(`/guilds/guild%2F1/members/${validAddress}/roles`),
        expect.any(Object),
      );
    });

    it('should normalise wallet address in path parameters', async () => {
      const mockRoles = [{ id: '1', name: 'Role 1' }];
      (fetch as any).mockResolvedValue({
        ok: true,
        status: 200,
        json: () => Promise.resolve(mockRoles),
        headers: new Headers(),
      });

      const mixedCaseAddress = '0xAbCdEf1234567890AbCdEf1234567890AbCdEf12';
      await client.roles.getUserRoles({
        guildId: 'guild_1',
        walletAddress: mixedCaseAddress,
      });

      expect(fetch).toHaveBeenCalledWith(
        expect.stringContaining(`/members/${mixedCaseAddress.toLowerCase()}/roles`),
        expect.any(Object),
      );
    });

    it('should reject invalid guild IDs before fetching roles', async () => {
      await expect(client.roles.getRoles({ guildId: ' ' })).rejects.toMatchObject({
        code: GuildPassErrorCode.INVALID_INPUT,
      });

      expect(fetch).not.toHaveBeenCalled();
    });

    it('should reject invalid guild IDs before fetching user roles', async () => {
      await expect(
        client.roles.getUserRoles({
          guildId: ' ',
          walletAddress: '0x1234567890123456789012345678901234567890',
        }),
      ).rejects.toMatchObject({
        code: GuildPassErrorCode.INVALID_INPUT,
      });

      expect(fetch).not.toHaveBeenCalled();
    });

    it('should reject invalid wallet addresses before fetching user roles', async () => {
      await expect(
        client.roles.getUserRoles({
          guildId: 'guild_1',
          walletAddress: 'not-an-address',
        }),
      ).rejects.toMatchObject({
        code: GuildPassErrorCode.INVALID_ADDRESS,
      });

      expect(fetch).not.toHaveBeenCalled();
    });
  });

  describe('GuildsService', () => {
    it('should fetch guild info', async () => {
      const mockGuild = { id: 'guild_1', name: 'Test Guild' };
      (fetch as any).mockResolvedValue({
        ok: true,
        status: 200,
        json: () => Promise.resolve(mockGuild),
        headers: new Headers(),
      });

      const result = await client.guilds.getGuild({ guildId: 'guild_1' });
      expect(result).toEqual(mockGuild);
    });

    it('should URL-encode guild IDs in guild endpoint paths', async () => {
      const mockGuild = { id: 'guild/1', name: 'Encoded Guild' };
      (fetch as any).mockResolvedValue({
        ok: true,
        status: 200,
        json: () => Promise.resolve(mockGuild),
        headers: new Headers(),
      });

      const result = await client.guilds.getGuild({ guildId: 'guild/1' });
      expect(result).toEqual(mockGuild);
      expect(fetch).toHaveBeenCalledWith(
        expect.stringContaining('/guilds/guild%2F1'),
        expect.any(Object),
      );
    });
  });

  describe('Response Validation (validateResponses)', () => {
    let validatingClient: GuildPassClient;

    beforeEach(() => {
      validatingClient = new GuildPassClient({
        apiUrl: 'https://api.test.com',
        validateResponses: true,
      });
    });

    it('is off by default, so malformed responses are passed through unchanged', async () => {
      const malformedResult = { hasAccess: true };
      mockJsonResponse(malformedResult);

      const result = await client.access.checkAccess({
        walletAddress: '0x1234567890123456789012345678901234567890',
        guildId: 'guild_1',
        resourceId: 'res_1',
      });

      expect(result).toEqual(malformedResult);
    });

    it('rejects a malformed AccessCheckResult with a clear GuildPassError', async () => {
      mockJsonResponse({ hasAccess: true });

      await expect(
        validatingClient.access.checkAccess({
          walletAddress: '0x1234567890123456789012345678901234567890',
          guildId: 'guild_1',
          resourceId: 'res_1',
        }),
      ).rejects.toMatchObject({
        code: GuildPassErrorCode.INVALID_RESPONSE,
        message: expect.stringContaining('AccessCheckResult'),
      });
    });

    it('accepts a well-formed AccessCheckResult', async () => {
      const mockResult = {
        hasAccess: true,
        walletAddress: '0x1234567890123456789012345678901234567890',
        guildId: 'guild_1',
        resourceId: 'res_1',
        requiredRoles: ['member'],
        matchedRoles: ['member'],
      };
      mockJsonResponse(mockResult);

      const result = await validatingClient.access.checkAccess({
        walletAddress: '0x1234567890123456789012345678901234567890',
        guildId: 'guild_1',
        resourceId: 'res_1',
      });

      expect(result).toEqual(mockResult);
    });

    it('rejects a malformed Membership response with a clear GuildPassError', async () => {
      mockJsonResponse({ isActive: true });

      await expect(
        validatingClient.membership.getMembership({
          walletAddress: '0x1234567890123456789012345678901234567890',
          guildId: 'guild_1',
        }),
      ).rejects.toBeInstanceOf(GuildPassError);
    });

    it('accepts a well-formed Membership response', async () => {
      const mockMembership = {
        walletAddress: '0x1234567890123456789012345678901234567890',
        guildId: 'guild_1',
        isActive: true,
        roles: ['member'],
      };
      mockJsonResponse(mockMembership);

      const result = await validatingClient.membership.getMembership({
        walletAddress: '0x1234567890123456789012345678901234567890',
        guildId: 'guild_1',
      });

      expect(result).toEqual(mockMembership);
    });

    it('rejects a malformed GuildRole[] response with a clear GuildPassError', async () => {
      mockJsonResponse([{ id: '1' }]);

      await expect(validatingClient.roles.getRoles({ guildId: 'guild_1' })).rejects.toMatchObject({
        code: GuildPassErrorCode.INVALID_RESPONSE,
      });
    });

    it('accepts a well-formed GuildRole[] response', async () => {
      const mockRoles = [{ id: '1', name: 'Role 1' }];
      mockJsonResponse(mockRoles);

      const result = await validatingClient.roles.getRoles({ guildId: 'guild_1' });
      expect(result).toEqual(mockRoles);
    });

    it('rejects a malformed Guild response with a clear GuildPassError', async () => {
      mockJsonResponse({ id: 'guild_1' });

      await expect(validatingClient.guilds.getGuild({ guildId: 'guild_1' })).rejects.toMatchObject({
        code: GuildPassErrorCode.INVALID_RESPONSE,
      });
    });

    it('accepts a well-formed Guild response', async () => {
      const mockGuild = {
        id: 'guild_1',
        name: 'Test Guild',
        ownerAddress: '0x1234567890123456789012345678901234567890',
        chainId: 1,
      };
      mockJsonResponse(mockGuild);

      const result = await validatingClient.guilds.getGuild({ guildId: 'guild_1' });
      expect(result).toEqual(mockGuild);
    });

    it('rejects a malformed GuildConfig response with a clear GuildPassError', async () => {
      mockJsonResponse({ theme: 'dark' });

      await expect(
        validatingClient.guilds.getGuildConfig({ guildId: 'guild_1' }),
      ).rejects.toMatchObject({ code: GuildPassErrorCode.INVALID_RESPONSE });
    });

    it('accepts a well-formed GuildConfig response', async () => {
      const mockGuildConfig = { id: 'guild_1', theme: 'dark' };
      mockJsonResponse(mockGuildConfig);

      const result = await validatingClient.guilds.getGuildConfig({ guildId: 'guild_1' });
      expect(result).toEqual(mockGuildConfig);
    });
  });

  describe('API Contract Tests', () => {
    let client: GuildPassClient;

    beforeEach(() => {
      client = new GuildPassClient({ apiUrl: 'https://api.test.com' });
      vi.stubGlobal('fetch', vi.fn());
    });

    it('should match access check contract', async () => {
      const fixture = apiContract.access.check;
      mockJsonResponse(fixture.response.success);

      const result = await client.access.checkAccess({
        walletAddress: fixture.response.success.walletAddress,
        guildId: fixture.response.success.guildId,
        resourceId: fixture.response.success.resourceId,
      });

      expect(result).toEqual(fixture.response.success);
      expect(fetch).toHaveBeenCalledWith(
        expect.stringContaining(fixture.request.path),
        expect.any(Object)
      );
      const urlCall = (fetch as any).mock.calls[0][0];
      expect(urlCall).toContain(`address=${fixture.response.success.walletAddress}`);
      expect(urlCall).toContain(`guildId=${fixture.response.success.guildId}`);
      expect(urlCall).toContain(`resourceId=${fixture.response.success.resourceId}`);
    });

    it('should match role check contract', async () => {
      const fixture = apiContract.access.roleCheck;
      mockJsonResponse(fixture.response.success);

      const result = await client.access.checkRoleAccess({
        walletAddress: '0x1234567890123456789012345678901234567890',
        guildId: 'guild_1',
        roleId: 'role_1',
      });

      expect(result).toEqual(fixture.response.success.hasRole);
      expect(fetch).toHaveBeenCalledWith(
        expect.stringContaining(fixture.request.path),
        expect.any(Object)
      );
    });

    it('should match membership get contract', async () => {
      const fixture = apiContract.membership.get;
      mockJsonResponse(fixture.response.success);

      const result = await client.membership.getMembership({
        walletAddress: fixture.response.success.walletAddress,
        guildId: fixture.response.success.guildId,
      });

      expect(result).toEqual(fixture.response.success);
      expect(fetch).toHaveBeenCalledWith(
        expect.stringContaining(fixture.request.path),
        expect.any(Object)
      );
    });

    it('should match get roles contract', async () => {
      const fixture = apiContract.roles.getRoles;
      mockJsonResponse(fixture.response.success);

      const result = await client.roles.getRoles({
        guildId: 'guild_1',
      });

      expect(result).toEqual(fixture.response.success);
      expect(fetch).toHaveBeenCalledWith(
        expect.stringContaining(fixture.request.path),
        expect.any(Object)
      );
    });

    it('should match get user roles contract', async () => {
      const fixture = apiContract.roles.getUserRoles;
      mockJsonResponse(fixture.response.success);

      const result = await client.roles.getUserRoles({
        walletAddress: '0x1234567890123456789012345678901234567890',
        guildId: 'guild_1',
      });

      expect(result).toEqual(fixture.response.success);
      expect(fetch).toHaveBeenCalledWith(
        expect.stringContaining(fixture.request.path),
        expect.any(Object)
      );
    });

    it('should match get guild contract', async () => {
      const fixture = apiContract.guilds.getGuild;
      mockJsonResponse(fixture.response.success);

      const result = await client.guilds.getGuild({
        guildId: fixture.response.success.id,
      });

      expect(result).toEqual(fixture.response.success);
      expect(fetch).toHaveBeenCalledWith(
        expect.stringContaining(fixture.request.path),
        expect.any(Object)
      );
    });

    it('should match get guild config contract', async () => {
      const fixture = apiContract.guilds.getGuildConfig;
      mockJsonResponse(fixture.response.success);

      const result = await client.guilds.getGuildConfig({
        guildId: fixture.response.success.id,
      });

      expect(result).toEqual(fixture.response.success);
      expect(fetch).toHaveBeenCalledWith(
        expect.stringContaining(fixture.request.path),
        expect.any(Object)
      );
    });

    it('should handle API contract errors', async () => {
      const fixture = apiContract.access.check;
      (fetch as any).mockResolvedValue({
        ok: false,
        status: 500,
        json: () => Promise.resolve(fixture.response.error),
        headers: new Headers({'content-type': 'application/json'}),
      });

      await expect(client.access.checkAccess({
        walletAddress: '0x1234567890123456789012345678901234567890',
        guildId: 'guild_1',
        resourceId: 'res_1',
      })).rejects.toThrow();
    });
  });
});
