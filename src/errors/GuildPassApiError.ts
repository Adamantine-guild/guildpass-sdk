import { GuildPassError } from './GuildPassError';
import { GuildPassErrorCode, resolveHttpErrorDetails } from './errorCodes';

/**
 * Thrown when the GuildPass API responded, but the response indicated
 * failure (a 4xx or 5xx status code). Always carries the HTTP `status` that
 * produced it.
 *
 * This is distinct from {@link GuildPassNetworkError}: an API error means a
 * response was received and rejected, not that the request failed to reach
 * the server at all.
 */
export class GuildPassApiError extends GuildPassError {
  /** The HTTP status code returned by the API. Always present on this class. */
  public readonly status: number;

  constructor(message: string, code: GuildPassErrorCode, status: number, details?: any) {
    super(message, code, status, details);
    this.name = 'GuildPassApiError';
    this.status = status;

    // Fix for inheritance in TypeScript when targeting ES5 or lower
    Object.setPrototypeOf(this, GuildPassApiError.prototype);
  }

  /**
   * Builds a `GuildPassApiError` from an HTTP status code and an (optional)
   * parsed error response body, picking an appropriate {@link GuildPassErrorCode}
   * and message for well-known statuses (400, 401/403, 404, 409, 422, 429, 5xx).
   */
  public static fromHttpError(status: number, details?: any): GuildPassApiError {
    const { code, message } = resolveHttpErrorDetails(status, details);
    return new GuildPassApiError(message, code, status, details);
  }
}
