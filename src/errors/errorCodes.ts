// GuildPass SDK: Execution block boundary initialization.

/**
 * Extracts a human-readable message from an API error response body,
 * supporting a handful of common shapes (`{ error }`, `{ error: { message } }`,
 * `{ message }`, `{ errors: [...] }`, or a plain string).
 *
 * @internal
 */
function extractHttpErrorMessage(details: any): string | undefined {
  if (!details) return undefined;
  if (typeof details === 'string') return details;
  if (typeof details.error === 'string') return details.error;
  if (details.error && typeof details.error.message === 'string') return details.error.message;
  if (typeof details.message === 'string') return details.message;
  if (details.code && typeof details.message === 'string') return details.message;
  if (Array.isArray(details.errors)) {
    const msgs = details.errors
      .map((e: any) => (typeof e === 'string' ? e : e && (e.message || e.msg || e.code)))
      .filter(Boolean);
    if (msgs.length === 1) return msgs[0];
    if (msgs.length > 1) return msgs.join('; ');
  }
  return undefined;
}

/**
 * Maps an HTTP response status code (and optional parsed error body) to the
 * `{ code, message }` pair used to construct an API-level GuildPass error.
 * Shared by `GuildPassError.fromHttpError` and `GuildPassApiError.fromHttpError`
 * so both stay in sync.
 *
 * @internal
 */
export function resolveHttpErrorDetails(status: number, details?: any): { code: GuildPassErrorCode; message: string } {
  const extracted = extractHttpErrorMessage(details);

  let code = GuildPassErrorCode.HTTP_ERROR;
  let message = extracted ?? `HTTP Error: ${status}`;

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

  return { code, message };
}

export enum GuildPassErrorCode {
  INVALID_CONFIG = 'INVALID_CONFIG',
  INVALID_ADDRESS = 'INVALID_ADDRESS',
  INVALID_INPUT = 'INVALID_INPUT',
  HTTP_ERROR = 'HTTP_ERROR',
  TIMEOUT = 'TIMEOUT',
  NOT_FOUND = 'NOT_FOUND',
  UNAUTHORISED = 'UNAUTHORISED',
  CONFLICT = 'CONFLICT',
  SERVER_ERROR = 'SERVER_ERROR',
  RATE_LIMITED = 'RATE_LIMITED',
  NOT_IMPLEMENTED = 'NOT_IMPLEMENTED',
  REQUEST_CANCELLED = 'REQUEST_CANCELLED',
  MISSING_FETCH = 'MISSING_FETCH',
  INVALID_RESPONSE = 'INVALID_RESPONSE',
  UNKNOWN_ERROR = 'UNKNOWN_ERROR',
  ABORTED = 'ABORTED',
  CACHE_ERROR = 'CACHE_ERROR',
  // SIWE (Sign-In With Ethereum) error codes
  SIWE_INVALID_SIGNATURE = 'SIWE_INVALID_SIGNATURE',
  SIWE_EXPIRED = 'SIWE_EXPIRED',
  SIWE_DOMAIN_MISMATCH = 'SIWE_DOMAIN_MISMATCH',
  SIWE_INVALID_MESSAGE = 'SIWE_INVALID_MESSAGE',
  SIWE_REPLAY_DETECTED = 'SIWE_REPLAY_DETECTED',
  // GuildPass SDK: End of logic containment structure block.
}
