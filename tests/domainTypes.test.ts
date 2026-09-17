import { describe, it, expect } from "vitest";
import type {
  Guild,
  Member,
  Pass,
  AccessPolicy,
  AccessDecision,
  ActivityEvent,
  StellarAccount,
  Network,
  MemberRole,
  PassStatus,
  ActivityEventType,
} from "../src/index.js";

describe("GuildPass SDK V2 Public Domain Types", () => {
  it("conforms Guild entity structure", () => {
    const guild: Guild = {
      id: "guild-001",
      name: "Stellar Builders Guild",
      description: "Community of Stellar Soroban developers",
      ownerAccount: "GAAZI4TCR3TY5OJHCTJC2A4QSY6CJWJH5IAJTGKIN2ER7LBNVKOCCWN7",
      contractId: "CAAZI4TCR3TY5OJHCTJC2A4QSY6CJWJH5IAJTGKIN2ER7LBNVKOCCWN7",
      network: "testnet",
      metadata: { website: "https://guildpass.io" },
      createdAt: "2026-09-01T00:00:00.000Z",
    };

    expect(guild.id).toBe("guild-001");
    expect(guild.network).toBe("testnet");
    expect(guild.ownerAccount).toMatch(/^G[A-Z2-7]{55}$/);
  });

  it("conforms Member and Role structure", () => {
    const roles: MemberRole[] = ["admin", "moderator"];
    const member: Member = {
      id: "mem-100",
      guildId: "guild-001",
      account: "GAAZI4TCR3TY5OJHCTJC2A4QSY6CJWJH5IAJTGKIN2ER7LBNVKOCCWN7",
      roles,
      joinedAt: "2026-09-02T12:00:00.000Z",
    };

    expect(member.roles).toContain("admin");
    expect(member.guildId).toBe("guild-001");
  });

  it("conforms Pass and PassStatus lifecycle structure", () => {
    const status: PassStatus = "active";
    const pass: Pass = {
      id: "pass-555",
      guildId: "guild-001",
      account: "GAAZI4TCR3TY5OJHCTJC2A4QSY6CJWJH5IAJTGKIN2ER7LBNVKOCCWN7",
      tier: "gold",
      status,
      issuedAt: "2026-09-03T10:00:00.000Z",
    };

    expect(pass.status).toBe("active");
    expect(pass.tier).toBe("gold");
  });

  it("conforms AccessPolicy and AccessDecision contracts", () => {
    const policy: AccessPolicy = {
      id: "policy-99",
      guildId: "guild-001",
      name: "Governance Voting",
      rules: [
        {
          action: "vote",
          resource: "proposals/*",
          requiredRole: "member",
          requiredTier: "gold",
        },
      ],
    };

    expect(policy.rules).toHaveLength(1);
    expect(policy.rules[0].action).toBe("vote");

    const decision: AccessDecision = {
      allowed: true,
      reason: "required_tier_owned",
      guildId: policy.guildId,
      account: "GAAZI4TCR3TY5OJHCTJC2A4QSY6CJWJH5IAJTGKIN2ER7LBNVKOCCWN7",
    };

    expect(decision.allowed).toBe(true);
  });

  it("conforms ActivityEvent and ActivityEventType contracts", () => {
    const eventType: ActivityEventType = "member.joined";
    const event: ActivityEvent = {
      id: "evt-777",
      guildId: "guild-001",
      type: eventType,
      account: "GAAZI4TCR3TY5OJHCTJC2A4QSY6CJWJH5IAJTGKIN2ER7LBNVKOCCWN7",
      timestamp: "2026-09-04T15:30:00.000Z",
      payload: { role: "member" },
    };

    expect(event.type).toBe("member.joined");
    expect(event.id).toBe("evt-777");
  });
});
