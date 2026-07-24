import type { RequestOptions, AccessRequirement } from '../types/common';

export type AccessCheckParams = {
  walletAddress: string;
  guildId: string;
  resourceId: string;
};

export type RoleAccessCheckParams = {
  walletAddress: string;
  guildId: string;
  roleId: string;
};

export type AccessCheckResult = {
  hasAccess: boolean;
  walletAddress: string;
  guildId: string;
  resourceId: string;
  requiredRoles: string[];
  matchedRoles: string[];
  reason?: string;
};

export type AccessCheckBatchOptions = {
  concurrency?: number;
  failFast?: boolean;
  /**
   * Opt-in adaptive (AIMD) concurrency: the effective in-flight limit starts
   * at `concurrency`, halves on HTTP 429/5xx responses, and grows back
   * gradually on sustained success. Defaults to false (static concurrency).
   */
  adaptiveConcurrency?: boolean;
};

export type AccessCheckBatchResult = {
  input: AccessCheckParams;
  status: 'fulfilled' | 'rejected';
  value?: AccessCheckResult;
  error?: Error;
};

export type VerifiedAccessCheckOptions = RequestOptions & {
  /** The access requirement rule to verify directly against the chain. */
  requirement: AccessRequirement;
  /** Chain ID to route the RPC verification call to. Defaults to the client's default chain. */
  chainId?: number;
  /** If true, throws a GuildPassError when the API and chain return conflicting results. */
  throwOnDiscrepancy?: boolean;
};

export type VerifiedAccessCheckResult = {
  /** The standard off-chain API access decision (null if the request failed). */
  apiResult: AccessCheckResult | null;
  /** The on-chain access decision (null if the JSON-RPC request failed). */
  onChainResult: boolean | null;
  /** True strictly when both requests succeeded AND their boolean access results match. */
  consistent: boolean;
  /** A descriptive reason if the results were not consistent or requests failed. */
  discrepancyReason?: string;
};