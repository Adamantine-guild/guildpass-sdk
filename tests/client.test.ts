import { describe, expect, it } from "vitest";
import { GuildPassClient } from "../src/client/index.js";
import type { GuildPassClientOptions } from "../src/config/index.js";

describe("GuildPassClient", () => {
  it("stores the configured base URL", () => {
    const options: GuildPassClientOptions = {
      baseUrl: "https://api.guildpass.example",
    };
    const client = new GuildPassClient(options);

    expect(client.baseUrl).toBe("https://api.guildpass.example");
  });
});
