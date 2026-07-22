/**
 * Edge-Runtime (V8-isolate / Cloudflare Workers) compatibility tests.
 *
 * These tests run under `@edge-runtime/vm` which simulates the V8-isolate
 * environment (no Node.js builtins like `node:crypto`, `Buffer`, `process`,
 * etc.). They verify the SDK never crashes or throws due to missing Node.js
 * APIs at import time or during normal operation.
 */

import { describe, it, expect } from 'vitest';

// ---------------------------------------------------------------------------
// Environment detection utilities
// ---------------------------------------------------------------------------

describe('isNodeEnvironment (in Edge runtime)', () => {
  it('should return false under @edge-runtime/vm', async () => {
    const { isNodeEnvironment, hasWebCrypto, isEdgeRuntime, isBrowser } = await import(
      '../../../src/utils/env'
    );
    // In @edge-runtime/vm, there is no process.versions.node
    expect(isNodeEnvironment()).toBe(false);
    // @edge-runtime/vm provides Web Crypto
    expect(hasWebCrypto()).toBe(true);
    // @edge-runtime/vm has globalThis.addEventListener and no navigator
    expect(isEdgeRuntime()).toBe(true);
    // @edge-runtime/vm does NOT have window.document
    expect(isBrowser()).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// constantTimeEqual
// ---------------------------------------------------------------------------

describe('constantTimeEqual - Edge Runtime', () => {
  it('works under V8 edge constraints', async () => {
    const { constantTimeEqual } = await import('../../../src/utils/constantTime');
    expect(constantTimeEqual('abc', 'abc')).toBe(true);
    expect(constantTimeEqual('abc', 'abd')).toBe(false);
    expect(constantTimeEqual('abc', 'abcd')).toBe(false);
    expect(constantTimeEqual('', '')).toBe(true);
    expect(constantTimeEqual('0x1234', '0x1234')).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// Address utilities (previously used node:crypto)
// ---------------------------------------------------------------------------

describe('Address utilities - Edge Runtime', () => {
  it('toChecksumAddress should use js-sha3 instead of node:crypto', async () => {
    const { toChecksumAddress, normaliseAddress, isChecksumAddress } = await import(
      '../../../src/utils/address'
    );

    // Vitalik's address - known EIP-55 checksum
    const addr = '0xd8dA6BF26964aF9D7eEd9e03E53415D37aA96045';
    expect(toChecksumAddress(addr.toLowerCase())).toBe(addr);
    expect(toChecksumAddress(addr.toUpperCase())).toBe(addr);

    // Normalise
    expect(normaliseAddress('0xABC')).toBe('0xabc');

    // Checksum validation
    expect(isChecksumAddress(addr)).toBe(true);
  });

  it('areAddressesEqual should work correctly', async () => {
    const { areAddressesEqual } = await import('../../../src/utils/address');
    expect(
      areAddressesEqual(
        '0xd8dA6BF26964aF9D7eEd9e03E53415D37aA96045',
        '0xDD8da6bf26964af9d7eed9e03e53415d37aa96045',
      ),
    ).toBe(true);
    expect(
      areAddressesEqual(
        '0xd8dA6BF26964aF9D7eEd9e03E53415D37aA96045',
        '0x0000000000000000000000000000000000000000',
      ),
    ).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// secp256k1 crypto (pure JS, no Node.js deps)
// ---------------------------------------------------------------------------

describe('secp256k1 - Edge Runtime', () => {
  it('should perform modular arithmetic', async () => {
    const { modPow, modInv, CURVE } = await import('../../../src/crypto/secp256k1');
    const two = BigInt(2);
    const three = BigInt(3);
    // 2^3 mod 7 = 8 mod 7 = 1
    expect(modPow(two, three, BigInt(7))).toBe(BigInt(1));
    // modInv
    const inv = modInv(two, BigInt(7)); // 2^-1 mod 7 = 4
    expect((two * inv) % BigInt(7)).toBe(BigInt(1));
    // Curve params accessible
    expect(CURVE.P).toBeDefined();
    expect(CURVE.N).toBeDefined();
  });

  it('should perform ECDSA recovery', async () => {
    const { ecRecover, hexToBytes, hashPersonalMessage, publicKeyToAddress } = await import(
      '../../../src/crypto/secp256k1'
    );

    // Test with a known signature structure (not verifying real sig, just the function)
    const msgHash = new Uint8Array(32);
    msgHash[0] = 0x01;
    const result = ecRecover(msgHash, 0, BigInt(1), BigInt(1));
    // With invalid s value (too high), should return null
    expect(result).toBeNull();
  });

  it('hexToBytes and publicKeyToAddress should work', async () => {
    const { hexToBytes, publicKeyToAddress } = await import('../../../src/crypto/secp256k1');
    const bytes = hexToBytes('deadbeef');
    expect(bytes.length).toBe(4);
    expect(bytes[0]).toBe(0xde);
    expect(bytes[3]).toBe(0xef);

    // Invalid pubkey → null
    expect(publicKeyToAddress(new Uint8Array(0))).toBeNull();
  });
});

// ---------------------------------------------------------------------------
// SIWE helpers (verify no node:crypto import at module level)
// ---------------------------------------------------------------------------

describe('SIWE helpers - Edge Runtime', () => {
  it('should generate a valid nonce without node:crypto', async () => {
    const { generateSiweNonce } = await import('../../../src/siwe/index');
    const nonce = generateSiweNonce();
    expect(nonce).toBeDefined();
    expect(typeof nonce).toBe('string');
    expect(nonce.length).toBe(16);
    // Should be alphanumeric
    expect(/^[a-zA-Z0-9]{16}$/.test(nonce)).toBe(true);
  });

  it('should format and parse SIWE messages', async () => {
    const { formatSiweMessage, parseSiweMessage } = await import('../../../src/siwe/index');

    const msg = {
      domain: 'example.com',
      address: '0xd8dA6BF26964aF9D7eEd9e03E53415D37aA96045',
      uri: 'https://example.com',
      version: '1',
      chainId: 1,
      nonce: 'abc12345xyz67890',
      issuedAt: '2024-01-01T00:00:00.000Z',
      statement: 'Sign in to Example',
    };

    const formatted = formatSiweMessage(msg);
    expect(formatted).toContain('example.com wants you to sign in');
    expect(formatted).toContain('URI: https://example.com');

    const parsed = parseSiweMessage(formatted);
    expect(parsed.success).toBe(true);
    expect(parsed.data?.domain).toBe('example.com');
    expect(parsed.data?.statement).toBe('Sign in to Example');
  });

  it('should verify SIWE signature (invalid cases)', async () => {
    const { verifySiweSignature } = await import('../../../src/siwe/index');

    // Invalid message
    const result1 = verifySiweSignature({
      message: null as unknown as string,
      signature: '0xabc',
    });
    expect(result1.success).toBe(false);

    // Invalid signature format
    const result2 = verifySiweSignature({
      message:
        'example.com wants you to sign in with your Ethereum account:\n0x1234\n\nURI: https://example.com\nVersion: 1\nChain ID: 1\nNonce: abc\nIssued At: 2024-01-01T00:00:00.000Z',
      signature: '0xinvalid',
      expectedDomain: 'example.com',
    });
    expect(result2.success).toBe(false);
    expect(result2.code).toBe('SIWE_INVALID_SIGNATURE');
  });
});

// ---------------------------------------------------------------------------
// Token bucket (setTimeout / Date.now based)
// ---------------------------------------------------------------------------

describe('TokenBucket - Edge Runtime', () => {
  it('should initialize and acquire tokens', async () => {
    const { TokenBucket } = await import('../../../src/http/tokenBucket');
    const bucket = new TokenBucket({ requestsPerSecond: 1000, burst: 10 });
    // First acquire should resolve immediately
    await expect(bucket.acquire()).resolves.toBeUndefined();
  });
});

// ---------------------------------------------------------------------------
// Cache types (no runtime dependencies)
// ---------------------------------------------------------------------------

describe('Cache - Edge Runtime', () => {
  it('InMemoryCacheAdapter should work', async () => {
    const { InMemoryCacheAdapter } = await import('../../../src/cache/cache.types');
    const cache = new InMemoryCacheAdapter();
    await cache.set('key1', { data: 'value1' }, 60_000);
    const val1 = await cache.get<{ data: string }>('key1');
    expect(val1?.data).toBe('value1');
    const val2 = await cache.get<unknown>('nonexistent');
    expect(val2).toBeNull();
    await cache.delete('key1');
    const val3 = await cache.get<unknown>('key1');
    expect(val3).toBeNull();
  });

  it('InMemoryCacheAdapter deleteByPrefix should work', async () => {
    const { InMemoryCacheAdapter } = await import('../../../src/cache/cache.types');
    const cache = new InMemoryCacheAdapter();
    await cache.set('wallet:0xabc:key1', 'val1');
    await cache.set('wallet:0xabc:key2', 'val2');
    await cache.set('guild:g1:key3', 'val3');
    await cache.deleteByPrefix('wallet:0xabc:');
    expect(await cache.get('wallet:0xabc:key1')).toBeNull();
    expect(await cache.get('wallet:0xabc:key2')).toBeNull();
    expect(await cache.get('guild:g1:key3')).toBe('val3');
  });

  it('InMemoryCacheAdapter clear should work', async () => {
    const { InMemoryCacheAdapter } = await import('../../../src/cache/cache.types');
    const cache = new InMemoryCacheAdapter();
    await cache.set('key', 'value');
    await cache.clear();
    expect(await cache.get('key')).toBeNull();
  });
});

// ---------------------------------------------------------------------------
// SIWE replay protection (no Node.js deps in core logic)
// ---------------------------------------------------------------------------

describe('SIWE replay protection - Edge Runtime', () => {
  it('should parse messages without Node.js deps', async () => {
    const { parseSiweMessage } = await import('../../../src/siwe/index');
    const result = parseSiweMessage('invalid');
    expect(result.success).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// Error types (purely structural)
// ---------------------------------------------------------------------------

describe('Error types - Edge Runtime', () => {
  it('should instantiate GuildPassError', async () => {
    const { GuildPassError } = await import('../../../src/errors/GuildPassError');
    const { GuildPassErrorCode } = await import('../../../src/errors/errorCodes');
    const err = new GuildPassError('Test error', GuildPassErrorCode.INVALID_CONFIG);
    expect(err.message).toBe('Test error');
    expect(err.code).toBe('INVALID_CONFIG');
  });

  it('should have valid error codes', async () => {
    const { GuildPassErrorCode } = await import('../../../src/errors/errorCodes');
    expect(GuildPassErrorCode.INVALID_CONFIG).toBe('INVALID_CONFIG');
    expect(GuildPassErrorCode.SIWE_INVALID_SIGNATURE).toBe('SIWE_INVALID_SIGNATURE');
  });
});

// ---------------------------------------------------------------------------
// GuildPassClient instantiation (without Node.js globals)
// ---------------------------------------------------------------------------

describe('GuildPassClient - Edge Runtime', () => {
  it('should initialize without Node.js globals', async () => {
    const { GuildPassClient } = await import('../../../src/client/GuildPassClient');
    expect(() => {
      new GuildPassClient({
        apiUrl: 'https://api.guildpass.xyz',
        chainId: 8453,
      });
    }).not.toThrow();
  });

  it('should instantiate with caching enabled', async () => {
    const { GuildPassClient } = await import('../../../src/client/GuildPassClient');
    const { InMemoryCacheAdapter } = await import('../../../src/cache/cache.types');

    const client = new GuildPassClient({
      apiUrl: 'https://api.guildpass.xyz',
      cache: new InMemoryCacheAdapter(),
      cacheTtl: 60_000,
    });

    expect(client.cache).toBeDefined(); // eslint-disable-line
    expect(client.access).toBeDefined();
    expect(client.membership).toBeDefined();
    expect(client.roles).toBeDefined();
    expect(client.guilds).toBeDefined();
  });
});

// ---------------------------------------------------------------------------
// Validation schema & response guards (pure logic)
// ---------------------------------------------------------------------------

describe('Validation - Edge Runtime', () => {
  it('should validate addresses', async () => {
    const { validateAddress } = await import('../../../src/utils/validation');
    expect(() => validateAddress('0xd8dA6BF26964aF9D7eEd9e03E53415D37aA96045')).not.toThrow();
    expect(() => validateAddress('invalid')).toThrow();
  });

  it('schema validators should work', async () => {
    const { string, number, boolean, object, optional, array } = await import(
      '../../../src/validation/schema'
    );

    const isPerson = object({
      name: string(),
      age: number(),
      active: optional(boolean()),
    });

    expect(isPerson({ name: 'Alice', age: 30 })).toBe(true);
    expect(isPerson({ name: 'Alice', age: 30, active: true })).toBe(true);
    expect(isPerson({ name: 123 })).toBe(false);
    expect(isPerson(null)).toBe(false);

    const isStringArr = array(string());
    expect(isStringArr(['a', 'b'])).toBe(true);
    expect(isStringArr([1, 2])).toBe(false);
  });
});
