import { AccessCheckResult } from './access.types';

export function isAccessAllowed(result: AccessCheckResult): boolean {
  return result.hasAccess;
}
export function isAccessDenied(result: AccessCheckResult): boolean {
  return !result.hasAccess;
}

export function getMissingRoles(result: AccessCheckResult): string[] {
  return result.requiredRoles.filter((r) => !result.matchedRoles.includes(r));
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

/**
 * Converts an access check result into a concise, user-facing summary.
 *
 * @example
 * ```ts
 * const summary = getAccessSummary(accessResult);
 * // "Access granted."
 * ```
 */
export function getAccessSummary(result: AccessCheckResult): string {
  const decision = getAccessDecision(result);

  switch (decision.kind) {
    case 'allowed':
      return 'Access granted.';
    case 'denied-missing-role':
      return `Missing required roles: ${decision.missingRoles.join(', ')}.`;
    case 'denied-inactive':
      return 'Membership is inactive or expired.';
    case 'denied-unknown':
      return decision.reason ? `Access denied: ${decision.reason}` : 'Access denied.';
  }
}
