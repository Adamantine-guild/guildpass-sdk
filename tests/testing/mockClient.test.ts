import { describe, it, expect } from 'vitest';
import { createMockGuildPassClient, type Public } from '../../src/testing/mockClient';
import { DEFAULT_ACCESS_RESULT, DEFAULT_GUILD } from '../../src/testing/fixtures';
import type { GuildPassClient } from '../../src/client/GuildPassClient';

describe('MockGuildPassClient', () => {
  it('should implement the public interface of GuildPassClient at compile time', () => {
    const mockClient = createMockGuildPassClient();
    
    // Compile-time type check: if GuildPassClient public shape changes, this will fail
    const check: Public<GuildPassClient> = mockClient;
    expect(check).toBeDefined();
    expect(check.access).toBeDefined();
    expect(check.guilds).toBeDefined();
  });

  it('should return default fixtures when no overrides are provided', async () => {
    const mockClient = createMockGuildPassClient();

    const accessResult = await mockClient.access.checkAccess({
      walletAddress: '0x123',
      guildId: 'guild-123',
      resourceId: 'res-1'
    });
    expect(accessResult).toEqual(DEFAULT_ACCESS_RESULT);

    const guildResult = await mockClient.guilds.getGuild({ guildId: 'guild-123' });
    expect(guildResult).toEqual(DEFAULT_GUILD);
  });

  it('should return overridden fixtures when provided', async () => {
    const customAccessResult = {
      hasAccess: false,
      walletAddress: '0xoverride',
      guildId: 'override-guild',
      resourceId: 'override-res',
      requiredRoles: ['admin'],
      matchedRoles: [],
      reason: 'Overridden false'
    };

    const mockClient = createMockGuildPassClient({
      access: {
        checkAccess: async () => customAccessResult,
      }
    });

    const result = await mockClient.access.checkAccess({
      walletAddress: '0x123',
      guildId: 'guild-123',
      resourceId: 'res-1'
    });

    expect(result).toEqual(customAccessResult);
    // Un-overridden methods should still return defaults
    expect(await mockClient.guilds.getGuild({ guildId: 'guild-123' })).toEqual(DEFAULT_GUILD);
  });
});
