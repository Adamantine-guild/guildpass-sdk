/**
 * EIP-712 typed-data signing/verification — generic infrastructure plus a
 * concrete `GuildRoleDelegation` reference schema.
 *
 * @module eip712
 */
export type {
  EIP712TypeProperty,
  EIP712Types,
  EIP712Domain,
  EIP712Message,
  EIP712Value,
  EIP712TypedData,
  EIP712VerifyResult,
} from './eip712.types';

export {
  encodeType,
  typeHash,
  hashStruct,
  hashDomain,
  hashTypedData,
  verifyTypedDataSignature,
} from './eip712.helpers';

export {
  GUILD_ROLE_DELEGATION_TYPES,
  buildGuildRoleDelegationTypedData,
  verifyGuildRoleDelegationSignature,
  verifyGuildRoleDelegationWithReplayProtection,
} from './guildRoleDelegation';
export type { GuildRoleDelegation } from './guildRoleDelegation';
