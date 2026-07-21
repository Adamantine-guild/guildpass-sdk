/**
 * SIWE (Sign-In With Ethereum) helpers.
 *
 * Implements EIP-4361 message formatting, parsing, and secp256k1 signature
 * verification using only built-in Node.js crypto and js-sha3. No extra
 * runtime dependencies are required.
 *
 * @module siwe
 */

import { keccak256 } from 'js-sha3';
import { GuildPassError } from '../errors/GuildPassError';
import { GuildPassErrorCode } from '../errors/errorCodes';
import { toChecksumAddress } from '../utils/address';
import type { SiweMessage, SiweParseResult, SiweVerifyParams, SiweVerifyResult } from './siwe.types';

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

type Point = { x: bigint; y: bigint } | null; // null = point at infinity

// ---------------------------------------------------------------------------
// Finite-field arithmetic helpers
// ---------------------------------------------------------------------------

/** Fast modular exponentiation. */
function modPow(base: bigint, exp: bigint, mod: bigint): bigint {
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
function modInv(a: bigint, p: bigint): bigint {
  return modPow(a, p - BigInt(2), p);
}

/** Point doubling on secp256k1. */
function pointDouble(P: Point): Point {
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
function pointAdd(P: Point, Q: Point): Point {
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
function scalarMul(k: bigint, P: Point): Point {
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
function ecRecover(msgHash: Uint8Array, v: number, r: bigint, s: bigint): Uint8Array | null {
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
function bigintToBytes32(n: bigint): Uint8Array {
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
function keccak256Bytes(data: Uint8Array): Uint8Array {
  return hexToBytes(keccak256(data));
}

/** Converts a hex string (no 0x prefix) to Uint8Array. */
function hexToBytes(hex: string): Uint8Array {
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
function hashPersonalMessage(message: string): Uint8Array {
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
function publicKeyToAddress(pubKey: Uint8Array): string {
  // Take bytes 1..64 (skip 0x04 prefix), keccak256 them, take last 20 bytes
  const pubKeyBody = pubKey.slice(1); // 64 bytes: x || y
  const hash = keccak256(pubKeyBody);
  const addressHex = hash.slice(-40); // last 20 bytes = 40 hex chars
  return toChecksumAddress(addressHex);
}

// ---------------------------------------------------------------------------
// EIP-4361 message formatting
// ---------------------------------------------------------------------------

/**
 * Formats a {@link SiweMessage} into the canonical EIP-4361 string that
 * the wallet is expected to sign.
 *
 * @example
 * const msg = formatSiweMessage({
 *   domain: 'example.com',
 *   address: '0xd8dA6BF26964aF9D7eEd9e03E53415D37aA96045',
 *   uri: 'https://example.com',
 *   version: '1',
 *   chainId: 1,
 *   nonce: 'abc12345',
 *   issuedAt: '2024-01-01T00:00:00.000Z',
 * });
 */
export function formatSiweMessage(msg: SiweMessage): string {
  const lines: string[] = [];

  // Header: "<domain> wants you to sign in with your Ethereum account:"
  lines.push(`${msg.domain} wants you to sign in with your Ethereum account:`);
  lines.push(msg.address);
  lines.push('');

  if (msg.statement) {
    lines.push(msg.statement);
    lines.push('');
  }

  lines.push(`URI: ${msg.uri}`);
  lines.push(`Version: ${msg.version}`);
  lines.push(`Chain ID: ${msg.chainId}`);
  lines.push(`Nonce: ${msg.nonce}`);
  lines.push(`Issued At: ${msg.issuedAt}`);

  if (msg.expirationTime) lines.push(`Expiration Time: ${msg.expirationTime}`);
  if (msg.notBefore) lines.push(`Not Before: ${msg.notBefore}`);
  if (msg.requestId) lines.push(`Request ID: ${msg.requestId}`);

  if (msg.resources && msg.resources.length > 0) {
    lines.push('Resources:');
    for (const resource of msg.resources) {
      lines.push(`- ${resource}`);
    }
  }

  return lines.join('\n');
}

// ---------------------------------------------------------------------------
// EIP-4361 message parsing
// ---------------------------------------------------------------------------

/**
 * Parses a raw EIP-4361 string back into a {@link SiweMessage}.
 *
 * Returns a {@link SiweParseResult} with `success: false` (and an `error`
 * description) rather than throwing when the input is malformed.
 */
export function parseSiweMessage(raw: string): SiweParseResult {
  try {
    if (raw == null || typeof raw !== 'string') {
      return { success: false, error: 'Message must be a non-null string' };
    }
    const lines = raw.split('\n');
    if (lines.length < 2) {
      return { success: false, error: 'Message is too short to be a valid EIP-4361 message' };
    }

    // Line 0: "<domain> wants you to sign in with your Ethereum account:"
    const headerLine = lines[0];
    const headerMatch = headerLine.match(/^(.+) wants you to sign in with your Ethereum account:$/);
    if (!headerMatch) {
      return { success: false, error: 'Invalid EIP-4361 header line' };
    }
    const domain = headerMatch[1];

    // Line 1: Ethereum address
    const address = lines[1];
    if (!/^0x[a-fA-F0-9]{40}$/.test(address)) {
      return { success: false, error: `Invalid Ethereum address: "${address}"` };
    }

    // Line 2 must be blank
    if (lines[2] !== '') {
      return { success: false, error: 'Expected blank line after address' };
    }

    // Collect optional statement (non-empty lines before the first "Field: value")
    let cursor = 3;
    let statement: string | undefined;
    // EIP-4361: optional statement is before the structured fields
    // The statement ends at the blank line before "URI:"
    const fieldStartIdx = lines.findIndex((l) => l.startsWith('URI: '));
    if (fieldStartIdx === -1) {
      return { success: false, error: 'Missing required field: URI' };
    }

    // Everything between cursor and fieldStartIdx - 1 is the statement block
    // (the spec wraps it with blank lines)
    const statementLines: string[] = [];
    for (let i = cursor; i < fieldStartIdx; i++) {
      const line = lines[i];
      if (line !== '') statementLines.push(line);
    }
    if (statementLines.length > 0) {
      statement = statementLines.join('\n');
    }
    cursor = fieldStartIdx;

    // Helper: extract a required field value
    const getField = (prefix: string): string | undefined => {
      const line = lines.find((l) => l.startsWith(prefix));
      return line?.slice(prefix.length).trim();
    };

    const uri = getField('URI: ');
    const version = getField('Version: ');
    const chainIdStr = getField('Chain ID: ');
    const nonce = getField('Nonce: ');
    const issuedAt = getField('Issued At: ');

    if (!uri) return { success: false, error: 'Missing required field: URI' };
    if (!version) return { success: false, error: 'Missing required field: Version' };
    if (!chainIdStr) return { success: false, error: 'Missing required field: Chain ID' };
    if (!nonce) return { success: false, error: 'Missing required field: Nonce' };
    if (!issuedAt) return { success: false, error: 'Missing required field: Issued At' };

    const chainId = parseInt(chainIdStr, 10);
    if (isNaN(chainId) || chainId <= 0) {
      return { success: false, error: `Invalid Chain ID: "${chainIdStr}"` };
    }

    const expirationTime = getField('Expiration Time: ');
    const notBefore = getField('Not Before: ');
    const requestId = getField('Request ID: ');

    // Resources section
    let resources: string[] | undefined;
    const resourcesIdx = lines.findIndex((l) => l === 'Resources:');
    if (resourcesIdx !== -1) {
      resources = [];
      for (let i = resourcesIdx + 1; i < lines.length; i++) {
        const l = lines[i].trim();
        if (l.startsWith('- ')) {
          resources.push(l.slice(2));
        }
      }
      if (resources.length === 0) resources = undefined;
    }

    const siweMessage: SiweMessage = {
      domain,
      address,
      uri,
      version,
      chainId,
      nonce,
      issuedAt,
      ...(statement !== undefined && { statement }),
      ...(expirationTime !== undefined && { expirationTime }),
      ...(notBefore !== undefined && { notBefore }),
      ...(requestId !== undefined && { requestId }),
      ...(resources !== undefined && { resources }),
    };

    return { success: true, data: siweMessage };
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : 'Unknown parse error';
    return { success: false, error: `Failed to parse SIWE message: ${message}` };
  }
}

// ---------------------------------------------------------------------------
// Signature verification
// ---------------------------------------------------------------------------

/**
 * Verifies an EIP-4361 (SIWE) signature.
 *
 * The function:
 * 1. Parses the raw message string via {@link parseSiweMessage}.
 * 2. Optionally checks domain and nonce mismatches.
 * 3. Optionally checks expiry (default: `true`).
 * 4. Recovers the signer address from the ECDSA signature using secp256k1.
 * 5. Compares the recovered address against the `address` field in the message.
 *
 * Returns a {@link SiweVerifyResult} — never throws.
 *
 * @example
 * const result = await verifySiweSignature({
 *   message: rawMessage,
 *   signature: '0xabc...def',
 *   expectedDomain: 'example.com',
 *   expectedNonce: 'abc12345',
 * });
 * if (result.success) {
 *   console.log('Signed by', result.data?.address);
 * }
 */
export function verifySiweSignature(params: SiweVerifyParams): SiweVerifyResult {
  const { message, signature, expectedDomain, expectedNonce, checkExpiry = true } = params;

  // --- Guard against null/undefined inputs ---
  if (message == null || typeof message !== 'string') {
    return {
      success: false,
      error: 'message must be a non-null string',
      code: GuildPassErrorCode.SIWE_INVALID_MESSAGE,
    };
  }
  if (signature == null || typeof signature !== 'string') {
    return {
      success: false,
      error: 'signature must be a non-null string',
      code: GuildPassErrorCode.SIWE_INVALID_SIGNATURE,
    };
  }

  // --- 1. Parse ---
  const parseResult = parseSiweMessage(message);
  if (!parseResult.success || !parseResult.data) {
    return {
      success: false,
      error: parseResult.error ?? 'Failed to parse SIWE message',
      code: GuildPassErrorCode.SIWE_INVALID_MESSAGE,
    };
  }
  const siwe = parseResult.data;

  // --- 2. Domain check ---
  if (expectedDomain !== undefined && siwe.domain !== expectedDomain) {
    return {
      success: false,
      error: `Domain mismatch: expected "${expectedDomain}", got "${siwe.domain}"`,
      code: GuildPassErrorCode.SIWE_DOMAIN_MISMATCH,
    };
  }

  // --- 3. Nonce check ---
  if (expectedNonce !== undefined && siwe.nonce !== expectedNonce) {
    return {
      success: false,
      error: `Nonce mismatch: expected "${expectedNonce}", got "${siwe.nonce}"`,
      code: GuildPassErrorCode.SIWE_INVALID_MESSAGE,
    };
  }

  // --- 4. Expiry check ---
  if (checkExpiry && siwe.expirationTime) {
    const expiry = new Date(siwe.expirationTime).getTime();
    if (isNaN(expiry)) {
      return {
        success: false,
        error: `Invalid expirationTime: "${siwe.expirationTime}"`,
        code: GuildPassErrorCode.SIWE_INVALID_MESSAGE,
      };
    }
    if (Date.now() > expiry) {
      return {
        success: false,
        error: 'SIWE message has expired',
        code: GuildPassErrorCode.SIWE_EXPIRED,
      };
    }
  }

  // --- 5. Not-before check ---
  if (siwe.notBefore) {
    const nbf = new Date(siwe.notBefore).getTime();
    if (!isNaN(nbf) && Date.now() < nbf) {
      return {
        success: false,
        error: 'SIWE message is not yet valid (notBefore constraint)',
        code: GuildPassErrorCode.SIWE_INVALID_MESSAGE,
      };
    }
  }

  // --- 6. Recover signer ---
  try {
    const sigHex = signature.startsWith('0x') ? signature.slice(2) : signature;
    if (sigHex.length !== 130) {
      return {
        success: false,
        error: 'Signature must be 65 bytes (130 hex characters)',
        code: GuildPassErrorCode.SIWE_INVALID_SIGNATURE,
      };
    }

    const r = BigInt('0x' + sigHex.slice(0, 64));
    const s = BigInt('0x' + sigHex.slice(64, 128));
    let v = parseInt(sigHex.slice(128, 130), 16);

    // Ethereum adds 27 or 28 to the raw recovery id (0 or 1)
    if (v === 27 || v === 28) {
      v -= 27;
    }
    if (v !== 0 && v !== 1) {
      return {
        success: false,
        error: `Invalid signature v value: ${v + 27}`,
        code: GuildPassErrorCode.SIWE_INVALID_SIGNATURE,
      };
    }

    const msgHash = hashPersonalMessage(message);
    const pubKey = ecRecover(msgHash, v, r, s);
    if (!pubKey) {
      return {
        success: false,
        error: 'Could not recover public key from signature',
        code: GuildPassErrorCode.SIWE_INVALID_SIGNATURE,
      };
    }

    const recovered = publicKeyToAddress(pubKey);

    if (recovered.toLowerCase() !== siwe.address.toLowerCase()) {
      return {
        success: false,
        error: `Signature address mismatch: recovered "${recovered}", expected "${siwe.address}"`,
        code: GuildPassErrorCode.SIWE_INVALID_SIGNATURE,
      };
    }

    return { success: true, data: siwe };
  } catch (err: unknown) {
    const errMsg = err instanceof Error ? err.message : 'Unknown error during signature verification';
    return {
      success: false,
      error: errMsg,
      code: GuildPassErrorCode.SIWE_INVALID_SIGNATURE,
    };
  }
}

// ---------------------------------------------------------------------------
// Nonce generation utility
// ---------------------------------------------------------------------------

/**
 * Generates a cryptographically random nonce suitable for use in a SIWE message.
 *
 * The nonce is 16 alphanumeric characters, URL-safe, and meets the EIP-4361
 * requirement of at least 8 alphanumeric characters.
 */
export function generateSiweNonce(): string {
  const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';
  const length = 16;
  const bytes = new Uint8Array(length);

  if (typeof globalThis.crypto?.getRandomValues === 'function') {
    globalThis.crypto.getRandomValues(bytes);
  } else {
    // Fallback for environments without Web Crypto
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const nodeCrypto = require('node:crypto') as typeof import('node:crypto');
    const buf = nodeCrypto.randomBytes(length);
    bytes.set(buf);
  }

  return Array.from(bytes)
    .map((b) => chars[b % chars.length])
    .join('');
}
