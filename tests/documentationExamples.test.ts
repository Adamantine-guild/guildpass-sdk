import { describe, it, expect } from "vitest";
import {
  GuildPassClient,
  isStellarAccountId,
  parseStellarAccountId,
  safeParseStellarAccountId,
  paginate,
  collectAll,
  createPaginatedApi,
  isGuildPassError,
  GuildPassError,
  GuildPassErrorCode,
  HttpError,
  TimeoutError,
  NetworkError,
  redactSecret,
  type Page,
  type PageRequest,
} from "../src/index.js";

describe("Documentation Examples Validation", () => {
  it("verifies GuildPassClient initialization options documented in README & api-reference", () => {
    const client = new GuildPassClient({
      baseUrl: "https://api.testnet.guildpass.io",
      timeoutMs: 15000,
      headers: {
        "x-api-key": "demo-key",
      },
    });

    expect(client.baseUrl).toBe("https://api.testnet.guildpass.io");
    expect(client.timeoutMs).toBe(15000);
    expect(client.headers["x-api-key"]).toBe("demo-key");
    expect(client.access).toBeDefined();
  });

  it("verifies Stellar helpers documented in API reference", () => {
    const validAccount = "GAAZI4TCR3TY5OJHCTJC2A4QSY6CJWJH5IAJTGKIN2ER7LBNVKOCCWN7";
    const invalidAccount = "INVALID_STELLAR_ADDRESS";

    expect(isStellarAccountId(validAccount)).toBe(true);
    expect(isStellarAccountId(invalidAccount)).toBe(false);

    const parsed = parseStellarAccountId(validAccount);
    expect(parsed).toBe(validAccount);

    const safeResult = safeParseStellarAccountId(validAccount);
    expect(safeResult.success).toBe(true);
    if (safeResult.success) {
      expect(safeResult.data).toBe(validAccount);
    }
  });

  it("verifies pagination helpers documented in API reference", async () => {
    interface Member {
      id: string;
      account: string;
    }

    const mockFetcher = async (req: PageRequest): Promise<Page<Member>> => {
      if (req.cursor === "p2") {
        return {
          items: [{ id: "m2", account: "GAAZI4TCR3TY5OJHCTJC2A4QSY6CJWJH5IAJTGKIN2ER7LBNVKOCCWN7" }],
          nextCursor: null,
        };
      }
      return {
        items: [{ id: "m1", account: "GAAZI4TCR3TY5OJHCTJC2A4QSY6CJWJH5IAJTGKIN2ER7LBNVKOCCWN7" }],
        nextCursor: "p2",
      };
    };

    const items: Member[] = [];
    for await (const m of paginate(mockFetcher, { maxPages: 3 })) {
      items.push(m);
    }
    expect(items).toHaveLength(2);

    const collected = await collectAll(mockFetcher, { maxPages: 3 });
    expect(collected).toHaveLength(2);

    const api = createPaginatedApi(mockFetcher);
    const paginatedAll = await api.collect({ maxPages: 3 });
    expect(paginatedAll).toHaveLength(2);
  });

  it("verifies error handling hierarchy documented in API reference", () => {
    const httpErr = new HttpError(404, "Not Found", { resource: "guild" });
    expect(isGuildPassError(httpErr)).toBe(true);
    expect(httpErr.code).toBe(GuildPassErrorCode.HTTP_ERROR);
    expect(httpErr.status).toBe(404);

    const timeoutErr = new TimeoutError("Operation timed out");
    expect(isGuildPassError(timeoutErr)).toBe(true);
    expect(timeoutErr.code).toBe(GuildPassErrorCode.TIMEOUT);

    const netErr = new NetworkError("Connection refused");
    expect(isGuildPassError(netErr)).toBe(true);
    expect(netErr.code).toBe(GuildPassErrorCode.TRANSPORT_ERROR);
  });

  it("verifies secret redaction documented in API reference", () => {
    const result = redactSecret("my-super-secret-api-key", { namespace: "api-key" });

    expect(result.display).toBe("[REDACTED]");
    expect(result.fingerprint).toHaveLength(16);
    expect(result.namespace).toBe("api-key");
  });
});
