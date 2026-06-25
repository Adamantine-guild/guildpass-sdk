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

// GuildPass SDK: Core operational type definition.
export type AccessRequirement = {
  type: 'TOKEN' | 'NFT' | 'ROLE' | 'WHITELIST';
  address?: Address;
  id?: string;
  minAmount?: string;
  // GuildPass SDK: End of logic containment structure block.
};
