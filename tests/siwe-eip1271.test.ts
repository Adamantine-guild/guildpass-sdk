/**
 * EIP-1271 smart-contract wallet verification for SIWE (#213).
 *
 * The fallback is deliberately keyed on *any* SIWE_INVALID_SIGNATURE outcome
 * rather than on a recovered-address mismatch: an EIP-1271 signature has no
 * fixed length, so a Safe signature is rejected by the 65-byte guard before
 * ECDSA recovery ever runs. Several tests below exist specifically to pin that.
 */
import { describe, it, expect, vi } from 'vitest';
import {
  verifySiweSignature,
  verifySiweSignatureAsync,
  verifySiweSignatureWithReplayProtection,
  InMemoryNonceStore,
  EIP1271_MAGIC_VALUE,
} from '../src/siwe';
import { encodeIsValidSignature } from '../src/siwe/eip1271';
import { GuildPassErrorCode } from '../src/errors/errorCodes';
import { hashPersonalMessage } from '../src/crypto/secp256k1';
import type { ContractProvider } from '../src/contracts/providers/provider.types';

// ---------------------------------------------------------------------------
// Fixtures
// ---------------------------------------------------------------------------

/** The address claimed by the message below; treated as a contract wallet here. */
const WALLET = '0xf39Fd6e51aad88F6F4ce6aB8827279cffFb92266';

const MESSAGE =
  'example.com wants you to sign in with your Ethereum account:\n' +
  '0xf39Fd6e51aad88F6F4ce6aB8827279cffFb92266\n' +
  '\n' +
  'URI: https://example.com\n' +
  'Version: 1\n' +
  'Chain ID: 1\n' +
  'Nonce: abc12345\n' +
  'Issued At: 2024-01-01T00:00:00.000Z';

/** A genuine ECDSA signature over MESSAGE by WALLET's key — verifies locally. */
const VALID_EOA_SIGNATURE =
  '0x82790bc51f261e6461cb1a3baeed8494cd796093c93db2b564c2260535203c612ca06a4cf8ca39e15452d8fbd24000c6d752a45c5c46ae1ced3c641b5370c1901b';

/**
 * A 200-byte signature — the shape a Safe with multiple owners produces.
 * Nothing about it is recoverable; the point is that it is not 65 bytes.
 */
const CONTRACT_SIGNATURE = `0x${'ab'.repeat(200)}`;

/** A well-formed 65-byte signature that simply recovers to the wrong address. */
const MISMATCHED_SIGNATURE = `0x${'11'.repeat(32)}${'22'.repeat(32)}1b`;

const MAGIC_WORD = `${EIP1271_MAGIC_VALUE}${'0'.repeat(56)}`;

/** Minimal ContractProvider stub; only `ethCall` is exercised. */
function mockProvider(impl: () => Promise<unknown>): ContractProvider {
  return {
    ethCall: vi.fn(impl),
    batchEthCall: vi.fn(),
  } as unknown as ContractProvider;
}

const acceptingProvider = () => mockProvider(async () => MAGIC_WORD);

// ---------------------------------------------------------------------------

describe('verifySiweSignatureAsync — EIP-1271 fallback', () => {
  it('accepts a contract signature when the wallet returns the magic value', async () => {
    const provider = acceptingProvider();

    const result = await verifySiweSignatureAsync({
      message: MESSAGE,
      signature: CONTRACT_SIGNATURE,
      contractProvider: provider,
    });

    expect(result.success).toBe(true);
    expect(result.data?.address).toBe(WALLET);
    expect(result.error).toBeUndefined();
  });

  it('reaches the fallback for a signature that is not 65 bytes', async () => {
    // The load-bearing case. `verifySiweSignature` rejects CONTRACT_SIGNATURE at
    // the length guard, long before ECDSA recovery — so an implementation that
    // only falls back on a recovered-address mismatch never calls the provider
    // at all, and no real smart-contract wallet would ever verify.
    const provider = acceptingProvider();

    const sync = verifySiweSignature({ message: MESSAGE, signature: CONTRACT_SIGNATURE });
    expect(sync.success).toBe(false);
    expect(sync.error).toMatch(/65 bytes/);

    await verifySiweSignatureAsync({
      message: MESSAGE,
      signature: CONTRACT_SIGNATURE,
      contractProvider: provider,
    });

    expect(provider.ethCall).toHaveBeenCalledTimes(1);
  });

  it('also reaches the fallback when a 65-byte signature recovers to another address', async () => {
    const provider = acceptingProvider();

    const result = await verifySiweSignatureAsync({
      message: MESSAGE,
      signature: MISMATCHED_SIGNATURE,
      contractProvider: provider,
    });

    expect(provider.ethCall).toHaveBeenCalledTimes(1);
    expect(result.success).toBe(true);
  });

  it('rejects when the contract returns a different word', async () => {
    const provider = mockProvider(async () => `0x${'0'.repeat(64)}`);

    const result = await verifySiweSignatureAsync({
      message: MESSAGE,
      signature: CONTRACT_SIGNATURE,
      contractProvider: provider,
    });

    expect(result.success).toBe(false);
    expect(result.code).toBe(GuildPassErrorCode.SIWE_INVALID_SIGNATURE);
  });

  it('rejects a result that merely starts with the magic selector', async () => {
    // `bytes4` is right-padded, so anything after the selector must be zeroes.
    // A `startsWith` check would wrongly accept this.
    const provider = mockProvider(async () => `${EIP1271_MAGIC_VALUE}${'f'.repeat(56)}`);

    const result = await verifySiweSignatureAsync({
      message: MESSAGE,
      signature: CONTRACT_SIGNATURE,
      contractProvider: provider,
    });

    expect(result.success).toBe(false);
    expect(result.code).toBe(GuildPassErrorCode.SIWE_INVALID_SIGNATURE);
  });

  it('resolves rather than rejecting when the RPC call fails', async () => {
    const provider = mockProvider(async () => {
      throw new Error('connection refused');
    });

    // The whole contract of SiweVerifyResult is that verification never throws.
    await expect(
      verifySiweSignatureAsync({
        message: MESSAGE,
        signature: CONTRACT_SIGNATURE,
        contractProvider: provider,
      }),
    ).resolves.toMatchObject({
      success: false,
      code: GuildPassErrorCode.SIWE_INVALID_SIGNATURE,
    });
  });

  it('rejects a non-string eth_call result', async () => {
    // `ContractProvider.ethCall` is typed as `Promise<unknown>`.
    const provider = mockProvider(async () => ({ unexpected: true }));

    const result = await verifySiweSignatureAsync({
      message: MESSAGE,
      signature: CONTRACT_SIGNATURE,
      contractProvider: provider,
    });

    expect(result.success).toBe(false);
    expect(result.error).toMatch(/non-string/);
  });

  it('behaves exactly like the synchronous verifier without a contractProvider', async () => {
    const sync = verifySiweSignature({ message: MESSAGE, signature: CONTRACT_SIGNATURE });
    const async = await verifySiweSignatureAsync({
      message: MESSAGE,
      signature: CONTRACT_SIGNATURE,
    });

    expect(async).toEqual(sync);
  });

  it('never touches the network for a valid EOA signature', async () => {
    const provider = acceptingProvider();

    const result = await verifySiweSignatureAsync({
      message: MESSAGE,
      signature: VALID_EOA_SIGNATURE,
      contractProvider: provider,
    });

    expect(result.success).toBe(true);
    expect(provider.ethCall).not.toHaveBeenCalled();
  });

  it('does not fall back for non-signature failures', async () => {
    const provider = acceptingProvider();

    // A domain mismatch is terminal: no contract signature can fix a message
    // that was addressed to somewhere else.
    const result = await verifySiweSignatureAsync({
      message: MESSAGE,
      signature: CONTRACT_SIGNATURE,
      expectedDomain: 'evil.com',
      contractProvider: provider,
    });

    expect(result.success).toBe(false);
    expect(result.code).toBe(GuildPassErrorCode.SIWE_DOMAIN_MISMATCH);
    expect(provider.ethCall).not.toHaveBeenCalled();
  });

  it('does not fall back for a nonce mismatch', async () => {
    const provider = acceptingProvider();

    const result = await verifySiweSignatureAsync({
      message: MESSAGE,
      signature: CONTRACT_SIGNATURE,
      expectedNonce: 'not-the-nonce',
      contractProvider: provider,
    });

    expect(result.success).toBe(false);
    expect(result.code).toBe(GuildPassErrorCode.SIWE_INVALID_MESSAGE);
    expect(provider.ethCall).not.toHaveBeenCalled();
  });
});

describe('EIP-1271 call encoding', () => {
  it('encodes isValidSignature(bytes32,bytes) with a correct dynamic tail', async () => {
    const provider = acceptingProvider();

    await verifySiweSignatureAsync({
      message: MESSAGE,
      signature: CONTRACT_SIGNATURE,
      contractProvider: provider,
    });

    const [request] = (provider.ethCall as ReturnType<typeof vi.fn>).mock.calls[0];
    expect(request.to).toBe(WALLET);

    const data: string = request.data;
    const body = data.slice(2 + 8); // strip 0x and the 4-byte selector

    expect(data.startsWith(EIP1271_MAGIC_VALUE)).toBe(true);

    // Word 0: the EIP-191 digest the ECDSA path would have used.
    const digest = Buffer.from(hashPersonalMessage(MESSAGE)).toString('hex');
    expect(body.slice(0, 64)).toBe(digest);

    // Word 1: offset to the dynamic tail — two words in.
    expect(BigInt(`0x${body.slice(64, 128)}`)).toBe(64n);

    // Word 2: byte length of the signature.
    expect(BigInt(`0x${body.slice(128, 192)}`)).toBe(200n);

    // Tail: the signature body, right-padded to a whole number of words.
    const tail = body.slice(192);
    expect(tail.startsWith('ab'.repeat(200))).toBe(true);
    expect(tail.length % 64).toBe(0);
  });

  it('pads a signature whose length is not a multiple of 32 bytes', () => {
    const digest = hashPersonalMessage(MESSAGE);
    const encoded = encodeIsValidSignature(digest, `0x${'cd'.repeat(65)}`);
    const tail = encoded.slice(2 + 8 + 64 + 64 + 64);

    expect(BigInt(`0x${encoded.slice(2 + 8 + 64 + 64, 2 + 8 + 64 + 64 + 64)}`)).toBe(65n);
    // 65 bytes is 130 hex chars, which rounds up to three 32-byte words (192).
    expect(tail.length).toBe(192);
    expect(tail.startsWith('cd'.repeat(65))).toBe(true);
    expect(tail.slice(130)).toBe('0'.repeat(62));
  });
});

describe('EIP-1271 composes with replay protection', () => {
  it('accepts a contract signature once and rejects the replay', async () => {
    const provider = acceptingProvider();
    const nonceStore = new InMemoryNonceStore();

    const params = {
      message: MESSAGE,
      signature: CONTRACT_SIGNATURE,
      contractProvider: provider,
    };

    const first = await verifySiweSignatureWithReplayProtection(params, nonceStore);
    expect(first.success).toBe(true);

    const second = await verifySiweSignatureWithReplayProtection(params, nonceStore);
    expect(second.success).toBe(false);
    expect(second.code).toBe(GuildPassErrorCode.SIWE_REPLAY_DETECTED);
  });

  it('never consumes a nonce when the contract rejects the signature', async () => {
    const rejecting = mockProvider(async () => `0x${'0'.repeat(64)}`);
    const nonceStore = new InMemoryNonceStore();

    const failed = await verifySiweSignatureWithReplayProtection(
      { message: MESSAGE, signature: CONTRACT_SIGNATURE, contractProvider: rejecting },
      nonceStore,
    );
    expect(failed.success).toBe(false);

    // The nonce must still be available to a subsequent legitimate sign-in.
    const accepted = await verifySiweSignatureWithReplayProtection(
      { message: MESSAGE, signature: CONTRACT_SIGNATURE, contractProvider: acceptingProvider() },
      nonceStore,
    );
    expect(accepted.success).toBe(true);
  });

  it('still works for EOA signatures with no contractProvider', async () => {
    const nonceStore = new InMemoryNonceStore();

    const result = await verifySiweSignatureWithReplayProtection(
      { message: MESSAGE, signature: VALID_EOA_SIGNATURE },
      nonceStore,
    );

    expect(result.success).toBe(true);
  });
});
