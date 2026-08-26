import { describe, expect, it } from "vitest";
import { GuildPassClient } from "../src/client/index.js";

describe("GuildPassClient", () => {
  it("stores the configured base URL", () => {
    const client = new GuildPassClient({
      baseUrl: "https://api.guildpass.example",
    });

    expect(client.baseUrl).toBe("https://api.guildpass.example");
  });
});
