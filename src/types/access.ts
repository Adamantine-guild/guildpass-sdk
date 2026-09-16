import type { StellarAccountId } from "../stellar/accountId.js";

/**
 * Parameters for performing an access evaluation check against GuildPass Core.
 */
export interface AccessCheckRequest {
  /**
   * The identifier of the guild whose access policy is being evaluated.
   */
  guildId: string;

  /**
   * The subject account identifier (Stellar address or account identifier).
   */
  account: string | StellarAccountId;

  /**
   * The specific resource being accessed (optional).
   */
  resource?: string;

  /**
   * The action the account attempts to perform on the resource (optional).
   */
  action?: string;

  /**
   * Additional contextual attributes passed for policy evaluation (optional).
   */
  context?: Record<string, unknown>;
}

/**
 * Structured result of an access evaluation check.
 */
export interface AccessDecision {
  /**
   * Whether access is granted.
   */
  allowed: boolean;

  /**
   * Explanation or reason code explaining why access was granted or denied
   * (e.g. "required_pass_owned", "pass_expired", "insufficient_tier").
   */
  reason?: string;

  /**
   * Guild identifier evaluated.
   */
  guildId?: string;

  /**
   * Subject account identifier evaluated.
   */
  account?: string;

  /**
   * Target resource evaluated, if specified.
   */
  resource?: string;

  /**
   * Target action evaluated, if specified.
   */
  action?: string;

  /**
   * Optional metadata or diagnostic attributes returned by Core.
   */
  metadata?: Record<string, unknown>;
}
