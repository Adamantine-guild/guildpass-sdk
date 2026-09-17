import {
  GuildPassClient,
  isStellarAccountId,
  parseStellarAccountId,
  paginate,
  isGuildPassError,
  HttpError,
  type Page,
  type PageRequest,
  type AccessDecision,
} from "../src/index.js";

async function main() {
  console.log("=== GuildPass SDK V2 Quickstart Example ===");

  // 1. Initialize Client
  const client = new GuildPassClient({
    baseUrl: "https://api.testnet.guildpass.io",
    timeoutMs: 10000,
    headers: {
      "x-api-key": "sample-api-key",
    },
  });

  console.log(`Initialized client with baseUrl: ${client.baseUrl}`);

  // 2. Stellar Account Validation
  const sampleAccount = "GAAZI4TCR3TY5OJHCTJC2A4QSY6CJWJH5IAJTGKIN2ER7LBNVKOCCWN7";
  if (!isStellarAccountId(sampleAccount)) {
    throw new Error("Sample account is not a valid Stellar account ID");
  }

  const parsed = parseStellarAccountId(sampleAccount);
  console.log(`Validated Stellar Account: ${parsed}`);

  // 3. Evaluate Access via client.access.check
  try {
    const decision: AccessDecision = await client.access.check({
      guildId: "guild-stellar-builders",
      account: parsed,
      resource: "developer-forum",
      action: "post",
    });

    console.log("Access decision:", decision.allowed ? "GRANTED" : "DENIED");
  } catch (error: unknown) {
    if (error instanceof HttpError) {
      console.log(`Received API response with HTTP status: ${error.status}`);
    } else if (isGuildPassError(error)) {
      console.log(`GuildPass Error [${error.code}]: ${error.message}`);
    } else {
      console.log("Standard exception caught as expected in mock environment");
    }
  }

  // 4. Working with Pagination Helpers
  interface SampleMember {
    id: string;
    role: string;
  }

  async function mockPageFetcher(req: PageRequest): Promise<Page<SampleMember>> {
    if (req.cursor === "page-2") {
      return {
        items: [{ id: "mem-3", role: "member" }],
        nextCursor: null,
      };
    }
    return {
      items: [
        { id: "mem-1", role: "admin" },
        { id: "mem-2", role: "contributor" },
      ],
      nextCursor: "page-2",
    };
  }

  console.log("Iterating across paginated members:");
  for await (const member of paginate(mockPageFetcher, { maxPages: 2 })) {
    console.log(` - Member ID: ${member.id}, Role: ${member.role}`);
  }

  console.log("Quickstart completed successfully!");
}

main().catch(console.error);
