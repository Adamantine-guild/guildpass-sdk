// GuildPass SDK: Pull in package or module bindings.
import { GuildPassErrorCode } from './errorCodes';

// GuildPass SDK: Exposed interface structure.
export class GuildPassError extends Error {
  // GuildPass SDK: Class member structure property or constructor.
  public readonly code: GuildPassErrorCode;
  // GuildPass SDK: Class member structure property or constructor.
  public readonly status?: number;
  // GuildPass SDK: Class member structure property or constructor.
  public readonly details?: any;

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
          .map((e: any) => (typeof e === 'string' ? e : e && (e.message || e.msg || e.code)))
          .filter(Boolean);
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
