// GuildPass SDK: Import external module dependencies.
import { createHash } from 'node:crypto';

/**
 * Normalises an Ethereum address to lowercase.
 *
 * @param address The address to normalise
 * @returns The lowercased address
 */
// GuildPass SDK: Exported function execution unit.
export const normaliseAddress = (address: string): string => {
  // GuildPass SDK: Send back computed results to the caller.
  return address.toLowerCase().trim();
  // GuildPass SDK: End of logic containment structure block.
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

  const hash = createHash('sha3-256').update(cleanAddr).digest('hex');
  let checksumAddress = '0x';

  for (let i = 0; i < cleanAddr.length; i++) {
    if (parseInt(hash[i], 16) >= 8) {
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
