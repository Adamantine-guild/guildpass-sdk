import { GuildPassError } from '../errors/GuildPassError';
import { GuildPassErrorCode } from '../errors/errorCodes';
import { AccessRequirement } from '../types/common';
import { validateAddress } from '../utils/validation';
import { areAddressesEqual } from '../utils/address';

// ---------------------------------------------------------------------------
// Function selectors (first 4 bytes of keccak256(signature))
// ---------------------------------------------------------------------------

export const GET_GUILD_OWNER_SELECTOR = '0xab4511dc';
/** ERC-20 `balanceOf(address)`; also valid for ERC-721 collection-wide balance. */
export const BALANCE_OF_SELECTOR = '0x70a08231';
/** ERC-721 `ownerOf(uint256)`. */
export const ERC721_OWNER_OF_SELECTOR = '0x6352211e';
/** OpenZeppelin AccessControl `hasRole(bytes32,address)`. */
export const HAS_ROLE_SELECTOR = '0x91d14854';
export const DECIMALS_SELECTOR = '0x313ce567'; // 4-byte signature for decimals()
/** ERC-165 `supportsInterface(bytes4)`. */
export const SUPPORTS_INTERFACE_SELECTOR = '0x01ffc9a7';

// ---------------------------------------------------------------------------
// ERC-165 interface IDs
// ---------------------------------------------------------------------------

/** ERC-165 itself (`supportsInterface(bytes4)`). */
export const ERC165_INTERFACE_ID = '0x01ffc9a7';
/** ERC-721 (NFT) standard. */
export const ERC721_INTERFACE_ID = '0x80ac58cd';
/** ERC-1155 multi-token standard. */
export const ERC1155_INTERFACE_ID = '0xd9b67a26';
/** OpenZeppelin IAccessControl. */
export const ACCESS_CONTROL_INTERFACE_ID = '0x7965db0b';

/**
 * Maps requirement type strings to their expected ERC-165 interface ID.
 * TOKEN is intentionally omitted — ERC-20 predates ERC-165 and has no
 * universally-adopted interface ID.
 */
export const REQUIREMENT_TYPE_INTERFACE_IDS: Record<string, string | undefined> = {
  NFT: ERC721_INTERFACE_ID,
  ROLE: ACCESS_CONTROL_INTERFACE_ID,
};

export const HEX_32_BYTES_LENGTH = 64;

/** Maximum byte length for the pre-encode check in `encodeBytes32`. */
export const MAX_BYTES32_INPUT_LENGTH = 256;

const HEX_WORD_REGEX = /^0x[a-fA-F0-9]{64}$/;
const ADDRESS_REGEX = /^0x[a-fA-F0-9]{40}$/;

// ---------------------------------------------------------------------------
// Pure ABI argument encoders
// ---------------------------------------------------------------------------

export const encodeAddressArgument = (address: string): string => {
  if (!ADDRESS_REGEX.test(address)) {
    throw new GuildPassError(
      `Invalid address for ABI encoding: "${address}"`,
      GuildPassErrorCode.INVALID_INPUT,
    );
  }
  return address.slice(2).toLowerCase().padStart(HEX_32_BYTES_LENGTH, '0');
};

/** Maximum value encodable as uint256 / bytes32 (2^256 − 1). */
export const UINT256_MAX = BigInt('0x' + 'f'.repeat(64));

/**
 * Encodes a string as a 32-byte (bytes32) ABI argument.
 *
 * Classification rules (applied in strict order, no overlap):
 *
 * 1. **Hex mode** — input matches `/^0x[a-fA-F0-9]{64}$/` exactly (case-insensitive).
 *    The `0x` prefix is stripped and the hex digits are lowercased.
 *    Inputs that start with `0x` but do NOT match this exact pattern (e.g.
 *    `"0x1234"`, `"0x" + "g".repeat(64)`) are **not** treated as hex — they
 *    fall through to UTF-8 mode.
 *
 * 2. **Integer mode** — input matches `/^\d+$/` (only ASCII decimal digits,
 *    no leading whitespace after trim).  The value is converted via `BigInt`
 *    and left-zero-padded to 32 bytes.  Throws `INVALID_INPUT` if the value
 *    exceeds `2^256 − 1` (uint256 max).
 *
 * 3. **UTF-8 mode** — everything else.  The string is UTF-8 encoded and
 *    right-zero-padded to 32 bytes.  Throws `INVALID_INPUT` if the encoded
 *    byte length exceeds 32.
 *
 * The three modes are mutually exclusive: a string that matches mode 1 or 2
 * is never processed by a later mode, eliminating all ambiguous cases.
 */
export const encodeBytes32 = (value: string, label: string): string => {
  const trimmed = value.trim();

  // ── Mode 1: exact 0x-prefixed 64-hex-char string ──────────────────────────
  if (/^0x[a-fA-F0-9]{64}$/.test(trimmed)) {
    return trimmed.slice(2).toLowerCase();
  }

  // ── Mode 2: pure decimal integer string within uint256 range ──────────────
  if (/^\d+$/.test(trimmed)) {
    const n = BigInt(trimmed);
    if (n > UINT256_MAX) {
      throw new GuildPassError(
        `${label} exceeds uint256 maximum and cannot be encoded as bytes32`,
        GuildPassErrorCode.INVALID_INPUT,
      );
    }
    return n.toString(16).padStart(HEX_32_BYTES_LENGTH, '0');
  }

  // ── Mode 3: UTF-8 right-zero-padded to 32 bytes ───────────────────────────
  // Pre-check input length to avoid excessive memory allocation in
  // TextEncoder().encode() before the post-encode 32-byte limit check.
  if (trimmed.length > MAX_BYTES32_INPUT_LENGTH) {
    throw new GuildPassError(
      `${label} exceeds maximum bytes32 input length of ${MAX_BYTES32_INPUT_LENGTH} characters (got ${trimmed.length})`,
      GuildPassErrorCode.INVALID_INPUT,
    );
  }
  const bytes = new TextEncoder().encode(trimmed);
  if (bytes.length > 32) {
    throw new GuildPassError(
      `${label} must fit within 32 UTF-8 bytes (got ${bytes.length})`,
      GuildPassErrorCode.INVALID_INPUT,
    );
  }

  return Array.from(bytes)
    .map((byte) => byte.toString(16).padStart(2, '0'))
    .join('')
    .padEnd(HEX_32_BYTES_LENGTH, '0');
};

export const encodeGuildId = (guildId: string): string => encodeBytes32(guildId, 'guildId');

/**
 * Encodes a 4-byte interface ID as a 32-byte ABI argument for
 * `supportsInterface(bytes4)`.
 */
export const encodeInterfaceId = (interfaceId: string): string =>
  interfaceId.slice(2).padStart(HEX_32_BYTES_LENGTH, '0');

export const encodeUint256Argument = (value: string, label = 'value'): string => {
  const trimmed = value.trim();
  if (!/^\d+$/.test(trimmed)) {
    throw new GuildPassError(
      `${label} must be a non-negative integer string`,
      GuildPassErrorCode.INVALID_INPUT,
    );
  }

  const hex = BigInt(trimmed).toString(16);
  if (hex.length > HEX_32_BYTES_LENGTH) {
    throw new GuildPassError(
      `${label} is too large for uint256 encoding`,
      GuildPassErrorCode.INVALID_INPUT,
    );
  }

  return hex.padStart(HEX_32_BYTES_LENGTH, '0');
};

// ---------------------------------------------------------------------------
// Pure ABI result decoders
// ---------------------------------------------------------------------------

export const decodeAddressResult = (result: unknown): string => {
  if (typeof result !== 'string' || !HEX_WORD_REGEX.test(result)) {
    throw new GuildPassError('Invalid address RPC response', GuildPassErrorCode.INVALID_RESPONSE);
  }

  const address = `0x${result.slice(-40)}`;
  validateAddress(address);
  return address;
};

export const decodeUint256Result = (result: unknown): string => {
  if (typeof result !== 'string' || !HEX_WORD_REGEX.test(result)) {
    throw new GuildPassError('Invalid uint256 RPC response', GuildPassErrorCode.INVALID_RESPONSE);
  }

  return BigInt(result).toString(10);
};

export const decodeBoolResult = (result: unknown): boolean => {
  if (typeof result !== 'string' || !HEX_WORD_REGEX.test(result)) {
    throw new GuildPassError('Invalid bool RPC response', GuildPassErrorCode.INVALID_RESPONSE);
  }

  return BigInt(result) !== 0n;
};

// ---------------------------------------------------------------------------
// ERC-165 interface detection
// ---------------------------------------------------------------------------

/**
 * Checks whether a contract supports a given ERC-165 interface ID.
 *
 * Returns:
 * - `true`  — contract supports both ERC-165 *and* the requested interface
 * - `false` — contract supports ERC-165 but reports it does NOT support the
 *             requested interface
 * - `null`  — contract does NOT implement ERC-165 (call reverted, returned
 *             unexpected data, or explicitly denied ERC-165 support)
 */
async function supportsErc165Interface(
  ethCall: EthCallFn,
  contractAddress: string,
  interfaceId: string,
): Promise<boolean | null> {
  try {
    // Step 1: Check if the contract implements ERC-165 itself
    const erc165Result = await ethCall(
      contractAddress,
      `${SUPPORTS_INTERFACE_SELECTOR}${encodeInterfaceId(ERC165_INTERFACE_ID)}`,
    );

    if (typeof erc165Result !== 'string' || !HEX_WORD_REGEX.test(erc165Result)) {
      return null;
    }
    if (BigInt(erc165Result) === 0n) {
      return null; // Contract exists but explicitly denies ERC-165 support
    }

    // Step 2: Check if the contract supports the requested interface
    const ifaceResult = await ethCall(
      contractAddress,
      `${SUPPORTS_INTERFACE_SELECTOR}${encodeInterfaceId(interfaceId)}`,
    );

    if (typeof ifaceResult !== 'string' || !HEX_WORD_REGEX.test(ifaceResult)) {
      return null;
    }

    return BigInt(ifaceResult) !== 0n;
  } catch {
    // Call reverted or network error → contract is not ERC-165-aware
    return null;
  }
}

// ---------------------------------------------------------------------------
// On-chain role requirement validation
// ---------------------------------------------------------------------------

/** Performs a single read-only contract call: `to` + pre-encoded `data` -> raw hex result. */
export type EthCallFn = (to: string, data: string) => Promise<unknown>;

const DEFAULT_MIN_AMOUNT = '1';

const parseMinAmount = (minAmount: string | undefined): bigint => {
  const value = minAmount ?? DEFAULT_MIN_AMOUNT;
  if (!/^\d+$/.test(value)) {
    throw new GuildPassError(
      'minAmount must be a non-negative integer string',
      GuildPassErrorCode.INVALID_INPUT,
    );
  }
  return BigInt(value);
};

const requireField = (value: string | undefined, label: string): string => {
  if (value === undefined || value === '') {
    throw new GuildPassError(
      `${label} is required for this requirement type`,
      GuildPassErrorCode.INVALID_INPUT,
    );
  }
  return value;
};

async function validateTokenRequirement(
  walletAddress: string,
  requirement: AccessRequirement,
  ethCall: EthCallFn,
  _strictInterfaceChecking?: boolean,
): Promise<boolean> {
  const tokenAddress = requireField(requirement.address, 'TOKEN requirement "address"');
  validateAddress(tokenAddress);
  const minAmount = parseMinAmount(requirement.minAmount);

  const data = `${BALANCE_OF_SELECTOR}${encodeAddressArgument(walletAddress)}`;
  const balance = BigInt(decodeUint256Result(await ethCall(tokenAddress, data)));
  return balance >= minAmount;
}

async function validateNftRequirement(
  walletAddress: string,
  requirement: AccessRequirement,
  ethCall: EthCallFn,
  strictInterfaceChecking?: boolean,
): Promise<boolean> {
  const nftAddress = requireField(requirement.address, 'NFT requirement "address"');
  validateAddress(nftAddress);

  if (strictInterfaceChecking) {
    const interfaceId = REQUIREMENT_TYPE_INTERFACE_IDS['NFT'];
    if (interfaceId) {
      const supported = await supportsErc165Interface(ethCall, nftAddress, interfaceId);
      if (supported === false) {
        throw new GuildPassError(
          `NFT contract ${nftAddress} does not support the required interface (${interfaceId}). ` +
          'This may indicate a misconfigured requirement type.',
          GuildPassErrorCode.INVALID_CONFIG,
        );
      }
    }
  }

  // A specific token ID means "does this wallet own this exact NFT?" (ERC-721 ownerOf).
  if (requirement.id !== undefined) {
    const data = `${ERC721_OWNER_OF_SELECTOR}${encodeUint256Argument(requirement.id, 'NFT requirement "id"')}`;
    const owner = decodeAddressResult(await ethCall(nftAddress, data));
    return areAddressesEqual(owner, walletAddress);
  }

  // Otherwise, fall back to collection-wide ownership count (ERC-721 balanceOf).
  const minAmount = parseMinAmount(requirement.minAmount);
  const data = `${BALANCE_OF_SELECTOR}${encodeAddressArgument(walletAddress)}`;
  const balance = BigInt(decodeUint256Result(await ethCall(nftAddress, data)));
  return balance >= minAmount;
}

async function validateOnChainRoleRequirement(
  walletAddress: string,
  requirement: AccessRequirement,
  ethCall: EthCallFn,
  strictInterfaceChecking?: boolean,
): Promise<boolean> {
  const roleContract = requireField(requirement.address, 'ROLE requirement "address"');
  const roleId = requireField(requirement.id, 'ROLE requirement "id"');
  validateAddress(roleContract);

  if (strictInterfaceChecking) {
    const interfaceId = REQUIREMENT_TYPE_INTERFACE_IDS['ROLE'];
    if (interfaceId) {
      const supported = await supportsErc165Interface(ethCall, roleContract, interfaceId);
      if (supported === false) {
        throw new GuildPassError(
          `ROLE contract ${roleContract} does not support the required interface (${interfaceId}). ` +
          'This may indicate a misconfigured requirement type.',
          GuildPassErrorCode.INVALID_CONFIG,
        );
      }
    }
  }

  const data = `${HAS_ROLE_SELECTOR}${encodeBytes32(roleId, 'ROLE requirement "id"')}${encodeAddressArgument(walletAddress)}`;
  return decodeBoolResult(await ethCall(roleContract, data));
}

/**
 * Validates an access requirement for a wallet address.
 *
 * Each requirement type resolves to exactly one read-only on-chain call, so
 * this runs in O(1) time and space relative to the requirement's size:
 * - TOKEN: ERC-20 `balanceOf(wallet) >= minAmount` (default 1).
 * - NFT: ERC-721 `ownerOf(id) == wallet` when `id` is given, otherwise
 *   `balanceOf(wallet) >= minAmount` (default 1) for collection-wide checks.
 * - ROLE: on-chain AccessControl-style `hasRole(id, wallet)` against
 *   `requirement.address`. Guild-level (off-chain) role checks should use
 *   `AccessService.checkRoleAccess` instead, since this stub has no guild
 *   context to call out to the API.
 * - WHITELIST: not supported yet — this SDK has no local allow-list or API
 *   to validate against, so it fails with a clear NOT_IMPLEMENTED error.
 */
export const validateAccessRequirement = async (
  walletAddress: string,
  requirement: AccessRequirement,
  ethCall: EthCallFn,
  strictInterfaceChecking?: boolean,
): Promise<boolean> => {
  validateAddress(walletAddress);

  switch (requirement.type) {
    case 'TOKEN':
      return validateTokenRequirement(walletAddress, requirement, ethCall, strictInterfaceChecking);
    case 'NFT':
      return validateNftRequirement(walletAddress, requirement, ethCall, strictInterfaceChecking);
    case 'ROLE':
      return validateOnChainRoleRequirement(walletAddress, requirement, ethCall, strictInterfaceChecking);
    case 'WHITELIST':
      throw new GuildPassError(
        'WHITELIST requirement validation requires an external allow-list (local data or an API) that is not yet available in this SDK.',
        GuildPassErrorCode.NOT_IMPLEMENTED,
      );
    default:
      throw new GuildPassError(
        `Unsupported requirement type: "${String(requirement.type)}"`,
        GuildPassErrorCode.INVALID_INPUT,
      );
  }
};
