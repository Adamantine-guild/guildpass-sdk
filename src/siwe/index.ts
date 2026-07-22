/**
 * SIWE (Sign-In With Ethereum) helpers — EIP-4361 implementation.
 *
 * @module siwe
 */
export type {
  SiweMessage,
  SiweVerifyParams,
  SiweVerifyResult,
  SiweParseResult,
} from './siwe.types';

export {
  formatSiweMessage,
  parseSiweMessage,
  verifySiweSignature,
  generateSiweNonce,
  MAX_SIWE_MESSAGE_LENGTH,
} from './siwe.helpers';

export { InMemoryNonceStore } from './nonceStore';
export type { NonceStore } from './nonceStore';

export { verifySiweSignatureWithReplayProtection } from './replayProtection';