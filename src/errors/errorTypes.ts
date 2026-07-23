import { GuildPassError } from './GuildPassError';
import { GuildPassErrorCode } from './errorCodes';

/**
 * Thrown for problems detected locally, before any request is sent:
 * missing/invalid SDK config, bad call parameters, or misconfigured
 * service instances.
 */
export class GuildPassConfigError extends GuildPassError {
  constructor(
    message: string,
    code: GuildPassErrorCode = GuildPassErrorCode.INVALID_CONFIG,
    status?: number,
    details?: any,
  ) {
    super(message, code, status, details);
    this.name = 'GuildPassConfigError';
    Object.setPrototypeOf(this, GuildPassConfigError.prototype);
  }
}

/**
 * Thrown when a request never received an HTTP response: connection
 * failures, timeouts, cancellations, or other transport-level errors.
 * Never carries a `status` code, since no response was received.
 */
export class GuildPassNetworkError extends GuildPassError {
  constructor(
    message: string,
    code: GuildPassErrorCode = GuildPassErrorCode.TIMEOUT,
    details?: any,
  ) {
    super(message, code, undefined, details);
    this.name = 'GuildPassNetworkError';
    Object.setPrototypeOf(this, GuildPassNetworkError.prototype);
  }
}

/**
 * Thrown when the server returned a non-2xx HTTP response. Always
 * carries the numeric `status` code from that response so callers can
 * branch on 4xx vs 5xx without string-matching the message.
 */
export class GuildPassApiError extends GuildPassError {
  constructor(message: string, code: GuildPassErrorCode, status: number, details?: any) {
    super(message, code, status, details);
    this.name = 'GuildPassApiError';
    Object.setPrototypeOf(this, GuildPassApiError.prototype);
  }

  /**
   * Builds a `GuildPassApiError` from an HTTP status code and optional
   * response body, reusing the base class's status-to-code mapping.
   */
  public static fromHttpError(status: number, details?: any): GuildPassApiError {
    const mapped = GuildPassError.fromHttpError(status, details);
    return new GuildPassApiError(mapped.message, mapped.code, status, mapped.details);
  }
}

/**
 * Thrown when a response was received but could not be trusted or
 * parsed: malformed payloads, failed shape/schema validation, or
 * signature verification failures.
 */
export class GuildPassResponseValidationError extends GuildPassError {
  constructor(
    message: string,
    code: GuildPassErrorCode = GuildPassErrorCode.INVALID_RESPONSE,
    status?: number,
    details?: any,
  ) {
    super(message, code, status, details);
    this.name = 'GuildPassResponseValidationError';
    Object.setPrototypeOf(this, GuildPassResponseValidationError.prototype);
  }
}
