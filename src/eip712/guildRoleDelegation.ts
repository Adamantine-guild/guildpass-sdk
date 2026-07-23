/**
 * `GuildRoleDelegation`: a concrete EIP-712 typed-data reference schema for
 * delegating a guild role from one wallet to another.
 *
 * This is a reference implementation demonstrating the generic
 * `eip712.helpers` primitives for a real GuildPass use case (Issue #239); it
 * is not itself a protocol requirement. Callers needing a different
 * typed-data shape can build directly on `hashTypedData` /
 * `verifyTypedDataSignature`.
 *
 * @module eip712
 */
import { GuildPassErrorCode } from '../errors/errorCodes';
import { verifyTypedDataSignature } from './eip712.helpers';
import type {
  EIP712Domain,
  EIP712Message,
  EIP712TypedData,
  EIP712Types,
  EIP712VerifyResult,
} from './eip712.types';
import type { NonceStore } from '../siwe/nonceStore';

/**
 * A signed guild-role delegation: `delegator` grants `roleId` within
 * `guildId` to `delegate`, valid until `expiry` (Unix seconds), single-use
 * per `nonce`.
 */
export interface GuildRoleDelegation {
  /** Wallet delegating the role, as a 0x-prefixed checksummed address. */
  delegator: string;
  /** Wallet receiving the delegated role, as a 0x-prefixed checksummed address. */
  delegate: string;
  /** Guild identifier, as a 0x-prefixed 32-byte hex string. */
  guildId: string;
  /** Role identifier, as a 0x-prefixed 32-byte hex string. */
  roleId: string;
  /** Unix timestamp (seconds) after which the delegation is no longer valid. */
  expiry: bigint | number;
  /** Single-use nonce; consumed via a {@link NonceStore} for replay protection. */
  nonce: bigint | number;
}

/** The `types` map for {@link GuildRoleDelegation}, per the issue's suggested schema. */
export const GUILD_ROLE_DELEGATION_TYPES: EIP712Types = {
  GuildRoleDelegation: [
    { name: 'delegator', type: 'address' },
    { name: 'delegate', type: 'address' },
    { name: 'guildId', type: 'bytes32' },
    { name: 'roleId', type: 'bytes32' },
    { name: 'expiry', type: 'uint256' },
    { name: 'nonce', type: 'uint256' },
  ],
};

/**
 * Builds the full {@link EIP712TypedData} payload for a
 * {@link GuildRoleDelegation}, ready to pass to a wallet's
 * `eth_signTypedData_v4` (e.g. via viem's `signTypedData` or ethers'
 * `signTypedData`).
 */
export function buildGuildRoleDelegationTypedData(
  domain: EIP712Domain,
  delegation: GuildRoleDelegation,
): EIP712TypedData {
  return {
    domain,
    types: GUILD_ROLE_DELEGATION_TYPES,
    primaryType: 'GuildRoleDelegation',
    message: delegation as unknown as EIP712Message,
  };
}

/**
 * Verifies a signed {@link GuildRoleDelegation}: checks that the EIP-712
 * signature recovers to `delegation.delegator`, and (unless disabled) that
 * the delegation has not expired.
 *
 * This performs signature + expiry checks only — it does not enforce
 * single-use replay protection. For that, see
 * {@link verifyGuildRoleDelegationWithReplayProtection}.
 */
export function verifyGuildRoleDelegationSignature(
  domain: EIP712Domain,
  delegation: GuildRoleDelegation,
  signature: string,
  options: { checkExpiry?: boolean } = {},
): EIP712VerifyResult {
  const { checkExpiry = true } = options;

  if (checkExpiry) {
    const expiry = typeof delegation.expiry === 'bigint' ? delegation.expiry : BigInt(delegation.expiry);
    const nowSeconds = BigInt(Math.floor(Date.now() / 1000));
    if (nowSeconds > expiry) {
      return {
        success: false,
        error: 'GuildRoleDelegation has expired',
        code: GuildPassErrorCode.EIP712_EXPIRED,
      };
    }
  }

  return verifyTypedDataSignature(
    domain,
    GUILD_ROLE_DELEGATION_TYPES,
    'GuildRoleDelegation',
    delegation as unknown as EIP712Message,
    signature,
    delegation.delegator,
  );
}

/**
 * Verifies a signed {@link GuildRoleDelegation} AND enforces single-use
 * replay protection by consuming a key derived from the delegation through a
 * {@link NonceStore}.
 *
 * Mirrors `verifySiweSignatureWithReplayProtection`'s ordering guarantee:
 * signature + expiry verification runs FIRST, and the nonce is only consumed
 * once that fully succeeds — so a failed or malformed request never burns a
 * nonce. The consumed key is scoped to
 * `guildId:roleId:delegator:nonce` rather than the bare `nonce`, so the same
 * numeric nonce can't be replayed across different guilds/roles/delegators
 * sharing one {@link NonceStore}.
 */
export async function verifyGuildRoleDelegationWithReplayProtection(
  domain: EIP712Domain,
  delegation: GuildRoleDelegation,
  signature: string,
  nonceStore: NonceStore,
  options: { checkExpiry?: boolean } = {},
): Promise<EIP712VerifyResult> {
  const result = verifyGuildRoleDelegationSignature(domain, delegation, signature, options);
  if (!result.success) return result;

  const nonceKey = `${delegation.guildId}:${delegation.roleId}:${delegation.delegator}:${delegation.nonce.toString()}`;

  let consumed: boolean;
  try {
    consumed = await nonceStore.consume(nonceKey);
  } catch (err: unknown) {
    return {
      success: false,
      error:
        'Replay protection store failed during nonce consumption: ' +
        (err instanceof Error ? err.message : 'unknown error'),
      code: GuildPassErrorCode.EIP712_REPLAY_DETECTED,
    };
  }

  if (!consumed) {
    return {
      success: false,
      error: 'GuildRoleDelegation nonce has already been used (replay detected)',
      code: GuildPassErrorCode.EIP712_REPLAY_DETECTED,
    };
  }

  return result;
}
