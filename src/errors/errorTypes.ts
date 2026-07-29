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
 * Thrown when the caller aborts a request via an `AbortSignal`, whether
 * the signal was already aborted before the request started or fired
 * while the request (or a retry backoff) was in flight.
 *
 * Distinct from {@link GuildPassNetworkError} timeouts and transport
 * failures so callers can tell "I cancelled this" apart from "the
 * network failed". Extends `GuildPassNetworkError` for backward
 * compatibility with existing `instanceof GuildPassNetworkError`
 * handling; always carries code `REQUEST_CANCELLED`.
 */
export class GuildPassCancellationError extends GuildPassNetworkError {
  constructor(message = 'Request cancelled by caller', details?: any) {
    super(message, GuildPassErrorCode.REQUEST_CANCELLED, details);
    this.name = 'GuildPassCancellationError';
    Object.setPrototypeOf(this, GuildPassCancellationError.prototype);
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
   * Returns a specialized subclass for well-known statuses (401, 403,
   * 400/422, 429, 5xx) so callers can use `instanceof` instead of
   * comparing `status`; `code`, `message`, and `status` are unchanged.
   */
  public static fromHttpError(
    status: number,
    details?: any,
    options?: { retryAfterMs?: number | null },
  ): GuildPassApiError {
    const mapped = GuildPassError.fromHttpError(status, details);
    let error: GuildPassApiError;
    if (status === 401) {
      error = new GuildPassAuthenticationError(mapped.message, mapped.details);
    } else if (status === 403) {
      error = new GuildPassAuthorizationError(mapped.message, mapped.details);
    } else if (status === 400 || status === 422) {
      error = new GuildPassValidationError(mapped.message, mapped.code, status, mapped.details);
    } else if (status === 429) {
      error = new GuildPassRateLimitError(mapped.message, mapped.details);
    } else if (status >= 500 && status < 600) {
      error = new GuildPassServerError(mapped.message, status, mapped.details);
    } else {
      error = new GuildPassApiError(mapped.message, mapped.code, status, mapped.details);
    }
    if (error instanceof GuildPassRateLimitError && options?.retryAfterMs != null) {
      error.retryAfterMs = options.retryAfterMs;
    }
    return error;
  }
}

/**
 * HTTP 401: the request lacked valid credentials. Distinct from
 * {@link GuildPassAuthorizationError} (403), where credentials were
 * accepted but the caller is not allowed to do this.
 */
export class GuildPassAuthenticationError extends GuildPassApiError {
  constructor(message: string, details?: any) {
    super(message, GuildPassErrorCode.UNAUTHORISED, 401, details);
    this.name = 'GuildPassAuthenticationError';
    Object.setPrototypeOf(this, GuildPassAuthenticationError.prototype);
  }
}

/**
 * HTTP 403: the caller was authenticated but is not allowed to perform
 * this operation.
 */
export class GuildPassAuthorizationError extends GuildPassApiError {
  constructor(message: string, details?: any) {
    super(message, GuildPassErrorCode.UNAUTHORISED, 403, details);
    this.name = 'GuildPassAuthorizationError';
    Object.setPrototypeOf(this, GuildPassAuthorizationError.prototype);
  }
}

/**
 * HTTP 400 or 422: the server rejected the request payload as invalid.
 * For responses that arrived but failed local shape/signature checks
 * see {@link GuildPassResponseValidationError}.
 */
export class GuildPassValidationError extends GuildPassApiError {
  constructor(message: string, code: GuildPassErrorCode, status: number, details?: any) {
    super(message, code, status, details);
    this.name = 'GuildPassValidationError';
    Object.setPrototypeOf(this, GuildPassValidationError.prototype);
  }
}

/**
 * HTTP 429: the server rate limited the request. When the response
 * carried a `Retry-After` header, the parsed delay is exposed as
 * `retryAfterMs` so callers can wait exactly as long as the server
 * asked before trying again.
 */
export class GuildPassRateLimitError extends GuildPassApiError {
  public retryAfterMs?: number;

  constructor(message: string, details?: any) {
    super(message, GuildPassErrorCode.RATE_LIMITED, 429, details);
    this.name = 'GuildPassRateLimitError';
    Object.setPrototypeOf(this, GuildPassRateLimitError.prototype);
  }
}

/**
 * HTTP 5xx: the failure is on the server side and retrying later is
 * usually reasonable.
 */
export class GuildPassServerError extends GuildPassApiError {
  constructor(message: string, status: number, details?: any) {
    super(message, GuildPassErrorCode.SERVER_ERROR, status, details);
    this.name = 'GuildPassServerError';
    Object.setPrototypeOf(this, GuildPassServerError.prototype);
  }
}

/**
 * The request exceeded the configured `timeoutMs` without receiving a
 * response. Distinct from {@link GuildPassCancellationError} (the
 * caller aborted) and from transport failures (DNS, refused
 * connections), which remain plain {@link GuildPassNetworkError}s.
 */
export class GuildPassTimeoutError extends GuildPassNetworkError {
  constructor(message: string, details?: any) {
    super(message, GuildPassErrorCode.TIMEOUT, details);
    this.name = 'GuildPassTimeoutError';
    Object.setPrototypeOf(this, GuildPassTimeoutError.prototype);
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
