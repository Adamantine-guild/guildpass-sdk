import { GuildPassError } from '../errors/GuildPassError';
import { GuildPassErrorCode } from '../errors/errorCodes';
import type {
  AccessCheckRule,
  AccessRule,
  HasRoleRule,
  RuleEvaluationClient,
  RuleEvaluationContext,
  RuleEvaluationResult,
  TokenBalanceAtLeastRule,
} from './rule.types';

function resolveWalletAddress(
  rule: { walletAddress?: string },
  context: RuleEvaluationContext,
  fieldLabel: string,
): string {
  const walletAddress = rule.walletAddress ?? context.walletAddress;
  if (!walletAddress) {
    throw new GuildPassError(
      `${fieldLabel} requires walletAddress on the rule or in the evaluation context`,
      GuildPassErrorCode.INVALID_INPUT,
      undefined,
      { field: 'walletAddress', reason: 'required' },
    );
  }
  return walletAddress;
}

function resolveGuildId(
  rule: { guildId?: string },
  context: RuleEvaluationContext,
  fieldLabel: string,
): string {
  const guildId = rule.guildId ?? context.guildId;
  if (!guildId) {
    throw new GuildPassError(
      `${fieldLabel} requires guildId on the rule or in the evaluation context`,
      GuildPassErrorCode.INVALID_INPUT,
      undefined,
      { field: 'guildId', reason: 'required' },
    );
  }
  return guildId;
}

function parseMinAmount(minAmount: string): bigint {
  if (typeof minAmount !== 'string' || !/^\d+$/.test(minAmount.trim())) {
    throw new GuildPassError(
      'tokenBalanceAtLeast.minAmount must be a non-negative decimal integer string',
      GuildPassErrorCode.INVALID_INPUT,
      undefined,
      { field: 'minAmount', reason: 'invalid_format', value: minAmount },
    );
  }
  return BigInt(minAmount.trim());
}

async function evaluateAccessCheckRule(
  client: RuleEvaluationClient,
  rule: AccessCheckRule,
  context: RuleEvaluationContext,
): Promise<boolean> {
  const result = await client.access.checkAccess(
    {
      walletAddress: resolveWalletAddress(rule, context, 'accessCheck'),
      guildId: resolveGuildId(rule, context, 'accessCheck'),
      resourceId: rule.resourceId,
    },
    context.requestOptions,
  );
  return result.hasAccess;
}

async function evaluateTokenBalanceAtLeastRule(
  client: RuleEvaluationClient,
  rule: TokenBalanceAtLeastRule,
  context: RuleEvaluationContext,
): Promise<boolean> {
  const balance = await client.contracts.getMembershipTokenBalance(
    {
      walletAddress: resolveWalletAddress(rule, context, 'tokenBalanceAtLeast'),
      chainId: rule.chainId,
      contractAddress: rule.contractAddress,
    },
    context.requestOptions,
  );
  return BigInt(balance) >= parseMinAmount(rule.minAmount);
}

async function evaluateHasRoleRule(
  client: RuleEvaluationClient,
  rule: HasRoleRule,
  context: RuleEvaluationContext,
): Promise<boolean> {
  return client.roles.hasRole(
    {
      walletAddress: resolveWalletAddress(rule, context, 'hasRole'),
      guildId: resolveGuildId(rule, context, 'hasRole'),
      roleId: rule.roleId,
    },
    context.requestOptions,
  );
}

/**
 * Evaluates a composable {@link AccessRule} tree against a configured client.
 *
 * Each primitive delegates to the corresponding SDK service method, so caching,
 * retry, and error handling behave exactly as they do for direct service calls.
 *
 * `and` / `or` nodes short-circuit: once the outcome is determined, remaining
 * branches are not evaluated.
 */
export async function evaluateRule(
  client: RuleEvaluationClient,
  rule: AccessRule,
  context: RuleEvaluationContext,
): Promise<RuleEvaluationResult> {
  switch (rule.type) {
    case 'accessCheck':
      return { granted: await evaluateAccessCheckRule(client, rule, context) };

    case 'tokenBalanceAtLeast':
      return { granted: await evaluateTokenBalanceAtLeastRule(client, rule, context) };

    case 'hasRole':
      return { granted: await evaluateHasRoleRule(client, rule, context) };

    case 'and': {
      for (const child of rule.rules) {
        const result = await evaluateRule(client, child, context);
        if (!result.granted) {
          return { granted: false };
        }
      }
      return { granted: true };
    }

    case 'or': {
      for (const child of rule.rules) {
        const result = await evaluateRule(client, child, context);
        if (result.granted) {
          return { granted: true };
        }
      }
      return { granted: false };
    }

    default: {
      const unknownRule = rule as { type?: string };
      throw new GuildPassError(
        `Unknown access rule type: ${unknownRule.type ?? 'undefined'}`,
        GuildPassErrorCode.INVALID_INPUT,
        undefined,
        { field: 'type', reason: 'unknown', value: unknownRule.type },
      );
    }
  }
}
