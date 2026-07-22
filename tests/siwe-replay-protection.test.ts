/**
 * Tests for SIWE nonce store abstraction and single-use replay protection (#219).
 *
 * Acceptance criteria coverage:
 *  1. Replaying an identical valid SIWE message+signature a second time through
 *     the wrapper fails with a clear, distinct error/result.
 *  2. InMemoryNonceStore correctly expires old nonces to avoid unbounded memory.
 *  3. (Design) A failed verification never consumes a nonce, and the store
 *     mirrors the CacheAdapter shape so a shared backend can be swapped in.
 *
 * The valid message+signature vector below is the same one used by
 * tests/siwe.test.ts, produced with the first Hardhat account:
 *   pk 0xac0974bec39a17e36ba4a6b4d238ff944bacb478cbed5efcae784d7bf4f2ff80
 *   address 0xf39Fd6e51aad88F6F4ce6aB8827279cffFb92266
 * Using a real vector means the nonce is consumed through the genuine verify
 * path, not a stub.
 */
import { describe, it, expect } from 'vitest';
import {
  InMemoryNonceStore,
  verifySiweSignatureWithReplayProtection,
} from '../src/siwe';
import type { NonceStore } from '../src/siwe';
import { GuildPassErrorCode } from '../src/errors/errorCodes';

// ---------------------------------------------------------------------------
// Fixtures — a genuinely valid SIWE message + signature (nonce: abc12345).
// ---------------------------------------------------------------------------

const VALID = {
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
};

// ---------------------------------------------------------------------------
// AC1: single-use — first accept, second (replay) rejected distinctly
// ---------------------------------------------------------------------------

describe('verifySiweSignatureWithReplayProtection (AC1)', () => {
  it('accepts a valid message the first time', async () => {
    const store = new InMemoryNonceStore();
    const result = await verifySiweSignatureWithReplayProtection(
      { message: VALID.message, signature: VALID.signature, checkExpiry: false },
      store,
    );

    expect(result.success).toBe(true);
    expect(result.data?.nonce).toBe('abc12345');
  });

  it('rejects an identical replay with a distinct SIWE_REPLAY_DETECTED code', async () => {
    const store = new InMemoryNonceStore();
    const params = { message: VALID.message, signature: VALID.signature, checkExpiry: false };

    const first = await verifySiweSignatureWithReplayProtection(params, store);
    const second = await verifySiweSignatureWithReplayProtection(params, store);

    expect(first.success).toBe(true);
    // The replay must fail, distinctly and clearly.
    expect(second.success).toBe(false);
    expect(second.code).toBe(GuildPassErrorCode.SIWE_REPLAY_DETECTED);
    expect(second.error).toMatch(/replay/i);
    // The distinct code separates a replay from an ordinary bad signature.
    expect(second.code).not.toBe(GuildPassErrorCode.SIWE_INVALID_SIGNATURE);
  });

  it('does NOT consume the nonce when verification fails', async () => {
    const store = new InMemoryNonceStore();

    // Tamper the signature so verification fails.
    const bad = {
      message: VALID.message,
      signature: '0x' + '00'.repeat(65),
      checkExpiry: false,
    };
    const failed = await verifySiweSignatureWithReplayProtection(bad, store);
    expect(failed.success).toBe(false);
    // Nonce must remain unconsumed, so a later valid submission still works.
    expect(await store.has('abc12345')).toBe(false);

    const good = await verifySiweSignatureWithReplayProtection(
      { message: VALID.message, signature: VALID.signature, checkExpiry: false },
      store,
    );
    expect(good.success).toBe(true);
  });

  it('fails closed when the nonce store throws during consume', async () => {
    const throwingStore: NonceStore = {
      consume: async () => {
        throw new Error('backend unavailable');
      },
    };

    const result = await verifySiweSignatureWithReplayProtection(
      { message: VALID.message, signature: VALID.signature, checkExpiry: false },
      throwingStore,
    );

    // A store failure must reject, never silently accept a possible replay.
    expect(result.success).toBe(false);
    expect(result.code).toBe(GuildPassErrorCode.SIWE_REPLAY_DETECTED);
  });
});

// ---------------------------------------------------------------------------
// AC2: InMemoryNonceStore expires old nonces (bounded memory)
// ---------------------------------------------------------------------------

describe('InMemoryNonceStore expiry (AC2)', () => {
  it('reports a consumed nonce as used until its TTL elapses', async () => {
    const store = new InMemoryNonceStore();

    expect(await store.consume('nonce-1', 1000)).toBe(true); // fresh
    expect(await store.consume('nonce-1', 1000)).toBe(false); // still live -> replay
    expect(await store.has('nonce-1')).toBe(true);
  });

  it('allows re-consumption once a nonce has expired', async () => {
    const store = new InMemoryNonceStore();

    // Consume with a 1ms TTL, then wait past it.
    expect(await store.consume('short', 1)).toBe(true);
    await new Promise((r) => setTimeout(r, 5));

    // Expired: has() is false and it can be consumed again.
    expect(await store.has('short')).toBe(false);
    expect(await store.consume('short', 1)).toBe(true);
  });

  it('prunes expired entries so memory does not grow unbounded', async () => {
    const store = new InMemoryNonceStore();

    for (let i = 0; i < 50; i += 1) {
      await store.consume(`n-${i}`, 1);
    }
    expect(store.size).toBe(50);

    await new Promise((r) => setTimeout(r, 5));
    store.sweepExpired();

    expect(store.size).toBe(0);
  });

  it('keeps entries with no TTL until explicitly cleared', async () => {
    const store = new InMemoryNonceStore();

    await store.consume('permanent'); // no TTL
    store.sweepExpired(Date.now() + 1_000_000); // far future sweep
    expect(await store.has('permanent')).toBe(true);

    await store.clear();
    expect(await store.has('permanent')).toBe(false);
  });

  it('dispose() stops the background sweep timer without error', () => {
    const store = new InMemoryNonceStore({ sweepIntervalMs: 10 });
    expect(() => store.dispose()).not.toThrow();
  });
});
