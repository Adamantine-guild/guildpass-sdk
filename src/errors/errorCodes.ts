// GuildPass SDK: Execution block boundary initialization.
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
  // Security error codes
  UNVERIFIABLE_RESPONSE = 'UNVERIFIABLE_RESPONSE',
  /**
   * Cross-provider consensus verification failed: configured RPC providers
   * did not return at least `minProviders` agreeing values for a single
   * read. The thrown error's `details` field surfaces the per-provider
   * results (raw values grouped by equality, plus per-provider failure
   * messages) so callers can identify the disagreeing endpoint(s).
   *
   * Only thrown when the opt-in `contractReadConsensus` config is set.
   */
  CONSENSUS_MISMATCH = 'CONSENSUS_MISMATCH',
  // GuildPass SDK: End of logic containment structure block.
}
