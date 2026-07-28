// GuildPass SDK: Import external module dependencies.
import { AccessRequirement } from '../types/common';
// Type-only: keeps this module fully erasable at build time.
import type { GuildPassErrorCode } from '../errors/errorCodes';

/** Per-chain RPC and contract address configuration. */
export type ChainConfig = {
  /**
   * Primary RPC endpoint URL. When `rpcUrls` is also supplied, this acts as
   * an alias for the first entry (the two are merged in priority order so
   * callers can use either or both).
   */
  rpcUrl?: string;
  /**
   * Ordered list of RPC endpoint URLs to try in sequence. The first URL is
   * attempted first; on a transient error the next URL is tried, and so on
   * until one succeeds or all are exhausted.
   *
   * `rpcUrl` (singular) is still accepted for single-provider configurations
   * and is automatically prepended to this list when both are provided.
   */
  rpcUrls?: string[];
  contractAddress?: string;
  multicallAddress?: string;
};

// GuildPass SDK: Exposed interface structure.
export type TokenBalanceParams = {
  walletAddress: string;
  chainId?: number;
  contractAddress?: string;
  // GuildPass SDK: End of logic containment structure block.
};

/**
 * A token balance with the metadata needed to display it: the raw on-chain
 * integer (`raw`, base units as a decimal string), the token's `decimals`, and
 * the human-readable `formatted` amount.
 */
export type FormattedTokenBalance = {
  /** Raw balance in base units, as an exact decimal integer string. */
  raw: string;
  /** Number of decimals the token uses (from its `decimals()` view). */
  decimals: number;
  /** Human-readable balance, e.g. "1.5" for raw "1500000" with 6 decimals. */
  formatted: string;
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
  /** Chain to resolve the RPC endpoint for (TOKEN/NFT/ROLE checks only). */
  chainId?: number;
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
 * On failure, `status` is `'error'`, `error` contains a descriptive message and
 * `code` classifies the failure.
 */
export type BatchItemResult = {
  /** `'success'` when the call returned usable data, `'error'` when this item failed. */
  status: 'success' | 'error';
  /** The call's return value. Present when `status` is `'success'`. */
  result?: string;
  /**
   * Human-readable description of why this item failed. Present when `status`
   * is `'error'`. The exact wording is not a stable API — branch on
   * {@link BatchItemResult.code} rather than matching this string.
   */
  error?: string;
  /**
   * Machine-readable classification of the failure. Populated on every
   * `'error'` entry produced by the SDK, and never set on a `'success'` entry.
   *
   * - `HTTP_ERROR` — the call reached the contract and was rejected: a revert,
   *   or a JSON-RPC error envelope from the node. Deterministic; retrying the
   *   same call against another endpoint will not change the outcome.
   * - `INVALID_RESPONSE` — the node's response for this item was unusable:
   *   missing, empty, wrong-typed, over the response size cap, or undecodable.
   *   Another endpoint may well succeed.
   * - `CONSENSUS_MISMATCH` — `contractReadConsensus` is configured and the
   *   providers did not reach quorum for this item.
   * - Any other {@link GuildPassErrorCode} propagated from a custom
   *   `contractProvider`, falling back to `UNKNOWN_ERROR`.
   *
   * Note that pre-flight validation failures (an invalid address, an empty
   * input array, a batch exceeding `maxBatchSize`) are **thrown** rather than
   * reported here; this field classifies failures that occur during execution.
   *
   * Optional for backward compatibility: entries produced by a third-party
   * {@link ContractProvider} implementation may omit it.
   */
  code?: GuildPassErrorCode;
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
  /**
   * Maximum number of chunks to execute concurrently when `chunk` is `true`.
   * Omit or set to `1` for the default sequential behaviour. Values > 1
   * enable bounded parallel chunk execution (e.g. `4` runs up to 4 chunks at
   * once), reducing total wall-clock time for very large inputs. Capped at
   * 20 to avoid overwhelming the RPC provider.
   */
  chunkConcurrency?: number;
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
  /**
   * Maximum number of chunks to execute concurrently when `chunk` is `true`.
   * Omit or set to `1` for the default sequential behaviour. Values > 1
   * enable bounded parallel chunk execution (e.g. `4` runs up to 4 chunks at
   * once), reducing total wall-clock time for very large inputs. Capped at
   * 20 to avoid overwhelming the RPC provider.
   */
  chunkConcurrency?: number;
};

// ---------------------------------------------------------------------------
// Multi-chain balance aggregation types
// ---------------------------------------------------------------------------

/**
 * Parameters for {@link ContractClient.getMembershipTokenBalances}.
 * Queries every chain configured in {@link GuildPassClientConfig.chains} (plus
 * the default chain when {@link GuildPassClientConfig.chainId} is set) and
 * returns a per-chain balance map in a single call.
 */
export type MembershipTokenBalancesParams = {
  /** Wallet address to look up the balance for on every configured chain. */
  walletAddress: string;
  /**
   * Optional contract address override applied to every chain query.
   * When omitted, the contract address from each chain's own config is used.
   */
  contractAddress?: string;
};

/**
 * The result of a single chain's balance lookup within
 * {@link ContractClient.getMembershipTokenBalances}.
 *
 * On success, `balance` holds the raw on-chain integer as a decimal string.
 * On failure, `error` holds a human-readable description of what went wrong;
 * other chains in the same call are unaffected.
 */
export type ChainBalanceResult =
  | { status: 'success'; balance: string }
  | { status: 'error'; error: string };

/**
 * Return type of {@link ContractClient.getMembershipTokenBalances}.
 * A map from chain ID (number) to that chain's balance result.
 */
export type MembershipTokenBalancesResult = Record<number, ChainBalanceResult>;

// ---------------------------------------------------------------------------
// Convenience method types (ERC-20 / ERC-721 / ERC-1155)
// ---------------------------------------------------------------------------

/**
 * Parameters for an ERC-20 `balanceOf(address)` call.
 * All parameters are required except `chainId` (which defaults to the
 * client-level default chain).
 */
export type ERC20BalanceParams = {
  /** Wallet to check the balance of. */
  walletAddress: string;
  /** Chain override (defaults to the client-level default chain). */
  chainId?: number;
  /** The ERC-20 token contract address. */
  contractAddress: string;
};

/**
 * Parameters for an ERC-721 `ownerOf(uint256)` ownership check.
 */
export type ERC721TokenParams = {
  /** Wallet address expected to own the token. */
  walletAddress: string;
  /** The token ID to check ownership of (as a decimal or hex string). */
  tokenId: string;
  /** Chain override (defaults to the client-level default chain). */
  chainId?: number;
  /** The ERC-721 token contract address. */
  contractAddress: string;
};

/**
 * Parameters for an ERC-1155 `balanceOf(address,uint256)` balance check.
 */
export type ERC1155BalanceParams = {
  /** Wallet to check the balance of. */
  walletAddress: string;
  /** The token ID to check the balance of (as a decimal or hex string). */
  tokenId: string;
  /** Chain override (defaults to the client-level default chain). */
  chainId?: number;
  /** The ERC-1155 token contract address. */
  contractAddress: string;
};

// ---------------------------------------------------------------------------
// Generic readContract escape hatch types
// ---------------------------------------------------------------------------

/** A single input or output entry in an ABI function definition. */
export type AbiParameter = {
  type: string;
  name?: string;
  internalType?: string;
};

/** Minimal ABI fragment describing a read-only function. */
export type AbiFunction = {
  type: 'function';
  name: string;
  inputs: AbiParameter[];
  outputs: AbiParameter[];
  stateMutability?: string;
};

/**
 * Parameters for the generic `readContract` escape hatch. Accepts a
 * caller-supplied ABI fragment so any read-only function can be called
 * without adding a dedicated method to the SDK.
 */
export type ReadContractParams = {
  /** The contract address to call. */
  contractAddress: string;
  /** ABI fragment describing the function being called. */
  abi: AbiFunction;
  /** The function name (must match `abi.name`). */
  functionName: string;
  /** Arguments for the function call, in the same order as `abi.inputs`. */
  args: unknown[];
  /** Chain override (defaults to the client-level default chain). */
  chainId?: number;
};

// ---------------------------------------------------------------------------
// Cross-provider consensus verification (issue #307)
// ---------------------------------------------------------------------------

/**
 * Opt-in configuration for cross-provider consensus verification of read-only
 * contract calls (issue #307).
 *
 * Unlike `rpcUrl` / `rpcUrls` (which provide *availability* via failover on
 * transient RPC errors), consensus mode provides *correctness*: every
 * supported read is issued independently to every URL listed in `providers`,
 * and the SDK only returns a value when at least `minProviders` of them
 * return the same raw hex result. A responding-but-lying RPC endpoint (one
 * that returns a fabricated but well-formed value) is therefore detected and
 * surfaced as a distinct `CONSENSUS_MISMATCH` rather than silently corrupting
 * a token-gating decision.
 *
 * Behavior summary:
 * - `minProviders >= 2` is required when this config is set, because a quorum
 *   of one provider has no majority-over-lying-RPC value.
 * - `minProviders` cannot exceed `providers.length`.
 * - Calls are forwarded in parallel (`Promise.allSettled`); the single
 *   agreeing value of the largest group whose size meets the quorum wins.
 * - Disagreement, network failures, or `confirmations`-based historical reads
 *   throw `GuildPassError` with `code === CONSENSUS_MISMATCH` and a
 *   structured `details` payload identifying every disagreeing provider, the
 *   raw values returned, and any provider-side failures.
 * - When unset, the SDK falls back to its existing single-RPC-failover
 *   behavior — zero behavior change.
 * - When `contractProvider` is configured (custom viem/ethers adapter), it
 *   takes precedence over consensus mode, mirroring the existing precedence
 *   rule.
 */
export type ContractReadConsensus = {
  /**
   * Independent RPC endpoint URLs to query in parallel. Each URL must be a
   * fully-qualified http(s) URL. Order is preserved only for deterministic
   * error-message labelling; consensus is not priority-based.
   */
  providers: string[];
  /**
   * Minimum number of providers that must agree on the same raw hex result
   * for the call to succeed. Must be an integer in `[2, providers.length]`.
   */
  minProviders: number;
};

/**
 * Per-value group in a `CONSENSUS_MISMATCH` error: every provider that
 * returned a given raw hex result, plus the count of providers in the group.
 *
 * The group with the largest `count` is the "front-runner" — when its size
 * meets `quorum`, the SDK would have succeeded; when it does not, every
 * provider's response (group counts and individual failures) is reported
 * here for caller inspection.
 */
export type ConsensusMismatchGroup = {
  /** The raw hex result these providers returned (e.g. for `balanceOf`). */
  value: string;
  /** URLs of every provider that returned `value`. */
  urls: string[];
  /** `urls.length` — kept explicitly for clarity. */
  count: number;
};

/**
 * A single provider-side failure surfaced inside a `CONSENSUS_MISMATCH` error:
 * the RPC URL we attempted, the SDK / JSON-RPC error code, and the message
 * (typically a network error, execution revert, or parse failure).
 */
export type ConsensusMismatchFailure = {
  url: string;
  code: string;
  message: string;
};

/**
 * Structured details attached to a `CONSENSUS_MISMATCH` error. The thrown
 * `GuildPassError.code === CONSENSUS_MISMATCH` and `GuildPassError.details`
 * carries one of these objects, so callers can identify the disagreeing
 * provider(s) and the values each one returned.
 */
export type ConsensusMismatchDetails = {
  /** Total number of providers attempted (length of `consensus.providers`). */
  totalProviders: number;
  /** Providers that returned a usable (success) result. */
  successfulCount: number;
  /** Providers whose call threw or otherwise failed. */
  failedCount: number;
  /** The `minProviders` quorum the SDK was configured to require. */
  quorum: number;
  /**
   * One entry per distinct raw hex value returned. `count` of the largest
   * group is what the SDK compared against `quorum`.
   */
  groups: ConsensusMismatchGroup[];
  /** Per-provider failures (network errors, reverts, parse errors). */
  failures: ConsensusMismatchFailure[];
};
