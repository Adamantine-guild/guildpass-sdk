import type { RetryConfig } from '../http/http.types';

export type Address = string;

export type ResponseMeta = {
  status: number;
  durationMs: number;
  requestId?: string;
  correlationId?: string;
  traceparent?: string;
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
  timeoutMs?: number;
  retry?: RetryConfig;
  signal?: AbortSignal;
  includeMeta?: boolean;
  /**
   * Client-provided idempotency key.
   * If omitted and `retry.allowMutatingRetry` is true for a mutating request,
   * the SDK will auto-generate one to ensure safe retries.
   */
  idempotencyKey?: string;
  /**
   * Per-call override for in-flight request deduplication.
   * When `false`, this call always issues its own HTTP request even if an
   * identical request is already in flight. When `true`, deduplication is
   * used even if the client was constructed with `deduplication: false`.
   * Defaults to the client's `deduplication` config (which defaults to `true`).
   * Only applies to idempotent read operations; mutations are never deduplicated.
   */
  deduplicate?: boolean;
};

export type AccessRequirement = {
  type: 'TOKEN' | 'NFT' | 'ROLE' | 'WHITELIST';
  address?: Address;
  id?: string;
  minAmount?: string;
  standard?: 'ERC721' | 'ERC1155';
};