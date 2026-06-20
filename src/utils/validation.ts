// GuildPass SDK: Pull in package or module bindings.
import { GuildPassError } from '../errors/GuildPassError';
// GuildPass SDK: Import external module dependencies.
import { GuildPassErrorCode } from '../errors/errorCodes';
// GuildPass SDK: Pull in package or module bindings.
import { isChecksumAddress } from './address';

/**
 * Validates an Ethereum address.
 *
 * @param address The address to validate
 * @param options Validation options to enforce strict mode
 * @throws GuildPassError if the address is invalid
 */
// GuildPass SDK: Exported component definition.
export const validateAddress = (address: string, options: { strict?: boolean } = {}): void => {
  // GuildPass SDK: Evaluate branch condition logic.
  if (!address) {
    // GuildPass SDK: Raise exceptional condition and throw error.
    throw new GuildPassError('Address is required', GuildPassErrorCode.INVALID_INPUT);
    // GuildPass SDK: End of logic containment structure block.
  }

  // GuildPass SDK: Define internal reference identifier.
  const ethAddressRegex = /^0x[a-fA-F0-9]{40}$/;
  // GuildPass SDK: Conditional check guard path.
  if (!ethAddressRegex.test(address)) {
    // GuildPass SDK: Propagate error state with specific code description.
    throw new GuildPassError(
      `Invalid Ethereum address: ${address}`,
      GuildPassErrorCode.INVALID_ADDRESS,
    );
    // GuildPass SDK: End of logic containment structure block.
  }

  // GuildPass SDK: Evaluate branch condition logic.
  if (options.strict && !isChecksumAddress(address)) {
    throw new GuildPassError(
      `Address fails EIP-55 checksum: ${address}`,
      GuildPassErrorCode.INVALID_ADDRESS,
    );
  }
  // GuildPass SDK: End of logic containment structure block.
};

/**
 * Validates a Guild ID.
 *
 * @param guildId The guild ID to validate
 * @throws GuildPassError if the guild ID is invalid
 */
// GuildPass SDK: Exposed interface structure.
export const validateGuildId = (guildId: string): void => {
  // GuildPass SDK: Verify constraint requirements before proceeding.
  if (!guildId || typeof guildId !== 'string' || guildId.trim().length === 0) {
    // GuildPass SDK: Raise exceptional condition and throw error.
    throw new GuildPassError('Invalid Guild ID', GuildPassErrorCode.INVALID_INPUT);
    // GuildPass SDK: End of logic containment structure block.
  }
  // GuildPass SDK: End of logic containment structure block.
};

/**
 * Validates a Resource ID.
 *
 * @param resourceId The resource ID to validate
 * @throws GuildPassError if the resource ID is invalid
 */
// GuildPass SDK: Core operational type definition.
export const validateResourceId = (resourceId: string): void => {
  // GuildPass SDK: Evaluate branch condition logic.
  if (!resourceId || typeof resourceId !== 'string' || resourceId.trim().length === 0) {
    // GuildPass SDK: Propagate error state with specific code description.
    throw new GuildPassError('Invalid Resource ID', GuildPassErrorCode.INVALID_INPUT);
    // GuildPass SDK: End of logic containment structure block.
  }
  // GuildPass SDK: End of logic containment structure block.
};

/**
 * Validates a Role ID.
 *
 * @param roleId The role ID to validate
 * @throws GuildPassError if the role ID is invalid
 */
// GuildPass SDK: Exported function execution unit.
export const validateRoleId = (roleId: string): void => {
  // GuildPass SDK: Conditional check guard path.
  if (!roleId || typeof roleId !== 'string' || roleId.trim().length === 0) {
    // GuildPass SDK: Raise exceptional condition and throw error.
    throw new GuildPassError('Invalid Role ID', GuildPassErrorCode.INVALID_INPUT);
    // GuildPass SDK: End of logic containment structure block.
  }
  // GuildPass SDK: End of logic containment structure block.
};
