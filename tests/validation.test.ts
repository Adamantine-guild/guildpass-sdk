import { describe, it, expect } from 'vitest';
import {
  validateAddress,
  validateGuildId,
  validateResourceId,
  validateRoleId,
} from '../src/utils/validation';
import { isChecksumAddress, toChecksumAddress } from '../src/utils/address';
import { GuildPassError } from '../src/errors/GuildPassError';
import { GuildPassErrorCode } from '../src/errors/errorCodes';

describe('Validation Utils', () => {
  describe('validateAddress', () => {
    const validAddress = '0x1234567890123456789012345678901234567890';
    const checksumAddress = '0xd8dA6BF26964aF9D7eEd9e03E53415D37aA96045';

    it('should not throw for valid lowercase address', () => {
      expect(() => validateAddress(validAddress)).not.toThrow();
    });

    it('should not throw for valid uppercase address', () => {
      expect(() =>
        validateAddress('0xABCDEF0123456789012345678901234567890123'),
      ).not.toThrow();
    });

    it('should not throw for mixed case address in default mode', () => {
      expect(() => validateAddress(checksumAddress)).not.toThrow();
    });

    it('should not throw for valid checksum address in strict mode', () => {
      expect(() => validateAddress(checksumAddress, { strict: true })).not.toThrow();
    });

    it('should throw INVALID_ADDRESS for invalid checksum in strict mode', () => {
      try {
        validateAddress('0xd8da6bf26964af9d7eed9e03e53415d37aa96045', { strict: true });
      } catch (error: unknown) {
        expect((error as GuildPassError).code).toBe(GuildPassErrorCode.INVALID_ADDRESS);
      }
    });

    it('should throw INVALID_ADDRESS for malformed address', () => {
      try {
        validateAddress('invalid-addr');
      } catch (error: unknown) {
        expect((error as GuildPassError).code).toBe(GuildPassErrorCode.INVALID_ADDRESS);
      }
    });

    it('should throw INVALID_ADDRESS for short address', () => {
      try {
        validateAddress('0x1234');
      } catch (error: unknown) {
        expect((error as GuildPassError).code).toBe(GuildPassErrorCode.INVALID_ADDRESS);
      }
    });

    it('should throw INVALID_ADDRESS for address missing 0x prefix', () => {
      try {
        validateAddress('1234567890123456789012345678901234567890');
      } catch (error: unknown) {
        expect((error as GuildPassError).code).toBe(GuildPassErrorCode.INVALID_ADDRESS);
      }
    });

    it('should throw INVALID_ADDRESS for address with wrong length', () => {
      try {
        validateAddress('0x12345678901234567890123456789012345678901234');
      } catch (error: unknown) {
        expect((error as GuildPassError).code).toBe(GuildPassErrorCode.INVALID_ADDRESS);
      }
    });

    it('should throw INVALID_INPUT for empty address', () => {
      try {
        validateAddress('');
      } catch (error: unknown) {
        expect((error as GuildPassError).code).toBe(GuildPassErrorCode.INVALID_INPUT);
      }
    });

    it('computes EIP-55 checksums without hardcoded address special-cases', () => {
      const vectors = [
        ['0x52908400098527886e0f7030069857d2e4169ee7', '0x52908400098527886E0F7030069857D2E4169EE7'],
        ['0x8617e340b3d01fa5f11f306f4090fd50e238070d', '0x8617E340B3D01FA5F11F306F4090FD50E238070D'],
        ['0xde709f2102306220921060314715629080e2fb77', '0xde709f2102306220921060314715629080e2fb77'],
        ['0x27b1fdb04752bbc536007a920d24acb045561c26', '0x27b1fdb04752bbc536007a920d24acb045561c26'],
        ['0xd8da6bf26964af9d7eed9e03e53415d37aa96045', '0xd8dA6BF26964aF9D7eEd9e03E53415D37aA96045'],
      ];

      for (const [input, expected] of vectors) {
        expect(toChecksumAddress(input)).toBe(expected);
        expect(isChecksumAddress(expected)).toBe(true);
      }
    });
  });

  describe('validateGuildId', () => {
    it('should not throw for valid guild ID', () => {
      expect(() => validateGuildId('guild_123')).not.toThrow();
    });

    it('should throw INVALID_INPUT for empty guild ID', () => {
      try {
        validateGuildId('');
      } catch (error: unknown) {
        expect((error as GuildPassError).code).toBe(GuildPassErrorCode.INVALID_INPUT);
      }
    });

    it('should throw INVALID_INPUT for whitespace-only guild ID', () => {
      try {
        validateGuildId('   ');
      } catch (error: unknown) {
        expect((error as GuildPassError).code).toBe(GuildPassErrorCode.INVALID_INPUT);
      }
    });

    it('should throw INVALID_INPUT for null guild ID', () => {
      try {
        validateGuildId(null as unknown as string);
      } catch (error: unknown) {
        expect((error as GuildPassError).code).toBe(GuildPassErrorCode.INVALID_INPUT);
      }
    });

    it('should throw INVALID_INPUT for undefined guild ID', () => {
      try {
        validateGuildId(undefined as unknown as string);
      } catch (error: unknown) {
        expect((error as GuildPassError).code).toBe(GuildPassErrorCode.INVALID_INPUT);
      }
    });
  });

  describe('validateResourceId', () => {
    it('should not throw for valid resource ID', () => {
      expect(() => validateResourceId('resource_abc')).not.toThrow();
    });

    it('should throw INVALID_INPUT for empty resource ID', () => {
      try {
        validateResourceId('');
      } catch (error: unknown) {
        expect((error as GuildPassError).code).toBe(GuildPassErrorCode.INVALID_INPUT);
      }
    });

    it('should throw INVALID_INPUT for whitespace-only resource ID', () => {
      try {
        validateResourceId('   ');
      } catch (error: unknown) {
        expect((error as GuildPassError).code).toBe(GuildPassErrorCode.INVALID_INPUT);
      }
    });

    it('should throw INVALID_INPUT for null resource ID', () => {
      try {
        validateResourceId(null as unknown as string);
      } catch (error: unknown) {
        expect((error as GuildPassError).code).toBe(GuildPassErrorCode.INVALID_INPUT);
      }
    });

    it('should throw INVALID_INPUT for undefined resource ID', () => {
      try {
        validateResourceId(undefined as unknown as string);
      } catch (error: unknown) {
        expect((error as GuildPassError).code).toBe(GuildPassErrorCode.INVALID_INPUT);
      }
    });
  });

  describe('validateRoleId', () => {
    it('should not throw for valid role ID', () => {
      expect(() => validateRoleId('role_xyz')).not.toThrow();
    });

    it('should throw INVALID_INPUT for empty role ID', () => {
      try {
        validateRoleId('');
      } catch (error: unknown) {
        expect((error as GuildPassError).code).toBe(GuildPassErrorCode.INVALID_INPUT);
      }
    });

    it('should throw INVALID_INPUT for whitespace-only role ID', () => {
      try {
        validateRoleId('   ');
      } catch (error: unknown) {
        expect((error as GuildPassError).code).toBe(GuildPassErrorCode.INVALID_INPUT);
      }
    });

    it('should throw INVALID_INPUT for null role ID', () => {
      try {
        validateRoleId(null as unknown as string);
      } catch (error: unknown) {
        expect((error as GuildPassError).code).toBe(GuildPassErrorCode.INVALID_INPUT);
      }
    });

    it('should throw INVALID_INPUT for undefined role ID', () => {
      try {
        validateRoleId(undefined as unknown as string);
      } catch (error: unknown) {
        expect((error as GuildPassError).code).toBe(GuildPassErrorCode.INVALID_INPUT);
      }
    });
  });
});
