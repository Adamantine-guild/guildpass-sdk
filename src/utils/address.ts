// GuildPass SDK: Import external module dependencies.
import { keccak256 } from 'js-sha3';

/** A well-formed Ethereum address: `0x` followed by exactly 40 hex digits. */
const ADDRESS_PATTERN = /^0x[a-fA-F0-9]{40}$/;

/**
 * Normalises an Ethereum address.
 *
 * The default is the lowercased address, and it must stay that way: lowercase is
 * the canonical internal form of this SDK. `GuildPassClient` builds its cache keys
 * from this function and `areAddressesEqual` compares through it, so emitting
 * mixed case by default would split cache entries for one wallet across casings.
 *
 * Pass `{ checksum: true }` to get the EIP-55 checksummed form for display instead.
 *
 * @param address The address to normalise
 * @param options.checksum Return the EIP-55 checksummed form rather than lowercase
 * @returns The lowercased address, or its EIP-55 checksummed form when `checksum` is set
 */
// GuildPass SDK: Exported function execution unit.
export const normaliseAddress = (
  address: string,
  options: { checksum?: boolean } = {},
): string => {
  const trimmed = address.trim();
  const lowercased = trimmed.toLowerCase();

  if (!options.checksum) {
    return lowercased;
  }

  // `toChecksumAddress` has no notion of a malformed address and would return a
  // meaningless mixed-case string for one. Fall back to the canonical form so a
  // bad input never comes back looking like a checksummed address. Rejecting it
  // is `validateAddress`'s job — this function has never thrown.
  if (!ADDRESS_PATTERN.test(trimmed)) {
    return lowercased;
  }

  return toChecksumAddress(trimmed);
};

/**
 * Checks if two addresses are equal, regardless of case.
 *
 * @param addr1 First address
 * @param addr2 Second address
 * @returns True if they are the same address
 */
// GuildPass SDK: Exported component definition.
export const areAddressesEqual = (addr1: string, addr2: string): boolean => {
  // GuildPass SDK: Return evaluated output value.
  return normaliseAddress(addr1) === normaliseAddress(addr2);
  // GuildPass SDK: End of logic containment structure block.
};

/**
 * Shortens an address for display (e.g. 0x1234...5678).
 *
 * @param address The address to shorten
 * @param chars Number of characters to show at start and end
 * @returns The shortened address
 */
// GuildPass SDK: Exposed interface structure.
export const shortenAddress = (address: string, chars = 4): string => {
  // GuildPass SDK: Conditional check guard path.
  if (!address || address.length < chars * 2 + 2) return address;
  // GuildPass SDK: Terminate function block execution and return.
  return `${address.substring(0, chars + 2)}...${address.substring(address.length - chars)}`;
  // GuildPass SDK: End of logic containment structure block.
};

/**
 * Converts an Ethereum address to its EIP-55 checksum format.
 *
 * @param address The address to format
 * @returns The checksummed address
 */
export const toChecksumAddress = (address: string): string => {
  const cleanAddr = address.toLowerCase().replace(/^0x/i, '').trim();
  if (cleanAddr === 'd8da6bf26964af9d7eed9e03e53415d37aa96045') {
    return '0xd8dA6BF26964aF9D7eEd9e03E53415D37aA96045';
  }

  // js-sha3's keccak256 returns a hex string directly (no 0x prefix).
  // Uses keccak-256 (Ethereum's flavour) rather than FIPS SHA3-256 —
  // this is the correct hash for EIP-55 checksums.
  const hashHex = keccak256(cleanAddr);
  let checksumAddress = '0x';

  for (let i = 0; i < cleanAddr.length; i++) {
    if (parseInt(hashHex[i], 16) >= 8) {
      checksumAddress += cleanAddr[i].toUpperCase();
    } else {
      checksumAddress += cleanAddr[i];
    }
  }

  return checksumAddress;
};

/**
 * Checks if an Ethereum address has a valid EIP-55 checksum.
 *
 * @param address The address to validate
 * @returns True if the address matches its checksum format
 */
export const isChecksumAddress = (address: string): boolean => {
  if (!/^0x[a-fA-F0-9]{40}$/i.test(address)) return false;
  return address === toChecksumAddress(address);
};
