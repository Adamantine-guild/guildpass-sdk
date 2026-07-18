/**
 * Represents a parsed EIP-4361 (Sign-In With Ethereum) message.
 *
 * All required fields mirror the EIP-4361 specification.
 * Optional fields correspond to optional EIP-4361 fields.
 */
export interface SiweMessage {
  /** RFC 4501 DNS authority that is requesting the signing. */
  domain: string;
  /** Ethereum address performing the signing, as an EIP-55 checksummed address. */
  address: string;
  /** Human-readable ASCII assertion that the user will sign. */
  statement?: string;
  /** RFC 3986 URI referring to the resource that is the subject of the signing. */
  uri: string;
  /** EIP-4361 version of the message, currently "1". */
  version: string;
  /** EIP-155 Chain ID to which the session is bound. */
  chainId: number;
  /** Randomized token used to prevent replay attacks, at least 8 alphanumeric characters. */
  nonce: string;
  /** ISO 8601 datetime when the signed authentication message becomes valid. */
  issuedAt: string;
  /** ISO 8601 datetime when the signed authentication message is no longer valid. */
  expirationTime?: string;
  /** ISO 8601 datetime when the authentication message has become usable. */
  notBefore?: string;
  /** System-specific identifier that may be used to uniquely refer to the sign-in request. */
  requestId?: string;
  /** List of information or references to information the user wishes to have resolved. */
  resources?: string[];
}

/**
 * Parameters required to verify a SIWE signature.
 */
export interface SiweVerifyParams {
  /** The raw EIP-4361 message string that was signed. */
  message: string;
  /** Hex-encoded signature produced by the wallet (65-byte, prefixed with 0x). */
  signature: string;
  /**
   * Expected domain. When provided, the parsed message's domain must match.
   * Used to prevent cross-origin replay attacks.
   */
  expectedDomain?: string;
  /**
   * Expected nonce. When provided, the parsed message's nonce must match.
   * Used to prevent replay attacks with previously used messages.
   */
  expectedNonce?: string;
  /**
   * If set to `true`, expired messages (expirationTime in the past) are
   * rejected. Defaults to `true`.
   */
  checkExpiry?: boolean;
}

/**
 * Result returned by {@link verifySiweSignature}.
 */
export interface SiweVerifyResult {
  /** Whether the signature is valid and all checks passed. */
  success: boolean;
  /**
   * The parsed SIWE message on success. Undefined on failure.
   */
  data?: SiweMessage;
  /**
   * Human-readable error description on failure. Undefined on success.
   */
  error?: string;
  /**
   * The GuildPass error code when verification fails.
   * Undefined on success.
   */
  code?: string;
}

/**
 * Result returned by {@link parseSiweMessage}.
 */
export interface SiweParseResult {
  /** Whether the raw string was successfully parsed as a valid EIP-4361 message. */
  success: boolean;
  /**
   * The parsed SIWE message on success. Undefined on failure.
   */
  data?: SiweMessage;
  /**
   * Human-readable error description on failure. Undefined on success.
   */
  error?: string;
}
