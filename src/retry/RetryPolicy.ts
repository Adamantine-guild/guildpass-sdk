import type { RandomSource, RetryDecision, RetryPolicyOptions } from './types.js';
import { InvalidAttemptError, InvalidRetryConfigError } from './types.js';

/**
 * Default random source using Math.random().
 */
const defaultRandomSource: RandomSource = () => Math.random();

/**
 * HTTP status codes that are generally retryable due to transient conditions.
 */
const RETRYABLE_STATUS_CODES = new Set([
  429, // Too Many Requests
  500, // Internal Server Error
  502, // Bad Gateway
  503, // Service Unavailable
  504, // Gateway Timeout
]);

/**
 * HTTP status codes that are permanent client errors and should not be retried.
 */
const NON_RETRYABLE_STATUS_CODES = new Set([
  400, // Bad Request
  401, // Unauthorized
  403, // Forbidden
  404, // Not Found
  405, // Method Not Allowed
  406, // Not Acceptable
  409, // Conflict
  410, // Gone
  411, // Length Required
  412, // Precondition Failed
  413, // Payload Too Large
  414, // URI Too Long
  415, // Unsupported Media Type
  416, // Range Not Satisfiable
  417, // Expectation Failed
  418, // I'm a teapot
  421, // Misdirected Request
  422, // Unprocessable Entity
  423, // Locked
  424, // Failed Dependency
  425, // Too Early
  426, // Upgrade Required
  428, // Precondition Required
  431, // Request Header Fields Too Large
  451, // Unavailable For Legal Reasons
]);

/**
 * A standalone retry policy module for calculating backoff delays and classifying retryable outcomes.
 * This module does not execute actual retries or timers - it only provides the decision logic.
 */
export class RetryPolicy {
  private readonly options: RetryPolicyOptions;
  private readonly randomSource: RandomSource;

  /**
   * Creates a new RetryPolicy instance.
   * 
   * @param options - Configuration for retry behavior
   * @param randomSource - Optional random number generator for deterministic testing
   * @throws {InvalidRetryConfigError} If configuration is invalid
   */
  constructor(options: RetryPolicyOptions, randomSource: RandomSource = defaultRandomSource) {
    this.options = this.validateOptions(options);
    this.randomSource = randomSource;
  }

  /**
   * Validates retry policy configuration.
   * 
   * @param options - Configuration to validate
   * @returns Validated options
   * @throws {InvalidRetryConfigError} If configuration is invalid
   */
  private validateOptions(options: RetryPolicyOptions): RetryPolicyOptions {
    const { maxAttempts, initialDelayMs, maxDelayMs, multiplier, jitterRatio } = options;

    if (!Number.isInteger(maxAttempts) || maxAttempts < 1) {
      throw new InvalidRetryConfigError(
        `maxAttempts must be a positive integer, got ${maxAttempts}`
      );
    }

    if (!Number.isFinite(initialDelayMs) || initialDelayMs < 0) {
      throw new InvalidRetryConfigError(
        `initialDelayMs must be a non-negative number, got ${initialDelayMs}`
      );
    }

    if (!Number.isFinite(maxDelayMs) || maxDelayMs < initialDelayMs) {
      throw new InvalidRetryConfigError(
        `maxDelayMs must be >= initialDelayMs, got ${maxDelayMs} < ${initialDelayMs}`
      );
    }

    if (!Number.isFinite(multiplier) || multiplier < 1) {
      throw new InvalidRetryConfigError(
        `multiplier must be >= 1, got ${multiplier}`
      );
    }

    if (jitterRatio !== undefined) {
      if (!Number.isFinite(jitterRatio) || jitterRatio < 0 || jitterRatio > 1) {
        throw new InvalidRetryConfigError(
          `jitterRatio must be between 0 and 1, got ${jitterRatio}`
        );
      }
    }

    return options;
  }

  /**
   * Calculates the backoff delay for a given attempt number.
   * Uses exponential backoff with optional jitter.
   * 
   * @param attemptNumber - The attempt number (1-based, where 1 is the first retry)
   * @returns Delay in milliseconds
   * @throws {InvalidAttemptError} If attemptNumber is invalid
   */
  calculateDelay(attemptNumber: number): number {
    if (!Number.isInteger(attemptNumber) || attemptNumber < 1) {
      throw new InvalidAttemptError(
        `attemptNumber must be a positive integer, got ${attemptNumber}`
      );
    }

    // Calculate exponential backoff: initialDelay * multiplier^(attemptNumber - 1)
    const exponentialDelay = this.options.initialDelayMs * Math.pow(
      this.options.multiplier,
      attemptNumber - 1
    );

    // Cap at maxDelayMs
    const cappedDelay = Math.min(exponentialDelay, this.options.maxDelayMs);

    // Apply jitter if configured
    if (this.options.jitterRatio !== undefined && this.options.jitterRatio > 0) {
      const jitterRange = cappedDelay * this.options.jitterRatio;
      const jitterOffset = this.randomSource() * jitterRange;
      return Math.floor(cappedDelay - jitterRange / 2 + jitterOffset);
    }

    return Math.floor(cappedDelay);
  }

  /**
   * Determines whether an HTTP status code should be retried.
   * 
   * @param statusCode - HTTP status code
   * @param override - Optional override to force retry decision
   * @returns Retry decision with reason
   */
  classifyStatus(statusCode: number, override?: boolean): RetryDecision {
    if (override !== undefined) {
      return override
        ? { shouldRetry: true, reason: 'Explicit override' }
        : { shouldRetry: false, reason: 'Explicit override' };
    }

    if (RETRYABLE_STATUS_CODES.has(statusCode)) {
      const reasons: Record<number, string> = {
        429: 'Rate limited (Too Many Requests)',
        500: 'Internal Server Error',
        502: 'Bad Gateway',
        503: 'Service Unavailable',
        504: 'Gateway Timeout',
      };
      return { shouldRetry: true, reason: reasons[statusCode] || 'Transient server error' };
    }

    if (NON_RETRYABLE_STATUS_CODES.has(statusCode)) {
      return { shouldRetry: false, reason: 'Permanent client error' };
    }

    // For other 4xx codes not explicitly listed, treat as non-retryable
    if (statusCode >= 400 && statusCode < 500) {
      return { shouldRetry: false, reason: 'Client error' };
    }

    // For other 5xx codes not explicitly listed, treat as retryable
    if (statusCode >= 500 && statusCode < 600) {
      return { shouldRetry: true, reason: 'Server error' };
    }

    // For 1xx, 2xx, 3xx, treat as non-retryable (these are success or informational)
    return { shouldRetry: false, reason: 'Non-error status' };
  }

  /**
   * Determines whether an error should be retried based on error category.
   * 
   * @param error - The error to classify
   * @param override - Optional override to force retry decision
   * @returns Retry decision with reason
   */
  classifyError(error: Error, override?: boolean): RetryDecision {
    if (override !== undefined) {
      return override
        ? { shouldRetry: true, reason: 'Explicit override' }
        : { shouldRetry: false, reason: 'Explicit override' };
    }

    // Network-related errors that might be transient
    if (error.name === 'NetworkError' || error.name === 'TimeoutError') {
      return { shouldRetry: true, reason: 'Network error' };
    }

    // Default to non-retryable for unknown errors
    return { shouldRetry: false, reason: 'Unknown error type' };
  }

  /**
   * Calculates the effective delay considering a Retry-After header value.
   * 
   * @param retryAfterValue - The Retry-After header value (can be seconds as number or HTTP-date as string)
   * @returns Delay in milliseconds, or null if the value is invalid
   */
  parseRetryAfter(retryAfterValue: number | string): number | null {
    // If it's a number, treat it as seconds
    if (typeof retryAfterValue === 'number') {
      if (!Number.isFinite(retryAfterValue) || retryAfterValue < 0) {
        return null;
      }
      return Math.floor(retryAfterValue * 1000);
    }

    // If it's a string, try to parse as HTTP-date
    if (typeof retryAfterValue === 'string') {
      const date = new Date(retryAfterValue);
      if (Number.isNaN(date.getTime())) {
        return null;
      }
      const delay = date.getTime() - Date.now();
      return delay > 0 ? Math.floor(delay) : null;
    }

    return null;
  }

  /**
   * Gets the maximum configured attempts.
   */
  getMaxAttempts(): number {
    return this.options.maxAttempts;
  }

  /**
   * Gets the retry policy options.
   */
  getOptions(): Readonly<RetryPolicyOptions> {
    return { ...this.options };
  }
}
