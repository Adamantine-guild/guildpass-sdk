import { describe, it, expect } from 'vitest';
import {
  validateAddress,
  validateGuildId,
  validateResourceId,
  validateRoleId,
  MAX_ID_LENGTH,
} from '../src/utils/validation';
import { normaliseAddress } from '../src/utils/address';
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
  });

  describe('EIP-55 checksum handling', () => {
    /** The canonical test vectors published in the EIP-55 specification. */
    const EIP55_VECTORS = [
      '0x5aAeb6053F3E94C9b9A09f33669435E7Ef1BeAed',
      '0xfB6916095ca1df60bB79Ce92cE3Ea74c37c5d359',
      '0xdbF03B407c01E7cD3CBea99509d93f8DDDC8C6FB',
      '0xD1220A0cf47c7B9Be7A2E6BA89F429762e7b9aDb',
    ];

    /**
     * The same vectors with one character's case flipped. Each is still mixed
     * case — so it still carries checksum information — but the checksum no
     * longer matches the address. These are exactly the values that used to
     * slip through validation outside strict mode.
     */
    const CORRUPTED_VECTORS = [
      '0x5AAeb6053F3E94C9b9A09f33669435E7Ef1BeAed',
      '0xFB6916095ca1df60bB79Ce92cE3Ea74c37c5d359',
      '0xDbF03B407c01E7cD3CBea99509d93f8DDDC8C6FB',
      '0xd1220A0cf47c7B9Be7A2E6BA89F429762e7b9aDb',
    ];

    const toUpperHex = (address: string): string => `0x${address.slice(2).toUpperCase()}`;
    const isMixedCase = (address: string): boolean => {
      const hex = address.slice(2);
      return /[a-f]/.test(hex) && /[A-F]/.test(hex);
    };

    describe('validateAddress', () => {
      it.each(EIP55_VECTORS)('accepts the canonical checksummed form of %s', (address) => {
        expect(() => validateAddress(address)).not.toThrow();
      });

      it.each(EIP55_VECTORS)('accepts the all-lowercase form of %s', (address) => {
        expect(() => validateAddress(address.toLowerCase())).not.toThrow();
      });

      it.each(EIP55_VECTORS)('accepts the all-uppercase form of %s', (address) => {
        expect(() => validateAddress(toUpperHex(address))).not.toThrow();
      });

      it.each(CORRUPTED_VECTORS)('rejects mixed-case %s with a broken checksum', (address) => {
        // Guard the fixture itself: if the flip had left the address uniformly
        // cased it would carry no checksum information, and its rejection would
        // prove nothing about the mixed-case detection.
        expect(isMixedCase(address)).toBe(true);
        expect(() => validateAddress(address)).toThrow();
      });

      it('reports INVALID_ADDRESS with reason=checksum_failed for a broken checksum', () => {
        expect.assertions(4);
        try {
          validateAddress(CORRUPTED_VECTORS[0]);
        } catch (error: unknown) {
          const err = error as GuildPassError;
          expect(err.code).toBe(GuildPassErrorCode.INVALID_ADDRESS);
          expect(err.details.field).toBe('address');
          expect(err.details.reason).toBe('checksum_failed');
          expect(err.details.valueType).toBe('address');
        }
      });

      it('leaves the all-lowercase path untouched while strict still rejects it', () => {
        const lowercased = EIP55_VECTORS[0].toLowerCase();
        expect(() => validateAddress(lowercased)).not.toThrow();
        expect(() => validateAddress(lowercased, { strict: true })).toThrow();
      });

      it('keeps accepting a correctly checksummed address in strict mode', () => {
        for (const address of EIP55_VECTORS) {
          expect(() => validateAddress(address, { strict: true })).not.toThrow();
        }
      });

      it('reports a malformed address as a format error, not a checksum failure', () => {
        expect.assertions(2);
        try {
          // Mixed case, but not 40 hex digits: the format check must win.
          validateAddress('0x5aAeb6053F3E94C9b9A09f33669435E7Ef1Be');
        } catch (error: unknown) {
          const err = error as GuildPassError;
          expect(err.code).toBe(GuildPassErrorCode.INVALID_ADDRESS);
          expect(err.details.reason).toBe('format');
        }
      });
    });

    describe('normaliseAddress', () => {
      it.each(EIP55_VECTORS)('lowercases %s by default', (address) => {
        expect(normaliseAddress(address)).toBe(address.toLowerCase());
      });

      it.each(EIP55_VECTORS)('returns %s for { checksum: true } from any casing', (address) => {
        expect(normaliseAddress(address.toLowerCase(), { checksum: true })).toBe(address);
        expect(normaliseAddress(toUpperHex(address), { checksum: true })).toBe(address);
        expect(normaliseAddress(address, { checksum: true })).toBe(address);
      });

      it('derives one cache key for every casing of the same wallet', () => {
        // GuildPassClient builds cache keys through normaliseAddress; if the
        // default stopped being lowercase, the same wallet would occupy several
        // entries and prefix-based invalidation would miss them.
        const cacheKey = (address: string): string => `guildpass:wallet:${normaliseAddress(address)}`;
        for (const address of EIP55_VECTORS) {
          const expected = cacheKey(address.toLowerCase());
          expect(cacheKey(address)).toBe(expected);
          expect(cacheKey(toUpperHex(address))).toBe(expected);
        }
      });

      it('trims surrounding whitespace in both modes', () => {
        const address = EIP55_VECTORS[0];
        expect(normaliseAddress(`  ${address}  `)).toBe(address.toLowerCase());
        expect(normaliseAddress(`  ${address}  `, { checksum: true })).toBe(address);
      });

      it('falls back to lowercase instead of inventing a checksum for malformed input', () => {
        expect(() => normaliseAddress('0xABC', { checksum: true })).not.toThrow();
        expect(normaliseAddress('0xABC', { checksum: true })).toBe('0xabc');
        expect(normaliseAddress('not-an-address', { checksum: true })).toBe('not-an-address');
      });

      it('keeps the previous single-argument behaviour', () => {
        expect(normaliseAddress('0xABC')).toBe('0xabc');
        expect(normaliseAddress(EIP55_VECTORS[0], {})).toBe(EIP55_VECTORS[0].toLowerCase());
        expect(normaliseAddress(EIP55_VECTORS[0], { checksum: false })).toBe(
          EIP55_VECTORS[0].toLowerCase(),
        );
      });
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

    it('should throw INVALID_INPUT for guild ID exceeding max length', () => {
      const longId = 'a'.repeat(MAX_ID_LENGTH + 1);
      try {
        validateGuildId(longId);
      } catch (error: unknown) {
        expect((error as GuildPassError).code).toBe(GuildPassErrorCode.INVALID_INPUT);
        expect((error as GuildPassError).message).toContain('exceeds maximum length');
      }
    });

    it('should not throw for guild ID at max length boundary', () => {
      expect(() => validateGuildId('a'.repeat(MAX_ID_LENGTH))).not.toThrow();
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

    it('should throw INVALID_INPUT for resource ID exceeding max length', () => {
      const longId = 'b'.repeat(MAX_ID_LENGTH + 1);
      try {
        validateResourceId(longId);
      } catch (error: unknown) {
        expect((error as GuildPassError).code).toBe(GuildPassErrorCode.INVALID_INPUT);
        expect((error as GuildPassError).message).toContain('exceeds maximum length');
      }
    });

    it('should not throw for resource ID at max length boundary', () => {
      expect(() => validateResourceId('b'.repeat(MAX_ID_LENGTH))).not.toThrow();
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

    it('should throw INVALID_INPUT for role ID exceeding max length', () => {
      const longId = 'c'.repeat(MAX_ID_LENGTH + 1);
      try {
        validateRoleId(longId);
      } catch (error: unknown) {
        expect((error as GuildPassError).code).toBe(GuildPassErrorCode.INVALID_INPUT);
        expect((error as GuildPassError).message).toContain('exceeds maximum length');
      }
    });

    it('should not throw for role ID at max length boundary', () => {
      expect(() => validateRoleId('c'.repeat(MAX_ID_LENGTH))).not.toThrow();
    });
  });
});
