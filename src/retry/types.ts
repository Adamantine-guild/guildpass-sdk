/**
 * Configuration options for retry policy behavior.
 */
export interface RetryPolicyOptions {
  /** Maximum number of retry attempts (must be >= 1) */
  maxAttempts: number;
  /** Initial delay in milliseconds for the first retry (must be >= 0) */
  initialDelayMs: number;
  /** Maximum delay in milliseconds (must be >= initialDelayMs) */
  maxDelayMs: number;
  /** Multiplier for exponential backoff (must be >= 1) */
  multiplier: number;
  /** Optional jitter ratio between 0 and 1 for randomized delays */
  jitterRatio?: number;
}

/**
 * Result of retry classification for a failed request.
 */
export type RetryDecision = 
  | { shouldRetry: true; reason: string }
  | { shouldRetry: false; reason: string };

/**
 * Random number generator interface for deterministic jitter testing.
 */
export interface RandomSource {
  /** Returns a random number in the range [0, 1) */
  (): number;
}

/**
 * Error thrown when retry policy configuration is invalid.
 */
export class InvalidRetryConfigError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'InvalidRetryConfigError';
  }
}

/**
 * Error thrown when an invalid attempt number is provided.
 */
export class InvalidAttemptError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'InvalidAttemptError';
  }
}
