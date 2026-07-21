/**
 * secp256k1 cryptographic primitives.
 *
 * Standalone, SIWE-agnostic implementation of the secp256k1 curve arithmetic,
 * ECDSA public-key recovery (ecrecover), and the Ethereum keccak256/address
 * helpers used for signature verification. Extracted from siwe.helpers.ts (#240)
 * so the cryptographic core can be reviewed, versioned, and tested in isolation
 * from the SIWE protocol logic that consumes it.
 *
 * This module has no dependencies on SIWE types or logic. It depends only on
 * `js-sha3` for keccak256.
 *
 * NOTE: `ecRecover` currently uses Node's `Buffer` to convert the message hash
 * to a bigint. This was moved verbatim from the original implementation to
 * preserve behaviour exactly; a universal (Buffer-free) conversion is a
 * follow-up so the module is fully edge/browser-portable.
 */
import { keccak256 } from 'js-sha3';

// ---------------------------------------------------------------------------
// secp256k1 parameters (EIP-155 / Bitcoin / Ethereum)
// ---------------------------------------------------------------------------
const SECP256K1_P = BigInt(
  '0xFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFEFFFFFC2F',
);
const SECP256K1_N = BigInt(
  '0xFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFEBAAEDCE6AF48A03BBFD25E8CD0364141',
);
const SECP256K1_GX = BigInt(
  '0x79BE667EF9DCBBAC55A06295CE870B07029BFCDB2DCE28D959F2815B16F81798',
);
const SECP256K1_GY = BigInt(
  '0x483ADA7726A3C4655DA4FBFC0E1108A8FD17B448A68554199C47D08FFB10D4B8',
);
const SECP256K1_A = BigInt(0);
const SECP256K1_B = BigInt(7);

/** A point on the secp256k1 curve, or null for the point at infinity. */
export type Point = { x: bigint; y: bigint } | null;

// Exported curve parameters for tests / advanced consumers.
export const CURVE = {
  P: SECP256K1_P,
  N: SECP256K1_N,
  Gx: SECP256K1_GX,
  Gy: SECP256K1_GY,
  a: SECP256K1_A,
  b: SECP256K1_B,
} as const;

// ---------------------------------------------------------------------------
// Finite-field arithmetic helpers
// ---------------------------------------------------------------------------
/** Fast modular exponentiation. */
export function modPow(base: bigint, exp: bigint, mod: bigint): bigint {
  let result = BigInt(1);
  base = ((base % mod) + mod) % mod;
  while (exp > BigInt(0)) {
    if (exp & BigInt(1)) result = (result * base) % mod;
    exp >>= BigInt(1);
    base = (base * base) % mod;
  }
  return result;
}

/** Modular inverse via Fermat's little theorem (P is prime). */
export function modInv(a: bigint, p: bigint): bigint {
  return modPow(a, p - BigInt(2), p);
}

/** Point doubling on secp256k1. */
export function pointDouble(P: Point): Point {
  if (!P) return null;
  if (P.y === BigInt(0)) return null;
  const lam =
    (((BigInt(3) * P.x * P.x + SECP256K1_A) % SECP256K1_P) *
      modInv(BigInt(2) * P.y, SECP256K1_P)) %
    SECP256K1_P;
  const x3 = ((lam * lam - BigInt(2) * P.x) % SECP256K1_P + SECP256K1_P) % SECP256K1_P;
  const y3 = ((lam * (P.x - x3) - P.y) % SECP256K1_P + SECP256K1_P) % SECP256K1_P;
  return { x: x3, y: y3 };
}

/** Point addition on secp256k1. */
export function pointAdd(P: Point, Q: Point): Point {
  if (!P) return Q;
  if (!Q) return P;
  if (P.x === Q.x) {
    if (P.y !== Q.y) return null; // P + (-P) = point at infinity
    return pointDouble(P);
  }
  const lam =
    (((Q.y - P.y) % SECP256K1_P + SECP256K1_P) *
      modInv((Q.x - P.x + SECP256K1_P) % SECP256K1_P, SECP256K1_P)) %
    SECP256K1_P;
  const x3 = ((lam * lam - P.x - Q.x) % SECP256K1_P + SECP256K1_P) % SECP256K1_P;
  const y3 = ((lam * (P.x - x3) - P.y) % SECP256K1_P + SECP256K1_P) % SECP256K1_P;
  return { x: x3, y: y3 };
}

/** Scalar multiplication on secp256k1 (double-and-add). */
export function scalarMul(k: bigint, P: Point): Point {
  if (!P) return null;
  let result: Point = null;
  let addend: Point = P;
  while (k > BigInt(0)) {
    if (k & BigInt(1)) result = pointAdd(result, addend);
    k >>= BigInt(1);
    addend = pointDouble(addend);
  }
  return result;
}

// ---------------------------------------------------------------------------
// ECDSA recovery (ecrecover)
// ---------------------------------------------------------------------------
/**
 * Recovers the public key from a secp256k1 ECDSA signature.
 *
 * @param msgHash  32-byte message hash as a Uint8Array
 * @param v        recovery id — 0 or 1 (after removing the 27/28 Ethereum prefix)
 * @param r        signature r component as a bigint
 * @param s        signature s component as a bigint
 * @returns        65-byte uncompressed public key (04 || x || y), or null on failure
 */
export function ecRecover(msgHash: Uint8Array, v: number, r: bigint, s: bigint): Uint8Array | null {
  if (r <= BigInt(0) || r >= SECP256K1_N) return null;
  if (s <= BigInt(0) || s >= SECP256K1_N) return null;
  // Candidate x-coordinate for R: r (and optionally r + N, but for Ethereum
  // signatures that second candidate is almost always off-curve, so we skip it).
  const x = r;
  if (x >= SECP256K1_P) return null;
  // Recover point R from x using the secp256k1 curve equation: y² = x³ + 7
  const ySquared = (modPow(x, BigInt(3), SECP256K1_P) + SECP256K1_B) % SECP256K1_P;
  // y = sqrt(ySquared) mod P; secp256k1 P ≡ 3 (mod 4) so sqrt = y^((P+1)/4)
  let y = modPow(ySquared, (SECP256K1_P + BigInt(1)) / BigInt(4), SECP256K1_P);
  if ((y * y) % SECP256K1_P !== ySquared) return null; // x is not on the curve
  // Choose parity of y to match v
  if (Number(y & BigInt(1)) !== v) y = SECP256K1_P - y;
  const R: Point = { x, y };
  // e = hash as bigint
  const e = BigInt('0x' + Buffer.from(msgHash).toString('hex'));
  // Q = r⁻¹ · (s·R − e·G)
  const rInv = modInv(r, SECP256K1_N);
  const G: Point = { x: SECP256K1_GX, y: SECP256K1_GY };
  const sR = scalarMul(s, R);
  const eG = scalarMul((SECP256K1_N - (e % SECP256K1_N)) % SECP256K1_N, G);
  const Q = scalarMul(rInv, pointAdd(sR, eG));
  if (!Q) return null;
  // Encode as 65-byte uncompressed public key: 0x04 || x (32 bytes) || y (32 bytes)
  const pub = new Uint8Array(65);
  pub[0] = 0x04;
  const xBytes = bigintToBytes32(Q.x);
  const yBytes = bigintToBytes32(Q.y);
  pub.set(xBytes, 1);
  pub.set(yBytes, 33);
  return pub;
}

/** Encodes a bigint as a 32-byte big-endian Uint8Array. */
export function bigintToBytes32(n: bigint): Uint8Array {
  const hex = n.toString(16).padStart(64, '0');
  const bytes = new Uint8Array(32);
  for (let i = 0; i < 32; i++) {
    bytes[i] = parseInt(hex.slice(i * 2, i * 2 + 2), 16);
  }
  return bytes;
}

// ---------------------------------------------------------------------------
// Ethereum keccak256 helpers
// ---------------------------------------------------------------------------
/** Returns the keccak256 hash of a byte array as a Uint8Array (32 bytes). */
export function keccak256Bytes(data: Uint8Array): Uint8Array {
  return hexToBytes(keccak256(data));
}

/** Converts a hex string (no 0x prefix) to Uint8Array. */
export function hexToBytes(hex: string): Uint8Array {
  if (hex.length % 2 !== 0) hex = '0' + hex;
  const bytes = new Uint8Array(hex.length / 2);
  for (let i = 0; i < bytes.length; i++) {
    bytes[i] = parseInt(hex.slice(i * 2, i * 2 + 2), 16);
  }
  return bytes;
}

/**
 * Applies the Ethereum personal-sign prefix and returns the keccak256 hash.
 *
 * Hash = keccak256("\x19Ethereum Signed Message:\n" + len(msg) + msg)
 */
export function hashPersonalMessage(message: string): Uint8Array {
  const prefix = `\x19Ethereum Signed Message:\n${message.length}`;
  const prefixBytes = new TextEncoder().encode(prefix);
  const msgBytes = new TextEncoder().encode(message);
  const combined = new Uint8Array(prefixBytes.length + msgBytes.length);
  combined.set(prefixBytes, 0);
  combined.set(msgBytes, prefixBytes.length);
  return keccak256Bytes(combined);
}

/**
 * Derives the checksummed Ethereum address from a 65-byte uncompressed public key.
 */
export function publicKeyToAddress(pubKey: Uint8Array): string {
  // Take bytes 1..64 (skip 0x04 prefix), keccak256 them, take last 20 bytes
  const pubKeyBody = pubKey.slice(1); // 64 bytes: x || y
  const hash = keccak256(pubKeyBody);
  const addressHex = hash.slice(-40); // last 20 bytes = 40 hex chars
  return toChecksumAddress(addressHex);
}

/**
 * EIP-55 checksum address.
 * Matches the implementation in src/utils/address.ts.
 */
export function toChecksumAddress(addressHex: string): string {
  const lower = addressHex.toLowerCase();
  const hashHex = keccak256(lower); // returns hex string directly
  let result = '0x';
  for (let i = 0; i < 40; i++) {
    result += parseInt(hashHex[i], 16) >= 8 ? lower[i].toUpperCase() : lower[i];
  }
  return result;
}

