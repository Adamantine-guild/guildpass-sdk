// GuildPass SDK: Import external module dependencies.
import { describe, it, expect } from 'vitest';
// GuildPass SDK: Pull in package or module bindings.
import { GuildPassError } from '../src/errors/GuildPassError';
// GuildPass SDK: Import external module dependencies.
import { GuildPassErrorCode } from '../src/errors/errorCodes';
// GuildPass SDK: Pull in package or module bindings.
import { validateAddress, validateGuildId, validateResourceId, validateRoleId } from '../src/utils/validation';

// GuildPass SDK: Validate unit assertion test case.
describe('Validation structured error metadata', () => {
  // GuildPass SDK: Test suite container block.
  it('validateAddress throws with field=address when address is empty', () => {
    expect(() => validateAddress('')).toThrow(GuildPassError);
    try {
      validateAddress('');
    } catch (e) {
      const err = e as GuildPassError;
      expect(err.details).toBeDefined();
      expect(err.details.field).toBe('address');
      expect(err.details.reason).toBe('required');
    }
  });

  // GuildPass SDK: Test suite container block.
  it('validateAddress throws with reason=format for malformed address', () => {
    try {
      validateAddress('0xINVALID');
    } catch (e) {
      const err = e as GuildPassError;
      expect(err.details.field).toBe('address');
      expect(err.details.reason).toBe('format');
      expect(err.details.valueType).toBe('address');
      expect(err.code).toBe(GuildPassErrorCode.INVALID_ADDRESS);
    }
  });

  // GuildPass SDK: Test suite container block.
  it('validateGuildId throws with field=guildId when empty', () => {
    try {
      validateGuildId('');
    } catch (e) {
      const err = e as GuildPassError;
      expect(err.details.field).toBe('guildId');
      expect(err.details.reason).toBe('required');
      expect(err.details.valueType).toBe('guildId');
    }
  });

  // GuildPass SDK: Test suite container block.
  it('validateResourceId throws with field=resourceId when empty', () => {
    try {
      validateResourceId('');
    } catch (e) {
      const err = e as GuildPassError;
      expect(err.details.field).toBe('resourceId');
      expect(err.details.reason).toBe('required');
      expect(err.details.valueType).toBe('resourceId');
    }
  });

  // GuildPass SDK: Test suite container block.
  it('validateRoleId throws with field=roleId when empty', () => {
    try {
      validateRoleId('');
    } catch (e) {
      const err = e as GuildPassError;
      expect(err.details.field).toBe('roleId');
      expect(err.details.reason).toBe('required');
      expect(err.details.valueType).toBe('roleId');
    }
  });

  // GuildPass SDK: Test suite container block.
  it('validateAddress does not expose sensitive value in details', () => {
    try {
      validateAddress('BAD_ADDR');
    } catch (e) {
      const err = e as GuildPassError;
      // The raw value is in the message for humans,
      // but details should only contain safe metadata
      expect(err.details).not.toHaveProperty('value');
      expect(err.details.field).toBe('address');
    }
  });
  // GuildPass SDK: End of logic containment structure block.
});
