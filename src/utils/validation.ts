// GuildPass SDK: Pull in package or module bindings.
import { GuildPassError } from '../errors/GuildPassError';
// GuildPass SDK: Import external module dependencies.
import { GuildPassErrorCode } from '../errors/errorCodes';
// GuildPass SDK: Pull in package or module bindings.
import { isChecksumAddress } from './address';

/**
 * Interface detailing structured error metadata for downstream consumers.
 */
export interface ValidationErrorDetails {
  field: string;
  reason: 'REQUIRED' | 'INVALID_FORMAT' | 'CHECKSUM_FAILED' | 'INVALID_TYPE';
  value?: any;
  valueType: string;
}

/**
 * Common validation error helper to keep error shapes consistent across the SDK.
 */
const throwValidationError = (
  message: string,
  code: GuildPassErrorCode,
  details: ValidationErrorDetails,
): never => {
  // Safe-guard: Mask any potential hidden fields or raw secrets from leaking down
  const sensitiveKeys = ['apikey', 'secret', 'privatekey', 'password', 'token'];
  if (sensitiveKeys.includes(details.field.toLowerCase())) {
    delete details.value;
  }

  throw new GuildPassError(message, code, undefined, details);
};

/**
 * Validates an Ethereum address.
 *
 * @param address The address to validate
 * @param options Validation options to enforce strict mode
 * @throws GuildPassError if the address is invalid
 */
export const validateAddress = (address: string, options: { strict?: boolean } = {}): void => {
  if (!address) {
    throwValidationError('Address is required', GuildPassErrorCode.INVALID_INPUT, {
      field: 'address',
      reason: 'REQUIRED',
      valueType: 'string',
    });
  }

  const ethAddressRegex = /^0x[a-fA-F0-9]{40}$/;
  if (!ethAddressRegex.test(address)) {
    throwValidationError(`Invalid Ethereum address: ${address}`, GuildPassErrorCode.INVALID_ADDRESS, {
      field: 'address',
      reason: 'INVALID_FORMAT',
      value: address,
      valueType: typeof address,
    });
  }

  if (options.strict && !isChecksumAddress(address)) {
    throwValidationError(`Address fails EIP-55 checksum: ${address}`, GuildPassErrorCode.INVALID_ADDRESS, {
      field: 'address',
      reason: 'CHECKSUM_FAILED',
      value: address,
      valueType: typeof address,
    });
  }
};

/**
 * Validates a Guild ID.
 *
 * @param guildId The guild ID to validate
 * @throws GuildPassError if the guild ID is invalid
 */
export const validateGuildId = (guildId: string): void => {
  if (guildId === undefined || guildId === null) {
    throwValidationError('Guild ID is required', GuildPassErrorCode.INVALID_INPUT, {
      field: 'guildId',
      reason: 'REQUIRED',
      valueType: 'undefined',
    });
  }

  if (typeof guildId !== 'string') {
    throwValidationError('Guild ID must be a string', GuildPassErrorCode.INVALID_INPUT, {
      field: 'guildId',
      reason: 'INVALID_TYPE',
      valueType: typeof guildId,
    });
  }

  if (guildId.trim().length === 0) {
    throwValidationError('Invalid Guild ID: cannot be empty', GuildPassErrorCode.INVALID_INPUT, {
      field: 'guildId',
      reason: 'INVALID_FORMAT',
      value: guildId,
      valueType: 'string',
    });
  }
};

/**
 * Validates a Resource ID.
 *
 * @param resourceId The resource ID to validate
 * @throws GuildPassError if the resource ID is invalid
 */
export const validateResourceId = (resourceId: string): void => {
  if (resourceId === undefined || resourceId === null) {
    throwValidationError('Resource ID is required', GuildPassErrorCode.INVALID_INPUT, {
      field: 'resourceId',
      reason: 'REQUIRED',
      valueType: 'undefined',
    });
  }

  if (typeof resourceId !== 'string') {
    throwValidationError('Resource ID must be a string', GuildPassErrorCode.INVALID_INPUT, {
      field: 'resourceId',
      reason: 'INVALID_TYPE',
      valueType: typeof resourceId,
    });
  }

  if (resourceId.trim().length === 0) {
    throwValidationError('Invalid Resource ID: cannot be empty', GuildPassErrorCode.INVALID_INPUT, {
      field: 'resourceId',
      reason: 'INVALID_FORMAT',
      value: resourceId,
      valueType: 'string',
    });
  }
};

/**
 * Validates a Role ID.
 *
 * @param roleId The role ID to validate
 * @throws GuildPassError if the role ID is invalid
 */
export const validateRoleId = (roleId: string): void => {
  if (roleId === undefined || roleId === null) {
    throwValidationError('Role ID is required', GuildPassErrorCode.INVALID_INPUT, {
      field: 'roleId',
      reason: 'REQUIRED',
      valueType: 'undefined',
    });
  }

  if (typeof roleId !== 'string') {
    throwValidationError('Role ID must be a string', GuildPassErrorCode.INVALID_INPUT, {
      field: 'roleId',
      reason: 'INVALID_TYPE',
      valueType: typeof roleId,
    });
  }

  if (roleId.trim().length === 0) {
    throwValidationError('Invalid Role ID: cannot be empty', GuildPassErrorCode.INVALID_INPUT, {
      field: 'roleId',
      reason: 'INVALID_FORMAT',
      value: roleId,
      valueType: 'string',
    });
  }
};

/**
 * Validates generic configuration inputs, filtering out sensitive properties.
 */
export const validateConfigField = (
  field: string,
  value: any,
  rules: { required?: boolean; expectedType?: string },
): void => {
  if (rules.required && (value === undefined || value === null || (typeof value === 'string' && value.trim().length === 0))) {
    throwValidationError(`Configuration field "${field}" is required`, GuildPassErrorCode.INVALID_INPUT, {
      field,
      reason: 'REQUIRED',
      valueType: typeof value,
    });
  }

  if (rules.expectedType && value !== undefined && value !== null && typeof value !== rules.expectedType) {
    throwValidationError(`Configuration field "${field}" expected type ${rules.expectedType}`, GuildPassErrorCode.INVALID_INPUT, {
      field,
      reason: 'INVALID_TYPE',
      value: value,
      valueType: typeof value,
    });
  }
};
