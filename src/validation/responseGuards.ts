import { AccessRequirement } from '../types/common';
import { AccessCheckResult } from '../access/access.types';
import { Membership } from '../membership/membership.types';
import { GuildRole } from '../roles/roles.types';
import { Guild, GuildConfig } from '../guilds/guilds.types';

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function isString(value: unknown): value is string {
  return typeof value === 'string';
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

/**
 * Runtime shape guards for the SDK's core public response types. These are
 * intentionally hand-written and dependency-free to keep bundle size
 * minimal, and only check the fields the SDK itself relies on.
 */
export function isAccessCheckResult(value: unknown): value is AccessCheckResult {
  return (
    isRecord(value) &&
    isBoolean(value.hasAccess) &&
    isString(value.walletAddress) &&
    isString(value.guildId) &&
    isString(value.resourceId) &&
    isStringArray(value.requiredRoles) &&
    isStringArray(value.matchedRoles) &&
    isOptionalString(value.reason)
  );
}

export function isMembership(value: unknown): value is Membership {
  return (
    isRecord(value) &&
    isString(value.walletAddress) &&
    isString(value.guildId) &&
    isBoolean(value.isActive) &&
    isStringArray(value.roles) &&
    isOptionalString(value.joinedAt) &&
    isOptionalString(value.expiresAt)
  );
}

export function isGuildRole(value: unknown): value is GuildRole {
  return (
    isRecord(value) &&
    isString(value.id) &&
    isString(value.name) &&
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
    isString(value.id) &&
    isString(value.name) &&
    isOptionalString(value.description) &&
    isString(value.ownerAddress) &&
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


