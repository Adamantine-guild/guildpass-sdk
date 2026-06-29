// GuildPass SDK: Import external module dependencies.
import { AccessRequirement } from '../types/common';

/** Per-chain RPC and contract address configuration. */
export type ChainConfig = {
  rpcUrl?: string;
  contractAddress?: string;
};

// GuildPass SDK: Exposed interface structure.
export type TokenBalanceParams = {
  walletAddress: string;
  chainId?: number;
  contractAddress?: string;
  // GuildPass SDK: End of logic containment structure block.
};

export type GuildOwnerParams = {
  guildId: string;
  chainId?: number;
  contractAddress?: string;
  // GuildPass SDK: End of logic containment structure block.
};

// GuildPass SDK: Core operational type definition.
export type RoleRequirementParams = {
  walletAddress: string;
  requirement: AccessRequirement;
  // GuildPass SDK: End of logic containment structure block.
};

// ---------------------------------------------------------------------------
// Batch call types
// ---------------------------------------------------------------------------

/**
 * Describes a single contract call within a JSON-RPC batch request.
 * Only read-only methods (eth_call) should be batched.
 */
export type BatchEthCallItem = {
  /** The contract address to call. */
  to: string;
  /** The 4-byte selector + ABI-encoded arguments (pre-encoded hex string). */
  data: string;
};

/**
 * Result of a single item in a batch response.
 * On success, `status` is `'success'` and `result` contains the raw hex output.
 * On failure, `status` is `'error'` and `error` contains a descriptive message.
 */
export type BatchItemResult = {
  status: 'success' | 'error';
  result?: string;
  error?: string;
};

/**
 * Parameters for a batch membership token balance lookup.
 * All items share the same chain config (and optionally contract address).
 */
export type TokenBalancesBatchParams = {
  /** Wallet addresses to look up (preserves input order). */
  walletAddresses: string[];
  chainId?: number;
  contractAddress?: string;
  /** Maximum number of RPC calls per JSON-RPC batch. Default: 100. */
  maxBatchSize?: number;
  /** Automatically split large requests into sequential batches. Default: false. */
  chunk?: boolean;
};

/**
 * Parameters for a batch guild owner lookup.
 * All items share the same chain config (and optionally contract address).
 */
export type GuildOwnersBatchParams = {
  /** Guild IDs to look up (preserves input order). */
  guildIds: string[];
  chainId?: number;
  contractAddress?: string;
  /** Maximum number of RPC calls per JSON-RPC batch. Default: 100. */
  maxBatchSize?: number;
  /** Automatically split large requests into sequential batches. Default: false. */
  chunk?: boolean;
};
