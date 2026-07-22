import type { RequestOptions } from '../types/common';

/**
 * Shared evaluation context for {@link evaluateRule}.
 *
 * Primitive rules inherit `walletAddress` and, where applicable, `guildId`
 * from this context when they do not specify their own values.
 */
export type RuleEvaluationContext = {
  walletAddress: string;
  guildId?: string;
  requestOptions?: RequestOptions;
};

/** Off-chain resource access via {@link GuildPassClient.access.checkAccess}. */
export type AccessCheckRule = {
  type: 'accessCheck';
  resourceId: string;
  guildId?: string;
  walletAddress?: string;
};

/** On-chain membership token balance threshold via {@link ContractClient.getMembershipTokenBalance}. */
export type TokenBalanceAtLeastRule = {
  type: 'tokenBalanceAtLeast';
  /** Minimum raw token balance (base units) as a decimal integer string. */
  minAmount: string;
  walletAddress?: string;
  chainId?: number;
  contractAddress?: string;
};

/** Role assignment check via {@link RolesService.hasRole}. */
export type HasRoleRule = {
  type: 'hasRole';
  roleId: string;
  guildId?: string;
  walletAddress?: string;
};

/** All sub-rules must pass. Evaluates left-to-right and short-circuits on the first denial. */
export type AndRule = {
  type: 'and';
  rules: AccessRule[];
};

/** Any sub-rule may grant access. Evaluates left-to-right and short-circuits on the first grant. */
export type OrRule = {
  type: 'or';
  rules: AccessRule[];
};

/**
 * A composable client-side access rule tree.
 *
 * Compose hybrid off-chain/on-chain gates without hand-rolling short-circuit
 * logic on top of raw SDK calls.
 */
export type AccessRule =
  | AccessCheckRule
  | TokenBalanceAtLeastRule
  | HasRoleRule
  | AndRule
  | OrRule;

/** Result of evaluating an {@link AccessRule} tree. */
export type RuleEvaluationResult = {
  granted: boolean;
};

/**
 * Minimal client surface required by {@link evaluateRule}.
 * Matches {@link GuildPassClient} so evaluation reuses caching and transport behavior.
 */
export type RuleEvaluationClient = {
  access: {
    checkAccess: (
      params: { walletAddress: string; guildId: string; resourceId: string },
      options?: RequestOptions,
    ) => Promise<{ hasAccess: boolean }>;
  };
  contracts: {
    getMembershipTokenBalance: (
      params: { walletAddress: string; chainId?: number; contractAddress?: string },
      options?: RequestOptions,
    ) => Promise<string>;
  };
  roles: {
    hasRole: (
      params: { walletAddress: string; guildId: string; roleId: string },
      options?: RequestOptions,
    ) => Promise<boolean>;
  };
};
