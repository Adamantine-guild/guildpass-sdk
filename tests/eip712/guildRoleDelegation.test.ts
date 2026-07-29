/**
 * Tests for the GuildRoleDelegation reference EIP-712 schema (Issue #239).
 *
 * Acceptance criteria coverage:
 *  - The GuildRoleDelegation reference schema is fully typed, documented,
 *    and demonstrated end-to-end: signed with a test key via viem (a
 *    dev-only reference library), verified via the SDK's own
 *    verifyGuildRoleDelegationSignature.
 *  - Replay protection via the nonce field, reusing the NonceStore
 *    abstraction (#46), mirroring the ordering guarantee already tested for
 *    SIWE in tests/siwe-replay-protection.test.ts: a failed/expired
 *    verification never consumes the nonce, and a replay of an
 *    already-consumed nonce is rejected distinctly.
 *
 * Signing key: the same well-known first Hardhat/anvil default account used
 * throughout this test suite (see tests/eip712/eip712.test.ts).
 */
import { describe, it, expect } from 'vitest';
import { getAddress, type TypedDataDomain } from 'viem';
import { privateKeyToAccount } from 'viem/accounts';
import {
  buildGuildRoleDelegationTypedData,
  verifyGuildRoleDelegationSignature,
  verifyGuildRoleDelegationWithReplayProtection,
  type GuildRoleDelegation,
} from '../../src/eip712/guildRoleDelegation';
import { InMemoryNonceStore } from '../../src/siwe/nonceStore';
import { GuildPassErrorCode } from '../../src/errors/errorCodes';
import type { EIP712Domain } from '../../src/eip712/eip712.types';

const KNOWN_PRIVATE_KEY =
  '0xac0974bec39a17e36ba4a6b4d238ff944bacb478cbed5efcae784d7bf4f2ff80' as const;
const delegatorAccount = privateKeyToAccount(KNOWN_PRIVATE_KEY);

const domain: EIP712Domain = {
  name: 'GuildPass',
  version: '1',
  chainId: 8453,
  verifyingContract: getAddress('0x' + '11'.repeat(20)),
};

function futureDelegation(overrides: Partial<GuildRoleDelegation> = {}): GuildRoleDelegation {
  return {
    delegator: delegatorAccount.address,
    delegate: getAddress('0x' + '22'.repeat(20)),
    guildId: '0x' + '33'.repeat(32),
    roleId: '0x' + '44'.repeat(32),
    expiry: BigInt(Math.floor(Date.now() / 1000) + 3600),
    nonce: 1n,
    ...overrides,
  };
}

async function signDelegation(delegation: GuildRoleDelegation): Promise<string> {
  const typedData = buildGuildRoleDelegationTypedData(domain, delegation);
  return delegatorAccount.signTypedData({
    // Our EIP712Domain#salt is a plain `string`; viem narrows it to a
    // `0x${string}` template literal. No fixture here sets `salt`, so the
    // shapes are runtime-identical — see the same note in eip712.test.ts.
    domain: typedData.domain as TypedDataDomain,
    types: typedData.types,
    primaryType: typedData.primaryType as 'GuildRoleDelegation',
    message: delegation as unknown as Record<string, unknown>,
  });
}

describe('verifyGuildRoleDelegationSignature (end-to-end)', () => {
  it('accepts a delegation signed by the delegator with a real (viem) signature', async () => {
    const delegation = futureDelegation();
    const signature = await signDelegation(delegation);

    const result = verifyGuildRoleDelegationSignature(domain, delegation, signature);

    expect(result.success).toBe(true);
    expect(result.signer?.toLowerCase()).toBe(delegatorAccount.address.toLowerCase());
  });

  it('rejects an expired delegation even with a valid signature', async () => {
    const delegation = futureDelegation({
      expiry: BigInt(Math.floor(Date.now() / 1000) - 10),
    });
    const signature = await signDelegation(delegation);

    const result = verifyGuildRoleDelegationSignature(domain, delegation, signature);

    expect(result.success).toBe(false);
    expect(result.code).toBe(GuildPassErrorCode.EIP712_EXPIRED);
  });

  it('allows an expired delegation through when checkExpiry is disabled', async () => {
    const delegation = futureDelegation({
      expiry: BigInt(Math.floor(Date.now() / 1000) - 10),
    });
    const signature = await signDelegation(delegation);

    const result = verifyGuildRoleDelegationSignature(domain, delegation, signature, {
      checkExpiry: false,
    });

    expect(result.success).toBe(true);
  });

  it('rejects when the delegate field is tampered with after signing', async () => {
    const delegation = futureDelegation();
    const signature = await signDelegation(delegation);

    const tampered = { ...delegation, delegate: getAddress('0x' + '99'.repeat(20)) };
    const result = verifyGuildRoleDelegationSignature(domain, tampered, signature);

    expect(result.success).toBe(false);
    expect(result.code).toBe(GuildPassErrorCode.EIP712_SIGNER_MISMATCH);
  });

  it('rejects when the roleId is tampered with after signing (privilege-escalation attempt)', async () => {
    const delegation = futureDelegation();
    const signature = await signDelegation(delegation);

    const tampered = { ...delegation, roleId: '0x' + 'ff'.repeat(32) };
    const result = verifyGuildRoleDelegationSignature(domain, tampered, signature);

    expect(result.success).toBe(false);
    expect(result.code).toBe(GuildPassErrorCode.EIP712_SIGNER_MISMATCH);
  });
});

describe('verifyGuildRoleDelegationWithReplayProtection', () => {
  it('accepts a fresh delegation and consumes its nonce', async () => {
    const store = new InMemoryNonceStore();
    const delegation = futureDelegation({ nonce: 42n });
    const signature = await signDelegation(delegation);

    const result = await verifyGuildRoleDelegationWithReplayProtection(
      domain,
      delegation,
      signature,
      store,
    );

    expect(result.success).toBe(true);
  });

  it('rejects a replay of an already-consumed nonce with EIP712_REPLAY_DETECTED', async () => {
    const store = new InMemoryNonceStore();
    const delegation = futureDelegation({ nonce: 7n });
    const signature = await signDelegation(delegation);

    const first = await verifyGuildRoleDelegationWithReplayProtection(
      domain,
      delegation,
      signature,
      store,
    );
    const second = await verifyGuildRoleDelegationWithReplayProtection(
      domain,
      delegation,
      signature,
      store,
    );

    expect(first.success).toBe(true);
    expect(second.success).toBe(false);
    expect(second.code).toBe(GuildPassErrorCode.EIP712_REPLAY_DETECTED);
  });

  it('does NOT consume the nonce when signature verification fails, so a later valid submission still succeeds', async () => {
    const store = new InMemoryNonceStore();
    const delegation = futureDelegation({ nonce: 99n });
    const validSignature = await signDelegation(delegation);
    const badSignature =
      '0x' + '11'.repeat(64) + '11'.repeat(64) + '1c'; // well-formed shape, wrong value

    const failedAttempt = await verifyGuildRoleDelegationWithReplayProtection(
      domain,
      delegation,
      badSignature,
      store,
    );
    const genuineAttempt = await verifyGuildRoleDelegationWithReplayProtection(
      domain,
      delegation,
      validSignature,
      store,
    );

    expect(failedAttempt.success).toBe(false);
    expect(genuineAttempt.success).toBe(true);
  });

  it('scopes the consumed nonce to guildId:roleId:delegator so the same numeric nonce is reusable across different delegations', async () => {
    const store = new InMemoryNonceStore();
    const delegationA = futureDelegation({ nonce: 1n, guildId: '0x' + '01'.repeat(32) });
    const delegationB = futureDelegation({ nonce: 1n, guildId: '0x' + '02'.repeat(32) });
    const sigA = await signDelegation(delegationA);
    const sigB = await signDelegation(delegationB);

    const resultA = await verifyGuildRoleDelegationWithReplayProtection(
      domain,
      delegationA,
      sigA,
      store,
    );
    const resultB = await verifyGuildRoleDelegationWithReplayProtection(
      domain,
      delegationB,
      sigB,
      store,
    );

    expect(resultA.success).toBe(true);
    expect(resultB.success).toBe(true);
  });
});
