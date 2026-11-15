import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  GuildPassClient,
  HttpError,
  NetworkError,
  TimeoutError,
  paginate,
  type ActivityEvent,
  type Guild,
  type Member,
  type Page,
  type Pass,
} from "../../src/index.js";

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}

describe("GuildPass SDK V2 integration against mocked Core/API boundary (#499)", () => {
  let fetchSpy: ReturnType<typeof vi.spyOn>;

  beforeEach(() => {
    fetchSpy = vi.spyOn(globalThis, "fetch");
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("initializes GuildPassClient and executes access allowed and denied (403) flows end-to-end", async () => {
    const client = new GuildPassClient({
      baseUrl: "https://api.guildpass.example/",
      apiKey: "gp_test_token_123",
      timeoutMs: 5000,
    });

    expect(client.baseUrl).toBe("https://api.guildpass.example");

    fetchSpy.mockResolvedValueOnce(
      jsonResponse({
        decision: {
          allowed: true,
          reason: "active_gold_pass",
          guildId: "guild-stellar-1",
          account: "GAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAWHF",
          resource: "treasury",
          action: "vote",
        },
      }),
    );

    const allowedDecision = await client.access.check({
      guildId: "guild-stellar-1",
      account: "GAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAWHF",
      resource: "treasury",
      action: "vote",
    });

    expect(allowedDecision.allowed).toBe(true);
    expect(allowedDecision.reason).toBe("active_gold_pass");

    fetchSpy.mockResolvedValueOnce(
      jsonResponse(
        {
          allowed: false,
          reason: "pass_expired",
          metadata: { expiredAt: "2026-01-01T00:00:00Z" },
        },
        403,
      ),
    );

    const deniedDecision = await client.access.check({
      guildId: "guild-stellar-1",
      account: "GAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAWHF",
      resource: "treasury",
      action: "admin",
    });

    expect(deniedDecision.allowed).toBe(false);
    expect(deniedDecision.reason).toBe("pass_expired");
    expect(deniedDecision.metadata).toEqual({ expiredAt: "2026-01-01T00:00:00Z" });
  });

  it("exercises Guild, Pass, Member, and Activity Core boundary flows with cursor pagination", async () => {
    const client = new GuildPassClient({
      baseUrl: "https://api.guildpass.example",
      apiKey: "gp_test_token_123",
    });
    const transport = client._internalTransport;

    // 1. Guild create & get
    const mockGuild: Guild = {
      id: "guild-01",
      name: "Soroban Builders",
      ownerAccount: "GAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAWHF",
      network: "testnet",
      createdAt: "2026-11-15T00:00:00Z",
    };
    fetchSpy.mockResolvedValueOnce(jsonResponse(mockGuild, 201));
    const createdGuild = await transport.request<Guild>({
      method: "POST",
      path: "/guilds",
      body: { name: mockGuild.name, ownerAccount: mockGuild.ownerAccount, network: "testnet" },
    });
    expect(createdGuild.id).toBe("guild-01");

    // 2. Pass create & status update
    const mockPass: Pass = {
      id: "pass-01",
      guildId: "guild-01",
      account: "GAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAWHF",
      status: "active",
      tier: "gold",
      issuedAt: "2026-11-15T00:00:00Z",
    };
    fetchSpy.mockResolvedValueOnce(jsonResponse({ ...mockPass, status: "revoked" }, 200));
    const updatedPass = await transport.request<Pass>({
      method: "PATCH",
      path: "/passes/pass-01",
      body: { status: "revoked" },
    });
    expect(updatedPass.status).toBe("revoked");

    // 3. Member role update
    const mockMember: Member = {
      id: "mem-01",
      guildId: "guild-01",
      account: "GAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAWHF",
      roles: ["member", "moderator"],
      joinedAt: "2026-11-15T00:00:00Z",
    };
    fetchSpy.mockResolvedValueOnce(jsonResponse(mockMember, 200));
    const updatedMember = await transport.request<Member>({
      method: "PATCH",
      path: "/members/mem-01/roles",
      body: { roles: ["member", "moderator"] },
    });
    expect(updatedMember.roles).toContain("moderator");

    // 4. Activity cursor pagination across 2 pages
    const page1: Page<ActivityEvent> = {
      items: [
        {
          id: "evt-1",
          guildId: "guild-01",
          type: "guild.created",
          timestamp: "2026-11-15T00:00:00Z",
        },
      ],
      nextCursor: "cursor-page-2",
    };
    const page2: Page<ActivityEvent> = {
      items: [
        {
          id: "evt-2",
          guildId: "guild-01",
          type: "role.assigned",
          timestamp: "2026-11-15T00:01:00Z",
        },
      ],
      nextCursor: null,
    };

    fetchSpy
      .mockResolvedValueOnce(jsonResponse(page1, 200))
      .mockResolvedValueOnce(jsonResponse(page2, 200));

    const collected: ActivityEvent[] = [];
    for await (const ev of paginate<ActivityEvent>((req) =>
      transport.request<Page<ActivityEvent>>({
        method: "GET",
        path: `/activity?limit=${req.limit}${req.cursor ? `&cursor=${req.cursor}` : ""}`,
      }),
    )) {
      collected.push(ev);
    }

    expect(collected.map((e) => e.id)).toEqual(["evt-1", "evt-2"]);
  });

  it("maps authentication failures (401), validation failures (422), network errors, and timeouts deterministically", async () => {
    const client = new GuildPassClient({
      baseUrl: "https://api.guildpass.example",
      apiKey: "gp_invalid_key",
      timeoutMs: 100,
    });

    // 401 Authentication error
    fetchSpy.mockResolvedValueOnce(jsonResponse({ error: "unauthorized" }, 401));
    await expect(
      client.access.check({
        guildId: "guild-1",
        account: "GAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAWHF",
      }),
    ).rejects.toMatchObject({
      name: "HttpError",
      status: 401,
    });

    // 422 Validation error
    fetchSpy.mockResolvedValueOnce(jsonResponse({ error: "invalid_guild" }, 422));
    try {
      await client.access.check({
        guildId: "guild-1",
        account: "GAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAWHF",
      });
    } catch (err) {
      expect(err).toBeInstanceOf(HttpError);
      expect((err as HttpError).status).toBe(422);
    }

    // Network failure
    fetchSpy.mockRejectedValueOnce(new TypeError("fetch failed: ECONNREFUSED"));
    await expect(
      client.access.check({
        guildId: "guild-1",
        account: "GAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAWHF",
      }),
    ).rejects.toBeInstanceOf(NetworkError);

    // Timeout failure
    fetchSpy.mockImplementationOnce(
      (_url, init) =>
        new Promise((_resolve, reject) => {
          init?.signal?.addEventListener("abort", () => {
            reject(init.signal?.reason ?? new DOMException("Aborted", "AbortError"));
          });
        }),
    );
    await expect(
      client.access.check({
        guildId: "guild-1",
        account: "GAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAWHF",
      }),
    ).rejects.toBeInstanceOf(TimeoutError);
  });
});
