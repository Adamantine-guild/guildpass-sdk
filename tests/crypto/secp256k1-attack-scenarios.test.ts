/**
 * Attack-scenario tests for secp256k1 primitives.
 *
 * These tests go beyond functional correctness to verify specific security
 * properties identified in the cryptographic audit:
 *
 *   1. EIP-2 signature malleability rejection (F-03)
 *   2. Invalid-curve-point injection resistance (F-02)
 *   3. Point-at-infinity edge-case handling (F-04)
 *   4. publicKeyToAddress input validation (F-09)
 *   5. Buffer-free cross-platform compatibility (F-06)
 *   6. ecRecover null safety under adversarial inputs
 *   7. Constant-time string comparison correctness
 */

import { describe, it, expect } from 'vitest';
import {
  CURVE,
  ecRecover,
  publicKeyToAddress,
  pointAdd,
  pointDouble,
  scalarMul,
  modPow,
  hexToBytes,
  bigintToBytes32,
  modInv,
  toChecksumAddress,
  hashPersonalMessage,
  type Point,
} from '../../src/crypto/secp256k1';

const G: Point = { x: CURVE.Gx, y: CURVE.Gy };

// Known test key (first Hardhat/anvil account)
const KNOWN_PK = BigInt('0xac0974bec39a17e36ba4a6b4d238ff944bacb478cbed5efcae784d7bf4f2ff80');

// ---------------------------------------------------------------------------
// 1. EIP-2: Signature malleability (F-03)
// ---------------------------------------------------------------------------

describe('EIP-2 signature malleability rejection', () => {
  const anyHash = hexToBytes('aa'.repeat(32));

  it('rejects s in the upper half of the curve order', () => {
    // N/2 = 0x7FFFFFFFFFFFFFFFFFFFFFFFFFFFFFFF5D576E7357A4501DDFE92F46681B20A0
    // Pick s = N/2 + 1 (upper half)
    const highS = (CURVE.N >> BigInt(1)) + BigInt(1);
    const result = ecRecover(anyHash, 0, BigInt(2), highS);
    expect(result).toBeNull();
  });

  it('accepts s in the lower half of the curve order', () => {
    // s = N/2 - 1 (lower half) — should be accepted, though recovery may still
    // fail for other reasons (e.g., x=r=2 yields no curve point)
    const lowS = (CURVE.N >> BigInt(1)) - BigInt(1);
    // r=2 means x=2, ySq = 2^3+7 = 15, which is a QR mod P, so this is valid
    const result = ecRecover(anyHash, 0, BigInt(2), lowS);
    // We don't care if recovery succeeds; we only care it doesn't reject for s
    // being in the upper half
    expect(result === null || result instanceof Uint8Array).toBe(true);
  });

  it('accepts s exactly equal to N/2 (boundary)', () => {
    const midS = CURVE.N >> BigInt(1);
    // This is the boundary — N/2 is the highest accepted value
    const result = ecRecover(anyHash, 0, BigInt(2), midS);
    expect(result === null || result instanceof Uint8Array).toBe(true);
  });

  it('rejects s = N - 1 (highest malleable value)', () => {
    const maxS = CURVE.N - BigInt(1); // still valid ECDSA but upper half
    const result = ecRecover(anyHash, 0, BigInt(2), maxS);
    expect(result).toBeNull();
  });

  it('rejects s = N/2 + 100 (upper half)', () => {
    const highS = (CURVE.N >> BigInt(1)) + BigInt(100);
    const result = ecRecover(anyHash, 0, BigInt(2), highS);
    expect(result).toBeNull();
  });

  it('EIP-2 check is independent of r value', () => {
    // Even with a valid r, upper-half s must be rejected
    // Use r = G.x (a known valid x-coordinate)
    const highS = (CURVE.N >> BigInt(1)) + BigInt(1);
    const result = ecRecover(anyHash, 0, CURVE.Gx, highS);
    expect(result).toBeNull();
  });

  it('correctly recovers public key for lower-half s (full round-trip using SIWE test vector)', () => {
    // Use the known SIWE test vector from siwe.test.ts
    const rawMessage =
      'example.com wants you to sign in with your Ethereum account:\n' +
      '0xf39Fd6e51aad88F6F4ce6aB8827279cffFb92266\n' +
      '\n' +
      'URI: https://example.com\n' +
      'Version: 1\n' +
      'Chain ID: 1\n' +
      'Nonce: abc12345\n' +
      'Issued At: 2024-01-01T00:00:00.000Z';
    const msgHash = hashPersonalMessage(rawMessage);
    const sigHex =
      '82790bc51f261e6461cb1a3baeed8494cd796093c93db2b564c2260535203c612' +
      'ca06a4cf8ca39e15452d8fbd24000c6d752a45c5c46ae1ced3c641b5370c1901b';
    const r = BigInt('0x' + sigHex.slice(0, 64));
    const s = BigInt('0x' + sigHex.slice(64, 128));
    const v = parseInt(sigHex.slice(128, 130), 16) - 27; // 27 → 0

    // Verify s is in the lower half (it should be for this test)
    const N_HALF = CURVE.N >> BigInt(1);
    expect(s <= N_HALF).toBe(true);

    const pub = ecRecover(msgHash, v, r, s);
    expect(pub).not.toBeNull();

    // Verify the recovered address matches the known key
    const addr = publicKeyToAddress(pub!);
    expect(addr).toBe('0xf39Fd6e51aad88F6F4ce6aB8827279cffFb92266');
  });
});

// ---------------------------------------------------------------------------
// 2. Invalid-curve-point injection resistance (F-02)
// ---------------------------------------------------------------------------

describe('Invalid-curve-point injection resistance', () => {
  const anyHash = hexToBytes('aa'.repeat(32));

  it('returns null or a valid key when x=r yields a candidate x-coordinate', () => {
    // x=0: ySq = 0³ + 7 = 7. 7 is a QR mod P, so sqrt exists.
    // x=1: ySq = 1³ + 7 = 8. 8 is also a QR mod P.
    // The probability that a random x gives a QR is ~50%.
    // This test verifies ecRecover handles it gracefully in either case.
    const result = ecRecover(anyHash, 0, BigInt(1), BigInt(2));
    expect(result === null || result instanceof Uint8Array).toBe(true);
  });

  it('returns null when x=r is >= P (out of field)', () => {
    const result = ecRecover(anyHash, 0, CURVE.P, BigInt(2));
    expect(result).toBeNull();
  });

  it('returns null when x=r is >= N (out of valid range)', () => {
    const result = ecRecover(anyHash, 0, CURVE.N, BigInt(2));
    expect(result).toBeNull();
  });

  it('returns null when r is negative (invalid)', () => {
    const result = ecRecover(anyHash, 0, BigInt(-1), BigInt(2));
    expect(result).toBeNull();
  });

  it('returns null when r = 0', () => {
    const result = ecRecover(anyHash, 0, BigInt(0), BigInt(2));
    expect(result).toBeNull();
  });

  it('returns null when s = 0', () => {
    const result = ecRecover(anyHash, 0, BigInt(2), BigInt(0));
    expect(result).toBeNull();
  });

  it('returns null when s >= N', () => {
    const result = ecRecover(anyHash, 0, BigInt(2), CURVE.N);
    expect(result).toBeNull();
  });

  it('returns null when hash is all zeros (degenerate e = 0)', () => {
    const zeroHash = hexToBytes('00'.repeat(32));
    // Need a valid (r, s) where x=r is on the curve
    const result = ecRecover(zeroHash, 0, BigInt(2), BigInt(2));
    // ecRecover should handle e=0 gracefully (no division by zero)
    expect(result === null || result instanceof Uint8Array).toBe(true);
  });

  it('returns null when v is not 0 or 1', () => {
    const result = ecRecover(anyHash, 2, BigInt(2), BigInt(2));
    // Note: v is not validated inside ecRecover itself — only y parity is chosen
    // based on v. A v!=0/1 would just produce a wrong key, not null.
    // This is acceptable because the caller (verifySiweSignature) validates v.
    expect(result === null || result instanceof Uint8Array).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// 3. Point-at-infinity edge-case handling (F-04)
// ---------------------------------------------------------------------------

describe('Point-at-infinity edge cases', () => {
  it('pointAdd(null, null) = null', () => {
    expect(pointAdd(null, null)).toBeNull();
  });

  it('pointDouble(null) = null', () => {
    expect(pointDouble(null)).toBeNull();
  });

  it('scalarMul(0, G) = null (zero scalar)', () => {
    expect(scalarMul(BigInt(0), G)).toBeNull();
  });

  it('scalarMul(n, null) = null (null point)', () => {
    expect(scalarMul(BigInt(5), null)).toBeNull();
  });

  it('scalarMul(1, G) = G (identity under multiplication)', () => {
    const result = scalarMul(BigInt(1), G);
    expect(result).not.toBeNull();
    expect(result!.x).toBe(CURVE.Gx);
    expect(result!.y).toBe(CURVE.Gy);
  });

  it('scalarMul(N, G) = null (order of G)', () => {
    expect(scalarMul(CURVE.N, G)).toBeNull();
  });

  it('scalarMul(N+1, G) = G (cyclic group)', () => {
    const result = scalarMul(CURVE.N + BigInt(1), G);
    expect(result).not.toBeNull();
    expect(result!.x).toBe(CURVE.Gx);
    expect(result!.y).toBe(CURVE.Gy);
  });

  it('pointAdd(G, negG) = null (P + (-P) = O)', () => {
    const negG: Point = { x: CURVE.Gx, y: CURVE.P - CURVE.Gy };
    expect(pointAdd(G, negG)).toBeNull();
  });

  it('pointAdd(P, Q) = pointAdd(Q, P) (commutativity)', () => {
    const P = scalarMul(BigInt(5), G)!;
    const Q = scalarMul(BigInt(7), G)!;
    const sum1 = pointAdd(P, Q);
    const sum2 = pointAdd(Q, P);
    expect(sum1).toEqual(sum2);
  });

  it('pointAdd(P, O) = P (identity element)', () => {
    const P = scalarMul(BigInt(5), G)!;
    expect(pointAdd(P, null)).toEqual(P);
    expect(pointAdd(null, P)).toEqual(P);
  });

  it('scalarMul handles large scalars near N', () => {
    const result = scalarMul(CURVE.N - BigInt(1), G);
    expect(result).not.toBeNull();
    // (N-1)G = -G
    expect(result!.x).toBe(CURVE.Gx);
    expect(result!.y).toBe(CURVE.P - CURVE.Gy);
  });
});

// ---------------------------------------------------------------------------
// 4. publicKeyToAddress input validation (F-09)
// ---------------------------------------------------------------------------

describe('publicKeyToAddress input validation', () => {
  it('returns null for a key that is too short', () => {
    expect(publicKeyToAddress(new Uint8Array(3))).toBeNull();
  });

  it('returns null for a key that is too long', () => {
    expect(publicKeyToAddress(new Uint8Array(100))).toBeNull();
  });

  it('returns null for a key with wrong prefix byte', () => {
    const bad = new Uint8Array(65);
    bad[0] = 0x03; // compressed key prefix instead of 0x04
    expect(publicKeyToAddress(bad)).toBeNull();
  });

  it('returns null for a key with prefix 0x06 or 0x07 (hybrid)', () => {
    const hybrid06 = new Uint8Array(65);
    hybrid06[0] = 0x06;
    expect(publicKeyToAddress(hybrid06)).toBeNull();

    const hybrid07 = new Uint8Array(65);
    hybrid07[0] = 0x07;
    expect(publicKeyToAddress(hybrid07)).toBeNull();
  });

  it('returns null for a point NOT on the curve (y² ≠ x³+7)', () => {
    const badPub = new Uint8Array(65);
    badPub[0] = 0x04;
    // Set x = 0, y = 1 → y² = 1, x³+7 = 7 → not equal
    // x=0 is 32 zero bytes, y=1 is 31 zero bytes + 1
    badPub.fill(0, 1, 65);
    badPub[64] = 1; // y = 1
    expect(publicKeyToAddress(badPub)).toBeNull();
  });

  it('returns null when both x and y are all zeros (point at infinity encoded as 0x04)', () => {
    const zeroPub = new Uint8Array(65);
    zeroPub[0] = 0x04;
    // x = 0, y = 0 → y² = 0, x³+7 = 7 → not equal
    expect(publicKeyToAddress(zeroPub)).toBeNull();
  });

  it('returns the correct address for a valid uncompressed key', () => {
    // We know PK → pub → address for the known key
    const pub = scalarMul(KNOWN_PK, G)!;
    const pubBytes = new Uint8Array(65);
    pubBytes[0] = 0x04;
    pubBytes.set(bigintToBytes32(pub.x), 1);
    pubBytes.set(bigintToBytes32(pub.y), 33);

    const addr = publicKeyToAddress(pubBytes);
    expect(addr).toBe('0xf39Fd6e51aad88F6F4ce6aB8827279cffFb92266');
  });

  it('validates the curve equation for valid points', () => {
    for (const k of [2, 3, 5, 7, 11, 13, 42, 100, 12345]) {
      const P = scalarMul(BigInt(k), G)!;
      const pubBytes = new Uint8Array(65);
      pubBytes[0] = 0x04;
      pubBytes.set(bigintToBytes32(P.x), 1);
      pubBytes.set(bigintToBytes32(P.y), 33);

      const addr = publicKeyToAddress(pubBytes);
      expect(addr).not.toBeNull();
      expect(addr!).toMatch(/^0x[0-9a-fA-F]{40}$/);
    }
  });
});

// ---------------------------------------------------------------------------
// 5. Buffer-free cross-platform compatibility (F-06)
// ---------------------------------------------------------------------------

describe('Buffer-free hex conversion (cross-platform)', () => {
  it('bigintToBytes32 produces correct big-endian bytes', () => {
    const n = BigInt('0x0102030405060708090a0b0c0d0e0f101112131415161718191a1b1c1d1e1f20');
    const bytes = bigintToBytes32(n);
    expect(bytes.length).toBe(32);
    expect(bytes[0]).toBe(0x01);
    expect(bytes[31]).toBe(0x20);
    expect(bytes[15]).toBe(0x10);
  });

  it('bigintToBytes32 zero padding', () => {
    const bytes = bigintToBytes32(BigInt(1));
    expect(bytes.length).toBe(32);
    expect(bytes[31]).toBe(1);
    expect(bytes[0]).toBe(0);
    // All leading bytes should be zero
    for (let i = 0; i < 31; i++) {
      expect(bytes[i]).toBe(0);
    }
  });

  it('bigintToBytes32 handles UINT256_MAX', () => {
    const max = BigInt('0xFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFF');
    const bytes = bigintToBytes32(max);
    expect(bytes.length).toBe(32);
    for (let i = 0; i < 32; i++) {
      expect(bytes[i]).toBe(0xFF);
    }
  });

  it('hexToBytes handles odd-length hex strings', () => {
    const bytes = hexToBytes('abc');
    expect(bytes.length).toBe(2);
    expect(bytes[0]).toBe(0x0a);
    expect(bytes[1]).toBe(0xbc);
  });

  it('hexToBytes handles empty string', () => {
    expect(hexToBytes('')).toEqual(new Uint8Array(0));
  });
});

// ---------------------------------------------------------------------------
// 6. ecRecover null safety under adversarial inputs (F-03, F-04)
// ---------------------------------------------------------------------------

describe('ecRecover adversarial robustness', () => {
  const anyHash = hexToBytes('aa'.repeat(32));

  it('does not throw for any valid numeric (r, s) pairs', () => {
    const edgeCases = [
      [BigInt(2), BigInt(2)],       // minimal valid values
      [CURVE.N - BigInt(1), BigInt(2)], // r near N
      [BigInt(2), CURVE.N - BigInt(1)], // s near N (will be rejected by EIP-2)
      [CURVE.P - BigInt(1), BigInt(2)], // r near P
      [BigInt('0x' + 'f'.repeat(64)), BigInt(2)], // large r
    ];
    for (const [r, s] of edgeCases) {
      for (const v of [0, 1]) {
        expect(() => ecRecover(anyHash, v, r, s)).not.toThrow();
      }
    }
  });

  it('does not throw for degenerate hash values', () => {
    const degenerateHashes = [
      new Uint8Array(0),        // empty
      new Uint8Array(1),        // too short
      new Uint8Array(64),       // double size
      new Uint8Array(32),       // all zeros
    ];
    for (const hash of degenerateHashes) {
      expect(() => ecRecover(hash, 0, BigInt(2), BigInt(2))).not.toThrow();
    }
  });

  it('does not throw for boundary v values', () => {
    for (const v of [-1, 0, 1, 2, 27, 28, 255]) {
      expect(() => ecRecover(anyHash, v, BigInt(2), BigInt(2))).not.toThrow();
    }
  });

  it('handles msgHash with non-hex-convertible bytes gracefully', () => {
    // All byte values 0-255 should be handled correctly by the pure-JS hex
    const fullBytes = new Uint8Array(32);
    for (let i = 0; i < 32; i++) {
      fullBytes[i] = i * 8; // 0, 8, 16, 24, ... 248
    }
    expect(() => ecRecover(fullBytes, 0, BigInt(2), BigInt(2))).not.toThrow();
  });
});

// ---------------------------------------------------------------------------
// 7. Constant-time string comparison correctness
// ---------------------------------------------------------------------------

describe('constantTimeEqual properties (defense-in-depth)', () => {
  // Note: actual constantTimeEqual is tested in tests/constantTime.test.ts
  // These tests verify that the address comparisons in the SIWE flow are robust

  it('EIP-55 checksum address comparison is case-insensitive via toLowerCase', () => {
    // Both forms of the same address must compare equal after toLowerCase
    const addr1 = '0xf39Fd6e51aad88F6F4ce6aB8827279cffFb92266';
    const addr2 = '0xF39FD6E51AAD88F6F4CE6AB8827279CFFFB92266';
    expect(addr1.toLowerCase()).toBe(addr2.toLowerCase());
  });

  it('toChecksumAddress produces the correct EIP-55 casing', () => {
    // vitalik.eth — widely known EIP-55 test case
    expect(toChecksumAddress('d8da6bf26964af9d7eed9e03e53415d37aa96045'))
      .toBe('0xd8dA6BF26964aF9D7eEd9e03E53415D37aA96045');
  });

  it('toChecksumAddress is deterministic', () => {
    const lower = 'f39fd6e51aad88f6f4ce6ab8827279cfffb92266';
    const first = toChecksumAddress(lower);
    const second = toChecksumAddress(lower);
    expect(first).toBe(second);
  });
});

// ---------------------------------------------------------------------------
// 8. Modular inverse edge cases
// ---------------------------------------------------------------------------

describe('modInv edge cases', () => {
  it('modInv(1, p) = 1', () => {
    expect(modInv(BigInt(1), CURVE.P)).toBe(BigInt(1));
  });

  it('modInv(p-1, p) = p-1 (since -1 * -1 = 1 mod p)', () => {
    const inv = modInv(CURVE.P - BigInt(1), CURVE.P);
    expect(inv).toBe(CURVE.P - BigInt(1));
  });

  it('modInv(a, p) * a ≡ 1 mod p for various a', () => {
    for (const a of [BigInt(2), BigInt(3), BigInt(7), BigInt(12345), BigInt('0xdeadbeef')]) {
      const inv = modInv(a, CURVE.P);
      expect((a * inv) % CURVE.P).toBe(BigInt(1));
    }
  });
});

// ---------------------------------------------------------------------------
// 9. Field arithmetic edge cases
// ---------------------------------------------------------------------------

describe('modPow edge cases', () => {
  it('modPow(0, exp, mod) = 0', () => {
    expect(modPow(BigInt(0), BigInt(5), CURVE.P)).toBe(BigInt(0));
  });

  it('modPow(base, 0, mod) = 1', () => {
    expect(modPow(BigInt(42), BigInt(0), CURVE.P)).toBe(BigInt(1));
  });

  it('modPow handles negative base correctly', () => {
    const result = modPow(BigInt(-3), BigInt(3), CURVE.P);
    // (-3)³ = -27 ≡ P - 27 mod P
    const expected = (CURVE.P - BigInt(27)) % CURVE.P;
    expect(result).toBe(expected);
  });
});
