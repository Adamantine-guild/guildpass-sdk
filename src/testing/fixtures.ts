import type { AccessCheckResult } from '../access/access.types';
import type { Guild, GuildConfig } from '../guilds/guilds.types';
import type { GuildRole } from '../roles/roles.types';
import type { Membership } from '../membership/membership.types';

export const DEFAULT_ACCESS_RESULT: AccessCheckResult = {
  hasAccess: true,
  walletAddress: '0x1234567890123456789012345678901234567890',
  guildId: 'mock-guild',
  resourceId: 'mock-resource',
  requiredRoles: ['mock-role'],
  matchedRoles: ['mock-role'],
  reason: 'All requirements met (mock fixture)'
};

export const DEFAULT_GUILD: Guild = {
  id: 'mock-guild',
  name: 'Mock Guild',
  description: 'A mock guild for testing',
  ownerAddress: '0x1234567890123456789012345678901234567890',
  chainId: 1
};

export const DEFAULT_GUILD_CONFIG: GuildConfig = {
  id: 'mock-guild',
  theme: 'dark',
  socialLinks: {
    twitter: 'https://twitter.com/mockguild'
  }
};

export const DEFAULT_ROLE: GuildRole = {
  id: 'mock-role',
  name: 'Mock Role',
  description: 'A mock role for testing requirements',
  requirements: []
};

export const DEFAULT_MEMBERSHIP: Membership = {
  walletAddress: '0x1234567890123456789012345678901234567890',
  guildId: 'mock-guild',
  isActive: true,
  roles: ['mock-role'],
  joinedAt: new Date().toISOString()
};
