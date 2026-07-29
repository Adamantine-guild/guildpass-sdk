/**
 * Comprehensive tests for SIWE (Sign-In With Ethereum) helpers.
 *
 * All signature test vectors were produced with ethers v6 using private key:
 *   0xac0974bec39a17e36ba4a6b4d238ff944bacb478cbed5efcae784d7bf4f2ff80
 * (the first Hardhat default account — widely used in public test suites)
 * corresponding to address: 0xf39Fd6e51aad88F6F4ce6aB8827279cffFb92266
 */

import { describe, it, expect } from 'vitest';
import {
  formatSiweMessage,
  parseSiweMessage,
  verifySiweSignature,
  generateSiweNonce,
  MAX_SIWE_MESSAGE_LENGTH,
  type SiweMessage,
} from '../src/siwe';
import { GuildPassErrorCode } from '../src/errors/errorCodes';

// ---------------------------------------------------------------------------
// Shared fixtures
// ---------------------------------------------------------------------------

/** The Ethereum address whose private key is used for all test signatures. */
const TEST_ADDRESS = '0xf39Fd6e51aad88F6F4ce6aB8827279cffFb92266';

/** A minimal valid SiweMessage object. */
const BASE_MSG: SiweMessage = {
  domain: 'example.com',
  address: TEST_ADDRESS,
  uri: 'https://example.com',
  version: '1',
  chainId: 1,
  nonce: 'abc12345',
  issuedAt: '2024-01-01T00:00:00.000Z',
};

/**
 * Raw EIP-4361 strings and their corresponding ethers-produced signatures.
 * Each was generated with:
 *   const wallet = new ethers.Wallet('0xac0974bec39a17e36ba4a6b4d238ff944bacb478cbed5efcae784d7bf4f2ff80');
 *   const sig = await wallet.signMessage(rawMessage);
 */
const VECTORS = {
  /** Basic message — no optional fields. */
  basic: {
    message:
      'example.com wants you to sign in with your Ethereum account:\n' +
      '0xf39Fd6e51aad88F6F4ce6aB8827279cffFb92266\n' +
      '\n' +
      'URI: https://example.com\n' +
      'Version: 1\n' +
      'Chain ID: 1\n' +
      'Nonce: abc12345\n' +
      'Issued At: 2024-01-01T00:00:00.000Z',
    signature:
      '0x82790bc51f261e6461cb1a3baeed8494cd796093c93db2b564c2260535203c612ca06a4cf8ca39e15452d8fbd24000c6d752a45c5c46ae1ced3c641b5370c1901b',
  },

  /** Message with an optional statement. */
  withStatement: {
    message:
      'example.com wants you to sign in with your Ethereum account:\n' +
      '0xf39Fd6e51aad88F6F4ce6aB8827279cffFb92266\n' +
      '\n' +
      'I accept the Terms of Service.\n' +
      '\n' +
      'URI: https://example.com\n' +
      'Version: 1\n' +
      'Chain ID: 1\n' +
      'Nonce: abc12345\n' +
      'Issued At: 2024-01-01T00:00:00.000Z',
    signature:
      '0x63acbec0f3ada026872a68d0f3d95f8962091ede8a58f9ddf001d9aedb80c89c361976f45455abd987a43a52fbb0c773ca8de7b650cdd8f49ed492f6e332a4431b',
  },

  /** Message with expirationTime already in the past. */
  expired: {
    message:
      'example.com wants you to sign in with your Ethereum account:\n' +
      '0xf39Fd6e51aad88F6F4ce6aB8827279cffFb92266\n' +
      '\n' +
      'URI: https://example.com\n' +
      'Version: 1\n' +
      'Chain ID: 1\n' +
      'Nonce: abc12345\n' +
      'Issued At: 2024-01-01T00:00:00.000Z\n' +
      'Expiration Time: 2020-01-01T00:00:00.000Z',
    signature:
      '0x50ce710ff1905520be40f810f0c9dff3c518d70ecbe14fa0985d44e87ef122943fb9efb32b859725b6b33d548bf5cb890428062b799564b5430f247cd45cbc961c',
  },

  /** Message with expirationTime far in the future. */
  futureExpiry: {
    message:
      'example.com wants you to sign in with your Ethereum account:\n' +
      '0xf39Fd6e51aad88F6F4ce6aB8827279cffFb92266\n' +
      '\n' +
      'URI: https://example.com\n' +
      'Version: 1\n' +
      'Chain ID: 1\n' +
      'Nonce: abc12345\n' +
      'Issued At: 2024-01-01T00:00:00.000Z\n' +
      'Expiration Time: 2099-01-01T00:00:00.000Z',
    signature:
      '0x340767b6619aab332c548ac78267cd659d2823d500fb7b9509fdb8a9072d03822ab8d3d6c71233873a25d0653169b4d5cdd9d57245eed642ae209da1348013e81c',
  },

  /** Message with resources list. */
  withResources: {
    message:
      'example.com wants you to sign in with your Ethereum account:\n' +
      '0xf39Fd6e51aad88F6F4ce6aB8827279cffFb92266\n' +
      '\n' +
      'URI: https://example.com\n' +
      'Version: 1\n' +
      'Chain ID: 1\n' +
      'Nonce: abc12345\n' +
      'Issued At: 2024-01-01T00:00:00.000Z\n' +
      'Resources:\n' +
      '- https://example.com/resource1\n' +
      '- ipfs://QmX...',
    signature:
      '0xb82412581d51dfae3872c6caa4bc0e48e8f9bce590860afa2f432d5848f47fa12f77a929cd6fe562bfa8d820c7e221765840aea338086fed79aa65202389edca1c',
  },
};

// ---------------------------------------------------------------------------
// generateSiweNonce
// ---------------------------------------------------------------------------

describe('generateSiweNonce', () => {
  it('returns a string of exactly 16 characters', () => {
    expect(generateSiweNonce()).toHaveLength(16);
  });

  it('only contains alphanumeric characters', () => {
    const nonce = generateSiweNonce();
    expect(nonce).toMatch(/^[A-Za-z0-9]{16}$/);
  });

  it('generates unique values on repeated calls', () => {
    const samples = new Set(Array.from({ length: 20 }, () => generateSiweNonce()));
    // With 62^16 possibilities, collisions in 20 calls are astronomically unlikely
    expect(samples.size).toBe(20);
  });

  it('satisfies EIP-4361 minimum of 8 alphanumeric characters', () => {
    const nonce = generateSiweNonce();
    expect(nonce.length).toBeGreaterThanOrEqual(8);
    expect(nonce).toMatch(/^[A-Za-z0-9]+$/);
  });
});

// ---------------------------------------------------------------------------
// formatSiweMessage
// ---------------------------------------------------------------------------

describe('formatSiweMessage', () => {
  it('produces the canonical EIP-4361 header line', () => {
    const formatted = formatSiweMessage(BASE_MSG);
    expect(formatted).toContain(
      'example.com wants you to sign in with your Ethereum account:',
    );
  });

  it('includes the address on the second line', () => {
    const lines = formatSiweMessage(BASE_MSG).split('\n');
    expect(lines[1]).toBe(TEST_ADDRESS);
  });

  it('includes a blank line after the address', () => {
    const lines = formatSiweMessage(BASE_MSG).split('\n');
    expect(lines[2]).toBe('');
  });

  it('includes all required structured fields', () => {
    const formatted = formatSiweMessage(BASE_MSG);
    expect(formatted).toContain('URI: https://example.com');
    expect(formatted).toContain('Version: 1');
    expect(formatted).toContain('Chain ID: 1');
    expect(formatted).toContain('Nonce: abc12345');
    expect(formatted).toContain('Issued At: 2024-01-01T00:00:00.000Z');
  });

  it('omits optional fields when not provided', () => {
    const formatted = formatSiweMessage(BASE_MSG);
    expect(formatted).not.toContain('Expiration Time:');
    expect(formatted).not.toContain('Not Before:');
    expect(formatted).not.toContain('Request ID:');
    expect(formatted).not.toContain('Resources:');
    expect(formatted).not.toContain('Statement:');
  });

  it('includes the statement with surrounding blank lines', () => {
    const msg: SiweMessage = { ...BASE_MSG, statement: 'I accept the Terms of Service.' };
    const formatted = formatSiweMessage(msg);
    expect(formatted).toContain('I accept the Terms of Service.');
    // statement is preceded by a blank line and followed by a blank line
    expect(formatted).toContain('\n\nI accept the Terms of Service.\n\n');
  });

  it('includes expirationTime when provided', () => {
    const msg: SiweMessage = { ...BASE_MSG, expirationTime: '2099-01-01T00:00:00.000Z' };
    expect(formatSiweMessage(msg)).toContain('Expiration Time: 2099-01-01T00:00:00.000Z');
  });

  it('includes notBefore when provided', () => {
    const msg: SiweMessage = { ...BASE_MSG, notBefore: '2024-01-01T00:00:00.000Z' };
    expect(formatSiweMessage(msg)).toContain('Not Before: 2024-01-01T00:00:00.000Z');
  });

  it('includes requestId when provided', () => {
    const msg: SiweMessage = { ...BASE_MSG, requestId: 'req-xyz-123' };
    expect(formatSiweMessage(msg)).toContain('Request ID: req-xyz-123');
  });

  it('includes resources list when provided', () => {
    const msg: SiweMessage = {
      ...BASE_MSG,
      resources: ['https://example.com/r1', 'ipfs://QmABC'],
    };
    const formatted = formatSiweMessage(msg);
    expect(formatted).toContain('Resources:');
    expect(formatted).toContain('- https://example.com/r1');
    expect(formatted).toContain('- ipfs://QmABC');
  });

  it('round-trips through parseSiweMessage for the basic message', () => {
    const formatted = formatSiweMessage(BASE_MSG);
    const parsed = parseSiweMessage(formatted);
    expect(parsed.success).toBe(true);
    expect(parsed.data?.domain).toBe('example.com');
    expect(parsed.data?.address).toBe(TEST_ADDRESS);
    expect(parsed.data?.chainId).toBe(1);
  });

  it('round-trips through parseSiweMessage with all optional fields', () => {
    const full: SiweMessage = {
      ...BASE_MSG,
      statement: 'Accept ToS',
      expirationTime: '2099-01-01T00:00:00.000Z',
      notBefore: '2024-01-01T00:00:00.000Z',
      requestId: 'req-001',
      resources: ['https://res.example.com'],
    };
    const parsed = parseSiweMessage(formatSiweMessage(full));
    expect(parsed.success).toBe(true);
    expect(parsed.data?.statement).toBe('Accept ToS');
    expect(parsed.data?.expirationTime).toBe('2099-01-01T00:00:00.000Z');
    expect(parsed.data?.notBefore).toBe('2024-01-01T00:00:00.000Z');
    expect(parsed.data?.requestId).toBe('req-001');
    expect(parsed.data?.resources).toEqual(['https://res.example.com']);
  });

  it('matches the known ethers-signed basic message byte-for-byte', () => {
    const formatted = formatSiweMessage(BASE_MSG);
    expect(formatted).toBe(VECTORS.basic.message);
  });

  it('matches the known ethers-signed message with statement', () => {
    const msg: SiweMessage = { ...BASE_MSG, statement: 'I accept the Terms of Service.' };
    expect(formatSiweMessage(msg)).toBe(VECTORS.withStatement.message);
  });
});

// ---------------------------------------------------------------------------
// parseSiweMessage
// ---------------------------------------------------------------------------

describe('parseSiweMessage', () => {
  it('parses the basic message successfully', () => {
    const result = parseSiweMessage(VECTORS.basic.message);
    expect(result.success).toBe(true);
    expect(result.error).toBeUndefined();
    expect(result.data).toBeDefined();
  });

  it('extracts domain correctly', () => {
    const result = parseSiweMessage(VECTORS.basic.message);
    expect(result.data?.domain).toBe('example.com');
  });

  it('extracts address correctly', () => {
    const result = parseSiweMessage(VECTORS.basic.message);
    expect(result.data?.address).toBe(TEST_ADDRESS);
  });

  it('extracts uri correctly', () => {
    const result = parseSiweMessage(VECTORS.basic.message);
    expect(result.data?.uri).toBe('https://example.com');
  });

  it('extracts version correctly', () => {
    const result = parseSiweMessage(VECTORS.basic.message);
    expect(result.data?.version).toBe('1');
  });

  it('extracts chainId as a number', () => {
    const result = parseSiweMessage(VECTORS.basic.message);
    expect(result.data?.chainId).toBe(1);
    expect(typeof result.data?.chainId).toBe('number');
  });

  it('extracts nonce correctly', () => {
    const result = parseSiweMessage(VECTORS.basic.message);
    expect(result.data?.nonce).toBe('abc12345');
  });

  it('extracts issuedAt correctly', () => {
    const result = parseSiweMessage(VECTORS.basic.message);
    expect(result.data?.issuedAt).toBe('2024-01-01T00:00:00.000Z');
  });

  it('parses statement when present', () => {
    const result = parseSiweMessage(VECTORS.withStatement.message);
    expect(result.success).toBe(true);
    expect(result.data?.statement).toBe('I accept the Terms of Service.');
  });

  it('leaves statement undefined when absent', () => {
    const result = parseSiweMessage(VECTORS.basic.message);
    expect(result.data?.statement).toBeUndefined();
  });

  it('parses expirationTime when present', () => {
    const result = parseSiweMessage(VECTORS.expired.message);
    expect(result.data?.expirationTime).toBe('2020-01-01T00:00:00.000Z');
  });

  it('leaves expirationTime undefined when absent', () => {
    const result = parseSiweMessage(VECTORS.basic.message);
    expect(result.data?.expirationTime).toBeUndefined();
  });

  it('parses resources list when present', () => {
    const result = parseSiweMessage(VECTORS.withResources.message);
    expect(result.success).toBe(true);
    expect(result.data?.resources).toEqual([
      'https://example.com/resource1',
      'ipfs://QmX...',
    ]);
  });

  it('leaves resources undefined when absent', () => {
    const result = parseSiweMessage(VECTORS.basic.message);
    expect(result.data?.resources).toBeUndefined();
  });

  it('returns success:false for an empty string', () => {
    const result = parseSiweMessage('');
    expect(result.success).toBe(false);
    expect(result.error).toBeDefined();
  });

  it('returns success:false when the header line is missing', () => {
    const bad =
      '0xf39Fd6e51aad88F6F4ce6aB8827279cffFb92266\n\nURI: https://example.com\nVersion: 1\nChain ID: 1\nNonce: abc\nIssued At: 2024-01-01T00:00:00.000Z';
    const result = parseSiweMessage(bad);
    expect(result.success).toBe(false);
    expect(result.error).toMatch(/header/i);
  });

  it('returns success:false when address is missing or malformed', () => {
    const bad =
      'example.com wants you to sign in with your Ethereum account:\nnot-an-address\n\nURI: https://example.com\nVersion: 1\nChain ID: 1\nNonce: abc\nIssued At: 2024-01-01T00:00:00.000Z';
    const result = parseSiweMessage(bad);
    expect(result.success).toBe(false);
    expect(result.error).toMatch(/address/i);
  });

  it('returns success:false when URI is missing', () => {
    const bad =
      'example.com wants you to sign in with your Ethereum account:\n0xf39Fd6e51aad88F6F4ce6aB8827279cffFb92266\n\nVersion: 1\nChain ID: 1\nNonce: abc\nIssued At: 2024-01-01T00:00:00.000Z';
    const result = parseSiweMessage(bad);
    expect(result.success).toBe(false);
    expect(result.error).toMatch(/URI/i);
  });

  it('returns success:false when Nonce is missing', () => {
    const bad =
      'example.com wants you to sign in with your Ethereum account:\n0xf39Fd6e51aad88F6F4ce6aB8827279cffFb92266\n\nURI: https://example.com\nVersion: 1\nChain ID: 1\nIssued At: 2024-01-01T00:00:00.000Z';
    const result = parseSiweMessage(bad);
    expect(result.success).toBe(false);
    expect(result.error).toMatch(/Nonce/i);
  });

  it('returns success:false when Chain ID is invalid (non-numeric)', () => {
    const bad =
      'example.com wants you to sign in with your Ethereum account:\n0xf39Fd6e51aad88F6F4ce6aB8827279cffFb92266\n\nURI: https://example.com\nVersion: 1\nChain ID: abc\nNonce: xyz\nIssued At: 2024-01-01T00:00:00.000Z';
    const result = parseSiweMessage(bad);
    expect(result.success).toBe(false);
    expect(result.error).toMatch(/Chain ID/i);
  });

  it('returns success:false when Issued At is missing', () => {
    const bad =
      'example.com wants you to sign in with your Ethereum account:\n0xf39Fd6e51aad88F6F4ce6aB8827279cffFb92266\n\nURI: https://example.com\nVersion: 1\nChain ID: 1\nNonce: abc12345';
    const result = parseSiweMessage(bad);
    expect(result.success).toBe(false);
    expect(result.error).toMatch(/Issued At/i);
  });

  it('does not throw — always returns a result object', () => {
    const weirdInputs = [null as any, undefined as any, 42 as any, {} as any];
    for (const input of weirdInputs) {
      expect(() => parseSiweMessage(input)).not.toThrow();
    }
  });

  it('returns success:false for a message exceeding the maximum length', () => {
    const longDomain = 'x'.repeat(MAX_SIWE_MESSAGE_LENGTH + 1);
    const result = parseSiweMessage(longDomain);
    expect(result.success).toBe(false);
    expect(result.error).toMatch(/exceeds maximum length/i);
  });

  it('returns success:false for a malformed domain in the header', () => {
    const bad =
      'has spaces wants you to sign in with your Ethereum account:\n0xf39Fd6e51aad88F6F4ce6aB8827279cffFb92266\n\nURI: https://example.com\nVersion: 1\nChain ID: 1\nNonce: abc12345\nIssued At: 2024-01-01T00:00:00.000Z';
    const result = parseSiweMessage(bad);
    expect(result.success).toBe(false);
    expect(result.error).toMatch(/domain/i);
  });

  it('returns success:false for a domain with invalid characters', () => {
    const bad =
      '<script>alert(1)</script> wants you to sign in with your Ethereum account:\n0xf39Fd6e51aad88F6F4ce6aB8827279cffFb92266\n\nURI: https://example.com\nVersion: 1\nChain ID: 1\nNonce: abc12345\nIssued At: 2024-01-01T00:00:00.000Z';
    const result = parseSiweMessage(bad);
    expect(result.success).toBe(false);
    expect(result.error).toMatch(/domain/i);
  });

  it('accepts localhost as a valid domain', () => {
    const msg =
      'localhost wants you to sign in with your Ethereum account:\n0xf39Fd6e51aad88F6F4ce6aB8827279cffFb92266\n\nURI: https://example.com\nVersion: 1\nChain ID: 1\nNonce: abc12345\nIssued At: 2024-01-01T00:00:00.000Z';
    const result = parseSiweMessage(msg);
    expect(result.success).toBe(true);
    expect(result.data?.domain).toBe('localhost');
  });

  it('accepts a valid subdomain', () => {
    const msg =
      'app.example.com wants you to sign in with your Ethereum account:\n0xf39Fd6e51aad88F6F4ce6aB8827279cffFb92266\n\nURI: https://example.com\nVersion: 1\nChain ID: 1\nNonce: abc12345\nIssued At: 2024-01-01T00:00:00.000Z';
    const result = parseSiweMessage(msg);
    expect(result.success).toBe(true);
    expect(result.data?.domain).toBe('app.example.com');
  });
});

// ---------------------------------------------------------------------------
// verifySiweSignature — valid signatures
// ---------------------------------------------------------------------------

describe('verifySiweSignature — valid signatures', () => {
  it('returns success:true for the basic test vector', () => {
    const result = verifySiweSignature({
      message: VECTORS.basic.message,
      signature: VECTORS.basic.signature,
    });
    expect(result.success).toBe(true);
    expect(result.error).toBeUndefined();
    expect(result.code).toBeUndefined();
  });

  it('returns the parsed SiweMessage as result.data on success', () => {
    const result = verifySiweSignature({
      message: VECTORS.basic.message,
      signature: VECTORS.basic.signature,
    });
    expect(result.data).toBeDefined();
    expect(result.data?.domain).toBe('example.com');
    expect(result.data?.address).toBe(TEST_ADDRESS);
    expect(result.data?.chainId).toBe(1);
    expect(result.data?.nonce).toBe('abc12345');
  });

  it('verifies a message with an optional statement', () => {
    const result = verifySiweSignature({
      message: VECTORS.withStatement.message,
      signature: VECTORS.withStatement.signature,
    });
    expect(result.success).toBe(true);
    expect(result.data?.statement).toBe('I accept the Terms of Service.');
  });

  it('verifies a message with resources', () => {
    const result = verifySiweSignature({
      message: VECTORS.withResources.message,
      signature: VECTORS.withResources.signature,
    });
    expect(result.success).toBe(true);
    expect(result.data?.resources).toEqual([
      'https://example.com/resource1',
      'ipfs://QmX...',
    ]);
  });

  it('verifies a message with a future expiration time', () => {
    const result = verifySiweSignature({
      message: VECTORS.futureExpiry.message,
      signature: VECTORS.futureExpiry.signature,
    });
    expect(result.success).toBe(true);
  });

  it('accepts a matching expectedDomain', () => {
    const result = verifySiweSignature({
      message: VECTORS.basic.message,
      signature: VECTORS.basic.signature,
      expectedDomain: 'example.com',
    });
    expect(result.success).toBe(true);
  });

  it('accepts a matching expectedNonce', () => {
    const result = verifySiweSignature({
      message: VECTORS.basic.message,
      signature: VECTORS.basic.signature,
      expectedNonce: 'abc12345',
    });
    expect(result.success).toBe(true);
  });

  it('accepts both expectedDomain and expectedNonce together', () => {
    const result = verifySiweSignature({
      message: VECTORS.basic.message,
      signature: VECTORS.basic.signature,
      expectedDomain: 'example.com',
      expectedNonce: 'abc12345',
    });
    expect(result.success).toBe(true);
  });

  it('accepts a 0x-prefixed signature', () => {
    const result = verifySiweSignature({
      message: VECTORS.basic.message,
      signature: VECTORS.basic.signature, // already 0x-prefixed
    });
    expect(result.success).toBe(true);
  });

  it('accepts a signature without 0x prefix', () => {
    const sigWithout0x = VECTORS.basic.signature.slice(2);
    const result = verifySiweSignature({
      message: VECTORS.basic.message,
      signature: sigWithout0x,
    });
    expect(result.success).toBe(true);
  });

  it('bypasses expiry check when checkExpiry is false', () => {
    const result = verifySiweSignature({
      message: VECTORS.expired.message,
      signature: VECTORS.expired.signature,
      checkExpiry: false,
    });
    expect(result.success).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// verifySiweSignature — invalid / failing cases
// ---------------------------------------------------------------------------

describe('verifySiweSignature — invalid signatures', () => {
  it('returns success:false for a completely wrong signature', () => {
    const badSig = '0x' + 'a'.repeat(130);
    const result = verifySiweSignature({
      message: VECTORS.basic.message,
      signature: badSig,
    });
    expect(result.success).toBe(false);
    expect(result.code).toBe(GuildPassErrorCode.SIWE_INVALID_SIGNATURE);
  });

  it('returns success:false when the message is tampered after signing', () => {
    // Swap the nonce in an already-signed message
    const tampered = VECTORS.basic.message.replace('Nonce: abc12345', 'Nonce: TAMPERED1');
    const result = verifySiweSignature({
      message: tampered,
      signature: VECTORS.basic.signature,
    });
    expect(result.success).toBe(false);
    expect(result.code).toBe(GuildPassErrorCode.SIWE_INVALID_SIGNATURE);
  });

  it('returns SIWE_EXPIRED for an expired message with checkExpiry:true (default)', () => {
    const result = verifySiweSignature({
      message: VECTORS.expired.message,
      signature: VECTORS.expired.signature,
    });
    expect(result.success).toBe(false);
    expect(result.code).toBe(GuildPassErrorCode.SIWE_EXPIRED);
    expect(result.error).toMatch(/expir/i);
  });

  it('returns SIWE_DOMAIN_MISMATCH for a wrong expectedDomain', () => {
    const result = verifySiweSignature({
      message: VECTORS.basic.message,
      signature: VECTORS.basic.signature,
      expectedDomain: 'evil.com',
    });
    expect(result.success).toBe(false);
    expect(result.code).toBe(GuildPassErrorCode.SIWE_DOMAIN_MISMATCH);
    expect(result.error).toMatch(/domain/i);
  });

  it('returns SIWE_INVALID_MESSAGE for a wrong expectedNonce', () => {
    const result = verifySiweSignature({
      message: VECTORS.basic.message,
      signature: VECTORS.basic.signature,
      expectedNonce: 'wrongnonce',
    });
    expect(result.success).toBe(false);
    expect(result.code).toBe(GuildPassErrorCode.SIWE_INVALID_MESSAGE);
    expect(result.error).toMatch(/nonce/i);
  });

  it('returns SIWE_INVALID_MESSAGE for a completely malformed message', () => {
    const result = verifySiweSignature({
      message: 'not a siwe message at all',
      signature: VECTORS.basic.signature,
    });
    expect(result.success).toBe(false);
    expect(result.code).toBe(GuildPassErrorCode.SIWE_INVALID_MESSAGE);
  });

  it('returns SIWE_INVALID_SIGNATURE for a signature that is too short', () => {
    const result = verifySiweSignature({
      message: VECTORS.basic.message,
      signature: '0xdeadbeef',
    });
    expect(result.success).toBe(false);
    expect(result.code).toBe(GuildPassErrorCode.SIWE_INVALID_SIGNATURE);
  });

  it('returns SIWE_INVALID_SIGNATURE for a signature from a different key', () => {
    // Use a signature generated for the withStatement message — it covers a different hash
    const result = verifySiweSignature({
      message: VECTORS.basic.message,
      signature: VECTORS.withStatement.signature, // wrong sig for this message
    });
    expect(result.success).toBe(false);
    expect(result.code).toBe(GuildPassErrorCode.SIWE_INVALID_SIGNATURE);
  });

  it('does not throw — always returns a result object', () => {
    const inputs = [
      { message: '', signature: '' },
      { message: null as any, signature: null as any },
      { message: VECTORS.basic.message, signature: 'not-hex' },
    ];
    for (const input of inputs) {
      expect(() => verifySiweSignature(input)).not.toThrow();
      const result = verifySiweSignature(input);
      expect(result).toHaveProperty('success');
      expect(result.success).toBe(false);
    }
  });
});

// ---------------------------------------------------------------------------
// verifySiweSignature — error codes are correctly set
// ---------------------------------------------------------------------------

describe('verifySiweSignature — error code mapping', () => {
  it('sets code SIWE_INVALID_SIGNATURE on bad signature', () => {
    const result = verifySiweSignature({
      message: VECTORS.basic.message,
      signature: '0x' + '0'.repeat(130),
    });
    expect(result.code).toBe(GuildPassErrorCode.SIWE_INVALID_SIGNATURE);
  });

  it('sets code SIWE_EXPIRED on expired message', () => {
    const result = verifySiweSignature({
      message: VECTORS.expired.message,
      signature: VECTORS.expired.signature,
    });
    expect(result.code).toBe(GuildPassErrorCode.SIWE_EXPIRED);
  });

  it('sets code SIWE_DOMAIN_MISMATCH on domain check failure', () => {
    const result = verifySiweSignature({
      message: VECTORS.basic.message,
      signature: VECTORS.basic.signature,
      expectedDomain: 'other.com',
    });
    expect(result.code).toBe(GuildPassErrorCode.SIWE_DOMAIN_MISMATCH);
  });

  it('sets code SIWE_INVALID_MESSAGE on parse failure', () => {
    const result = verifySiweSignature({
      message: 'garbage',
      signature: VECTORS.basic.signature,
    });
    expect(result.code).toBe(GuildPassErrorCode.SIWE_INVALID_MESSAGE);
  });

  it('does not set code on success', () => {
    const result = verifySiweSignature({
      message: VECTORS.basic.message,
      signature: VECTORS.basic.signature,
    });
    expect(result.code).toBeUndefined();
  });
});

// ---------------------------------------------------------------------------
// Integration: public API exports from src/index.ts
// ---------------------------------------------------------------------------

describe('SIWE public API exports', () => {
  it('re-exports formatSiweMessage from the root package', async () => {
    const mod = await import('../src/index');
    expect(typeof mod.formatSiweMessage).toBe('function');
  });

  it('re-exports parseSiweMessage from the root package', async () => {
    const mod = await import('../src/index');
    expect(typeof mod.parseSiweMessage).toBe('function');
  });

  it('re-exports verifySiweSignature from the root package', async () => {
    const mod = await import('../src/index');
    expect(typeof mod.verifySiweSignature).toBe('function');
  });

  it('re-exports generateSiweNonce from the root package', async () => {
    const mod = await import('../src/index');
    expect(typeof mod.generateSiweNonce).toBe('function');
  });

  it('exports SIWE error codes from GuildPassErrorCode', () => {
    expect(GuildPassErrorCode.SIWE_INVALID_SIGNATURE).toBe('SIWE_INVALID_SIGNATURE');
    expect(GuildPassErrorCode.SIWE_EXPIRED).toBe('SIWE_EXPIRED');
    expect(GuildPassErrorCode.SIWE_DOMAIN_MISMATCH).toBe('SIWE_DOMAIN_MISMATCH');
    expect(GuildPassErrorCode.SIWE_INVALID_MESSAGE).toBe('SIWE_INVALID_MESSAGE');
  });
});
