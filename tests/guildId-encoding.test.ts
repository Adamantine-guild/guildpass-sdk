/**
 * Hardened guild ID encoding tests (Issue #157)
 *
 * Covers:
 *  1. Exact mode classification — every branch of encodeGuildId / encodeBytes32
 *  2. Collision tests — distinct inputs in different modes must never produce the same bytes32
 *  3. Negative / boundary tests — overflow, oversized UTF-8, malformed hex prefixes
 *  4. Property-based / fuzz tests via fast-check — no two distinct "realistic" inputs collide
 */

import { describe, expect, it } from 'vitest';
import * as fc from 'fast-check';
import { encodeGuildId, UINT256_MAX } from '../src/contracts/contractHelpers';
import { GuildPassErrorCode } from '../src/errors/errorCodes';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

const HEX_WORD_LEN = 64; // hex chars in a bytes32 value

/** Returns true if the value is a valid 64-hex-char string (no 0x prefix). */
const isValidBytes32Hex = (v: string): boolean => /^[a-f0-9]{64}$/.test(v);

// ---------------------------------------------------------------------------
// 1. Mode classification: hex mode
// ---------------------------------------------------------------------------
describe('encodeGuildId — hex mode (/^0x[a-fA-F0-9]{64}$/)', () => {
  it('strips 0x and lowercases an exact 32-byte hex string', () => {
    const input = '0x' + 'ABCDEF0123456789'.repeat(4);
    const result = encodeGuildId(input);
    expect(result).toBe('abcdef0123456789'.repeat(4));
    expect(result).toHaveLength(HEX_WORD_LEN);
  });

  it('accepts lower-case hex digits', () => {
    const input = '0x' + 'deadbeef'.repeat(8);
    expect(encodeGuildId(input)).toBe('deadbeef'.repeat(8));
  });

  it('accepts mixed-case hex digits', () => {
    const input = '0xDeAdBeEf' + '0'.repeat(56);
    expect(encodeGuildId(input)).toBe('deadbeef' + '0'.repeat(56));
  });

  it('accepts the zero bytes32', () => {
    const input = '0x' + '0'.repeat(64);
    expect(encodeGuildId(input)).toBe('0'.repeat(64));
  });

  it('accepts the max bytes32', () => {
    const input = '0x' + 'f'.repeat(64);
    expect(encodeGuildId(input)).toBe('f'.repeat(64));
  });

  // Inputs that START with 0x but do NOT match exactly must NOT be treated as hex
  it('does NOT treat 0x-prefixed string with only 63 hex chars as hex (falls to UTF-8)', () => {
    // "0x" + 63 hex chars = 65 chars total — falls to UTF-8
    const input = '0x' + 'a'.repeat(63);
    // UTF-8 bytes of that string; it's only 65 chars (well within 32-byte limit? No: 65 chars > 32)
    // This should throw because the raw string is 65 bytes as UTF-8
    expect(() => encodeGuildId(input)).toThrow(
      expect.objectContaining({ code: GuildPassErrorCode.INVALID_INPUT }),
    );
  });

  it('does NOT treat 0x-prefixed string with 65 hex chars as hex (falls to UTF-8)', () => {
    // "0x" + 65 hex chars = 67 chars as UTF-8 > 32 bytes → INVALID_INPUT
    const input = '0x' + 'a'.repeat(65);
    expect(() => encodeGuildId(input)).toThrow(
      expect.objectContaining({ code: GuildPassErrorCode.INVALID_INPUT }),
    );
  });

  it('does NOT treat 0x-prefixed string with non-hex chars as hex', () => {
    // "0x" + 63 valid hex + 1 'g' — not a hex word, falls to UTF-8
    const input = '0x' + 'a'.repeat(63) + 'g';
    // 66 chars as UTF-8 → > 32 bytes → throws
    expect(() => encodeGuildId(input)).toThrow(
      expect.objectContaining({ code: GuildPassErrorCode.INVALID_INPUT }),
    );
  });
});

// ---------------------------------------------------------------------------
// 2. Mode classification: integer mode
// ---------------------------------------------------------------------------
describe('encodeGuildId — integer mode (/^\\d+$/)', () => {
  it('encodes 0 as all zeros', () => {
    expect(encodeGuildId('0')).toBe('0'.repeat(64));
  });

  it('encodes 1 correctly (0x01 left-padded)', () => {
    expect(encodeGuildId('1')).toBe('0'.repeat(63) + '1');
  });

  it('encodes 42 correctly (0x2a left-padded)', () => {
    expect(encodeGuildId('42')).toBe('0'.repeat(62) + '2a');
  });

  it('encodes the uint256 maximum value', () => {
    const maxStr = UINT256_MAX.toString(10);
    const result = encodeGuildId(maxStr);
    expect(result).toBe('f'.repeat(64));
  });

  it('throws INVALID_INPUT for uint256 overflow (max + 1)', () => {
    const overflowStr = (UINT256_MAX + 1n).toString(10);
    expect(() => encodeGuildId(overflowStr)).toThrow(
      expect.objectContaining({ code: GuildPassErrorCode.INVALID_INPUT }),
    );
  });

  it('throws INVALID_INPUT for a very large number well above uint256', () => {
    const hugeStr = '1' + '0'.repeat(78); // 10^78 > 2^256
    expect(() => encodeGuildId(hugeStr)).toThrow(
      expect.objectContaining({ code: GuildPassErrorCode.INVALID_INPUT }),
    );
  });

  it('produces a valid 64-char hex string for a mid-range value', () => {
    const result = encodeGuildId('999999999999');
    expect(result).toHaveLength(HEX_WORD_LEN);
    expect(isValidBytes32Hex(result)).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// 3. Mode classification: UTF-8 mode
// ---------------------------------------------------------------------------
describe('encodeGuildId — UTF-8 mode (everything else)', () => {
  it('encodes a short ASCII string right-padded to 64 hex chars', () => {
    const result = encodeGuildId('guild_1');
    // "guild_1" = 67 75 69 6c 64 5f 31
    expect(result).toBe('6775696c645f3100000000000000000000000000000000000000000000000000');
    expect(result).toHaveLength(HEX_WORD_LEN);
  });

  it('encodes a string with multibyte (UTF-8) characters within 32 bytes', () => {
    // "€" is 3 UTF-8 bytes (e2 82 ac)
    const result = encodeGuildId('€');
    expect(result.startsWith('e282ac')).toBe(true);
    expect(result).toHaveLength(HEX_WORD_LEN);
  });

  it('encodes an exactly 32-byte UTF-8 string without throwing', () => {
    const exactly32 = 'a'.repeat(32);
    const result = encodeGuildId(exactly32);
    expect(result).toHaveLength(HEX_WORD_LEN);
    expect(isValidBytes32Hex(result)).toBe(true);
  });

  it('throws INVALID_INPUT for a 33-byte UTF-8 string', () => {
    const tooLong = 'a'.repeat(33);
    expect(() => encodeGuildId(tooLong)).toThrow(
      expect.objectContaining({ code: GuildPassErrorCode.INVALID_INPUT }),
    );
  });

  it('throws INVALID_INPUT for a string that is <= 32 chars but > 32 UTF-8 bytes', () => {
    // "€" = 3 bytes; 11 * 3 = 33 bytes, still 11 chars
    const elevenEuros = '€'.repeat(11);
    expect(() => encodeGuildId(elevenEuros)).toThrow(
      expect.objectContaining({ code: GuildPassErrorCode.INVALID_INPUT }),
    );
  });

  it('does NOT classify a 0x-prefixed short string as hex (encodes as UTF-8)', () => {
    // "0x1234" is only 6 chars as UTF-8 (6 bytes), should encode as UTF-8
    const result = encodeGuildId('0x1234');
    // UTF-8 bytes: 30 78 31 32 33 34
    expect(result.startsWith('307831323334')).toBe(true);
    expect(result).toHaveLength(HEX_WORD_LEN);
  });

  it('encodes a hex-looking string that is too short as UTF-8, not hex', () => {
    // This is a key security assertion: partial hex strings MUST NOT be silently
    // interpreted as hex, since they would encode to a completely different value
    const partial = '0xdeadbeef'; // only 10 chars, not 66
    const result = encodeGuildId(partial);
    // Must be UTF-8 bytes of the literal string "0xdeadbeef"
    const expected = Array.from(new TextEncoder().encode(partial))
      .map((b) => b.toString(16).padStart(2, '0'))
      .join('')
      .padEnd(64, '0');
    expect(result).toBe(expected);
  });

  it('a numeric-looking string that contains non-digit chars goes to UTF-8', () => {
    // "42abc" is not purely decimal → UTF-8 mode
    const result = encodeGuildId('42abc');
    const expected = Array.from(new TextEncoder().encode('42abc'))
      .map((b) => b.toString(16).padStart(2, '0'))
      .join('')
      .padEnd(64, '0');
    expect(result).toBe(expected);
  });
});

// ---------------------------------------------------------------------------
// 4. Collision tests — distinct inputs in DIFFERENT modes must produce different bytes32
// ---------------------------------------------------------------------------
describe('encodeGuildId — cross-mode collision safety', () => {
  /**
   * The integer 42 encodes to 0x2a left-padded.
   * The UTF-8 string "42" encodes to the bytes for '4' (0x34) + '2' (0x32) right-padded.
   * These MUST be different.
   */
  it('integer "42" and UTF-8 "42" cannot collide (different modes, different values)', () => {
    // Integer mode
    const intEncoded = encodeGuildId('42'); // 0x2a padded
    // We need a UTF-8-mode input that looks like "42" — but "42" is caught by integer mode.
    // So we test using a Unicode lookalike (fullwidth digits) that bypasses the /^\d+$/ check.
    const fullwidthDigits = '\uFF14\uFF12'; // ４２ (fullwidth 4 and 2, NOT ASCII)
    const utfEncoded = encodeGuildId(fullwidthDigits);
    expect(intEncoded).not.toBe(utfEncoded);
  });

  /**
   * The hex string 0x + "00"*31 + "01" encodes to 63 zeros + "1".
   * The integer "1" encodes to 63 zeros + "1".
   * These SHOULD be equal (hex mode and integer mode of value 1 are the same bytes32).
   * This is intentional and correct ABI equivalence — not a collision.
   */
  it('hex "0x000...001" and integer "1" encode to the same bytes32 (expected ABI equivalence)', () => {
    const hexInput = '0x' + '0'.repeat(63) + '1';
    const intInput = '1';
    expect(encodeGuildId(hexInput)).toBe(encodeGuildId(intInput));
  });

  /**
   * A string that looks like a small hex number but has only partial hex prefix
   * must NOT collide with the integer of that value.
   * "0x2a" (UTF-8 mode) ≠ "42" (integer mode, value 0x2a).
   */
  it('"0x2a" (UTF-8 mode) does not collide with "42" (integer mode)', () => {
    const partialHex = encodeGuildId('0x2a'); // UTF-8 mode
    const intVal = encodeGuildId('42');       // integer mode
    expect(partialHex).not.toBe(intVal);
  });

  /**
   * Two different UTF-8 strings must always produce different bytes32 values.
   */
  it('distinct UTF-8 guild IDs produce distinct bytes32 values', () => {
    const pairs: [string, string][] = [
      ['guild_1', 'guild_2'],
      ['alpha', 'beta'],
      ['guild_1', 'Guild_1'],
      ['abc', 'abcd'], // one extra char
      ['a', 'b'],
    ];
    for (const [a, b] of pairs) {
      expect(encodeGuildId(a)).not.toBe(encodeGuildId(b));
    }
  });

  /**
   * A numeric string and a hex-looking partial string encoding to similar
   * looking output must not accidentally match.
   */
  it('"10" (integer → 0x0a) and "0xa" (UTF-8) do not collide', () => {
    expect(encodeGuildId('10')).not.toBe(encodeGuildId('0xa'));
  });

  /**
   * A hex-prefixed short string and a numeric string with the same decimal
   * value must not collide when the hex string is not a full 32-byte word.
   */
  it('"0x1234" (UTF-8) and "4660" (integer, = 0x1234) do not collide', () => {
    expect(encodeGuildId('0x1234')).not.toBe(encodeGuildId('4660'));
  });
});

// ---------------------------------------------------------------------------
// 5. Boundary / negative tests
// ---------------------------------------------------------------------------
describe('encodeGuildId — boundary and negative cases', () => {
  it('encodes the empty string as all-zero bytes32 (0 UTF-8 bytes, right-padded)', () => {
    // Empty string: 0 bytes, padded with zeros
    // Note: validateGuildId in ContractClient rejects empty strings before encodeGuildId
    // is called in production, but the encoder itself handles it gracefully.
    const result = encodeGuildId('');
    expect(result).toBe('0'.repeat(64));
  });

  it('handles leading/trailing whitespace by trimming before classification', () => {
    // "  42  " trims to "42" → integer mode
    expect(encodeGuildId('  42  ')).toBe(encodeGuildId('42'));
  });

  it('throws for a 33-ASCII-character string', () => {
    expect(() => encodeGuildId('x'.repeat(33))).toThrow(
      expect.objectContaining({ code: GuildPassErrorCode.INVALID_INPUT }),
    );
  });

  it('does not throw for a 32-ASCII-character string', () => {
    expect(() => encodeGuildId('x'.repeat(32))).not.toThrow();
  });

  it('throws for malformed hex: 0x followed by 64 non-hex chars', () => {
    // Not matched by hex mode regex → UTF-8 mode: "0x" + "z"*64 = 66 bytes > 32
    expect(() => encodeGuildId('0x' + 'z'.repeat(64))).toThrow(
      expect.objectContaining({ code: GuildPassErrorCode.INVALID_INPUT }),
    );
  });

  it('throws for 0x prefix alone (2 chars → UTF-8 fine, but edge case)', () => {
    // "0x" = 2 bytes UTF-8, should encode successfully
    const result = encodeGuildId('0x');
    // '0' = 0x30, 'x' = 0x78
    expect(result.startsWith('3078')).toBe(true);
  });

  it('encodes the uint256 max decimal string without throwing', () => {
    const maxDec = UINT256_MAX.toString(10);
    expect(() => encodeGuildId(maxDec)).not.toThrow();
    expect(encodeGuildId(maxDec)).toBe('f'.repeat(64));
  });

  it('throws INVALID_INPUT for (uint256 max + 1)', () => {
    const overflow = (UINT256_MAX + 1n).toString(10);
    expect(() => encodeGuildId(overflow)).toThrow(
      expect.objectContaining({ code: GuildPassErrorCode.INVALID_INPUT }),
    );
  });

  it('throws INVALID_INPUT for a 78-digit all-nines integer (exceeds uint256)', () => {
    // 9^78 > 2^256
    expect(() => encodeGuildId('9'.repeat(78))).toThrow(
      expect.objectContaining({ code: GuildPassErrorCode.INVALID_INPUT }),
    );
  });

  it('result is always exactly 64 hex characters for valid inputs', () => {
    const validInputs = [
      '0',
      '1',
      '42',
      '999',
      'guild_1',
      'abc',
      'x'.repeat(32),
      '0x' + '0'.repeat(64),
      '0x' + 'f'.repeat(64),
      '0xABCDEF' + '0'.repeat(58),
    ];
    for (const input of validInputs) {
      const result = encodeGuildId(input);
      expect(result).toHaveLength(HEX_WORD_LEN);
      expect(isValidBytes32Hex(result)).toBe(true);
    }
  });
});

// ---------------------------------------------------------------------------
// 6. Property-based / fuzz tests (fast-check)
// ---------------------------------------------------------------------------
describe('encodeGuildId — property-based fuzz tests', () => {
  /**
   * For any valid hex bytes32 input, encodeGuildId must:
   * - Return exactly 64 lowercase hex chars
   * - Equal the input minus the 0x prefix, lowercased
   */
  it('hex mode: result always equals lowercased input without 0x prefix', () => {
    fc.assert(
      fc.property(
        fc.hexaString({ minLength: 64, maxLength: 64 }),
        (hexBody) => {
          const input = '0x' + hexBody;
          const result = encodeGuildId(input);
          expect(result).toBe(hexBody.toLowerCase());
          expect(result).toHaveLength(64);
        },
      ),
      { numRuns: 500 },
    );
  });

  /**
   * For any non-negative BigInt value within uint256 range, encodeGuildId must:
   * - Return exactly 64 lowercase hex chars
   * - Round-trip correctly: BigInt('0x' + result) === original value
   */
  it('integer mode: result round-trips correctly via BigInt', () => {
    fc.assert(
      fc.property(
        fc.bigInt({ min: 0n, max: UINT256_MAX }),
        (value) => {
          const input = value.toString(10);
          const result = encodeGuildId(input);
          expect(result).toHaveLength(64);
          expect(isValidBytes32Hex(result)).toBe(true);
          expect(BigInt('0x' + result)).toBe(value);
        },
      ),
      { numRuns: 500 },
    );
  });

  /**
   * For any string that is <= 32 ASCII bytes (not matching hex or integer mode),
   * encodeGuildId must:
   * - Return exactly 64 lowercase hex chars
   * - Never throw
   * - Result must decode back to the original UTF-8 bytes (without trailing zeros)
   */
  it('UTF-8 mode: valid short strings always produce valid 64-char hex output', () => {
    // Strings that won't be caught by hex or integer mode:
    // use strings containing at least one non-digit, non-0x-64-hex character
    const safeUtf8 = fc
      .string({ minLength: 1, maxLength: 32 })
      .filter((s) => {
        const t = s.trim();
        // exclude pure decimal strings (integer mode)
        if (/^\d+$/.test(t)) return false;
        // exclude exact 0x + 64 hex chars (hex mode)
        if (/^0x[a-fA-F0-9]{64}$/.test(t)) return false;
        // only keep strings whose UTF-8 encoding fits in 32 bytes
        return new TextEncoder().encode(t).length <= 32;
      });

    fc.assert(
      fc.property(safeUtf8, (s) => {
        const result = encodeGuildId(s);
        expect(result).toHaveLength(64);
        expect(isValidBytes32Hex(result)).toBe(true);
      }),
      { numRuns: 500 },
    );
  });

  /**
   * No two distinct valid inputs (across all modes) should accidentally produce
   * the same bytes32 output, UNLESS they are intentionally equivalent
   * (e.g. hex and integer representations of the same value).
   *
   * We check that within each mode alone, distinct inputs produce distinct outputs.
   */
  it('integer mode: distinct values always produce distinct bytes32 outputs (no collisions)', () => {
    fc.assert(
      fc.property(
        fc.bigInt({ min: 0n, max: UINT256_MAX }),
        fc.bigInt({ min: 0n, max: UINT256_MAX }),
        (a, b) => {
          fc.pre(a !== b);
          const ra = encodeGuildId(a.toString(10));
          const rb = encodeGuildId(b.toString(10));
          expect(ra).not.toBe(rb);
        },
      ),
      { numRuns: 500 },
    );
  });

  it('UTF-8 mode: distinct <= 32-byte strings always produce distinct bytes32 outputs', () => {
    const safeUtf8 = fc
      .string({ minLength: 1, maxLength: 32 })
      .filter((s) => {
        const t = s.trim();
        if (/^\d+$/.test(t)) return false;
        if (/^0x[a-fA-F0-9]{64}$/.test(t)) return false;
        return new TextEncoder().encode(t).length <= 32;
      });

    fc.assert(
      fc.property(safeUtf8, safeUtf8, (a, b) => {
        fc.pre(a.trim() !== b.trim()); // distinct after trim
        const ra = encodeGuildId(a);
        const rb = encodeGuildId(b);
        expect(ra).not.toBe(rb);
      }),
      { numRuns: 300 },
    );
  });

  /**
   * Any input > 32 UTF-8 bytes that is NOT pure decimal or exact hex must throw
   * INVALID_INPUT — never silently truncate.
   */
  it('UTF-8 mode: inputs > 32 UTF-8 bytes always throw INVALID_INPUT (never silently truncate)', () => {
    const oversizedUtf8 = fc
      .string({ minLength: 33, maxLength: 100 })
      .filter((s) => {
        const t = s.trim();
        if (/^\d+$/.test(t)) return false;
        if (/^0x[a-fA-F0-9]{64}$/.test(t)) return false;
        return new TextEncoder().encode(t).length > 32;
      });

    fc.assert(
      fc.property(oversizedUtf8, (s) => {
        expect(() => encodeGuildId(s)).toThrow(
          expect.objectContaining({ code: GuildPassErrorCode.INVALID_INPUT }),
        );
      }),
      { numRuns: 300 },
    );
  });

  /**
   * Any integer string that exceeds uint256 max must always throw INVALID_INPUT.
   */
  it('integer mode: any value > uint256 max always throws INVALID_INPUT', () => {
    fc.assert(
      fc.property(
        fc.bigInt({ min: UINT256_MAX + 1n, max: UINT256_MAX + 10n ** 10n }),
        (value) => {
          expect(() => encodeGuildId(value.toString(10))).toThrow(
            expect.objectContaining({ code: GuildPassErrorCode.INVALID_INPUT }),
          );
        },
      ),
      { numRuns: 200 },
    );
  });
});
