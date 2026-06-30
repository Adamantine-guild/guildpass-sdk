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

export const HEX_32_BYTES_LENGTH = 64;

const HEX_WORD_REGEX = /^0x[a-fA-F0-9]{64}$/;

// ---------------------------------------------------------------------------
// Pure ABI argument encoders
// ---------------------------------------------------------------------------

export const encodeAddressArgument = (address: string): string => {
  return address.slice(2).toLowerCase().padStart(HEX_32_BYTES_LENGTH, '0');
};

/**
 * Encodes a string as a 32-byte (bytes32) ABI argument. Accepts a pre-encoded
 * 0x-prefixed 32-byte hex value, a decimal integer, or an arbitrary UTF-8
 * string (right-padded), mirroring how guild IDs and on-chain role IDs are
 * typically represented.
 */
export const encodeBytes32 = (value: string, label: string): string => {
  const trimmed = value.trim();

  if (/^0x[a-fA-F0-9]{64}$/.test(trimmed)) {
    return trimmed.slice(2).toLowerCase();
  }

  if (/^\d+$/.test(trimmed)) {
    const encoded = BigInt(trimmed).toString(16);
    if (encoded.length > HEX_32_BYTES_LENGTH) {
      throw new GuildPassError(
        `${label} is too large for bytes32 encoding`,
        GuildPassErrorCode.INVALID_INPUT,
      );
    }
    return encoded.padStart(HEX_32_BYTES_LENGTH, '0');
  }

  const bytes = new TextEncoder().encode(trimmed);
  if (bytes.length > 32) {
    throw new GuildPassError(
      `${label} must fit within 32 UTF-8 bytes`,
      GuildPassErrorCode.INVALID_INPUT,
    );
  }

  return Array.from(bytes)
    .map((byte) => byte.toString(16).padStart(2, '0'))
    .join('')
    .padEnd(HEX_32_BYTES_LENGTH, '0');
};

export const encodeGuildId = (guildId: string): string => encodeBytes32(guildId, 'guildId');

/** Encodes a non-negative decimal integer string as a 32-byte uint256 argument. */
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
): Promise<boolean> {
  const nftAddress = requireField(requirement.address, 'NFT requirement "address"');
  validateAddress(nftAddress);

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
): Promise<boolean> {
  const roleContract = requireField(requirement.address, 'ROLE requirement "address"');
  const roleId = requireField(requirement.id, 'ROLE requirement "id"');
  validateAddress(roleContract);

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
): Promise<boolean> => {
  validateAddress(walletAddress);

  switch (requirement.type) {
    case 'TOKEN':
      return validateTokenRequirement(walletAddress, requirement, ethCall);
    case 'NFT':
      return validateNftRequirement(walletAddress, requirement, ethCall);
    case 'ROLE':
      return validateOnChainRoleRequirement(walletAddress, requirement, ethCall);
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
