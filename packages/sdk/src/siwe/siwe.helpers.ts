/**
 * SIWE (Sign-In With Ethereum) helpers.
 *
 * Implements EIP-4361 message formatting, parsing, and secp256k1 signature
 * verification using only built-in Node.js crypto and js-sha3. No extra
 * runtime dependencies are required.
 *
 * @module siwe
 */

import { GuildPassError } from '../errors/GuildPassError';
import { GuildPassErrorCode } from '../errors/errorCodes';
import type { SiweMessage, SiweParseResult, SiweVerifyParams, SiweVerifyResult } from './siwe.types';
import { constantTimeEqual } from '../utils';

import {
  ecRecover,
  publicKeyToAddress,
  hashPersonalMessage,
  hexToBytes,
  keccak256Bytes,
  bigintToBytes32,
} from '../crypto/secp256k1';

/** Maximum length of a raw SIWE message string (10 KB). */
export const MAX_SIWE_MESSAGE_LENGTH = 10_240;

/**
 * Basic domain-name validation regex. Accepts standard domains,
 * subdomains, and localhost — rejects anything with control
 * characters or whitespace.
 */
const DOMAIN_REGEX = /^([a-zA-Z0-9]([a-zA-Z0-9-]{0,61}[a-zA-Z0-9])?\.)+[a-zA-Z]{2,}$|^localhost$/;

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
    if (raw.length > MAX_SIWE_MESSAGE_LENGTH) {
      return {
        success: false,
        error: `SIWE message exceeds maximum length of ${MAX_SIWE_MESSAGE_LENGTH} characters (got ${raw.length})`,
      };
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
    if (!DOMAIN_REGEX.test(domain)) {
      return { success: false, error: `Invalid domain in SIWE message: "${domain}"` };
    }

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

    if (!constantTimeEqual(recovered.toLowerCase(), siwe.address.toLowerCase())) {
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
