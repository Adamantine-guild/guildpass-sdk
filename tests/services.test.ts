import { describe, it, expect, vi, beforeEach } from 'vitest';
import { GuildPassClient } from '../src/client/GuildPassClient';
import { GuildPassError } from '../src/errors/GuildPassError';
import { GuildPassErrorCode } from '../src/errors/errorCodes';

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
        expect.any(Object),
      );
    });

    describe('checkAccessBatch', () => {
      it('should process multiple access checks and preserve order', async () => {
        const mockResult = { hasAccess: true, matchedRoles: ['admin'] };
        (fetch as any).mockResolvedValue({
          ok: true, status: 200,
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
            return Promise.resolve({ ok: false, status: 500, text: () => Promise.resolve('error'), headers: new Headers() });
          }
          return Promise.resolve({ ok: true, status: 200, json: () => Promise.resolve(mockResult), headers: new Headers() });
        });
        const inputs = [
          { walletAddress: '0x1234567890123456789012345678901234567890', guildId: 'g1', resourceId: 'r1' },
          { walletAddress: '0x1234567890123456789012345678901234567890', guildId: 'g2', resourceId: 'r2' },
        ];
        const results = await client.access.checkAccessBatch(inputs);
        expect(results[0].status).toBe('fulfilled');
        expect(results[1].status).toBe('rejected');
        expect(results[1].error).toBeDefined();
      });

      it('should fail fast if configured', async () => {
        let callCount = 0;
        (fetch as any).mockImplementation(() => {
          callCount++;
          return Promise.resolve({ ok: false, status: 500, text: () => Promise.resolve('error'), headers: new Headers() });
        });
        const inputs = [
          { walletAddress: '0x1234567890123456789012345678901234567890', guildId: 'g1', resourceId: 'r1' },
          { walletAddress: '0x1234567890123456789012345678901234567890', guildId: 'g2', resourceId: 'r2' },
        ];
        await expect(client.access.checkAccessBatch(inputs, { failFast: true, concurrency: 1 })).rejects.toThrow();
        expect(callCount).toBe(1);
      });

      it('should catch validation errors per item', async () => {
        const mockResult = { hasAccess: true, matchedRoles: ['admin'] };
        (fetch as any).mockResolvedValue({
          ok: true, status: 200,
          json: () => Promise.resolve(mockResult),
          headers: new Headers(),
        });
        const inputs = [
          { walletAddress: 'invalid-address', guildId: 'g1', resourceId: 'r1' },
          { walletAddress: '0x1234567890123456789012345678901234567890', guildId: 'g2', resourceId: 'r2' },
        ];
        const results = await client.access.checkAccessBatch(inputs);
        expect(results[0].status).toBe('rejected');
        expect(results[1].status).toBe('fulfilled');
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
});
