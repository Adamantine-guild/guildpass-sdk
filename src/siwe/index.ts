/**
 * SIWE (Sign-In With Ethereum) helpers — EIP-4361 implementation.
 *
 * @module siwe
 */
export type {
  SiweMessage,
  SiweVerifyParams,
  SiweVerifyAsyncParams,
  SiweVerifyResult,
  SiweParseResult,
} from './siwe.types';

export {
  formatSiweMessage,
  parseSiweMessage,
  verifySiweSignature,
  verifySiweSignatureAsync,
  generateSiweNonce,
  MAX_SIWE_MESSAGE_LENGTH,
} from './siwe.helpers';

export { EIP1271_MAGIC_VALUE } from './eip1271';
export type { Eip1271Outcome } from './eip1271';

export { InMemoryNonceStore } from './nonceStore';
export type { NonceStore } from './nonceStore';

export { verifySiweSignatureWithReplayProtection } from './replayProtection';