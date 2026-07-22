import { describe, it, expect, vi, beforeEach } from 'vitest';
import { evaluateRule } from '../src/rules/evaluateRule';
import type { AccessRule, RuleEvaluationClient, RuleEvaluationContext } from '../src/rules/rule.types';
import { GuildPassError } from '../src/errors/GuildPassError';
import { GuildPassErrorCode } from '../src/errors/errorCodes';

const WALLET = '0x1234567890123456789012345678901234567890';
const GUILD_ID = 'prime-guild';

const baseContext: RuleEvaluationContext = {
  walletAddress: WALLET,
  guildId: GUILD_ID,
};

function createMockClient(overrides?: Partial<RuleEvaluationClient>): RuleEvaluationClient {
  return {
    access: {
      checkAccess: vi.fn().mockResolvedValue({
        hasAccess: true,
        walletAddress: WALLET,
        guildId: GUILD_ID,
        resourceId: 'premium',
        requiredRoles: [],
        matchedRoles: [],
      }),
    },
    contracts: {
      getMembershipTokenBalance: vi.fn().mockResolvedValue('100'),
    },
    roles: {
      hasRole: vi.fn().mockResolvedValue(true),
    },
    ...overrides,
  };
}

describe('evaluateRule primitives', () => {
  it('accessCheck delegates to client.access.checkAccess and returns hasAccess', async () => {
    const checkAccess = vi.fn().mockResolvedValue({
      hasAccess: false,
      walletAddress: WALLET,
      guildId: GUILD_ID,
      resourceId: 'premium',
      requiredRoles: [],
      matchedRoles: [],
      reason: 'denied',
    });
    const client = createMockClient({ access: { checkAccess } });

    const result = await evaluateRule(
      client,
      { type: 'accessCheck', resourceId: 'premium' },
      baseContext,
    );

    expect(result.granted).toBe(false);
    expect(checkAccess).toHaveBeenCalledWith(
      { walletAddress: WALLET, guildId: GUILD_ID, resourceId: 'premium' },
      undefined,
    );
  });

  it('tokenBalanceAtLeast delegates to client.contracts.getMembershipTokenBalance', async () => {
    const getMembershipTokenBalance = vi.fn().mockResolvedValue('42');
    const client = createMockClient({ contracts: { getMembershipTokenBalance } });

    const granted = await evaluateRule(
      client,
      { type: 'tokenBalanceAtLeast', minAmount: '40' },
      baseContext,
    );
    expect(granted.granted).toBe(true);

    const denied = await evaluateRule(
      client,
      { type: 'tokenBalanceAtLeast', minAmount: '43' },
      baseContext,
    );
    expect(denied.granted).toBe(false);

    expect(getMembershipTokenBalance).toHaveBeenCalledWith(
      { walletAddress: WALLET, chainId: undefined, contractAddress: undefined },
      undefined,
    );
  });

  it('hasRole delegates to client.roles.hasRole', async () => {
    const hasRole = vi.fn().mockResolvedValue(true);
    const client = createMockClient({ roles: { hasRole } });

    const result = await evaluateRule(
      client,
      { type: 'hasRole', roleId: 'moderator' },
      baseContext,
    );

    expect(result.granted).toBe(true);
    expect(hasRole).toHaveBeenCalledWith(
      { walletAddress: WALLET, guildId: GUILD_ID, roleId: 'moderator' },
      undefined,
    );
  });

  it('forwards requestOptions from context to primitive service calls', async () => {
    const checkAccess = vi.fn().mockResolvedValue({
      hasAccess: true,
      walletAddress: WALLET,
      guildId: GUILD_ID,
      resourceId: 'premium',
      requiredRoles: [],
      matchedRoles: [],
    });
    const client = createMockClient({ access: { checkAccess } });
    const requestOptions = { timeoutMs: 500 };

    await evaluateRule(
      client,
      { type: 'accessCheck', resourceId: 'premium' },
      { ...baseContext, requestOptions },
    );

    expect(checkAccess).toHaveBeenCalledWith(expect.any(Object), requestOptions);
  });
});

describe('evaluateRule AND/OR short-circuiting', () => {
  it('AND short-circuits when an earlier branch denies access', async () => {
    const checkAccess = vi.fn().mockResolvedValue({
      hasAccess: false,
      walletAddress: WALLET,
      guildId: GUILD_ID,
      resourceId: 'premium',
      requiredRoles: [],
      matchedRoles: [],
    });
    const hasRole = vi.fn().mockResolvedValue(true);
    const client = createMockClient({
      access: { checkAccess },
      roles: { hasRole },
    });

    const rule: AccessRule = {
      type: 'and',
      rules: [
        { type: 'accessCheck', resourceId: 'premium' },
        { type: 'hasRole', roleId: 'moderator' },
      ],
    };

    const result = await evaluateRule(client, rule, baseContext);

    expect(result.granted).toBe(false);
    expect(checkAccess).toHaveBeenCalledTimes(1);
    expect(hasRole).not.toHaveBeenCalled();
  });

  it('OR short-circuits when an earlier branch grants access', async () => {
    const checkAccess = vi.fn().mockResolvedValue({
      hasAccess: true,
      walletAddress: WALLET,
      guildId: GUILD_ID,
      resourceId: 'premium',
      requiredRoles: [],
      matchedRoles: [],
    });
    const getMembershipTokenBalance = vi.fn().mockResolvedValue('0');
    const client = createMockClient({
      access: { checkAccess },
      contracts: { getMembershipTokenBalance },
    });

    const rule: AccessRule = {
      type: 'or',
      rules: [
        { type: 'accessCheck', resourceId: 'premium' },
        { type: 'tokenBalanceAtLeast', minAmount: '1' },
      ],
    };

    const result = await evaluateRule(client, rule, baseContext);

    expect(result.granted).toBe(true);
    expect(checkAccess).toHaveBeenCalledTimes(1);
    expect(getMembershipTokenBalance).not.toHaveBeenCalled();
  });

  it('evaluates nested AND/OR compositions with short-circuiting', async () => {
    const checkAccess = vi.fn().mockResolvedValue({
      hasAccess: false,
      walletAddress: WALLET,
      guildId: GUILD_ID,
      resourceId: 'premium',
      requiredRoles: [],
      matchedRoles: [],
    });
    const getMembershipTokenBalance = vi.fn().mockResolvedValue('999');
    const hasRole = vi.fn().mockResolvedValue(true);
    const client = createMockClient({
      access: { checkAccess },
      contracts: { getMembershipTokenBalance },
      roles: { hasRole },
    });

    const rule: AccessRule = {
      type: 'or',
      rules: [
        {
          type: 'and',
          rules: [
            { type: 'accessCheck', resourceId: 'premium' },
            { type: 'hasRole', roleId: 'moderator' },
          ],
        },
        { type: 'tokenBalanceAtLeast', minAmount: '500' },
      ],
    };

    const result = await evaluateRule(client, rule, baseContext);

    expect(result.granted).toBe(true);
    expect(checkAccess).toHaveBeenCalledTimes(1);
    expect(hasRole).not.toHaveBeenCalled();
    expect(getMembershipTokenBalance).toHaveBeenCalledTimes(1);
  });

  it('AND returns granted when every branch passes', async () => {
    const checkAccess = vi.fn().mockResolvedValue({
      hasAccess: true,
      walletAddress: WALLET,
      guildId: GUILD_ID,
      resourceId: 'premium',
      requiredRoles: [],
      matchedRoles: [],
    });
    const hasRole = vi.fn().mockResolvedValue(true);
    const client = createMockClient({
      access: { checkAccess },
      roles: { hasRole },
    });

    const result = await evaluateRule(
      client,
      {
        type: 'and',
        rules: [
          { type: 'accessCheck', resourceId: 'premium' },
          { type: 'hasRole', roleId: 'moderator' },
        ],
      },
      baseContext,
    );

    expect(result.granted).toBe(true);
    expect(checkAccess).toHaveBeenCalledTimes(1);
    expect(hasRole).toHaveBeenCalledTimes(1);
  });

  it('OR returns denied when every branch fails', async () => {
    const checkAccess = vi.fn().mockResolvedValue({
      hasAccess: false,
      walletAddress: WALLET,
      guildId: GUILD_ID,
      resourceId: 'premium',
      requiredRoles: [],
      matchedRoles: [],
    });
    const getMembershipTokenBalance = vi.fn().mockResolvedValue('0');
    const client = createMockClient({
      access: { checkAccess },
      contracts: { getMembershipTokenBalance },
    });

    const result = await evaluateRule(
      client,
      {
        type: 'or',
        rules: [
          { type: 'accessCheck', resourceId: 'premium' },
          { type: 'tokenBalanceAtLeast', minAmount: '1' },
        ],
      },
      baseContext,
    );

    expect(result.granted).toBe(false);
    expect(checkAccess).toHaveBeenCalledTimes(1);
    expect(getMembershipTokenBalance).toHaveBeenCalledTimes(1);
  });
});

describe('evaluateRule validation', () => {
  it('requires guildId for accessCheck when not provided on the rule or context', async () => {
    const client = createMockClient();

    await expect(
      evaluateRule(
        client,
        { type: 'accessCheck', resourceId: 'premium' },
        { walletAddress: WALLET },
      ),
    ).rejects.toMatchObject({
      code: GuildPassErrorCode.INVALID_INPUT,
    });
  });

  it('rejects invalid tokenBalanceAtLeast minAmount values', async () => {
    const client = createMockClient();

    await expect(
      evaluateRule(
        client,
        { type: 'tokenBalanceAtLeast', minAmount: '-1' },
        baseContext,
      ),
    ).rejects.toBeInstanceOf(GuildPassError);
  });
});
