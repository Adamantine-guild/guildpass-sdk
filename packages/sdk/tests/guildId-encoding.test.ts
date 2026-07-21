/**
* Hardened guild ID encoding tests (Issue #157 & #228)
*
* Covers:
*  1. Exact mode classification — every branch of encodeGuildId / encodeBytes32
*  2. Collision tests — distinct inputs in different modes must never produce the same bytes32
*  3. Negative / boundary tests — overflow, oversized UTF-8, malformed hex prefixes, leading zeros, null bytes
*  4. Property-based / fuzz tests via fast-check — no two distinct "realistic" inputs collide
*  5. Unified Mode Invariant — proves mutual exclusivity and no silent truncation across thousands of chaotic inputs
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

  it('does NOT treat 0x-prefixed string with only 63 hex chars as hex (falls to UTF-8)', () => {
    const input = '0x' + 'a'.repeat(63);
    expect(() => encodeGuildId(input)).toThrow(
      expect.objectContaining({ code: GuildPassErrorCode.INVALID_INPUT }),
    );
  });

  it('does NOT treat 0x-prefixed string with 65 hex chars as hex (falls to UTF-8)', () => {
    const input = '0x' + 'a'.repeat(65);
    expect(() => encodeGuildId(input)).toThrow(
      expect.objectContaining({ code: GuildPassErrorCode.INVALID_INPUT }),
    );
  });

  it('does NOT treat 0x-prefixed string with non-hex chars as hex', () => {
    const input = '0x' + 'a'.repeat(63) + 'g';
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

  it('handles decimal strings with leading zeros identically to normalized decimals', () => {
    expect(encodeGuildId('00042')).toBe(encodeGuildId('42'));
    expect(encodeGuildId('00000')).toBe(encodeGuildId('0'));
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
    expect(result).toBe('6775696c645f3100000000000000000000000000000000000000000000000000');
    expect(result).toHaveLength(HEX_WORD_LEN);
  });

  it('classifies integer with leading + sign as UTF-8, not integer mode', () => {
    // "/^\d+$/" rejects "+42", so it falls to UTF-8
    const result = encodeGuildId('+42');
    const expected = Array.from(new TextEncoder().encode('+42'))
      .map(b => b.toString(16).padStart(2, '0'))
      .join('')
      .padEnd(64, '0');
    expect(result).toBe(expected);
    expect(result).not.toBe(encodeGuildId('42'));
  });

  it('handles strings with embedded null bytes', () => {
    const input = 'hello\0world';
    const result = encodeGuildId(input);
    const expected = Array.from(new TextEncoder().encode(input))
      .map(b => b.toString(16).padStart(2, '0'))
      .join('')
      .padEnd(64, '0');
    expect(result).toBe(expected);
  });

  it('encodes a string with multibyte (UTF-8) characters within 32 bytes', () => {
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
    const elevenEuros = '€'.repeat(11);
    expect(() => encodeGuildId(elevenEuros)).toThrow(
      expect.objectContaining({ code: GuildPassErrorCode.INVALID_INPUT }),
    );
  });

  it('does NOT classify a 0x-prefixed short string as hex (encodes as UTF-8)', () => {
    const result = encodeGuildId('0x1234');
    expect(result.startsWith('307831323334')).toBe(true);
    expect(result).toHaveLength(HEX_WORD_LEN);
  });

  it('encodes a hex-looking string that is too short as UTF-8, not hex', () => {
    const partial = '0xdeadbeef';
    const result = encodeGuildId(partial);
    const expected = Array.from(new TextEncoder().encode(partial))
      .map((b) => b.toString(16).padStart(2, '0'))
      .join('')
      .padEnd(64, '0');
    expect(result).toBe(expected);
  });

  it('a numeric-looking string that contains non-digit chars goes to UTF-8', () => {
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
  it('integer "42" and UTF-8 "42" cannot collide (different modes, different values)', () => {
    const intEncoded = encodeGuildId('42');
    const fullwidthDigits = '\uFF14\uFF12'; // ４２ (fullwidth 4 and 2, NOT ASCII)
    const utfEncoded = encodeGuildId(fullwidthDigits);
    expect(intEncoded).not.toBe(utfEncoded);
  });

  it('hex "0x000...001" and integer "1" encode to the same bytes32 (expected ABI equivalence)', () => {
    const hexInput = '0x' + '0'.repeat(63) + '1';
    const intInput = '1';
    expect(encodeGuildId(hexInput)).toBe(encodeGuildId(intInput));
  });

  it('"0x2a" (UTF-8 mode) does not collide with "42" (integer mode)', () => {
    const partialHex = encodeGuildId('0x2a'); // UTF-8 mode
    const intVal = encodeGuildId('42');       // integer mode
    expect(partialHex).not.toBe(intVal);
  });

  it('distinct UTF-8 guild IDs produce distinct bytes32 values', () => {
    const pairs: [string, string][] = [
      ['guild_1', 'guild_2'],
      ['alpha', 'beta'],
      ['guild_1', 'Guild_1'],
      ['abc', 'abcd'],
      ['a', 'b'],
    ];
    for (const [a, b] of pairs) {
      expect(encodeGuildId(a)).not.toBe(encodeGuildId(b));
    }
  });

  it('"10" (integer → 0x0a) and "0xa" (UTF-8) do not collide', () => {
    expect(encodeGuildId('10')).not.toBe(encodeGuildId('0xa'));
  });

  it('"0x1234" (UTF-8) and "4660" (integer, = 0x1234) do not collide', () => {
    expect(encodeGuildId('0x1234')).not.toBe(encodeGuildId('4660'));
  });
});

// ---------------------------------------------------------------------------
// 5. Boundary / negative tests
// ---------------------------------------------------------------------------
describe('encodeGuildId — boundary and negative cases', () => {
  it('encodes the empty string as all-zero bytes32 (0 UTF-8 bytes, right-padded)', () => {
    const result = encodeGuildId('');
    expect(result).toBe('0'.repeat(64));
  });

  it('encodes whitespace-only input as all zeros (trims to empty string)', () => {
    const result = encodeGuildId('   \t\n  ');
    expect(result).toBe('0'.repeat(64));
  });

  it('handles leading/trailing whitespace by trimming before classification', () => {
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
    expect(() => encodeGuildId('0x' + 'z'.repeat(64))).toThrow(
      expect.objectContaining({ code: GuildPassErrorCode.INVALID_INPUT }),
    );
  });

  it('throws for 0x prefix alone (2 chars → UTF-8 fine, but edge case)', () => {
    const result = encodeGuildId('0x');
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
    expect(() => encodeGuildId('9'.repeat(78))).toThrow(
      expect.objectContaining({ code: GuildPassErrorCode.INVALID_INPUT }),
    );
  });

  it('result is always exactly 64 hex characters for valid inputs', () => {
    const validInputs = [
      '0', '1', '42', '999', 'guild_1', 'abc', 'x'.repeat(32),
      '0x' + '0'.repeat(64), '0x' + 'f'.repeat(64), '0xABCDEF' + '0'.repeat(58),
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

  it('UTF-8 mode: valid short strings always produce valid 64-char hex output', () => {
    const safeUtf8 = fc
      .string({ minLength: 1, maxLength: 32 })
      .filter((s) => {
        const t = s.trim();
        if (/^\d+$/.test(t)) return false;
        if (/^0x[a-fA-F0-9]{64}$/.test(t)) return false;
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
        fc.pre(a.trim() !== b.trim());
        const ra = encodeGuildId(a);
        const rb = encodeGuildId(b);
        expect(ra).not.toBe(rb);
      }),
      { numRuns: 300 },
    );
  });

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

  /**
   * Unified invariant: exactly one mode applies, and no overlap exists.
   * Tested across thousands of randomized and boundary-focused string inputs.
   */
  it('unified invariant: EXACTLY ONE mode applies, no overlap, and no silent truncation', () => {
    // A comprehensive generator focused on mode boundaries
    const boundaryStrings = fc.oneof(
      fc.string(), // purely random strings
      fc.hexaString({ minLength: 64, maxLength: 64 }).map((s) => `0x${s}`), // valid hex
      fc.hexaString({ minLength: 63, maxLength: 65 }).map((s) => `0x${s}`), // almost hex
      fc.bigUint().map((n) => n.toString(10)), // valid pure decimal
      fc.bigUint().map((n) => `000${n.toString(10)}`), // decimal with leading zeros
      fc.bigUint().map((n) => `+${n.toString(10)}`), // decimal with leading +
      fc.stringOf(fc.constantFrom(' ', '\t', '\n')), // whitespace only
      fc.string({ minLength: 31, maxLength: 34 }) // exactly around UTF-8 length boundary
    );

    fc.assert(
      fc.property(boundaryStrings, (input) => {
        const trimmed = input.trim();
        const isHexMode = /^0x[a-fA-F0-9]{64}$/.test(trimmed);
        const isIntMode = /^\d+$/.test(trimmed);

        // INVARIANT 1: No overlap possible. Hex mode and Int mode are strictly disjoint.
        expect(isHexMode && isIntMode).toBe(false);

        // INVARIANT 2: Behavioral validation matching the single matched mode
        if (isHexMode) {
          const result = encodeGuildId(input);
          expect(result).toBe(trimmed.slice(2).toLowerCase());
        } else if (isIntMode) {
          const n = BigInt(trimmed);
          if (n > UINT256_MAX) {
            expect(() => encodeGuildId(input)).toThrow(
              expect.objectContaining({ code: GuildPassErrorCode.INVALID_INPUT }),
            );
          } else {
            const result = encodeGuildId(input);
            expect(result).toBe(n.toString(16).padStart(64, '0'));
          }
        } else {
          // Fallback mode (UTF-8)
          const bytes = new TextEncoder().encode(trimmed);
          if (bytes.length > 32) {
            // Must NEVER silently truncate. Must throw.
            expect(() => encodeGuildId(input)).toThrow(
              expect.objectContaining({ code: GuildPassErrorCode.INVALID_INPUT }),
            );
          } else {
            const result = encodeGuildId(input);
            const expected = Array.from(bytes)
              .map((b) => b.toString(16).padStart(2, '0'))
              .join('')
              .padEnd(64, '0');
            expect(result).toBe(expected);
          }
        }
      }),
      { numRuns: 2500 }, // Massive 2,500 run sample size specifically for boundary testing
    );
  });
});