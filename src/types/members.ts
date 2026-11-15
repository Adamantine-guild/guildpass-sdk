import type { Member, MemberRole } from "./domain.js";
import type { PageRequest } from "./pagination.js";

/**
 * Lifecycle membership status within a Guild.
 */
export type MemberStatus = "active" | "invited" | "suspended" | "removed";

/**
 * Extended Member representation including optional membership lifecycle status.
 */
export interface GuildMember extends Member {
  /** Current membership status */
  status?: MemberStatus;
}

/**
 * Options for listing Guild members.
 */
export interface ListMembersOptions extends PageRequest {
  /** Target Guild identifier (required) */
  guildId: string;
  /** Optional filter by assigned role */
  role?: MemberRole;
  /** Optional filter by Stellar account identifier */
  account?: string;
  /** Optional filter by membership status */
  status?: MemberStatus;
}
