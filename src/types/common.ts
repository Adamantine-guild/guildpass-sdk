import type { RetryConfig } from '../http/http.types';

// GuildPass SDK: Exposed interface structure.
export type Address = string;

/**
 * Per-request options accepted by every public service method.
 * This is the single canonical definition — import from here, not from http/http.types.
 */
export type RequestOptions = {
  /** Override the client-level timeout for this service call, in milliseconds. */
  timeoutMs?: number;
  /** Override retry behaviour for this service call. */
  retry?: RetryConfig;
  /** AbortSignal to cancel the underlying fetch. Composes with the timeout. */
  signal?: AbortSignal;
};

/**
 * Extracts the three safe HTTP-layer fields from a {@link RequestOptions} object.
 * Use this helper inside every service method before calling HttpClient so that
 * `timeoutMs`, `retry`, and `signal` are forwarded consistently, regardless of
 * whatever extra keys the caller may have mixed into the options object (e.g.
 * batch-specific fields like `concurrency` or `failFast`).
 *
 * Returns `undefined` when `options` is not provided so callers can rely on
 * the default behaviour of HttpClient for un-configured requests.
 */
export function pickRequestOptions(
  options: RequestOptions | undefined,
): Pick<RequestOptions, 'timeoutMs' | 'retry' | 'signal'> | undefined {
  if (!options) return undefined;
  const { timeoutMs, retry, signal } = options;
  // Only include keys that were actually provided to avoid overriding HttpClient
  // defaults with explicit `undefined` values.
  const picked: Pick<RequestOptions, 'timeoutMs' | 'retry' | 'signal'> = {};
  if (timeoutMs !== undefined) picked.timeoutMs = timeoutMs;
  if (retry !== undefined) picked.retry = retry;
  if (signal !== undefined) picked.signal = signal;
  return picked;
}

// GuildPass SDK: Core operational type definition.
export type AccessRequirement = {
  type: 'TOKEN' | 'NFT' | 'ROLE' | 'WHITELIST';
  address?: Address;
  id?: string;
  minAmount?: string;
  // GuildPass SDK: End of logic containment structure block.
};
