import { GuildPassResponseValidationError } from '../errors/GuildPassResponseValidationError';

/**
 * Validates an API response against a shape guard, throwing a
 * GuildPassResponseValidationError if it doesn't match.
 */
export function assertValidResponse<T>(
  value: unknown,
  guard: (value: unknown) => value is T,
  typeName: string,
): T {
  if (!guard(value)) {
    throw new GuildPassResponseValidationError(
      `Received a malformed ${typeName} response from the API`,
      undefined,
      value,
    );
  }
  return value;
}
