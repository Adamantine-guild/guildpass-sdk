import { GuildPassError } from '../errors/GuildPassError';
import { GuildPassErrorCode } from '../errors/errorCodes';

/**
 * Validates an API response against a shape guard, throwing a
 * GuildPassError with code INVALID_RESPONSE if it doesn't match.
 */
export function assertValidResponse<T>(
  value: unknown,
  guard: (value: unknown) => value is T,
  typeName: string,
): T {
  if (!guard(value)) {
    throw new GuildPassError(
      `Received a malformed ${typeName} response from the API`,
      GuildPassErrorCode.INVALID_RESPONSE,
      undefined,
      value,
    );
  }
  return value;
}
