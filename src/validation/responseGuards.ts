import { AccessRequirement } from '../types/common';
import { AccessCheckResult } from '../access/access.types';
import { Membership } from '../membership/membership.types';
import { GuildRole } from '../roles/roles.types';
import { Guild, GuildConfig } from '../guilds/guilds.types';

const ADDRESS_REGEX = /^0x[a-fA-F0-9]{40}$/;

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function isString(value: unknown): value is string {
  return typeof value === 'string';
}

function isNonEmptyString(value: unknown): value is string {
  return typeof value === 'string' && value.length > 0;
}

function isAddress(value: unknown): value is string {
  return typeof value === 'string' && ADDRESS_REGEX.test(value);
}

function isOptionalString(value: unknown): boolean {
  return value === undefined || isString(value);
}

function isBoolean(value: unknown): value is boolean {
  return typeof value === 'boolean';
}

function isNumber(value: unknown): value is number {
  return typeof value === 'number' && !Number.isNaN(value);
}

function isStringArray(value: unknown): value is string[] {
  return Array.isArray(value) && value.every(isString);
}

function isNonEmptyStringArray(value: unknown): value is string[] {
  return Array.isArray(value) && value.length > 0 && value.every(isNonEmptyString);
}

/**
 * Runtime shape guards for the SDK's core public response types. These are
 * intentionally hand-written and dependency-free to keep bundle size
 * minimal, and only check the fields the SDK itself relies on.
 *
 * In addition to type checks, the guards perform content-level validation
 * for well-known formats (Ethereum addresses, non-empty identifiers) to
 * catch malformed API responses early.
 */
export function isAccessCheckResult(value: unknown): value is AccessCheckResult {
  return (
    isRecord(value) &&
    isBoolean(value.hasAccess) &&
    isAddress(value.walletAddress) &&
    isNonEmptyString(value.guildId) &&
    isNonEmptyString(value.resourceId) &&
    isNonEmptyStringArray(value.requiredRoles) &&
    isNonEmptyStringArray(value.matchedRoles) &&
    isOptionalString(value.reason)
  );
}

export function isMembership(value: unknown): value is Membership {
  return (
    isRecord(value) &&
    isAddress(value.walletAddress) &&
    isNonEmptyString(value.guildId) &&
    isBoolean(value.isActive) &&
    isStringArray(value.roles) &&
    isOptionalString(value.joinedAt) &&
    isOptionalString(value.expiresAt)
  );
}

export function isGuildRole(value: unknown): value is GuildRole {
  return (
    isRecord(value) &&
    isNonEmptyString(value.id) &&
    isNonEmptyString(value.name) &&
    isOptionalString(value.description) &&
    (value.requirements === undefined || (Array.isArray(value.requirements) && value.requirements.every(isAccessRequirement)))
  );
}

export function isGuildRoleArray(value: unknown): value is GuildRole[] {
  return Array.isArray(value) && value.every(isGuildRole);
}

const VALID_REQUIREMENT_TYPES = new Set(["TOKEN", "NFT", "ROLE", "WHITELIST"]);

function isAccessRequirement(value: unknown): value is AccessRequirement {
  if (!isRecord(value)) return false;
  if (!isString(value.type) || !VALID_REQUIREMENT_TYPES.has(value.type)) return false;
  if (value.address !== undefined && !isString(value.address)) return false;
  if (value.id !== undefined && !isString(value.id)) return false;
  if (value.minAmount !== undefined && !isString(value.minAmount)) return false;
  return true;
}

export function isGuild(value: unknown): value is Guild {
  return (
    isRecord(value) &&
    isNonEmptyString(value.id) &&
    isNonEmptyString(value.name) &&
    isOptionalString(value.description) &&
    isAddress(value.ownerAddress) &&
    isOptionalString(value.contractAddress) &&
    isNumber(value.chainId)
  );
}

export function isGuildConfig(value: unknown): value is GuildConfig {
  return (
    isRecord(value) &&
    isString(value.id) &&
    isOptionalString(value.theme) &&
    isOptionalString(value.logoUrl) &&
    isOptionalString(value.bannerUrl) &&
    (value.socialLinks === undefined || isRecord(value.socialLinks))
  );
}


