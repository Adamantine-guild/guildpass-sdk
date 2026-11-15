import { HttpTransport } from "../transport/HttpTransport.js";
import type { MemberRole } from "../types/domain.js";
import type { GuildMember, ListMembersOptions } from "../types/members.js";
import type { Page } from "../types/pagination.js";
import { validateCursor, validateLimit } from "../utils/pagination.js";
import { serializeQuery } from "../utils/querySerializer.js";

const VALID_ROLES = new Set<MemberRole>(["owner", "admin", "moderator", "member"]);

/**
 * Resource client for retrieving Guild members and managing membership roles in GuildPass Core.
 */
export class MembersResource {
  constructor(
    private readonly transport: HttpTransport,
    private readonly defaultHeaders: Readonly<Record<string, string>> = {},
  ) {}

  /**
   * Retrieves a single Guild member record by its unique identifier.
   */
  public async get(memberId: string): Promise<GuildMember> {
    if (!memberId || typeof memberId !== "string" || !memberId.trim()) {
      throw new Error("memberId is required and must be a non-empty string");
    }

    const encodedId = encodeURIComponent(memberId.trim());
    const response = await this.transport.request<GuildMember | { member: GuildMember }>({
      method: "GET",
      path: `/members/${encodedId}`,
      headers: { ...this.defaultHeaders },
    });

    const raw =
      response && typeof response === "object" && "member" in response
        ? (response as { member: GuildMember }).member
        : (response as GuildMember);

    return this.normalizeMember(raw);
  }

  /**
   * Lists members belonging to a Guild with optional role/account/status filtering and cursor pagination.
   */
  public async list(options: ListMembersOptions): Promise<Page<GuildMember>> {
    if (!options || typeof options !== "object") {
      throw new Error("ListMembersOptions must be an object");
    }

    if (!options.guildId || typeof options.guildId !== "string" || !options.guildId.trim()) {
      throw new Error("guildId is required and must be a non-empty string");
    }

    const limit = validateLimit(options.limit);
    const cursor = validateCursor(options.cursor);

    const queryParams: Record<string, string | number | undefined> = {
      guildId: options.guildId.trim(),
      limit,
      ...(cursor ? { cursor } : {}),
      ...(options.role ? { role: options.role } : {}),
      ...(options.account ? { account: options.account.trim() } : {}),
      ...(options.status ? { status: options.status } : {}),
    };

    const queryString = serializeQuery(queryParams);
    const response = await this.transport.request<
      Page<GuildMember> | { items?: GuildMember[]; members?: GuildMember[]; nextCursor?: string | null }
    >({
      method: "GET",
      path: `/members?${queryString}`,
      headers: { ...this.defaultHeaders },
    });

    const items = Array.isArray((response as any)?.items)
      ? (response as any).items
      : Array.isArray((response as any)?.members)
        ? (response as any).members
        : [];

    return {
      items: items.map((m: GuildMember) => this.normalizeMember(m)),
      nextCursor: (response as any)?.nextCursor ?? null,
    };
  }

  /**
   * Updates the assigned roles for a Guild member.
   */
  public async updateRoles(memberId: string, roles: MemberRole[]): Promise<GuildMember> {
    if (!memberId || typeof memberId !== "string" || !memberId.trim()) {
      throw new Error("memberId is required and must be a non-empty string");
    }

    if (!Array.isArray(roles) || roles.length === 0) {
      throw new Error("roles must be a non-empty array of MemberRole values");
    }

    for (const role of roles) {
      if (!VALID_ROLES.has(role)) {
        throw new Error(`Invalid member role: "${String(role)}"`);
      }
    }

    const encodedId = encodeURIComponent(memberId.trim());
    const response = await this.transport.request<GuildMember | { member: GuildMember }>({
      method: "PATCH",
      path: `/members/${encodedId}/roles`,
      headers: { ...this.defaultHeaders },
      body: { roles },
    });

    const raw =
      response && typeof response === "object" && "member" in response
        ? (response as { member: GuildMember }).member
        : (response as GuildMember);

    return this.normalizeMember(raw);
  }

  private normalizeMember(raw: GuildMember): GuildMember {
    return {
      id: String(raw.id),
      guildId: String(raw.guildId),
      account: String(raw.account),
      roles: Array.isArray(raw.roles) ? (raw.roles as MemberRole[]) : [],
      joinedAt: String(raw.joinedAt),
      ...(raw.status !== undefined ? { status: raw.status } : {}),
      ...(raw.metadata && typeof raw.metadata === "object" ? { metadata: raw.metadata } : {}),
    };
  }
}
