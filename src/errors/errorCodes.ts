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
  /**
   * A WebSocket transport failure: the socket could not be opened, was closed
   * mid-request, exhausted its reconnect budget, or the provider was destroyed
   * with requests still in flight.
   *
   * Only surfaced by `WebSocketContractProvider`.
   */
  WS_CONNECTION_ERROR = 'WS_CONNECTION_ERROR',
  // SIWE (Sign-In With Ethereum) error codes
  SIWE_INVALID_SIGNATURE = 'SIWE_INVALID_SIGNATURE',
  SIWE_EXPIRED = 'SIWE_EXPIRED',
  SIWE_DOMAIN_MISMATCH = 'SIWE_DOMAIN_MISMATCH',
  SIWE_INVALID_MESSAGE = 'SIWE_INVALID_MESSAGE',
  SIWE_REPLAY_DETECTED = 'SIWE_REPLAY_DETECTED',
  // EIP-712 typed-data error codes
  EIP712_INVALID_SIGNATURE = 'EIP712_INVALID_SIGNATURE',
  EIP712_INVALID_TYPED_DATA = 'EIP712_INVALID_TYPED_DATA',
  EIP712_SIGNER_MISMATCH = 'EIP712_SIGNER_MISMATCH',
  EIP712_EXPIRED = 'EIP712_EXPIRED',
  EIP712_REPLAY_DETECTED = 'EIP712_REPLAY_DETECTED',
  // Security error codes
  UNVERIFIABLE_RESPONSE = 'UNVERIFIABLE_RESPONSE',
  /**
   * Cross-provider consensus verification failed: configured RPC providers
   * did not return at least `minProviders` agreeing values for a single
   * read. The thrown error's `details` field surfaces the per-provider
   * results (raw values grouped by equality, plus per-provider failure
   * messages) so callers can identify the disagreeing endpoint(s).
   *
   * Only surfaced when the opt-in `contractReadConsensus` config is set. The
   * batch read paths do not throw it: an item that fails to reach quorum
   * becomes an error entry carrying this code in its `BatchItemResult.code`,
   * leaving its siblings unaffected.
   */
  CONSENSUS_MISMATCH = 'CONSENSUS_MISMATCH',
  // GuildPass SDK: End of logic containment structure block.
}
