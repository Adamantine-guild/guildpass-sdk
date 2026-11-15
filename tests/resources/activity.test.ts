import { describe, expect, it, vi } from "vitest";
import { ActivityResource } from "../../src/resources/activity.js";
import { HttpTransport } from "../../src/transport/HttpTransport.js";
import { InvalidLimitError } from "../../src/types/pagination.js";

describe("ActivityResource (#497)", () => {
  it("lists activity events with typed filters and cursor pagination", async () => {
    const transport = new HttpTransport({ baseUrl: "https://api.guildpass.example" });
    const requestSpy = vi.spyOn(transport, "request").mockResolvedValueOnce({
      items: [
        {
          id: "evt-101",
          guildId: "guild-stellar",
          type: "pass.issued",
          account: "GAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAWHF",
          timestamp: "2026-11-15T10:00:00Z",
          payload: { tier: "gold" },
        },
      ],
      nextCursor: "cursor-next-101",
    });

    const activity = new ActivityResource(transport, { Authorization: "Bearer token" });
    const page = await activity.list({
      guildId: "guild-stellar",
      type: "pass.issued",
      account: "GAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAWHF",
      since: "2026-11-01T00:00:00Z",
      limit: 10,
    });

    expect(requestSpy).toHaveBeenCalledTimes(1);
    const callArg = requestSpy.mock.calls[0]![0];
    expect(callArg.method).toBe("GET");
    expect(callArg.path).toContain("/activity?");
    expect(callArg.path).toContain("guildId=guild-stellar");
    expect(callArg.path).toContain("type=pass.issued");
    expect(callArg.path).toContain("limit=10");
    expect(page.items).toHaveLength(1);
    expect(page.items[0]?.id).toBe("evt-101");
    expect(page.nextCursor).toBe("cursor-next-101");
  });

  it("retrieves an individual activity event by ID and unwraps { event } envelopes", async () => {
    const transport = new HttpTransport({ baseUrl: "https://api.guildpass.example" });
    vi.spyOn(transport, "request").mockResolvedValueOnce({
      event: {
        id: "evt-202",
        guildId: "guild-stellar",
        type: "member.joined",
        timestamp: "2026-11-15T11:00:00Z",
      },
    });

    const activity = new ActivityResource(transport);
    const event = await activity.get("evt-202");

    expect(event.id).toBe("evt-202");
    expect(event.type).toBe("member.joined");
  });

  it("rejects invalid pagination limits and blank eventId or filter values", async () => {
    const transport = new HttpTransport({ baseUrl: "https://api.guildpass.example" });
    const activity = new ActivityResource(transport);

    await expect(activity.list({ limit: 0 })).rejects.toBeInstanceOf(InvalidLimitError);
    await expect(activity.list({ guildId: "   " })).rejects.toThrow(/guildId filter/);
    await expect(activity.get("")).rejects.toThrow(/eventId is required/);
  });
});
