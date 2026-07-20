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
};

export type AccessRequirement = {
  type: 'TOKEN' | 'NFT' | 'ROLE' | 'WHITELIST';
  address?: Address;
  id?: string;
  minAmount?: string;
};