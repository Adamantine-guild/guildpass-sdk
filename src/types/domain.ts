import type { StellarAccountId } from "../stellar/accountId.js";

/**
 * Supported Stellar network identifiers across the GuildPass platform.
 */
export type Network = "testnet" | "public" | "futurenet" | "standalone";

/**
 * Canonical Stellar account representation for public API consumers.
 */
export type StellarAccount = string | StellarAccountId;

/**
 * Community / Guild entity representing a programmable community in GuildPass.
 */
export interface Guild {
  /** Unique Guild identifier */
  id: string;
  /** Human-readable display name */
  name: string;
  /** Community description */
  description?: string;
  /** Primary owner / creator Stellar account */
  ownerAccount: string;
  /** Associated Soroban smart contract identifier, if deployed on-chain */
  contractId?: string;
  /** Network on which the guild operates */
  network: Network;
  /** Additional arbitrary metadata */
  metadata?: Record<string, unknown>;
  /** ISO-8601 creation timestamp */
  createdAt: string;
  /** ISO-8601 last update timestamp */
  updatedAt?: string;
}

/**
 * Standard member roles within a guild.
 */
export type MemberRole = "owner" | "admin" | "moderator" | "member";

/**
 * Community member representing a participant in a guild.
 */
export interface Member {
  /** Unique member record identifier */
  id: string;
  /** Target Guild identifier */
  guildId: string;
  /** Member Stellar account */
  account: string;
  /** Assigned roles within the guild */
  roles: MemberRole[];
  /** ISO-8601 join timestamp */
  joinedAt: string;
  /** Additional arbitrary metadata */
  metadata?: Record<string, unknown>;
}

/**
 * Lifecycle status of a digital membership pass.
 */
export type PassStatus = "active" | "expired" | "revoked" | "pending";

/**
 * Digital membership pass granting access permissions within a guild.
 */
export interface Pass {
  /** Unique pass identifier */
  id: string;
  /** Target Guild identifier */
  guildId: string;
  /** Beneficiary Stellar account */
  account: string;
  /** Soroban token / pass ID, if minted on-chain */
  tokenId?: string;
  /** Tier tier tier or membership tier level (e.g. 'standard', 'gold') */
  tier?: string;
  /** Pass lifecycle state */
  status: PassStatus;
  /** ISO-8601 issuance timestamp */
  issuedAt: string;
  /** ISO-8601 expiration timestamp, if time-bound */
  expiresAt?: string;
  /** Additional arbitrary metadata */
  metadata?: Record<string, unknown>;
}

/**
 * Individual rule within an access control policy.
 */
export interface AccessPolicyRule {
  /** Target action permitted or evaluated (e.g. 'read', 'vote', 'admin') */
  action: string;
  /** Optional resource pattern the rule applies to */
  resource?: string;
  /** Minimum required member role */
  requiredRole?: MemberRole;
  /** Minimum required pass tier */
  requiredTier?: string;
}

/**
 * Access control policy governing community permissions.
 */
export interface AccessPolicy {
  /** Unique policy identifier */
  id: string;
  /** Associated Guild identifier */
  guildId: string;
  /** Human-readable policy name */
  name: string;
  /** Policy description */
  description?: string;
  /** Policy evaluation rules */
  rules: AccessPolicyRule[];
  /** Additional arbitrary metadata */
  metadata?: Record<string, unknown>;
}

/**
 * Canonical event types emitted or recorded across GuildPass activities.
 */
export type ActivityEventType =
  | "guild.created"
  | "guild.updated"
  | "member.joined"
  | "member.left"
  | "role.assigned"
  | "role.revoked"
  | "pass.issued"
  | "pass.revoked"
  | "pass.expired"
  | "access.evaluated";

/**
 * Public audit/activity log entry representing actions taken in GuildPass.
 */
export interface ActivityEvent {
  /** Unique activity event identifier */
  id: string;
  /** Associated Guild identifier */
  guildId: string;
  /** Standard event classification or custom event name */
  type: ActivityEventType | string;
  /** Subject Stellar account associated with the event */
  account?: string;
  /** ISO-8601 event timestamp */
  timestamp: string;
  /** Event payload details */
  payload?: Record<string, unknown>;
}
