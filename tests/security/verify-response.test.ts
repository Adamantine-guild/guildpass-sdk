import { describe, it, expect } from 'vitest';
import { verifySignedPayload, SignedEnvelope } from '../../src/security/verify-response';
import { GuildPassError } from '../../src/errors/GuildPassError';
import { GuildPassErrorCode } from '../../src/errors/errorCodes';
import { generatePrivateKey, privateKeyToAccount } from 'viem/accounts';

describe('verifySignedPayload', () => {
  it('should throw INVALID_RESPONSE if envelope is malformed', async () => {
    const invalidEnvelope = { foo: 'bar' };
    
    await expect(verifySignedPayload(invalidEnvelope as any, '0x0')).rejects.toThrowError(
      new GuildPassError(
        'Invalid signed envelope structure. Expected a SignedEnvelope from the API.',
        GuildPassErrorCode.INVALID_RESPONSE
      )
    );
  });

  it('should verify a valid signature and return the data', async () => {
    const account = privateKeyToAccount(generatePrivateKey());
    const data = { hasAccess: true, reason: 'All checks passed' };
    const signature = await account.signMessage({ message: JSON.stringify(data) });

    const envelope: SignedEnvelope<typeof data> = {
      data,
      signature,
      signer: account.address
    };

    const result = await verifySignedPayload(envelope, account.address);
    expect(result).toEqual(data);
  });

  it('should throw UNVERIFIABLE_RESPONSE if payload is tampered post-signing', async () => {
    const account = privateKeyToAccount(generatePrivateKey());
    const data = { hasAccess: true, reason: 'All checks passed' };
    const signature = await account.signMessage({ message: JSON.stringify(data) });

    const tamperedData = { hasAccess: false, reason: 'Tampered' };
    const envelope: SignedEnvelope<typeof tamperedData> = {
      data: tamperedData,
      signature,
      signer: account.address
    };

    await expect(verifySignedPayload(envelope, account.address)).rejects.toThrowError(
      new GuildPassError(
        'Signature verification failed.',
        GuildPassErrorCode.UNVERIFIABLE_RESPONSE
      )
    );
  });

  it('should throw UNVERIFIABLE_RESPONSE if verified against wrong signer', async () => {
    const account = privateKeyToAccount(generatePrivateKey());
    const wrongAccount = privateKeyToAccount(generatePrivateKey());
    
    const data = { hasAccess: true, reason: 'All checks passed' };
    const signature = await account.signMessage({ message: JSON.stringify(data) });

    const envelope: SignedEnvelope<typeof data> = {
      data,
      signature,
      signer: account.address
    };

    await expect(verifySignedPayload(envelope, wrongAccount.address)).rejects.toThrowError(
      new GuildPassError(
        'Signature verification failed.',
        GuildPassErrorCode.UNVERIFIABLE_RESPONSE
      )
    );
  });
});
