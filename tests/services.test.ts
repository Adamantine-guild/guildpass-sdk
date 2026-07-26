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
  let mockFetch: any;

  beforeEach(() => {
    mockFetch = vi.fn();
    vi.stubGlobal('fetch', mockFetch);
    client = new GuildPassClient({
      apiUrl: 'https://api.test.com',
      fetch: mockFetch,
    });
  });

  describe('AccessService', () => {
    it('should call checkAccess endpoint', async () => {
      const mockResult = {
        hasAccess: true,
        walletAddress: '0x1234567890123456789012345678901234567890',
        guildId: 'guild_1',
        resourceId: 'res_1',
        requiredRoles: ['admin'],
        matchedRoles: ['admin'],
      };
      mockFetch.mockResolvedValue({
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
      expect(mockFetch).toHaveBeenCalledWith(
        expect.stringContaining('/access/check'),
        expect.objectContaining({
          method: 'GET',
        }),
      );
    });

    it('should normalise wallet address in query parameters', async () => {
      const mockResult = {
        hasAccess: true,
        walletAddress: '0x1234567890123456789012345678901234567890',
        guildId: 'guild_1',
        resourceId: 'res_1',
        requiredRoles: ['admin'],
        matchedRoles: ['admin'],
      };
      (fetch as any).mockResolvedValue({
        ok: true,
        status: 200,
        json: () => Promise.resolve(mockResult),
        headers: new Headers(),
      });

      const mixedCaseAddress = '0xf39Fd6e51aad88F6F4ce6aB8827279cffFb92266';
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

    it('should override the global timeout for an individual access check', async () => {
      const timeoutClient = new GuildPassClient({
        apiUrl: 'https://api.test.com',
        timeoutMs: 1000,
      });
      (fetch as any).mockImplementation((_url: string, init: RequestInit) => {
        const error = new Error('AbortError');
        error.name = 'AbortError';
        init.signal?.dispatchEvent(new Event('abort'));
        return Promise.reject(error);
      });

      await expect(
        timeoutClient.access.checkAccess(
          {
            walletAddress: '0x1234567890123456789012345678901234567890',
            guildId: 'guild_1',
            resourceId: 'res_1',
          },
          { timeoutMs: 25 },
        ),
      ).rejects.toMatchObject({
        code: GuildPassErrorCode.TIMEOUT,
        message: 'Request timed out after 25ms',
      });
    });

    describe('checkAccessBatch', () => {
      it('should process multiple access checks and preserve order', async () => {
        const mockResult = {
        hasAccess: true,
        walletAddress: '0x1234567890123456789012345678901234567890',
        guildId: 'guild_1',
        resourceId: 'res_1',
        requiredRoles: ['admin'],
        matchedRoles: ['admin'],
      };
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
        const mockResult = {
        hasAccess: true,
        walletAddress: '0x1234567890123456789012345678901234567890',
        guildId: 'guild_1',
        resourceId: 'res_1',
        requiredRoles: ['admin'],
        matchedRoles: ['admin'],
      };
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
        const mockResult = {
        hasAccess: true,
        walletAddress: '0x1234567890123456789012345678901234567890',
        guildId: 'guild_1',
        resourceId: 'res_1',
        requiredRoles: ['admin'],
        matchedRoles: ['admin'],
      };
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
        const mockResult = {
        hasAccess: true,
        walletAddress: '0x1234567890123456789012345678901234567890',
        guildId: 'guild_1',
        resourceId: 'res_1',
        requiredRoles: ['admin'],
        matchedRoles: ['admin'],
      };
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
      const mockMembership = {
        walletAddress: '0x1234567890123456789012345678901234567890',
        guildId: 'guild_1',
        isActive: true,
        roles: ['member'],
      };
      mockFetch.mockResolvedValue({
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
      mockFetch.mockResolvedValue({
        ok: true,
        status: 200,
        json: () => Promise.resolve(mockRoles),
        headers: new Headers(),
      });

      const result = await client.roles.getRoles({ guildId: 'guild_1' });
      expect(result).toEqual(mockRoles);
      expect(mockFetch).toHaveBeenCalledWith(
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
      mockFetch.mockResolvedValue({
        ok: true,
        status: 200,
        json: () => Promise.resolve(mockRoles),
        headers: new Headers(),
      });

      const result = await client.roles.getRoles({ guildId: 'guild/1' });
      expect(result).toEqual(mockRoles);
      expect(mockFetch).toHaveBeenCalledWith(
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
      expect(mockFetch).toHaveBeenCalledWith(
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

      const mixedCaseAddress = '0xf39Fd6e51aad88F6F4ce6aB8827279cffFb92266';
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

    describe('hasRole', () => {
      it('returns true when the API reports the wallet holds the role', async () => {
        mockFetch.mockResolvedValue({
          ok: true,
          status: 200,
          json: () => Promise.resolve({ hasRole: true }),
          headers: new Headers(),
        });

        const result = await client.roles.hasRole({
          walletAddress: '0x1234567890123456789012345678901234567890',
          guildId: 'guild_1',
          roleId: 'role_1',
        });

        expect(result).toBe(true);
        expect(mockFetch).toHaveBeenCalledWith(
          expect.stringContaining('/access/role-check'),
          expect.objectContaining({ method: 'GET' }),
        );
      });

      it('returns false when the API reports the wallet does not hold the role', async () => {
        mockFetch.mockResolvedValue({
          ok: true,
          status: 200,
          json: () => Promise.resolve({ hasRole: false }),
          headers: new Headers(),
        });

        const result = await client.roles.hasRole({
          walletAddress: '0x1234567890123456789012345678901234567890',
          guildId: 'guild_1',
          roleId: 'role_1',
        });

        expect(result).toBe(false);
      });

      it('rejects invalid wallet addresses before calling the API', async () => {
        await expect(
          client.roles.hasRole({
            walletAddress: 'not-an-address',
            guildId: 'guild_1',
            roleId: 'role_1',
          }),
        ).rejects.toMatchObject({ code: GuildPassErrorCode.INVALID_ADDRESS });

        expect(mockFetch).not.toHaveBeenCalled();
      });

      it('rejects invalid guild IDs before calling the API', async () => {
        await expect(
          client.roles.hasRole({
            walletAddress: '0x1234567890123456789012345678901234567890',
            guildId: ' ',
            roleId: 'role_1',
          }),
        ).rejects.toMatchObject({ code: GuildPassErrorCode.INVALID_INPUT });

        expect(mockFetch).not.toHaveBeenCalled();
      });

      it('rejects invalid role IDs before calling the API', async () => {
        await expect(
          client.roles.hasRole({
            walletAddress: '0x1234567890123456789012345678901234567890',
            guildId: 'guild_1',
            roleId: '',
          }),
        ).rejects.toMatchObject({ code: GuildPassErrorCode.INVALID_INPUT });

        expect(mockFetch).not.toHaveBeenCalled();
      });

      it('normalises wallet address in the query parameters', async () => {
        mockFetch.mockResolvedValue({
          ok: true,
          status: 200,
          json: () => Promise.resolve({ hasRole: true }),
          headers: new Headers(),
        });

        const mixedCase = '0xf39Fd6e51aad88F6F4ce6aB8827279cffFb92266';
        await client.roles.hasRole({
          walletAddress: mixedCase,
          guildId: 'guild_1',
          roleId: 'role_1',
        });

        expect(mockFetch).toHaveBeenCalledWith(
          expect.stringContaining(`address=${mixedCase.toLowerCase()}`),
          expect.any(Object),
        );
      });

      it('returns a cached result on repeated calls with the same params', async () => {
        const cachedClient = new GuildPassClient({
          apiUrl: 'https://api.test.com',
          fetch: mockFetch,
          cache: {
            get: vi.fn().mockResolvedValueOnce(null).mockResolvedValue(true),
            set: vi.fn().mockResolvedValue(undefined),
            delete: vi.fn().mockResolvedValue(undefined),
            clear: vi.fn().mockResolvedValue(undefined),
          },
        });

        mockFetch.mockResolvedValue({
          ok: true,
          status: 200,
          json: () => Promise.resolve({ hasRole: true }),
          headers: new Headers(),
        });

        const params = {
          walletAddress: '0x1234567890123456789012345678901234567890',
          guildId: 'guild_1',
          roleId: 'role_1',
        };

        await cachedClient.roles.hasRole(params);
        const second = await cachedClient.roles.hasRole(params);

        expect(second).toBe(true);
        // Second call should have been served from cache (fetch called only once)
        expect(mockFetch).toHaveBeenCalledTimes(1);
      });
    });
  });

  describe('GuildsService', () => {
    it('should fetch guild info', async () => {
      const mockGuild = {
        id: 'guild_1',
        name: 'Test Guild',
        ownerAddress: '0x1234567890123456789012345678901234567890',
        chainId: 1,
      };
      mockFetch.mockResolvedValue({
        ok: true,
        status: 200,
        json: () => Promise.resolve(mockGuild),
        headers: new Headers(),
      });

      const result = await client.guilds.getGuild({ guildId: 'guild_1' });
      expect(result).toEqual(mockGuild);
    });

    it('should URL-encode guild IDs in guild endpoint paths', async () => {
      const mockGuild = {
        id: 'guild/1',
        name: 'Encoded Guild',
        ownerAddress: '0x1234567890123456789012345678901234567890',
        chainId: 1,
      };
      mockFetch.mockResolvedValue({
        ok: true,
        status: 200,
        json: () => Promise.resolve(mockGuild),
        headers: new Headers(),
      });

      const result = await client.guilds.getGuild({ guildId: 'guild/1' });
      expect(result).toEqual(mockGuild);
      expect(mockFetch).toHaveBeenCalledWith(
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

    it('is on by default, so a malformed response is rejected without any config', async () => {
      const malformedResult = { hasAccess: true };
      mockJsonResponse(malformedResult);

      // `client` (outer beforeEach) sets no `validateResponses` at all —
      // proves validation runs out of the box, not just when opted in.
      await expect(
        client.access.checkAccess({
          walletAddress: '0x1234567890123456789012345678901234567890',
          guildId: 'guild_1',
          resourceId: 'res_1',
        }),
      ).rejects.toMatchObject({ code: GuildPassErrorCode.INVALID_RESPONSE });
    });

    it('validateResponses: false restores passing malformed responses through unchanged', async () => {
      const nonValidatingClient = new GuildPassClient({
        apiUrl: 'https://api.test.com',
        fetch: mockFetch,
        validateResponses: false,
      });
      const malformedResult = { hasAccess: true };
      mockJsonResponse(malformedResult);

      const result = await nonValidatingClient.access.checkAccess({
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

    it('rejects a malformed checkRoleAccess response when validation is enabled', async () => {
      mockJsonResponse({ hasRole: 'yes' });

      await expect(
        validatingClient.access.checkRoleAccess({
          walletAddress: '0x1234567890123456789012345678901234567890',
          guildId: 'guild_1',
          roleId: 'role_1',
        }),
      ).rejects.toMatchObject({
        code: GuildPassErrorCode.INVALID_RESPONSE,
        message: expect.stringContaining('hasRole'),
      });
    });

    it('passes a malformed checkRoleAccess response through when validation is off', async () => {
      const nonValidatingClient = new GuildPassClient({
        apiUrl: 'https://api.test.com',
        fetch: mockFetch,
        validateResponses: false,
      });
      mockJsonResponse({ hasRole: 'yes' });

      const result = await nonValidatingClient.access.checkRoleAccess({
        walletAddress: '0x1234567890123456789012345678901234567890',
        guildId: 'guild_1',
        roleId: 'role_1',
      });

      expect(result).toBe('yes');
    });

    it('validates the checkRoleAccess includeMeta path too', async () => {
      mockJsonResponse({});

      await expect(
        validatingClient.access.checkRoleAccess(
          {
            walletAddress: '0x1234567890123456789012345678901234567890',
            guildId: 'guild_1',
            roleId: 'role_1',
          },
          { includeMeta: true },
        ),
      ).rejects.toMatchObject({ code: GuildPassErrorCode.INVALID_RESPONSE });
    });

    it('accepts a well-formed checkRoleAccess includeMeta response', async () => {
      mockJsonResponse({ hasRole: true });

      const result = await validatingClient.access.checkRoleAccess(
        {
          walletAddress: '0x1234567890123456789012345678901234567890',
          guildId: 'guild_1',
          roleId: 'role_1',
        },
        { includeMeta: true },
      );

      expect(result.data).toBe(true);
      expect(result.meta).toBeDefined();
    });

    it('rejects a malformed getMembership response on the includeMeta path', async () => {
      mockJsonResponse({ isActive: true });

      await expect(
        validatingClient.membership.getMembership(
          {
            walletAddress: '0x1234567890123456789012345678901234567890',
            guildId: 'guild_1',
          },
          { includeMeta: true },
        ),
      ).rejects.toMatchObject({ code: GuildPassErrorCode.INVALID_RESPONSE });
    });

    it('accepts a well-formed getMembership includeMeta response', async () => {
      const mockMembership = {
        walletAddress: '0x1234567890123456789012345678901234567890',
        guildId: 'guild_1',
        isActive: true,
        roles: ['member'],
      };
      mockJsonResponse(mockMembership);

      const result = await validatingClient.membership.getMembership(
        {
          walletAddress: '0x1234567890123456789012345678901234567890',
          guildId: 'guild_1',
        },
        { includeMeta: true },
      );

      expect(result.data).toEqual(mockMembership);
      expect(result.meta).toBeDefined();
    });

    it('names the endpoint in the validation error message', async () => {
      mockJsonResponse({ hasAccess: true });

      await expect(
        validatingClient.access.checkAccess({
          walletAddress: '0x1234567890123456789012345678901234567890',
          guildId: 'guild_1',
          resourceId: 'res_1',
        }),
      ).rejects.toMatchObject({
        message: expect.stringContaining('GET /access/check'),
      });
    });

    it('names the specific offending field in the validation error message', async () => {
      mockJsonResponse({
        hasAccess: true,
        walletAddress: 'not-an-address',
        guildId: 'guild_1',
        resourceId: 'res_1',
        requiredRoles: ['member'],
        matchedRoles: ['member'],
      });

      await expect(
        validatingClient.access.checkAccess({
          walletAddress: '0x1234567890123456789012345678901234567890',
          guildId: 'guild_1',
          resourceId: 'res_1',
        }),
      ).rejects.toMatchObject({
        message: expect.stringContaining('walletAddress'),
      });
    });

    it('exposes endpoint, mismatch and received payload on error.details', async () => {
      const malformed = { hasAccess: true };
      mockJsonResponse(malformed);

      const failure = await validatingClient.access
        .checkAccess({
          walletAddress: '0x1234567890123456789012345678901234567890',
          guildId: 'guild_1',
          resourceId: 'res_1',
        })
        .then(
          () => null,
          (err: unknown) => err,
        );

      expect(failure).toMatchObject({
        code: GuildPassErrorCode.INVALID_RESPONSE,
        details: {
          endpoint: 'GET /access/check',
          received: malformed,
        },
      });
      expect(typeof (failure as { details: { mismatch?: unknown } }).details.mismatch).toBe('string');
    });

    it('locates the failing element inside an array response', async () => {
      mockJsonResponse([{ id: '1', name: 'ok' }, { id: '2' }]);

      await expect(validatingClient.roles.getRoles({ guildId: 'guild_1' })).rejects.toMatchObject({
        message: expect.stringContaining('[1].name'),
      });
    });
  });

  describe('API Contract Tests', () => {
    let client: GuildPassClient;

    beforeEach(() => {
      client = new GuildPassClient({ apiUrl: 'https://api.test.com' });
      vi.stubGlobal('fetch', vi.fn());
    });

    it('should match access check contract', async () => {
      const fixture = apiContract?.access?.check || { response: { success: { hasAccess: true, matchedRoles: [] } } };
      mockJsonResponse(fixture.response.success);

      const result = await client.access.checkAccess({
        walletAddress: '0x1234567890123456789012345678901234567890',
        guildId: 'guild_1',
        resourceId: 'res_1',
      });

      expect(result).toBeDefined();
      expect(fetch).toHaveBeenCalledWith(
        expect.stringContaining('/access/check'),
        expect.any(Object)
      );
    });

    it('should match role check contract', async () => {
      const fixture = apiContract?.access?.roleCheck || { response: { success: { hasRole: true } } };
      mockJsonResponse(fixture.response.success);

      const result = await client.access.checkRoleAccess({
        walletAddress: '0x1234567890123456789012345678901234567890',
        guildId: 'guild_1',
        roleId: 'role_1',
      });

      expect(result).toBeDefined();
    });

    it('should match hasRole contract via roles module', async () => {
      const fixture = apiContract?.access?.roleCheck || { response: { success: { hasRole: true } } };
      mockJsonResponse(fixture.response.success);

      const result = await client.roles.hasRole({
        walletAddress: '0x1234567890123456789012345678901234567890',
        guildId: 'guild_1',
        roleId: 'role_1',
      });

      expect(typeof result).toBe('boolean');
      expect(fetch).toHaveBeenCalledWith(
        expect.stringContaining('/access/role-check'),
        expect.any(Object),
      );
    });

    it('should match membership get contract', async () => {
      const fixture = apiContract?.membership?.get || { response: { success: { isActive: true, roles: [] } } };
      mockJsonResponse(fixture.response.success);

      const result = await client.membership.getMembership({
        walletAddress: '0x1234567890123456789012345678901234567890',
        guildId: 'guild_1',
      });

      expect(result).toBeDefined();
      expect(fetch).toHaveBeenCalledWith(
        expect.stringContaining('/membership'),
        expect.any(Object)
      );
    });

    it('should match get roles contract', async () => {
      const fixture = apiContract?.roles?.getRoles || { response: { success: [] } };
      mockJsonResponse(fixture.response.success);

      const result = await client.roles.getRoles({
        guildId: 'guild_1',
      });

      expect(result).toEqual(fixture.response.success);
      expect(fetch).toHaveBeenCalledWith(
        expect.stringContaining('/roles'),
        expect.any(Object)
      );
    });

    it('should match get user roles contract', async () => {
      const fixture = apiContract?.roles?.getUserRoles || { response: { success: [] } };
      mockJsonResponse(fixture.response.success);

      const result = await client.roles.getUserRoles({
        walletAddress: '0x1234567890123456789012345678901234567890',
        guildId: 'guild_1',
      });

      expect(result).toEqual(fixture.response.success);
      expect(fetch).toHaveBeenCalledWith(
        expect.stringContaining('/roles'),
        expect.any(Object)
      );
    });

    it('should match get guild contract', async () => {
      const fixture = apiContract?.guilds?.getGuild || { response: { success: { id: 'guild_1' } } };
      mockJsonResponse(fixture.response.success);

      const result = await client.guilds.getGuild({
        guildId: 'guild_1'
      });
      expect(result).toBeDefined();
      expect(fetch).toHaveBeenCalledWith(
        expect.stringContaining('/guilds/guild_1'),
        expect.any(Object)
      );
    });

    it('should match get guild config contract', async () => {
      const fixture = apiContract?.guilds?.getGuildConfig || { response: { success: { id: 'guild_1' } } };
      mockJsonResponse(fixture.response.success);

      const result = await client.guilds.getGuildConfig({
        guildId: 'guild_1'
      });

      expect(result).toBeDefined();
      expect(fetch).toHaveBeenCalledWith(
        expect.stringContaining('/guilds/guild_1/config'),
        expect.any(Object)
      );
    });

    it('should handle API contract errors', async () => {
      (fetch as any).mockResolvedValue({
        ok: false,
        status: 500,
        json: () => Promise.resolve({ error: 'Internal Server Error' }),
        headers: new Headers({ 'content-type': 'application/json' })
      });

      await expect(client.access.checkAccess({
        walletAddress: '0x1234567890123456789012345678901234567890',
        guildId: 'guild_1',
        resourceId: 'res_1',
      })).rejects.toThrow();
    });
  });
});

describe('strictAddressChecksum', () => {
  const nonChecksummedAddress = '0xd8da6bf26964af9d7eed9e03e53415d37aa96045';

  it('rejects non-checksummed addresses in AccessService', async () => {
    const client = new GuildPassClient({
      apiUrl: 'https://api.test.com',
      strictAddressChecksum: true,
    });

    await expect(client.access.checkAccess({
      walletAddress: nonChecksummedAddress,
      guildId: 'guild_1',
      resourceId: 'res_1',
    })).rejects.toMatchObject({ code: GuildPassErrorCode.INVALID_ADDRESS });
  });

  it('rejects non-checksummed addresses in MembershipService', async () => {
    const client = new GuildPassClient({
      apiUrl: 'https://api.test.com',
      strictAddressChecksum: true,
    });

    await expect(client.membership.getMembership({
      walletAddress: nonChecksummedAddress,
      guildId: 'guild_1',
    })).rejects.toMatchObject({ code: GuildPassErrorCode.INVALID_ADDRESS });
  });

  it('accepts non-checksummed addresses by default', async () => {
    const mockResult = {
      hasAccess: true,
      walletAddress: nonChecksummedAddress,
      guildId: 'guild_1',
      resourceId: 'res_1',
      requiredRoles: [],
      matchedRoles: [],
    };
    const fetch = vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      json: () => Promise.resolve(mockResult),
      headers: new Headers(),
    });
    const client = new GuildPassClient({ apiUrl: 'https://api.test.com', fetch });

    await expect(client.access.checkAccess({
      walletAddress: nonChecksummedAddress,
      guildId: 'guild_1',
      resourceId: 'res_1',
    })).resolves.toEqual(mockResult);
  });
});
