import { GuildPassError } from '../errors/GuildPassError';
import { GuildPassErrorCode } from '../errors/errorCodes';

export interface SignedEnvelope<T = any> {
  data: T;
  signature: string;
  signer?: string;
}

export function isSignedEnvelope(obj: any): obj is SignedEnvelope {
  return obj !== null && typeof obj === 'object' && 'data' in obj && typeof obj.signature === 'string';
}

/**
 * Verifies a signed envelope containing an API response payload.
 *
 * @param envelope The envelope containing the payload and signature.
 * @param expectedSigner The Ethereum address expected to have signed the payload.
 * @returns The verified payload data.
 * @throws GuildPassError if verification fails or dependencies are missing.
 */
export async function verifySignedPayload<T>(
  envelope: SignedEnvelope<T> | T,
  expectedSigner: string
): Promise<T> {
  if (!isSignedEnvelope(envelope)) {
    throw new GuildPassError(
      'Invalid signed envelope structure. Expected a SignedEnvelope from the API.',
      GuildPassErrorCode.INVALID_RESPONSE
    );
  }

  const { data, signature } = envelope;
  const payloadString = JSON.stringify(data);
  let recoveredAddress: string | undefined;

  try {
    // Attempt to use viem (verifyMessage) or ethers (verifyMessage)
    let hasDependency = false;
    
    // First try viem
    try {
      const { verifyMessage } = await import('viem');
      hasDependency = true;
      const valid = await verifyMessage({
        address: expectedSigner as any,
        message: payloadString,
        signature: signature as any,
      });
      if (!valid) {
        throw new Error('Signature verification failed');
      }
      return data;
    } catch (e: any) {
      if (hasDependency) {
        throw e; // rethrow if viem verification failed
      }
    }

    // Then try ethers
    if (!hasDependency) {
      try {
        const { verifyMessage } = await import('ethers');
        hasDependency = true;
        recoveredAddress = verifyMessage(payloadString, signature);
      } catch (e: any) {
        if (hasDependency) {
          throw e; // rethrow if ethers verification failed
        }
      }
    }

    if (!hasDependency) {
      throw new GuildPassError(
        'A cryptography library (viem or ethers) must be installed to use verifySignedResponses.',
        GuildPassErrorCode.INVALID_CONFIG
      );
    }
  } catch (error) {
    throw new GuildPassError(
      'Signature verification failed.',
      GuildPassErrorCode.UNVERIFIABLE_RESPONSE,
      undefined,
      error
    );
  }

  if (recoveredAddress && recoveredAddress.toLowerCase() !== expectedSigner.toLowerCase()) {
    throw new GuildPassError(
      `Signer mismatch. Expected ${expectedSigner}, but recovered ${recoveredAddress}`,
      GuildPassErrorCode.UNVERIFIABLE_RESPONSE
    );
  }

  return data;
}
