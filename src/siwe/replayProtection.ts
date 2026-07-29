// GuildPass SDK: Pull in package or module bindings.
import { GuildPassErrorCode } from '../errors/errorCodes';
import { verifySiweSignatureAsync, parseSiweMessage } from './siwe.helpers';
import { SiweVerifyAsyncParams, SiweVerifyResult } from './siwe.types';
import { NonceStore } from './nonceStore';

/**
 * Verifies a SIWE signature AND enforces single-use replay protection by
 * consuming the message's nonce through a {@link NonceStore}.
 *
 * Ordering matters and is deliberate: the signature and all EIP-4361 checks
 * run FIRST via {@link verifySiweSignature}. Only when verification fully
 * succeeds is the nonce consumed. This ensures a failed or malformed request
 * never burns a nonce (which would let an attacker grief a legitimate user by
 * pre-consuming their nonce), while a valid message can be accepted exactly
 * once — a second identical submission finds its nonce already consumed and is
 * rejected with {@link GuildPassErrorCode.SIWE_REPLAY_DETECTED}.
 *
 * The nonce marker's TTL is aligned with the message's `expirationTime` when
 * present, so the consumed record cannot expire before the message it guards.
 *
 * @param params - The same parameters accepted by {@link verifySiweSignature}.
 * @param nonceStore - The store used to check-and-consume the nonce atomically.
 * @returns A {@link SiweVerifyResult}. On a detected replay, `success` is
 *          `false`, `code` is `SIWE_REPLAY_DETECTED`, and `error` explains it.
 */
export async function verifySiweSignatureWithReplayProtection(
  params: SiweVerifyAsyncParams,
  nonceStore: NonceStore,
): Promise<SiweVerifyResult> {
  // 1. Full signature + EIP-4361 verification first. Never consume on failure.
  //    Routed through the async verifier so a smart-contract wallet composes
  //    with replay protection instead of having to choose between the two.
  //    Without a `contractProvider` this resolves to the synchronous result.
  const result = await verifySiweSignatureAsync(params);
  if (!result.success || !result.data) {
    return result;
  }

  const nonce = result.data.nonce;

  // 2. Derive a TTL from the message's expirationTime so the consumed marker
  //    outlives the message itself. Fall back to "no expiry" when absent or
  //    unparseable, so we never prune a still-valid nonce early.
  const ttl = computeNonceTtl(result.data.expirationTime);

  // 3. Atomically check-and-consume. A `false` return means the nonce was
  //    already used: this is a replay of an otherwise-valid message.
  let consumed: boolean;
  try {
    consumed = await nonceStore.consume(nonce, ttl);
  } catch (err) {
    // A store failure must fail closed: we cannot prove the nonce is unused,
    // so we reject rather than risk accepting a replay.
    return {
      success: false,
      error:
        'Replay protection store failed during nonce consumption: ' +
        (err instanceof Error ? err.message : 'unknown error'),
      code: GuildPassErrorCode.SIWE_REPLAY_DETECTED,
    };
  }

  if (!consumed) {
    return {
      success: false,
      error: 'SIWE nonce has already been used (replay detected)',
      code: GuildPassErrorCode.SIWE_REPLAY_DETECTED,
    };
  }

  // 4. Verified and nonce freshly consumed: a clean, single-use success.
  return result;
}

/**
 * Converts an ISO 8601 `expirationTime` into a TTL in milliseconds from now.
 * Returns `undefined` (no expiry) when the field is absent or unparseable, and
 * a small positive floor when the timestamp is already in the past, so a
 * just-expired message still records a short-lived marker rather than none.
 */
function computeNonceTtl(expirationTime?: string): number | undefined {
  if (!expirationTime) return undefined;
  const expiryMs = Date.parse(expirationTime);
  if (Number.isNaN(expiryMs)) return undefined;
  const delta = expiryMs - Date.now();
  return delta > 0 ? delta : 1;
}

// Re-exported so callers can parse without reaching into siwe.helpers directly.
export { parseSiweMessage };
