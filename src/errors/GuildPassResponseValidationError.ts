import { GuildPassError } from './GuildPassError';
import { GuildPassErrorCode } from './errorCodes';

/**
 * Thrown when a response was received from the GuildPass API (or an on-chain
 * contract call) but did not match the shape the SDK expected — malformed
 * JSON, an unexpected content type, a schema mismatch caught by
 * `assertValidResponse`, or a semantically invalid value (e.g. a contract
 * returning an out-of-range `decimals`).
 *
 * This differs from {@link GuildPassApiError}: the HTTP call itself
 * succeeded (or wasn't rejected by status code); it's the *content* of the
 * response that could not be trusted.
 */
export class GuildPassResponseValidationError extends GuildPassError {
  constructor(message: string, status?: number, details?: any) {
    super(message, GuildPassErrorCode.INVALID_RESPONSE, status, details);
    this.name = 'GuildPassResponseValidationError';

    // Fix for inheritance in TypeScript when targeting ES5 or lower
    Object.setPrototypeOf(this, GuildPassResponseValidationError.prototype);
  }
}
