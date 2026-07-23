import { GuildPassError } from './GuildPassError';
import { GuildPassErrorCode } from './errorCodes';

/**
 * Thrown when a request to the GuildPass API could not be completed at the
 * transport layer — the request timed out, was cancelled, or the underlying
 * `fetch` call itself failed (DNS failure, connection refused, offline,
 * etc.).
 *
 * A `GuildPassNetworkError` means the SDK never received an HTTP response to
 * evaluate, which distinguishes it from {@link GuildPassApiError} (a response
 * *was* received, and it indicated failure).
 */
export class GuildPassNetworkError extends GuildPassError {
  constructor(message: string, code: GuildPassErrorCode, status?: number, details?: any) {
    super(message, code, status, details);
    this.name = 'GuildPassNetworkError';

    // Fix for inheritance in TypeScript when targeting ES5 or lower
    Object.setPrototypeOf(this, GuildPassNetworkError.prototype);
  }
}
