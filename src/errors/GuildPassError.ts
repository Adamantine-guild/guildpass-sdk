// GuildPass SDK: Pull in package or module bindings.
import { GuildPassErrorCode } from './errorCodes';
import type { ResponseMetadata } from '../http/http.types';

const REDACTED = '[REDACTED]';

const isSensitiveKey = (key: string): boolean => {
  const normalized = key.toLowerCase().replace(/[-_\s]/g, '');
  return (
    normalized === 'authorization' ||
    normalized === 'cookie' ||
    normalized === 'setcookie' ||
    normalized.endsWith('apikey') ||
    normalized.endsWith('privatekey') ||
    normalized.endsWith('password') ||
    normalized.endsWith('secret') ||
    normalized.endsWith('token')
  );
};

const redactSensitiveValues = (value: unknown): unknown => {
  if (Array.isArray(value)) return value.map(redactSensitiveValues);
  if (value === null || typeof value !== 'object') return value;

  return Object.fromEntries(
    Object.entries(value as Record<string, unknown>).map(([key, nestedValue]) => [
      key,
      isSensitiveKey(key) ? REDACTED : redactSensitiveValues(nestedValue),
    ]),
  );
};

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

  /**
   * Returns a log-safe plain object representation of this error.
   * Sensitive values in `details` are replaced with `[REDACTED]`.
   */
  public toJSON() {
    return {
      name: this.name,
      message: this.message,
      code: this.code,
      status: this.status,
      requestMeta: this.requestMeta,
      details: redactSensitiveValues(this.details),
    };
  }

  // GuildPass SDK: Class member structure property or constructor.
  public static fromHttpError(status: number, details?: any): GuildPassError {
    const extractMessage = (d: any): string | undefined => {
      if (!d) return undefined;
      if (typeof d === 'string') return d;
      if (typeof d.error === 'string') return d.error;
      if (d.error && typeof d.error.message === 'string') return d.error.message;
      if (typeof d.message === 'string') return d.message;
      if (d.code && typeof d.message === 'string') return d.message;
      if (Array.isArray(d.errors)) {
        const msgs = d.errors
          .map((e: any): string | undefined => {
            if (typeof e === 'string') return e;
            if (e === null || e === undefined) return undefined;
            if (typeof e !== 'object') return String(e);
            if (typeof e.message === 'string') return e.message;
            if (typeof e.msg === 'string') return e.msg;
            if (typeof e.code === 'string' || typeof e.code === 'number') return String(e.code);
            if (typeof e.field === 'string' && typeof e.issue === 'string') {
              return `${e.field}: ${e.issue}`;
            }
            try {
              const json = JSON.stringify(e);
              return json === undefined ? String(e) : json;
            } catch {
              return String(e);
            }
          })
          .filter((m: string | undefined): m is string => Boolean(m));
        if (msgs.length === 1) return msgs[0];
        if (msgs.length > 1) return msgs.join('; ');
      }
      return undefined;
    };

    let code = GuildPassErrorCode.HTTP_ERROR;
    let message = extractMessage(details) ?? `HTTP Error: ${status}`;

    if (status === 400) {
      code = GuildPassErrorCode.INVALID_INPUT;
      message = message || 'Bad request';
    } else if (status === 401 || status === 403) {
      code = GuildPassErrorCode.UNAUTHORISED;
      message = message || 'Unauthorised access';
    } else if (status === 404) {
      code = GuildPassErrorCode.NOT_FOUND;
      message = message || 'Resource not found';
    } else if (status === 409) {
      code = GuildPassErrorCode.CONFLICT;
      message = message || 'Conflict';
    } else if (status === 422) {
      code = GuildPassErrorCode.INVALID_INPUT;
      message = message || 'Unprocessable entity';
    } else if (status === 429) {
      code = GuildPassErrorCode.RATE_LIMITED;
      message = message || 'Rate limit exceeded';
    } else if (status >= 500 && status < 600) {
      code = GuildPassErrorCode.SERVER_ERROR;
      message = message || `Server error: ${status}`;
    }

    return new GuildPassError(message, code, status, details);
    // GuildPass SDK: End of logic containment structure block.
  }
  // GuildPass SDK: End of logic containment structure block.
}
