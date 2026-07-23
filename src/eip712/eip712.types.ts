/**
 * EIP-712 typed-data structures.
 *
 * @module eip712
 */

/** A single field within an EIP-712 struct type definition. */
export interface EIP712TypeProperty {
  name: string;
  type: string;
}

/**
 * The `types` map of an EIP-712 typed-data payload: struct type name ->
 * ordered list of its fields. Must NOT include the implicit `EIP712Domain`
 * type; that one is derived automatically from the `domain` object's
 * populated fields.
 */
export type EIP712Types = Record<string, EIP712TypeProperty[]>;

/**
 * The `domain` separator fields, per EIP-712 section "Definition of
 * domainSeparator". Only the fields that are actually present on the object
 * are included when deriving the implicit `EIP712Domain` type.
 */
export interface EIP712Domain {
  name?: string;
  version?: string;
  chainId?: number | bigint;
  verifyingContract?: string;
  salt?: string;
}

/**
 * A generic EIP-712 struct message: field name -> value. Values may be
 * primitives, hex strings (bytes/address), bigints (uint/int), or nested
 * structs/arrays matching the declared `types`.
 */
export type EIP712Value = unknown;
export type EIP712Message = Record<string, EIP712Value>;

/** Full typed-data payload, as accepted by wallets' `eth_signTypedData_v4`. */
export interface EIP712TypedData {
  domain: EIP712Domain;
  types: EIP712Types;
  primaryType: string;
  message: EIP712Message;
}

/** Result returned by {@link verifyTypedDataSignature}. */
export interface EIP712VerifyResult {
  /** Whether the signature is valid and (when checked) all other checks passed. */
  success: boolean;
  /** Checksummed recovered signer address. Undefined on failure. */
  signer?: string;
  /** Human-readable error description on failure. Undefined on success. */
  error?: string;
  /** The GuildPass error code when verification fails. Undefined on success. */
  code?: string;
}
