import { GuildPassError } from '../errors/GuildPassError';
import type { AccessCheckParams, AccessCheckResult } from '../access/access.types';
import type { AccessRequirement } from '../types/common';
import { GuildPassErrorCode } from '../errors/errorCodes';
import type { ResponseMeta } from '../types/common';
import type { Middleware } from '../middleware/middleware.types';

export type HttpMethod = 'GET' | 'POST' | 'PUT' | 'DELETE' | 'PATCH';

export type RateLimitConfig = {
  requestsPerSecond: number;
  burst?: number;
};

export type RetryConfig = {
  maxRetries?: number;
  baseDelayMs?: number;
  maxDelayMs?: number;
  retryableStatuses?: number[];
  allowMutatingRetry?: boolean;
  /**
   * Randomize each backoff delay by ±25% to avoid thundering-herd retries.
   * Defaults to `true`; set to `false` for deterministic delays (e.g. tests).
   */
  jitter?: boolean;
};

export type DiscrepancyHookPayload = {
  params: AccessCheckParams;
  requirement: AccessRequirement;
  apiResult: AccessCheckResult | null;
  onChainResult: boolean | null;
  reason: string;
};

export type FetchLike = (
  input: string | URL | Request,
  init?: RequestInit,
) => Promise<Response>;

export type ClientMetadata = {
  sdkVersion?: string;
  clientName?: string;
  clientVersion?: string;
  sendClientMetadata?: boolean;
};

export type HttpClientConfig = {
  retry?: RetryConfig;
  hooks?: HttpHooks;
  middleware?: Middleware[];
  fetch?: FetchLike;
  transport?: import('../network/transport.types').HttpTransport;
  metadata?: ClientMetadata;
  rateLimit?: RateLimitConfig;
};

export type HttpRequestOptions<TBody = unknown> = {
  method?: HttpMethod;
  headers?: Record<string, string>;
  body?: TBody;
  params?: Record<string, string | number | boolean>;
  timeoutMs?: number;
  retry?: RetryConfig;
  signal?: AbortSignal;
  includeMeta?: boolean;
  /**
   * Client-provided idempotency key.
   * If omitted and `retry.allowMutatingRetry` is true for a mutating request,
   * the SDK will auto-generate one.
   */
  idempotencyKey?: string;
};

export type HttpResponse<T = any> = {
  data: T;
  status: number;
  headers: Headers;
  meta?: ResponseMeta;
};

export type ResponseMetadata = {
  requestId?: string;
  correlationId?: string;
  traceId?: string;
  status: number;
  durationMs: number;
};

export type RequestHookPayload = {
  method: HttpMethod;
  path: string;
  headers: Record<string, string>;
};

export type ResponseHookPayload = RequestHookPayload & {
  status: number;
  durationMs: number;
  responseHeaders: Record<string, string>;
};

export type ErrorHookPayload = RequestHookPayload & {
  error: Error;
  durationMs: number;
};

export type CacheErrorHookPayload = {
  operation: 'get' | 'set' | 'delete' | 'clear';
  key?: string;
  error: Error;
};

export type RpcFailoverHookPayload = {
  chainId?: number;
  failedUrl: string;
  nextUrl: string;
  error: unknown;
};

export interface HttpHooks {
  onRequest?: (payload: RequestHookPayload) => void | Promise<void>;
  onResponse?: (payload: ResponseHookPayload) => void | Promise<void>;
  onError?: (payload: ErrorHookPayload) => void | Promise<void>;
  onCacheError?: (payload: CacheErrorHookPayload) => void | Promise<void>;
  onRpcFailover?: (payload: RpcFailoverHookPayload) => void | Promise<void>;
  /** Fires when checkAccessVerified detects a mismatch between API and on-chain results. */
  onDiscrepancy?: (payload: DiscrepancyHookPayload) => void | Promise<void>;
}

