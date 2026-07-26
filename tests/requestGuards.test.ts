import { describe, it, expect } from 'vitest';
import {
  isAccessCheckParams,
  isRoleAccessCheckParams,
  isMembershipParams,
  isGetRolesParams,
  isGetUserRolesParams,
  isGetGuildParams,
} from '../src/validation/requestGuards';

const VALID_ADDRESS = '0xf39Fd6e51aad88F6F4ce6aB8827279cffFb92266';

describe('isAccessCheckParams', () => {
  const valid = {
    walletAddress: VALID_ADDRESS,
    guildId: 'guild_123',
    resourceId: 'resource_abc',
  };

  it('returns true for a valid AccessCheckParams shape', () => {
    expect(isAccessCheckParams(valid)).toBe(true);
  });

  it('returns false for null', () => {
    expect(isAccessCheckParams(null)).toBe(false);
  });

  it('returns false for an array', () => {
    expect(isAccessCheckParams([valid])).toBe(false);
  });

  it('returns false when walletAddress is missing', () => {
    // eslint-disable-next-line @typescript-eslint/no-unused-vars
    const { walletAddress, ...rest } = valid;
    expect(isAccessCheckParams(rest)).toBe(false);
  });

  it('returns false when walletAddress is an empty string', () => {
    expect(isAccessCheckParams({ ...valid, walletAddress: '' })).toBe(false);
  });

  it('returns false when guildId is not a string', () => {
    expect(isAccessCheckParams({ ...valid, guildId: 123 })).toBe(false);
  });

  it('returns false when resourceId is an empty string', () => {
    expect(isAccessCheckParams({ ...valid, resourceId: '' })).toBe(false);
  });

  it('is structural only: does not reject a malformed (non-checksummed) address', () => {
    // Format/checksum enforcement stays the job of `validateAddress` in
    // `src/utils/validation.ts`, which runs immediately after this guard.
    expect(isAccessCheckParams({ ...valid, walletAddress: 'not-an-address' })).toBe(true);
  });

  it('passes through unknown extra fields', () => {
    expect(isAccessCheckParams({ ...valid, extra: 'field' } as any)).toBe(true);
  });
});

describe('isRoleAccessCheckParams', () => {
  const valid = {
    walletAddress: VALID_ADDRESS,
    guildId: 'guild_123',
    roleId: 'role_1',
  };

  it('returns true for a valid RoleAccessCheckParams shape', () => {
    expect(isRoleAccessCheckParams(valid)).toBe(true);
  });

  it('returns false for null', () => {
    expect(isRoleAccessCheckParams(null)).toBe(false);
  });

  it('returns false when roleId is an empty string', () => {
    expect(isRoleAccessCheckParams({ ...valid, roleId: '' })).toBe(false);
  });

  it('returns false when roleId is missing', () => {
    // eslint-disable-next-line @typescript-eslint/no-unused-vars
    const { roleId, ...rest } = valid;
    expect(isRoleAccessCheckParams(rest)).toBe(false);
  });
});

describe('isMembershipParams', () => {
  const valid = { walletAddress: VALID_ADDRESS, guildId: 'guild_123' };

  it('returns true for a valid MembershipParams shape', () => {
    expect(isMembershipParams(valid)).toBe(true);
  });

  it('returns false for undefined', () => {
    expect(isMembershipParams(undefined)).toBe(false);
  });

  it('returns false when guildId is an empty string', () => {
    expect(isMembershipParams({ ...valid, guildId: '' })).toBe(false);
  });
});

describe('isGetRolesParams', () => {
  const valid = { guildId: 'guild_123' };

  it('returns true for a valid GetRolesParams shape with no pagination', () => {
    expect(isGetRolesParams(valid)).toBe(true);
  });

  it('returns true with cursor and limit set', () => {
    expect(isGetRolesParams({ ...valid, cursor: 'abc', limit: 10 })).toBe(true);
  });

  it('returns false when guildId is missing', () => {
    expect(isGetRolesParams({})).toBe(false);
  });

  it('returns false when limit is not a number', () => {
    expect(isGetRolesParams({ ...valid, limit: '10' })).toBe(false);
  });

  it('returns false when cursor is not a string', () => {
    expect(isGetRolesParams({ ...valid, cursor: 123 })).toBe(false);
  });

  it('accepts an empty-string cursor (pagination-token opacity is not this guard\'s concern)', () => {
    expect(isGetRolesParams({ ...valid, cursor: '' })).toBe(true);
  });
});

describe('isGetUserRolesParams', () => {
  const valid = { walletAddress: VALID_ADDRESS, guildId: 'guild_123' };

  it('returns true for a valid GetUserRolesParams shape', () => {
    expect(isGetUserRolesParams(valid)).toBe(true);
  });

  it('returns true with cursor and limit set', () => {
    expect(isGetUserRolesParams({ ...valid, cursor: 'abc', limit: 5 })).toBe(true);
  });

  it('returns false when walletAddress is missing', () => {
    // eslint-disable-next-line @typescript-eslint/no-unused-vars
    const { walletAddress, ...rest } = valid;
    expect(isGetUserRolesParams(rest)).toBe(false);
  });
});

describe('isGetGuildParams', () => {
  it('returns true for a valid GetGuildParams shape', () => {
    expect(isGetGuildParams({ guildId: 'guild_123' })).toBe(true);
  });

  it('returns false when guildId is an empty string', () => {
    expect(isGetGuildParams({ guildId: '' })).toBe(false);
  });

  it('returns false for an array', () => {
    expect(isGetGuildParams(['guild_123'])).toBe(false);
  });
});
