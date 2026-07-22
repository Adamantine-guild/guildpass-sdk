import { describe, it, expect } from 'vitest';
import { constantTimeEqual } from '../src/utils/constantTime';

describe('constantTimeEqual', () => {
  it('returns true for identical strings', () => {
    expect(constantTimeEqual('abc', 'abc')).toBe(true);
    expect(constantTimeEqual('', '')).toBe(true);
    expect(
      constantTimeEqual(
        '0xf39fd6e51aad88f6f4ce6ab8827279cfffb92266',
        '0xf39fd6e51aad88f6f4ce6ab8827279cfffb92266',
      ),
    ).toBe(true);
  });

  it('returns false for strings that differ', () => {
    expect(constantTimeEqual('abc', 'abd')).toBe(false);
    expect(constantTimeEqual('abc', 'xbc')).toBe(false);
    expect(constantTimeEqual('abc', 'abx')).toBe(false);
  });

  it('returns false for different lengths', () => {
    expect(constantTimeEqual('abc', 'abcd')).toBe(false);
    expect(constantTimeEqual('abcd', 'abc')).toBe(false);
    expect(constantTimeEqual('', 'a')).toBe(false);
  });

  it('handles multi-byte UTF-8 correctly', () => {
    expect(constantTimeEqual('café', 'café')).toBe(true);
    expect(constantTimeEqual('café', 'cafe')).toBe(false);
    expect(constantTimeEqual('🔐', '🔐')).toBe(true);
  });

  it('is case-sensitive (callers normalize before comparing)', () => {
    expect(constantTimeEqual('ABC', 'abc')).toBe(false);
  });

  it('does not early-exit on position of first difference (best-effort timing)', () => {
    const len = 4096;
    const base = 'a'.repeat(len);
    const diffFirst = 'b' + 'a'.repeat(len - 1);
    const diffLast = 'a'.repeat(len - 1) + 'b';
    const iterations = 2000;

    const timeIt = (x: string, y: string) => {
      const start = performance.now();
      for (let i = 0; i < iterations; i++) constantTimeEqual(x, y);
      return performance.now() - start;
    };

    timeIt(base, diffFirst);
    timeIt(base, diffLast);

    const tFirst = timeIt(base, diffFirst);
    const tLast = timeIt(base, diffLast);

    const ratio = Math.max(tFirst, tLast) / Math.min(tFirst, tLast);
    expect(ratio).toBeLessThan(5);
  });
});
