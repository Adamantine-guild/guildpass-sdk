import { describe, expect, it, vi } from "vitest";
import { MembersResource } from "../../src/resources/members.js";
import { HttpTransport } from "../../src/transport/HttpTransport.js";
import { HttpError } from "../../src/errors/index.js";

describe("MembersResource (#494)", () => {
  const stellarGAccount = "GAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAWHF";
  const stellarCAccount = "CAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAABSC4";

  it("retrieves an individual member with Stellar account and membership status", async () => {
    const transport = new HttpTransport({ baseUrl: "https://api.guildpass.example" });
    vi.spyOn(transport, "request").mockResolvedValueOnce({
      member: {
        id: "mem-100",
        guildId: "guild-soroban",
        account: stellarGAccount,
        roles: ["owner", "admin"],
        status: "active",
        joinedAt: "2026-11-15T08:00:00Z",
      },
    });

    const members = new MembersResource(transport);
    const member = await members.get("mem-100");

    expect(member.id).toBe("mem-100");
    expect(member.account).toBe(stellarGAccount);
    expect(member.status).toBe("active");
    expect(member.roles).toEqual(["owner", "admin"]);
  });

  it("lists guild members supporting both Stellar G... and Soroban C... accounts", async () => {
    const transport = new HttpTransport({ baseUrl: "https://api.guildpass.example" });
    const requestSpy = vi.spyOn(transport, "request").mockResolvedValueOnce({
      items: [
        {
          id: "mem-101",
          guildId: "guild-soroban",
          account: stellarCAccount,
          roles: ["member"],
          status: "active",
          joinedAt: "2026-11-15T09:00:00Z",
        },
      ],
      nextCursor: null,
    });

    const members = new MembersResource(transport);
    const page = await members.list({
      guildId: "guild-soroban",
      role: "member",
      limit: 25,
    });

    expect(requestSpy).toHaveBeenCalledTimes(1);
    expect(requestSpy.mock.calls[0]![0].path).toContain("guildId=guild-soroban");
    expect(page.items[0]?.account).toBe(stellarCAccount);
  });

  it("updates member roles and validates inputs and transport errors", async () => {
    const transport = new HttpTransport({ baseUrl: "https://api.guildpass.example" });
    const requestSpy = vi.spyOn(transport, "request").mockResolvedValueOnce({
      id: "mem-100",
      guildId: "guild-soroban",
      account: stellarGAccount,
      roles: ["admin", "moderator"],
      status: "active",
      joinedAt: "2026-11-15T08:00:00Z",
    });

    const members = new MembersResource(transport);
    const updated = await members.updateRoles("mem-100", ["admin", "moderator"]);

    expect(requestSpy).toHaveBeenCalledWith(
      expect.objectContaining({
        method: "PATCH",
        path: "/members/mem-100/roles",
        body: { roles: ["admin", "moderator"] },
      }),
    );
    expect(updated.roles).toEqual(["admin", "moderator"]);

    await expect(members.updateRoles("mem-100", [])).rejects.toThrow(/non-empty array/);
    await expect(members.list({ guildId: "" })).rejects.toThrow(/guildId is required/);

    vi.spyOn(transport, "request").mockRejectedValueOnce(new HttpError(404, "Member not found"));
    await expect(members.get("mem-missing")).rejects.toBeInstanceOf(HttpError);
  });
});
