import type { RetryConfig } from '../http/http.types';

// GuildPass SDK: Exposed interface structure.
export type Address = string;

/**
 * Safe response metadata captured when `includeMeta: true` is set on a request.
 *
 * Contains diagnostic identifiers extracted from response headers (request ID,
 * correlation ID, trace context) plus timing and status information. No
 * sensitive headers such as Authorization, API keys, or cookies are included.
 */
export type ResponseMeta = {
  /** The HTTP status code of the response. */
  status: number;
  /** Total request duration in milliseconds. */
  durationMs: number;
  /**
   * Request ID extracted from the `X-Request-ID` or `X-Request-Id` response
   * header. Useful for correlating SDK calls with server-side logs.
   */
  requestId?: string;
  /**
   * Correlation ID extracted from the `X-Correlation-ID` response header.
   * Useful for tracing a request across multiple services.
   */
  correlationId?: string;
  /**
   * W3C trace context extracted from the `Traceparent` response header.
   * Can be forwarded to distributed tracing systems.
   */
  traceparent?: string;
  /**
   * Trace ID extracted from the `X-Trace-ID` response header.
   * Alternative trace identifier used by some backends.
   */
  traceId?: string;
};

/**
 * A block tag for historical or confirmed read state:
 * - A `number` specifies confirmations (N blocks behind `latest`).
 * - `'safe'` / `'finalized'` are post-Merge named tags supported by
 *   Ethereum and compatible chains (support varies by client).
 *
 * **Caveat:** historical `eth_call` requires an **archive node** on most
 * public RPC providers. Without archive data the call will revert.
 */
export type BlockTag = number | 'safe' | 'finalized';

export type RequestOptions = {
  /** Override the client-level timeout for this service call, in milliseconds. */
  timeoutMs?: number;
  /** Override retry behavior for this service call. */
  retry?: RetryConfig;
  /** External AbortSignal. Aborts the underlying fetch when fired; composes with the timeout. */
  signal?: AbortSignal;

  includeMeta?: boolean;

  /**
   * Block confirmations for read safety. When set, `eth_call` is executed
   * against a historical block rather than `'latest'`, eliminating
   * chain-reorg risk.
   *
   * - Omit or `undefined` → `'latest'` (fully backwards compatible).
   * - Numeric (e.g. `6`) → issues a preliminary `eth_blockNumber` and
   *   computes `blockNumber - confirmations` as the target block tag.
   * - `'safe'` / `'finalized'` → passed directly to the RPC (post-Merge).
   *
   * Supported natively by `JsonRpcContractProvider`. Custom adapters
   * (viem, ethers) should configure block tags on their own client.
   */
  confirmations?: BlockTag;
};

// GuildPass SDK: Core operational type definition.
export type AccessRequirement = {
  type: 'TOKEN' | 'NFT' | 'ROLE' | 'WHITELIST';
  address?: Address;
  id?: string;
  minAmount?: string;
  // GuildPass SDK: End of logic containment structure block.
};
