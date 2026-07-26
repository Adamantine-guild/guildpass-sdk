/**
 * Runtime shape guards for the SDK's request parameter models.
 *
 * Built on the same composable schema DSL as `responseGuards.ts`
 * (`schema.ts`). These guards check *structural* shape only — required
 * fields present, correct primitive types — and intentionally do not
 * duplicate the semantic checks (address format/checksum, ID length
 * limits, trimmed-empty detection) already enforced by
 * `src/utils/validation.ts`. That module keeps running immediately after
 * these guards for the fields it covers; this file exists to catch the
 * shapes it can't (missing params object entirely, wrong top-level type,
 * `null`/`undefined`), and as the colocated source of truth for a
 * request model's shape.
 */

import { object, nonEmptyString, number, string, optional, type Validator } from './schema';
import type { AccessCheckParams, RoleAccessCheckParams } from '../access/access.types';
import type { MembershipParams } from '../membership/membership.types';
import type { GetRolesParams, GetUserRolesParams } from '../roles/roles.types';
import type { GetGuildParams } from '../guilds/guilds.types';

/**
 * Checks whether `value` conforms to the {@link AccessCheckParams} shape.
 */
export const isAccessCheckParams: Validator<AccessCheckParams> = object({
  walletAddress: nonEmptyString(),
  guildId: nonEmptyString(),
  resourceId: nonEmptyString(),
});

/**
 * Checks whether `value` conforms to the {@link RoleAccessCheckParams} shape.
 */
export const isRoleAccessCheckParams: Validator<RoleAccessCheckParams> = object({
  walletAddress: nonEmptyString(),
  guildId: nonEmptyString(),
  roleId: nonEmptyString(),
});

/**
 * Checks whether `value` conforms to the {@link MembershipParams} shape.
 */
export const isMembershipParams: Validator<MembershipParams> = object({
  walletAddress: nonEmptyString(),
  guildId: nonEmptyString(),
});

/**
 * Checks whether `value` conforms to the {@link GetRolesParams} shape.
 * `cursor`/`limit` are checked as plain `string`/`number` (not
 * non-empty/positive) — pagination-token semantics belong to the service,
 * not this structural guard.
 */
export const isGetRolesParams: Validator<GetRolesParams> = object({
  guildId: nonEmptyString(),
  cursor: optional(string()),
  limit: optional(number()),
});

/**
 * Checks whether `value` conforms to the {@link GetUserRolesParams} shape.
 */
export const isGetUserRolesParams: Validator<GetUserRolesParams> = object({
  walletAddress: nonEmptyString(),
  guildId: nonEmptyString(),
  cursor: optional(string()),
  limit: optional(number()),
});

/**
 * Checks whether `value` conforms to the {@link GetGuildParams} shape.
 */
export const isGetGuildParams: Validator<GetGuildParams> = object({
  guildId: nonEmptyString(),
});
