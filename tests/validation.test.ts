import { describe, it, expect } from 'vitest';
import { validateAddress, validateGuildId } from '../src/utils/validation';
import { GuildPassErrorCode } from '../src/errors/errorCodes';

describe('Validation Utils', () => {
  describe('validateAddress', () => {
    it('should not throw for valid address', () => {
      expect(() => validateAddress('0x1234567890123456789012345678901234567890')).not.toThrow();
    });

    it('should not throw for mixed case address in default mode', () => {
      expect(() => validateAddress('0xd8dA6BF26964aF9D7eEd9e03E53415D37aA96045')).not.toThrow();
    });

    it('should not throw for valid checksum address in strict mode', () => {
      expect(() =>
        validateAddress('0xd8dA6BF26964aF9D7eEd9e03E53415D37aA96045', { strict: true }),
      ).not.toThrow();
    });

    it('should throw for invalid checksum address in strict mode', () => {
      try {
        validateAddress('0xd8da6bf26964af9d7eed9e03e53415d37aa96045', { strict: true });
      } catch (error: any) {
        expect(error.code).toBe(GuildPassErrorCode.INVALID_ADDRESS);
      }
    });

    it('should throw for invalid address', () => {
      try {
        validateAddress('invalid-addr');
      } catch (error: any) {
        expect(error.code).toBe(GuildPassErrorCode.INVALID_ADDRESS);
      }
    });

    it('should throw for empty address', () => {
      try {
        validateAddress('');
      } catch (error: any) {
        expect(error.code).toBe(GuildPassErrorCode.INVALID_INPUT);
      }
    });
  });

  describe('validateGuildId', () => {
    it('should not throw for valid guild ID', () => {
      expect(() => validateGuildId('guild_123')).not.toThrow();
    });

    it('should throw for empty guild ID', () => {
      expect(() => validateGuildId('')).toThrow();
    });
  });
});
