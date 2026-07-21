import { describe, it, expect } from 'vitest';
import {
  isAccessCheckResult,
  isMembership,
  isGuildRole,
  isGuildRoleArray,
  isGuild,
  isGuildConfig,
} from '../src/validation/responseGuards';

const VALID_ADDRESS = '0xf39Fd6e51aad88F6F4ce6aB8827279cffFb92266';

describe('isAccessCheckResult', () => {
  const valid = {
    hasAccess: true,
    walletAddress: VALID_ADDRESS,
    guildId: 'guild_123',
    resourceId: 'resource_abc',
    requiredRoles: ['role_1'],
    matchedRoles: ['role_1'],
  };

  it('returns true for a valid AccessCheckResult', () => {
    expect(isAccessCheckResult(valid)).toBe(true);
  });

  it('returns false when walletAddress is not an Ethereum address', () => {
    expect(isAccessCheckResult({ ...valid, walletAddress: 'not-an-address' })).toBe(false);
  });

  it('returns false when walletAddress is empty', () => {
    expect(isAccessCheckResult({ ...valid, walletAddress: '' })).toBe(false);
  });

  it('returns false when guildId is empty', () => {
    expect(isAccessCheckResult({ ...valid, guildId: '' })).toBe(false);
  });

  it('returns false when resourceId is empty', () => {
    expect(isAccessCheckResult({ ...valid, resourceId: '' })).toBe(false);
  });

  it('returns false when requiredRoles contains an empty string', () => {
    expect(isAccessCheckResult({ ...valid, requiredRoles: [''] })).toBe(false);
  });

  it('returns false when matchedRoles contains an empty string', () => {
    expect(isAccessCheckResult({ ...valid, matchedRoles: [''] })).toBe(false);
  });

  it('returns false when hasAccess is not a boolean', () => {
    expect(isAccessCheckResult({ ...valid, hasAccess: 'true' })).toBe(false);
  });

  it('returns true when reason is a string or undefined', () => {
    expect(isAccessCheckResult({ ...valid, reason: 'Some reason' })).toBe(true);
    expect(isAccessCheckResult({ ...valid, reason: undefined })).toBe(true);
  });
});

describe('isMembership', () => {
  const valid = {
    walletAddress: VALID_ADDRESS,
    guildId: 'guild_123',
    isActive: true,
    roles: ['member'],
  };

  it('returns true for a valid Membership', () => {
    expect(isMembership(valid)).toBe(true);
  });

  it('returns false when walletAddress is not an Ethereum address', () => {
    expect(isMembership({ ...valid, walletAddress: '' })).toBe(false);
  });

  it('returns false when guildId is empty', () => {
    expect(isMembership({ ...valid, guildId: '' })).toBe(false);
  });

  it('returns false when isActive is not a boolean', () => {
    expect(isMembership({ ...valid, isActive: 'yes' })).toBe(false);
  });
});

describe('isGuildRole', () => {
  const valid = {
    id: 'role_admin',
    name: 'Admin',
  };

  it('returns true for a valid GuildRole', () => {
    expect(isGuildRole(valid)).toBe(true);
  });

  it('returns false when id is empty', () => {
    expect(isGuildRole({ ...valid, id: '' })).toBe(false);
  });

  it('returns false when name is empty', () => {
    expect(isGuildRole({ ...valid, name: '' })).toBe(false);
  });

  it('returns true when requirements is an array of valid requirements', () => {
    expect(
      isGuildRole({
        ...valid,
        requirements: [{ type: 'TOKEN', address: '0x1234567890123456789012345678901234567890' }],
      }),
    ).toBe(true);
  });
});

describe('isGuildRoleArray', () => {
  it('returns true for an array of valid GuildRole', () => {
    expect(isGuildRoleArray([{ id: 'r1', name: 'Role 1' }, { id: 'r2', name: 'Role 2' }])).toBe(true);
  });

  it('returns false when an element has an empty id', () => {
    expect(isGuildRoleArray([{ id: '', name: 'Empty' }])).toBe(false);
  });
});

describe('isGuild', () => {
  const valid = {
    id: 'guild_1',
    name: 'Test Guild',
    ownerAddress: VALID_ADDRESS,
    chainId: 1,
  };

  it('returns true for a valid Guild', () => {
    expect(isGuild(valid)).toBe(true);
  });

  it('returns false when id is empty', () => {
    expect(isGuild({ ...valid, id: '' })).toBe(false);
  });

  it('returns false when name is empty', () => {
    expect(isGuild({ ...valid, name: '' })).toBe(false);
  });

  it('returns false when ownerAddress is not an Ethereum address', () => {
    expect(isGuild({ ...valid, ownerAddress: '0xinvalid' })).toBe(false);
  });

  it('returns false when chainId is not a number', () => {
    expect(isGuild({ ...valid, chainId: '1' })).toBe(false);
  });
});

describe('isGuildConfig', () => {
  const valid = { id: 'guild_1' };

  it('returns true for a valid GuildConfig', () => {
    expect(isGuildConfig(valid)).toBe(true);
  });

  it('returns false when id is missing', () => {
    expect(isGuildConfig({})).toBe(false);
  });
});
