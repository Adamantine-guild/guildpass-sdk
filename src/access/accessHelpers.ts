import { AccessCheckResult } from './access.types';

export function isAccessAllowed(result: AccessCheckResult): boolean { return result.hasAccess; }
export function isAccessDenied(result: AccessCheckResult): boolean { return !result.hasAccess; }

export function getMissingRoles(result: AccessCheckResult): string[] {
  return result.requiredRoles.filter(r => !result.matchedRoles.includes(r));
}

export function isMissingRole(result: AccessCheckResult): boolean {
  return !result.hasAccess && getMissingRoles(result).length > 0;
}

export function getAccessDenialReason(result: AccessCheckResult): string {
  if (result.hasAccess) return '';
  const missing = getMissingRoles(result);
  if (missing.length > 0) return 'Missing roles: ' + missing.join(', ');
  return result.reason || 'Access denied';
}

export type AccessDecision =
  | { kind: 'allowed' }
  | { kind: 'denied-missing-role'; missingRoles: string[] }
  | { kind: 'denied-inactive' }
  | { kind: 'denied-unknown'; reason?: string };

export function getAccessDecision(result: AccessCheckResult): AccessDecision {
  if (result.hasAccess) return { kind: 'allowed' };
  const missing = getMissingRoles(result);
  if (missing.length > 0) return { kind: 'denied-missing-role', missingRoles: missing };
  if (result.reason && /inactive|expired/i.test(result.reason)) return { kind: 'denied-inactive' };
  return { kind: 'denied-unknown', reason: result.reason };
}
