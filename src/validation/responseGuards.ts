/**
 * Runtime shape guards for the SDK's core public response types.
 *
 * Built on the composable schema DSL from `schema.ts` — zero runtime
 * dependencies, minimal bundle footprint. Validates nested object/array
 * shapes recursively, not just top-level field types.
 *
 * Each guard is a type predicate so TypeScript narrows types in branches
 * that check the guard.
 */

import {
  object,
  string,
  nonEmptyString,
  address,
  boolean,
  number,
  optional,
  array,
  nonEmptyArray,
  record,
  type Validator,
} from './schema';

import type { AccessCheckResult } from '../access/access.types';
import type { Membership } from '../membership/membership.types';
import type { GuildRole } from '../roles/roles.types';
import type { Guild, GuildConfig } from '../guilds/guilds.types';
import type { AccessRequirement } from '../types/common';

// ---------------------------------------------------------------------------
// AccessRequirement schema (used inline by isGuildRole)
// ---------------------------------------------------------------------------

const VALID_REQUIREMENT_TYPES = new Set(['TOKEN', 'NFT', 'ROLE', 'WHITELIST']);

const isAccessRequirement: Validator<AccessRequirement> = object({
  type: (v): v is AccessRequirement['type'] =>
    typeof v === 'string' && VALID_REQUIREMENT_TYPES.has(v),
  address: optional(address()),
  id: optional(string()),
  minAmount: optional(string()),
});

// ---------------------------------------------------------------------------
// Domain response schemas
// ---------------------------------------------------------------------------

/**
 * Checks whether `value` conforms to the {@link AccessCheckResult} shape.
 *
 * Validates all fields including nested array content (non-empty strings
 * for `requiredRoles`/`matchedRoles`) and Ethereum address format.
 */
export const isAccessCheckResult: Validator<AccessCheckResult> = object({
  hasAccess: boolean(),
  walletAddress: address(),
  guildId: nonEmptyString(),
  resourceId: nonEmptyString(),
  requiredRoles: nonEmptyArray(nonEmptyString()),
  matchedRoles: nonEmptyArray(nonEmptyString()),
  reason: optional(string()),
});

/**
 * Checks whether `value` conforms to the {@link Membership} shape.
 */
export const isMembership: Validator<Membership> = object({
  walletAddress: address(),
  guildId: nonEmptyString(),
  isActive: boolean(),
  roles: array(string()),
  joinedAt: optional(string()),
  expiresAt: optional(string()),
});

/**
 * Checks whether `value` conforms to the {@link GuildRole} shape.
 */
export const isGuildRole: Validator<GuildRole> = object({
  id: nonEmptyString(),
  name: nonEmptyString(),
  description: optional(string()),
  requirements: optional(array(isAccessRequirement)),
});

/**
 * Checks whether `value` is an array of {@link GuildRole} objects.
 */
export const isGuildRoleArray: Validator<GuildRole[]> = array(isGuildRole);

/**
 * Checks whether `value` conforms to the {@link Guild} shape.
 */
export const isGuild: Validator<Guild> = object({
  id: nonEmptyString(),
  name: nonEmptyString(),
  description: optional(string()),
  ownerAddress: address(),
  contractAddress: optional(string()),
  chainId: number(),
});

/**
 * Checks whether `value` conforms to the {@link GuildConfig} shape.
 *
 * Note: `socialLinks` is validated as a `Record<string, string>`, so every
 * value in the record is checked to be a string — deeper than the original
 * `isRecord`-only check.
 */
export const isGuildConfig: Validator<GuildConfig> = object({
  id: string(),
  theme: optional(string()),
  logoUrl: optional(string()),
  bannerUrl: optional(string()),
  socialLinks: optional(record(string())),
});

/**
 * Checks whether `value` conforms to the `/access/role-check` response
 * shape consumed by `AccessService.checkRoleAccess`.
 */
export const isRoleCheckResult: Validator<{ hasRole: boolean }> = object({
  hasRole: boolean(),
});


