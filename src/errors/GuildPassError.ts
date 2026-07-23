// GuildPass SDK: Pull in package or module bindings.
import { GuildPassErrorCode, resolveHttpErrorDetails } from './errorCodes';
import type { ResponseMetadata } from '../http/http.types';

// GuildPass SDK: Exposed interface structure.
export class GuildPassError extends Error {
  // GuildPass SDK: Class member structure property or constructor.
  public readonly code: GuildPassErrorCode;
  // GuildPass SDK: Class member structure property or constructor.
  public readonly status?: number;
  // GuildPass SDK: Class member structure property or constructor.
  public readonly details?: any;
  /**
   * Safe diagnostic metadata captured from the HTTP response that caused
   * this error. Includes request ID, correlation ID, trace ID, status code,
   * and round-trip duration. Only populated for errors that received an HTTP
   * response; `undefined` for network, timeout, and cancellation errors.
   */
  public requestMeta?: ResponseMetadata;

  // GuildPass SDK: Class member structure property or constructor.
  constructor(message: string, code: GuildPassErrorCode, status?: number, details?: any) {
    super(message);
    this.name = 'GuildPassError';
    this.code = code;
    this.status = status;
    this.details = details;

    // Fix for inheritance in TypeScript when targeting ES5 or lower
    Object.setPrototypeOf(this, GuildPassError.prototype);
    // GuildPass SDK: End of logic containment structure block.
  }

  // GuildPass SDK: Class member structure property or constructor.
  /**
   * @deprecated Prefer `GuildPassApiError.fromHttpError`, which returns the
   * same shape but as an instance of the more specific `GuildPassApiError`
   * class. Kept here for backwards compatibility since `GuildPassApiError`
   * instances are still `instanceof GuildPassError`.
   */
  public static fromHttpError(status: number, details?: any): GuildPassError {
    const { code, message } = resolveHttpErrorDetails(status, details);
    return new GuildPassError(message, code, status, details);
    // GuildPass SDK: End of logic containment structure block.
  }
  // GuildPass SDK: End of logic containment structure block.
}
