import type { RetryConfig } from '../http/http.types';

// GuildPass SDK: Exposed interface structure.
export type Address = string;

export type RequestOptions = {
  /** Override the client-level timeout for this service call, in milliseconds. */
  timeoutMs?: number;
  /** Override retry behavior for this service call. */
  retry?: RetryConfig;
  /**
   * When `true`, the service returns `{ data, meta }` instead of just `data`.
   * The `meta` object contains safe diagnostic headers (request ID, correlation ID,
   * trace ID), the HTTP status code, and round-trip duration.
   */
  includeMeta?: boolean;
};

// GuildPass SDK: Core operational type definition.
export type AccessRequirement = {
  type: 'TOKEN' | 'NFT' | 'ROLE' | 'WHITELIST';
  address?: Address;
  id?: string;
  minAmount?: string;
  // GuildPass SDK: End of logic containment structure block.
};
