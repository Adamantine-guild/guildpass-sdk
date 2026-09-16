import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { GuildPassClient } from "../../src/client/index.js";
import { AccessResource } from "../../src/resources/access.js";
import { HttpTransport } from "../../src/transport/HttpTransport.js";
import { parseStellarAccountId } from "../../src/stellar/accountId.js";
import { HttpError, NetworkError, TimeoutError } from "../../src/errors/index.js";

const originalFetch = global.fetch;

describe("AccessResource & client.access.check", () => {
  const mockBaseUrl = "https://api.guildpass.example";
  const validStellarAccount = "GBBD47IF6LWK7P7MDEVSCWR7DPUWV3NY3DTQEVFL4NAT4AQH3ZLLFLA5";

  let client: GuildPassClient;

  beforeEach(() => {
    client = new GuildPassClient({
      baseUrl: mockBaseUrl,
      headers: {
        "x-api-key": "gp_test_secret_key",
      },
    });
    global.fetch = vi.fn();
  });

  afterEach(() => {
    global.fetch = originalFetch;
    vi.restoreAllMocks();
  });

  describe("API shape & initialization", () => {
    it("exposes client.access as an instance of AccessResource", () => {
      expect(client.access).toBeDefined();
      expect(client.access).toBeInstanceOf(AccessResource);
      expect(typeof client.access.check).toBe("function");
    });
  });

  describe("Allowed access scenarios", () => {
    it("returns an AccessDecision with allowed: true and reason code", async () => {
      const mockResponseBody = {
        allowed: true,
        reason: "required_pass_owned",
        guildId: "guild_alpha_123",
        account: validStellarAccount,
        resource: "vault_channels",
        action: "read",
      };

      vi.mocked(global.fetch).mockResolvedValueOnce(
        new Response(JSON.stringify(mockResponseBody), {
          status: 200,
          headers: { "Content-Type": "application/json" },
        }),
      );

      const decision = await client.access.check({
        guildId: "guild_alpha_123",
        account: validStellarAccount,
        resource: "vault_channels",
        action: "read",
      });

      expect(decision).toEqual({
        allowed: true,
        reason: "required_pass_owned",
        guildId: "guild_alpha_123",
        account: validStellarAccount,
        resource: "vault_channels",
        action: "read",
      });

      expect(global.fetch).toHaveBeenCalledTimes(1);
      const [calledUrl, calledInit] = vi.mocked(global.fetch).mock.calls[0];
      expect(calledUrl).toBe("https://api.guildpass.example/access/check");
      expect(calledInit?.method).toBe("POST");

      const parsedPayload = JSON.parse(calledInit?.body as string);
      expect(parsedPayload).toEqual({
        guildId: "guild_alpha_123",
        account: validStellarAccount,
        resource: "vault_channels",
        action: "read",
      });
    });

    it("supports typed StellarAccountId instances", async () => {
      const stellarId = parseStellarAccountId(validStellarAccount);

      vi.mocked(global.fetch).mockResolvedValueOnce(
        new Response(
          JSON.stringify({
            allowed: true,
            reason: "stellar_membership_active",
          }),
          { status: 200 },
        ),
      );

      const decision = await client.access.check({
        guildId: "guild_stellar_dao",
        account: stellarId,
      });

      expect(decision.allowed).toBe(true);
      expect(decision.reason).toBe("stellar_membership_active");
      expect(decision.account).toBe(validStellarAccount);
    });

    it("handles wrapped Core response format { decision: AccessDecision }", async () => {
      vi.mocked(global.fetch).mockResolvedValueOnce(
        new Response(
          JSON.stringify({
            decision: {
              allowed: true,
              reason: "tier_3_pass_holder",
              metadata: { expiresAt: 1893456000000 },
            },
          }),
          { status: 200 },
        ),
      );

      const decision = await client.access.check({
        guildId: "guild_vip",
        account: validStellarAccount,
      });

      expect(decision.allowed).toBe(true);
      expect(decision.reason).toBe("tier_3_pass_holder");
      expect(decision.metadata).toEqual({ expiresAt: 1893456000000 });
    });
  });

  describe("Denied access scenarios", () => {
    it("returns normal decision when Core responds 200 with allowed: false", async () => {
      vi.mocked(global.fetch).mockResolvedValueOnce(
        new Response(
          JSON.stringify({
            allowed: false,
            reason: "pass_expired",
          }),
          { status: 200 },
        ),
      );

      const decision = await client.access.check({
        guildId: "guild_alpha",
        account: validStellarAccount,
        resource: "restricted_zone",
      });

      expect(decision.allowed).toBe(false);
      expect(decision.reason).toBe("pass_expired");
    });

    it("captures 403 Forbidden as a normal denied decision instead of throwing", async () => {
      vi.mocked(global.fetch).mockResolvedValueOnce(
        new Response(
          JSON.stringify({
            reason: "insufficient_tier",
            metadata: { requiredTier: "platinum", currentTier: "bronze" },
          }),
          {
            status: 403,
            statusText: "Forbidden",
            headers: { "Content-Type": "application/json" },
          },
        ),
      );

      const decision = await client.access.check({
        guildId: "guild_gaming",
        account: validStellarAccount,
        action: "play_tournament",
      });

      expect(decision.allowed).toBe(false);
      expect(decision.reason).toBe("insufficient_tier");
      expect(decision.metadata).toEqual({
        requiredTier: "platinum",
        currentTier: "bronze",
      });
    });

    it("handles 403 Forbidden with error string or message field", async () => {
      vi.mocked(global.fetch).mockResolvedValueOnce(
        new Response(
          JSON.stringify({
            error: "pass_revoked",
          }),
          { status: 403 },
        ),
      );

      const decision = await client.access.check({
        guildId: "guild_gaming",
        account: validStellarAccount,
      });

      expect(decision.allowed).toBe(false);
      expect(decision.reason).toBe("pass_revoked");
    });

    it("defaults reason to access_denied on 403 without metadata", async () => {
      vi.mocked(global.fetch).mockResolvedValueOnce(new Response(null, { status: 403 }));

      const decision = await client.access.check({
        guildId: "guild_gaming",
        account: validStellarAccount,
      });

      expect(decision.allowed).toBe(false);
      expect(decision.reason).toBe("access_denied");
    });
  });

  describe("API and Transport failures (typed SDK errors)", () => {
    it("throws HttpError for 400 Bad Request", async () => {
      vi.mocked(global.fetch).mockResolvedValueOnce(
        new Response(JSON.stringify({ error: "Invalid guild ID format" }), {
          status: 400,
        }),
      );

      await expect(
        client.access.check({
          guildId: "invalid!guild",
          account: validStellarAccount,
        }),
      ).rejects.toThrow(HttpError);
    });

    it("throws HttpError for 500 Internal Server Error", async () => {
      vi.mocked(global.fetch).mockResolvedValueOnce(
        new Response(JSON.stringify({ error: "Database outage" }), {
          status: 500,
        }),
      );

      await expect(
        client.access.check({
          guildId: "guild_alpha",
          account: validStellarAccount,
        }),
      ).rejects.toThrow(HttpError);
    });

    it("throws NetworkError on network disconnection", async () => {
      vi.mocked(global.fetch).mockRejectedValueOnce(new TypeError("Failed to fetch"));

      await expect(
        client.access.check({
          guildId: "guild_alpha",
          account: validStellarAccount,
        }),
      ).rejects.toThrow(NetworkError);
    });
  });

  describe("Input validation & policy evaluation boundary", () => {
    it("validates that guildId is provided and non-empty", async () => {
      await expect(
        client.access.check({
          guildId: "",
          account: validStellarAccount,
        }),
      ).rejects.toThrow("guildId is required and must be a non-empty string");
    });

    it("validates that account is provided and non-empty", async () => {
      await expect(
        client.access.check({
          guildId: "guild_123",
          account: "   ",
        }),
      ).rejects.toThrow("account is required and must be a non-empty string");
    });

    it("forwards context and does not evaluate policy locally", async () => {
      vi.mocked(global.fetch).mockResolvedValueOnce(
        new Response(
          JSON.stringify({
            allowed: true,
            reason: "contextual_rule_matched",
          }),
          { status: 200 },
        ),
      );

      const customContext = { ip: "192.168.1.1", clientVersion: "2.1.0" };
      await client.access.check({
        guildId: "guild_123",
        account: validStellarAccount,
        context: customContext,
      });

      const calledInit = vi.mocked(global.fetch).mock.calls[0][1];
      const parsedBody = JSON.parse(calledInit?.body as string);
      expect(parsedBody.context).toEqual(customContext);
    });

    it("propagates configured client headers to request", async () => {
      vi.mocked(global.fetch).mockResolvedValueOnce(
        new Response(JSON.stringify({ allowed: true }), { status: 200 }),
      );

      await client.access.check({
        guildId: "guild_123",
        account: validStellarAccount,
      });

      const calledInit = vi.mocked(global.fetch).mock.calls[0][1];
      const headers = new Headers(calledInit?.headers);
      expect(headers.get("x-api-key")).toBe("gp_test_secret_key");
    });
  });
});
