/**
 * SIWE attack-scenario tests.
 *
 * Tests specific security properties of the SIWE signature verification flow
 * that go beyond basic functional correctness:
 *
 *   1. EIP-2 malleability rejection at the SIWE layer (F-03)
 *   2. Malleated signatures produce different verification results
 *   3. Nonce modulo bias is statistically negligible (F-07)
 *   4. Null/undefined/malformed inputs produce safe results, not throws
 *   5. publicKeyToAddress null return is handled in verifySiweSignature
 *   6. Cross-boundary robustness (extremely long messages, edge signatures)
 */

import { describe, it, expect } from 'vitest';
import {
  verifySiweSignature,
  generateSiweNonce,
  formatSiweMessage,
  parseSiweMessage,
  type SiweMessage,
} from '../src/siwe';
import { GuildPassErrorCode } from '../src/errors/errorCodes';

const TEST_ADDRESS = '0xf39Fd6e51aad88F6F4ce6aB8827279cffFb92266';

const BASE_MSG: SiweMessage = {
  domain: 'example.com',
  address: TEST_ADDRESS,
  uri: 'https://example.com',
  version: '1',
  chainId: 1,
  nonce: 'abc12345',
  issuedAt: '2024-01-01T00:00:00.000Z',
};

// ---------------------------------------------------------------------------
// 1. EIP-2 malleability rejection at the SIWE layer (F-03)
// ---------------------------------------------------------------------------

describe('SIWE EIP-2 malleability rejection', () => {
  it('rejects a signature with s in the upper half of N', () => {
    const rawMessage = formatSiweMessage(BASE_MSG);
    const genuineSig =
      '0x82790bc51f261e6461cb1a3baeed8494cd796093c93db2b564c2260535203c612ca06a4cf8ca39e15452d8fbd24000c6d752a45c5c46ae1ced3c641b5370c1901b';

    const sigHex = genuineSig.slice(2);
    const rHex = sigHex.slice(0, 64);
    const sHex = sigHex.slice(64, 128);
    const vHex = sigHex.slice(128, 130);

    const s = BigInt('0x' + sHex);
    const v = parseInt(vHex, 16);

    const N = BigInt('0xFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFEBAAEDCE6AF48A03BBFD25E8CD0364141');
    const malleatedS = N - s;
    const malleatedV = v === 27 ? 28 : v === 28 ? 27 : (v ^ 1) + 27;

    const malleatedSig =
      '0x' + rHex + malleatedS.toString(16).padStart(64, '0') + malleatedV.toString(16).padStart(2, '0');

    const genuineResult = verifySiweSignature({ message: rawMessage, signature: genuineSig });
    expect(genuineResult.success).toBe(true);

    const malleatedResult = verifySiweSignature({ message: rawMessage, signature: malleatedSig });
    expect(malleatedResult.success).toBe(false);
    expect(malleatedResult.code).toBe(GuildPassErrorCode.SIWE_INVALID_SIGNATURE);
    expect(malleatedResult.error).toMatch(/EIP-2|malleable|s-value/i);
  });

  it('rejects malleated signature for a message with statement', () => {
    const msg: SiweMessage = { ...BASE_MSG, statement: 'I accept the Terms of Service.' };
    const rawMessage = formatSiweMessage(msg);
    const genuineSig =
      '0x63acbec0f3ada026872a68d0f3d95f8962091ede8a58f9ddf001d9aedb80c89c361976f45455abd987a43a52fbb0c773ca8de7b650cdd8f49ed492f6e332a4431b';

    const sigHex = genuineSig.slice(2);
    const rHex = sigHex.slice(0, 64);
    const sHex = sigHex.slice(64, 128);
    const vHex = sigHex.slice(128, 130);

    const s = BigInt('0x' + sHex);
    const v = parseInt(vHex, 16);

    const N = BigInt('0xFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFEBAAEDCE6AF48A03BBFD25E8CD0364141');
    const malleatedS = N - s;
    const malleatedV = v === 27 ? 28 : v === 28 ? 27 : (v ^ 1) + 27;

    const malleatedSig =
      '0x' + rHex + malleatedS.toString(16).padStart(64, '0') + malleatedV.toString(16).padStart(2, '0');

    const genuineResult = verifySiweSignature({ message: rawMessage, signature: genuineSig });
    expect(genuineResult.success).toBe(true);

    const malleatedResult = verifySiweSignature({ message: rawMessage, signature: malleatedSig });
    expect(malleatedResult.success).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// 2. Nonce uniform distribution (F-07)
// ---------------------------------------------------------------------------

describe('generateSiweNonce distribution', () => {
  it('generates nonces with correct format', () => {
    for (let i = 0; i < 100; i++) {
      const nonce = generateSiweNonce();
      expect(nonce).toMatch(/^[A-Za-z0-9]{16}$/);
    }
  });

  it('generates unique values', () => {
    const nonces = new Set(Array.from({ length: 1000 }, () => generateSiweNonce()));
    expect(nonces.size).toBe(1000);
  });

  it('character frequency is roughly uniform (chi-squared test)', () => {
    const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';
    const counts: Record<string, number> = {};
    for (const c of chars) counts[c] = 0;

    const N = 10000;
    for (let i = 0; i < N; i++) {
      const nonce = generateSiweNonce();
      for (const c of nonce) {
        counts[c] = (counts[c] || 0) + 1;
      }
    }

    const total = N * 16;
    const expected = total / chars.length;

    let chiSq = 0;
    for (const c of chars) {
      const observed = counts[c];
      const diff = observed - expected;
      chiSq += (diff * diff) / expected;
    }

    // 61 degrees of freedom, α=0.01 critical value ≈ 88.0
    // Generous threshold of 150 to account for sampling noise
    expect(chiSq).toBeLessThan(150);
  });
});

// ---------------------------------------------------------------------------
// 3. publicKeyToAddress null handling (F-09 impact on SIWE)
// ---------------------------------------------------------------------------

describe('verifySiweSignature handles invalid recovered keys', () => {
  it('returns SIWE_INVALID_SIGNATURE for a bogus signature', () => {
    const result = verifySiweSignature({
      message: formatSiweMessage(BASE_MSG),
      signature: '0x' + 'a'.repeat(130),
    });
    expect(result.success).toBe(false);
    expect(result.code).toBe(GuildPassErrorCode.SIWE_INVALID_SIGNATURE);
  });
});

// ---------------------------------------------------------------------------
// 4. Null/undefined/malformed input safety
// ---------------------------------------------------------------------------

describe('verifySiweSignature input safety', () => {
  it('handles null message gracefully', () => {
    const result = verifySiweSignature({ message: null as any, signature: '0x' + 'a'.repeat(130) });
    expect(result.success).toBe(false);
    expect(result.error).toBeDefined();
  });

  it('handles undefined message gracefully', () => {
    const result = verifySiweSignature({ message: undefined as any, signature: '0x' + 'a'.repeat(130) });
    expect(result.success).toBe(false);
    expect(result.error).toBeDefined();
  });

  it('handles null signature gracefully', () => {
    const result = verifySiweSignature({ message: formatSiweMessage(BASE_MSG), signature: null as any });
    expect(result.success).toBe(false);
    expect(result.code).toBe(GuildPassErrorCode.SIWE_INVALID_SIGNATURE);
  });

  it('handles undefined signature gracefully', () => {
    const result = verifySiweSignature({ message: formatSiweMessage(BASE_MSG), signature: undefined as any });
    expect(result.success).toBe(false);
    expect(result.code).toBe(GuildPassErrorCode.SIWE_INVALID_SIGNATURE);
  });

  it('handles empty message gracefully', () => {
    const result = verifySiweSignature({ message: '', signature: '0x' + 'a'.repeat(130) });
    expect(result.success).toBe(false);
    expect(result.code).toBe(GuildPassErrorCode.SIWE_INVALID_MESSAGE);
  });

  it('handles empty signature gracefully', () => {
    const result = verifySiweSignature({ message: formatSiweMessage(BASE_MSG), signature: '' });
    expect(result.success).toBe(false);
    expect(result.code).toBe(GuildPassErrorCode.SIWE_INVALID_SIGNATURE);
  });

  it('handles numeric types gracefully', () => {
    const result = verifySiweSignature({ message: 42 as any, signature: '0x' + 'a'.repeat(130) });
    expect(result.success).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// 5. Boundary signature edge cases
// ---------------------------------------------------------------------------

describe('signature boundary edge cases', () => {
  it('rejects signature with v=26 (out of range)', () => {
    const sig = '0x' + 'a'.repeat(64) + 'b'.repeat(64) + '1a';
    const result = verifySiweSignature({ message: formatSiweMessage(BASE_MSG), signature: sig });
    expect(result.success).toBe(false);
  });

  it('rejects signature with v=29 (out of range)', () => {
    const sig = '0x' + 'a'.repeat(64) + 'b'.repeat(64) + '1d';
    const result = verifySiweSignature({ message: formatSiweMessage(BASE_MSG), signature: sig });
    expect(result.success).toBe(false);
  });

  it('rejects signature with v=0 (raw, no 27 offset)', () => {
    const sig = '0x' + 'a'.repeat(64) + 'b'.repeat(64) + '00';
    const result = verifySiweSignature({ message: formatSiweMessage(BASE_MSG), signature: sig });
    expect(result.success).toBe(false);
  });

  it('rejects signature with v=1 (raw, no 27 offset)', () => {
    const sig = '0x' + 'a'.repeat(64) + 'b'.repeat(64) + '01';
    const result = verifySiweSignature({ message: formatSiweMessage(BASE_MSG), signature: sig });
    expect(result.success).toBe(false);
  });

  it('rejects signature with r=0', () => {
    const sig = '0x' + '0'.repeat(64) + 'b'.repeat(64) + '1b';
    const result = verifySiweSignature({ message: formatSiweMessage(BASE_MSG), signature: sig });
    expect(result.success).toBe(false);
  });

  it('rejects signature with s=0', () => {
    const sig = '0x' + 'a'.repeat(64) + '0'.repeat(64) + '1b';
    const result = verifySiweSignature({ message: formatSiweMessage(BASE_MSG), signature: sig });
    expect(result.success).toBe(false);
  });

  it('rejects signature with r == N (curve order)', () => {
    const N = 'fffffffffffffffffffffffffffffffebaaedce6af48a03bbfd25e8cd0364141';
    const sig = '0x' + N + 'b'.repeat(64) + '1b';
    const result = verifySiweSignature({ message: formatSiweMessage(BASE_MSG), signature: sig });
    expect(result.success).toBe(false);
  });

  it('rejects signature with s == N (curve order)', () => {
    const N = 'fffffffffffffffffffffffffffffffebaaedce6af48a03bbfd25e8cd0364141';
    const sig = '0x' + 'a'.repeat(64) + N + '1b';
    const result = verifySiweSignature({ message: formatSiweMessage(BASE_MSG), signature: sig });
    expect(result.success).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// 6. Cross-boundary robustness
// ---------------------------------------------------------------------------

describe('verifySiweSignature cross-boundary robustness', () => {
  it('handles message just under the maximum length', () => {
    const longStatement = 'x'.repeat(9000);
    const msg: SiweMessage = { ...BASE_MSG, statement: longStatement };
    const rawMessage = formatSiweMessage(msg);
    expect(rawMessage.length).toBeLessThan(10240);

    const result = verifySiweSignature({ message: rawMessage, signature: '0x' + 'a'.repeat(130) });
    expect(result.success).toBe(false);
    expect(result.code).toBeDefined();
  });

  it('handles messages with unusual but valid domains', () => {
    const domains = ['localhost', 'sub.domain.example.com', 'a.b.c.d.e.example.com'];
    for (const domain of domains) {
      const msg: SiweMessage = { ...BASE_MSG, domain };
      const raw = formatSiweMessage(msg);
      const parsed = parseSiweMessage(raw);
      expect(parsed.success).toBe(true);
      expect(parsed.data?.domain).toBe(domain);
    }
  });
});
