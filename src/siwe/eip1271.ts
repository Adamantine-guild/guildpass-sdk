/**
 * EIP-1271 signature verification for smart-contract wallets.
 *
 * Smart-contract wallets (Safe, Argent, and account-abstraction wallets
 * generally) have no single ECDSA keypair to recover from. They implement
 * `isValidSignature(bytes32,bytes)` on-chain instead, so verifying one of their
 * signatures means asking the contract itself rather than doing local crypto.
 *
 * @module siwe/eip1271
 */

// GuildPass SDK: Pull in package or module bindings.
import type { ContractProvider } from '../contracts/providers/provider.types';

/**
 * The EIP-1271 `isValidSignature(bytes32,bytes)` selector, which is also the
 * magic value a contract must return to declare a signature valid.
 */
export const EIP1271_MAGIC_VALUE = '0x1626ba7e';

/**
 * The magic value as it actually comes back from `eth_call`.
 *
 * `isValidSignature` returns `bytes4`, and ABI encoding left-aligns a
 * fixed-size byte array inside its 32-byte word — so the selector is followed
 * by 28 zero bytes. Comparing against this whole word, rather than testing
 * whether the result merely *starts with* the selector, is what stops a
 * contract that returns `0x1626ba7e` plus arbitrary trailing data from being
 * accepted.
 */
const EIP1271_MAGIC_WORD = `${EIP1271_MAGIC_VALUE}${'0'.repeat(56)}`;

/** Hex characters in one 32-byte ABI word. */
const HEX_CHARS_PER_WORD = 64;

/** Hex-encodes a byte array. The SDK ships no shared helper for this. */
function toHex(bytes: Uint8Array): string {
  let out = '';
  for (const byte of bytes) out += byte.toString(16).padStart(2, '0');
  return out;
}

/** Right-pads a dynamic `bytes` body to a whole number of 32-byte words. */
function padTail(hex: string): string {
  const remainder = hex.length % HEX_CHARS_PER_WORD;
  return remainder === 0 ? hex : hex + '0'.repeat(HEX_CHARS_PER_WORD - remainder);
}

/**
 * ABI-encodes a call to `isValidSignature(bytes32 hash, bytes signature)`.
 *
 * Hand-rolled deliberately: the shared `encodeAbiParams` helper supports static
 * types only and throws for anything dynamic, while `bytes` needs head/tail
 * encoding — an offset word pointing past the head, then a length word, then
 * the body right-padded to a word boundary.
 */
export function encodeIsValidSignature(digest: Uint8Array, signature: string): string {
  const sigHex = (signature.startsWith('0x') ? signature.slice(2) : signature).toLowerCase();

  // Head is two words (the hash and this offset), so the tail starts at byte 64.
  const offsetWord = (64).toString(16).padStart(HEX_CHARS_PER_WORD, '0');
  const lengthWord = (sigHex.length / 2).toString(16).padStart(HEX_CHARS_PER_WORD, '0');

  return `${EIP1271_MAGIC_VALUE}${toHex(digest)}${offsetWord}${lengthWord}${padTail(sigHex)}`;
}

/**
 * Result of an EIP-1271 check.
 *
 * Never carries an exception: a transport failure is reported as `valid: false`
 * with a `reason`, because the caller's contract is to return a result rather
 * than reject.
 */
export interface Eip1271Outcome {
  /** Whether the contract returned the EIP-1271 magic value. */
  valid: boolean;
  /** Why the check did not pass. Undefined when `valid` is true. */
  reason?: string;
}

/**
 * Asks the contract at `address` whether `signature` is valid for `digest`.
 *
 * @param provider  Used to `eth_call` the contract. This is network I/O.
 * @param address   The claimed signer — must be the contract wallet itself.
 * @param digest    The 32-byte hash that was signed (for SIWE, the EIP-191 digest).
 * @param signature The wallet's signature, of any length.
 */
export async function checkEip1271Signature(
  provider: ContractProvider,
  address: string,
  digest: Uint8Array,
  signature: string,
): Promise<Eip1271Outcome> {
  let raw: unknown;

  try {
    raw = await provider.ethCall({
      to: address,
      data: encodeIsValidSignature(digest, signature),
    });
  } catch (err) {
    // An address that is not a contract, an RPC outage, and a reverting
    // `isValidSignature` all land here. None of them prove the signature valid,
    // and none of them should escape as a rejection.
    return {
      valid: false,
      reason: `EIP-1271 verification call failed: ${
        err instanceof Error ? err.message : 'unknown error'
      }`,
    };
  }

  // `ContractProvider.ethCall` resolves to `unknown`; narrow before comparing.
  if (typeof raw !== 'string') {
    return { valid: false, reason: 'EIP-1271 call returned a non-string result' };
  }

  if (raw.toLowerCase() !== EIP1271_MAGIC_WORD) {
    return { valid: false, reason: 'EIP-1271 contract did not return the magic value' };
  }

  return { valid: true };
}
