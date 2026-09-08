import { describe, expect, it } from 'vitest';
import { RetryPolicy } from '../src/retry/RetryPolicy.js';
import { InvalidAttemptError, InvalidRetryConfigError, type RandomSource } from '../src/retry/types.js';

describe('RetryPolicy', () => {
  describe('configuration validation', () => {
    it('accepts valid configuration', () => {
      const policy = new RetryPolicy({
        maxAttempts: 3,
        initialDelayMs: 100,
        maxDelayMs: 10000,
        multiplier: 2,
      });
      expect(policy.getMaxAttempts()).toBe(3);
    });

    it('rejects maxAttempts less than 1', () => {
      expect(() => new RetryPolicy({
        maxAttempts: 0,
        initialDelayMs: 100,
        maxDelayMs: 10000,
        multiplier: 2,
      })).toThrow(InvalidRetryConfigError);
    });

    it('rejects non-integer maxAttempts', () => {
      expect(() => new RetryPolicy({
        maxAttempts: 2.5,
        initialDelayMs: 100,
        maxDelayMs: 10000,
        multiplier: 2,
      })).toThrow(InvalidRetryConfigError);
    });

    it('rejects negative initialDelayMs', () => {
      expect(() => new RetryPolicy({
        maxAttempts: 3,
        initialDelayMs: -100,
        maxDelayMs: 10000,
        multiplier: 2,
      })).toThrow(InvalidRetryConfigError);
    });

    it('rejects maxDelayMs less than initialDelayMs', () => {
      expect(() => new RetryPolicy({
        maxAttempts: 3,
        initialDelayMs: 1000,
        maxDelayMs: 100,
        multiplier: 2,
      })).toThrow(InvalidRetryConfigError);
    });

    it('rejects multiplier less than 1', () => {
      expect(() => new RetryPolicy({
        maxAttempts: 3,
        initialDelayMs: 100,
        maxDelayMs: 10000,
        multiplier: 0.5,
      })).toThrow(InvalidRetryConfigError);
    });

    it('rejects jitterRatio outside [0, 1]', () => {
      expect(() => new RetryPolicy({
        maxAttempts: 3,
        initialDelayMs: 100,
        maxDelayMs: 10000,
        multiplier: 2,
        jitterRatio: 1.5,
      })).toThrow(InvalidRetryConfigError);
    });

    it('rejects negative jitterRatio', () => {
      expect(() => new RetryPolicy({
        maxAttempts: 3,
        initialDelayMs: 100,
        maxDelayMs: 10000,
        multiplier: 2,
        jitterRatio: -0.1,
      })).toThrow(InvalidRetryConfigError);
    });

    it('accepts jitterRatio of 0', () => {
      const policy = new RetryPolicy({
        maxAttempts: 3,
        initialDelayMs: 100,
        maxDelayMs: 10000,
        multiplier: 2,
        jitterRatio: 0,
      });
      expect(policy.getMaxAttempts()).toBe(3);
    });

    it('accepts jitterRatio of 1', () => {
      const policy = new RetryPolicy({
        maxAttempts: 3,
        initialDelayMs: 100,
        maxDelayMs: 10000,
        multiplier: 2,
        jitterRatio: 1,
      });
      expect(policy.getMaxAttempts()).toBe(3);
    });
  });

  describe('calculateDelay', () => {
    it('calculates first retry delay correctly', () => {
      const policy = new RetryPolicy({
        maxAttempts: 3,
        initialDelayMs: 100,
        maxDelayMs: 10000,
        multiplier: 2,
      });
      expect(policy.calculateDelay(1)).toBe(100);
    });

    it('calculates exponential backoff correctly', () => {
      const policy = new RetryPolicy({
        maxAttempts: 5,
        initialDelayMs: 100,
        maxDelayMs: 10000,
        multiplier: 2,
      });
      expect(policy.calculateDelay(1)).toBe(100); // 100 * 2^0
      expect(policy.calculateDelay(2)).toBe(200); // 100 * 2^1
      expect(policy.calculateDelay(3)).toBe(400); // 100 * 2^2
      expect(policy.calculateDelay(4)).toBe(800); // 100 * 2^3
    });

    it('caps delay at maxDelayMs', () => {
      const policy = new RetryPolicy({
        maxAttempts: 10,
        initialDelayMs: 100,
        maxDelayMs: 500,
        multiplier: 2,
      });
      expect(policy.calculateDelay(1)).toBe(100);
      expect(policy.calculateDelay(2)).toBe(200);
      expect(policy.calculateDelay(3)).toBe(400);
      expect(policy.calculateDelay(4)).toBe(500); // Would be 800, capped at 500
      expect(policy.calculateDelay(5)).toBe(500); // Would be 1600, capped at 500
    });

    it('rejects invalid attempt numbers', () => {
      const policy = new RetryPolicy({
        maxAttempts: 3,
        initialDelayMs: 100,
        maxDelayMs: 10000,
        multiplier: 2,
      });
      expect(() => policy.calculateDelay(0)).toThrow(InvalidAttemptError);
      expect(() => policy.calculateDelay(-1)).toThrow(InvalidAttemptError);
      expect(() => policy.calculateDelay(1.5)).toThrow(InvalidAttemptError);
    });

    it('handles multiplier of 1 (no exponential increase)', () => {
      const policy = new RetryPolicy({
        maxAttempts: 5,
        initialDelayMs: 100,
        maxDelayMs: 10000,
        multiplier: 1,
      });
      expect(policy.calculateDelay(1)).toBe(100);
      expect(policy.calculateDelay(2)).toBe(100);
      expect(policy.calculateDelay(3)).toBe(100);
    });

    it('handles multiplier greater than 1', () => {
      const policy = new RetryPolicy({
        maxAttempts: 5,
        initialDelayMs: 100,
        maxDelayMs: 10000,
        multiplier: 3,
      });
      expect(policy.calculateDelay(1)).toBe(100); // 100 * 3^0
      expect(policy.calculateDelay(2)).toBe(300); // 100 * 3^1
      expect(policy.calculateDelay(3)).toBe(900); // 100 * 3^2
    });
  });

  describe('jitter', () => {
    it('applies jitter when configured', () => {
      // Deterministic random source that returns 0.5 (middle of range)
      const deterministicRandom: RandomSource = () => 0.5;
      
      const policy = new RetryPolicy({
        maxAttempts: 3,
        initialDelayMs: 100,
        maxDelayMs: 10000,
        multiplier: 2,
        jitterRatio: 0.5,
      }, deterministicRandom);

      // With jitterRatio 0.5 and random 0.5:
      // jitterRange = 100 * 0.5 = 50
      // jitterOffset = 0.5 * 50 = 25
      // result = 100 - 25 + 25 = 100 (centered)
      expect(policy.calculateDelay(1)).toBe(100);
    });

    it('jitter produces deterministic results with fixed random source', () => {
      const deterministicRandom: RandomSource = () => 0.25;
      
      const policy = new RetryPolicy({
        maxAttempts: 3,
        initialDelayMs: 100,
        maxDelayMs: 10000,
        multiplier: 2,
        jitterRatio: 0.5,
      }, deterministicRandom);

      // With jitterRatio 0.5 and random 0.25:
      // jitterRange = 100 * 0.5 = 50
      // jitterOffset = 0.25 * 50 = 12.5
      // result = 100 - 25 + 12.5 = 87.5 -> floor to 87
      expect(policy.calculateDelay(1)).toBe(87);
    });

    it('jitter remains within bounds', () => {
      // Test with minimum random value (0)
      const minRandom: RandomSource = () => 0;
      const policyMin = new RetryPolicy({
        maxAttempts: 3,
        initialDelayMs: 100,
        maxDelayMs: 10000,
        multiplier: 2,
        jitterRatio: 0.5,
      }, minRandom);

      // jitterRange = 100 * 0.5 = 50
      // jitterOffset = 0 * 50 = 0
      // result = 100 - 25 + 0 = 75
      expect(policyMin.calculateDelay(1)).toBe(75);

      // Test with maximum random value (close to 1)
      const maxRandom: RandomSource = () => 0.999999;
      const policyMax = new RetryPolicy({
        maxAttempts: 3,
        initialDelayMs: 100,
        maxDelayMs: 10000,
        multiplier: 2,
        jitterRatio: 0.5,
      }, maxRandom);

      // jitterRange = 100 * 0.5 = 50
      // jitterOffset = 0.999999 * 50 ≈ 50
      // result = 100 - 25 + 50 = 125 (capped by floor)
      expect(policyMax.calculateDelay(1)).toBeGreaterThanOrEqual(75);
      expect(policyMax.calculateDelay(1)).toBeLessThanOrEqual(125);
    });

    it('does not apply jitter when not configured', () => {
      const policy = new RetryPolicy({
        maxAttempts: 3,
        initialDelayMs: 100,
        maxDelayMs: 10000,
        multiplier: 2,
      });
      expect(policy.calculateDelay(1)).toBe(100);
      expect(policy.calculateDelay(2)).toBe(200);
    });

    it('does not apply jitter when jitterRatio is 0', () => {
      const policy = new RetryPolicy({
        maxAttempts: 3,
        initialDelayMs: 100,
        maxDelayMs: 10000,
        multiplier: 2,
        jitterRatio: 0,
      });
      expect(policy.calculateDelay(1)).toBe(100);
      expect(policy.calculateDelay(2)).toBe(200);
    });
  });

  describe('classifyStatus', () => {
    it('classifies 429 as retryable', () => {
      const policy = new RetryPolicy({
        maxAttempts: 3,
        initialDelayMs: 100,
        maxDelayMs: 10000,
        multiplier: 2,
      });
      const decision = policy.classifyStatus(429);
      expect(decision.shouldRetry).toBe(true);
      expect(decision.reason).toBe('Rate limited (Too Many Requests)');
    });

    it('classifies 500 as retryable', () => {
      const policy = new RetryPolicy({
        maxAttempts: 3,
        initialDelayMs: 100,
        maxDelayMs: 10000,
        multiplier: 2,
      });
      const decision = policy.classifyStatus(500);
      expect(decision.shouldRetry).toBe(true);
      expect(decision.reason).toBe('Internal Server Error');
    });

    it('classifies 502 as retryable', () => {
      const policy = new RetryPolicy({
        maxAttempts: 3,
        initialDelayMs: 100,
        maxDelayMs: 10000,
        multiplier: 2,
      });
      const decision = policy.classifyStatus(502);
      expect(decision.shouldRetry).toBe(true);
      expect(decision.reason).toBe('Bad Gateway');
    });

    it('classifies 503 as retryable', () => {
      const policy = new RetryPolicy({
        maxAttempts: 3,
        initialDelayMs: 100,
        maxDelayMs: 10000,
        multiplier: 2,
      });
      const decision = policy.classifyStatus(503);
      expect(decision.shouldRetry).toBe(true);
      expect(decision.reason).toBe('Service Unavailable');
    });

    it('classifies 504 as retryable', () => {
      const policy = new RetryPolicy({
        maxAttempts: 3,
        initialDelayMs: 100,
        maxDelayMs: 10000,
        multiplier: 2,
      });
      const decision = policy.classifyStatus(504);
      expect(decision.shouldRetry).toBe(true);
      expect(decision.reason).toBe('Gateway Timeout');
    });

    it('classifies 400 as non-retryable', () => {
      const policy = new RetryPolicy({
        maxAttempts: 3,
        initialDelayMs: 100,
        maxDelayMs: 10000,
        multiplier: 2,
      });
      const decision = policy.classifyStatus(400);
      expect(decision.shouldRetry).toBe(false);
      expect(decision.reason).toBe('Permanent client error');
    });

    it('classifies 401 as non-retryable', () => {
      const policy = new RetryPolicy({
        maxAttempts: 3,
        initialDelayMs: 100,
        maxDelayMs: 10000,
        multiplier: 2,
      });
      const decision = policy.classifyStatus(401);
      expect(decision.shouldRetry).toBe(false);
      expect(decision.reason).toBe('Permanent client error');
    });

    it('classifies 403 as non-retryable', () => {
      const policy = new RetryPolicy({
        maxAttempts: 3,
        initialDelayMs: 100,
        maxDelayMs: 10000,
        multiplier: 2,
      });
      const decision = policy.classifyStatus(403);
      expect(decision.shouldRetry).toBe(false);
      expect(decision.reason).toBe('Permanent client error');
    });

    it('classifies 404 as non-retryable', () => {
      const policy = new RetryPolicy({
        maxAttempts: 3,
        initialDelayMs: 100,
        maxDelayMs: 10000,
        multiplier: 2,
      });
      const decision = policy.classifyStatus(404);
      expect(decision.shouldRetry).toBe(false);
      expect(decision.reason).toBe('Permanent client error');
    });

    it('classifies other 4xx as non-retryable', () => {
      const policy = new RetryPolicy({
        maxAttempts: 3,
        initialDelayMs: 100,
        maxDelayMs: 10000,
        multiplier: 2,
      });
      const decision = policy.classifyStatus(418);
      expect(decision.shouldRetry).toBe(false);
      expect(decision.reason).toBe('Permanent client error');
    });

    it('classifies other 5xx as retryable', () => {
      const policy = new RetryPolicy({
        maxAttempts: 3,
        initialDelayMs: 100,
        maxDelayMs: 10000,
        multiplier: 2,
      });
      const decision = policy.classifyStatus(507);
      expect(decision.shouldRetry).toBe(true);
      expect(decision.reason).toBe('Server error');
    });

    it('classifies 2xx as non-retryable', () => {
      const policy = new RetryPolicy({
        maxAttempts: 3,
        initialDelayMs: 100,
        maxDelayMs: 10000,
        multiplier: 2,
      });
      const decision = policy.classifyStatus(200);
      expect(decision.shouldRetry).toBe(false);
      expect(decision.reason).toBe('Non-error status');
    });

    it('classifies 3xx as non-retryable', () => {
      const policy = new RetryPolicy({
        maxAttempts: 3,
        initialDelayMs: 100,
        maxDelayMs: 10000,
        multiplier: 2,
      });
      const decision = policy.classifyStatus(301);
      expect(decision.shouldRetry).toBe(false);
      expect(decision.reason).toBe('Non-error status');
    });

    it('respects override to force retry', () => {
      const policy = new RetryPolicy({
        maxAttempts: 3,
        initialDelayMs: 100,
        maxDelayMs: 10000,
        multiplier: 2,
      });
      const decision = policy.classifyStatus(404, true);
      expect(decision.shouldRetry).toBe(true);
      expect(decision.reason).toBe('Explicit override');
    });

    it('respects override to force no retry', () => {
      const policy = new RetryPolicy({
        maxAttempts: 3,
        initialDelayMs: 100,
        maxDelayMs: 10000,
        multiplier: 2,
      });
      const decision = policy.classifyStatus(500, false);
      expect(decision.shouldRetry).toBe(false);
      expect(decision.reason).toBe('Explicit override');
    });
  });

  describe('classifyError', () => {
    it('classifies NetworkError as retryable', () => {
      const policy = new RetryPolicy({
        maxAttempts: 3,
        initialDelayMs: 100,
        maxDelayMs: 10000,
        multiplier: 2,
      });
      const error = new Error('Network failure');
      error.name = 'NetworkError';
      const decision = policy.classifyError(error);
      expect(decision.shouldRetry).toBe(true);
      expect(decision.reason).toBe('Network error');
    });

    it('classifies TimeoutError as retryable', () => {
      const policy = new RetryPolicy({
        maxAttempts: 3,
        initialDelayMs: 100,
        maxDelayMs: 10000,
        multiplier: 2,
      });
      const error = new Error('Request timeout');
      error.name = 'TimeoutError';
      const decision = policy.classifyError(error);
      expect(decision.shouldRetry).toBe(true);
      expect(decision.reason).toBe('Network error');
    });

    it('classifies unknown errors as non-retryable', () => {
      const policy = new RetryPolicy({
        maxAttempts: 3,
        initialDelayMs: 100,
        maxDelayMs: 10000,
        multiplier: 2,
      });
      const error = new Error('Some error');
      const decision = policy.classifyError(error);
      expect(decision.shouldRetry).toBe(false);
      expect(decision.reason).toBe('Unknown error type');
    });

    it('respects override to force retry', () => {
      const policy = new RetryPolicy({
        maxAttempts: 3,
        initialDelayMs: 100,
        maxDelayMs: 10000,
        multiplier: 2,
      });
      const error = new Error('Some error');
      const decision = policy.classifyError(error, true);
      expect(decision.shouldRetry).toBe(true);
      expect(decision.reason).toBe('Explicit override');
    });

    it('respects override to force no retry', () => {
      const policy = new RetryPolicy({
        maxAttempts: 3,
        initialDelayMs: 100,
        maxDelayMs: 10000,
        multiplier: 2,
      });
      const error = new Error('Network failure');
      error.name = 'NetworkError';
      const decision = policy.classifyError(error, false);
      expect(decision.shouldRetry).toBe(false);
      expect(decision.reason).toBe('Explicit override');
    });
  });

  describe('parseRetryAfter', () => {
    it('parses numeric retry-after as seconds', () => {
      const policy = new RetryPolicy({
        maxAttempts: 3,
        initialDelayMs: 100,
        maxDelayMs: 10000,
        multiplier: 2,
      });
      expect(policy.parseRetryAfter(5)).toBe(5000);
      expect(policy.parseRetryAfter(0)).toBe(0);
    });

    it('parses HTTP-date format', () => {
      const policy = new RetryPolicy({
        maxAttempts: 3,
        initialDelayMs: 100,
        maxDelayMs: 10000,
        multiplier: 2,
      });
      
      // Create a date 5 seconds in the future
      const futureDate = new Date(Date.now() + 5000);
      const delay = policy.parseRetryAfter(futureDate.toUTCString());
      
      // Allow some tolerance for test execution time
      expect(delay).toBeGreaterThanOrEqual(4000);
      expect(delay).toBeLessThanOrEqual(6000);
    });

    it('returns null for invalid numeric values', () => {
      const policy = new RetryPolicy({
        maxAttempts: 3,
        initialDelayMs: 100,
        maxDelayMs: 10000,
        multiplier: 2,
      });
      expect(policy.parseRetryAfter(-1)).toBeNull();
      expect(policy.parseRetryAfter(NaN)).toBeNull();
      expect(policy.parseRetryAfter(Infinity)).toBeNull();
    });

    it('returns null for invalid date strings', () => {
      const policy = new RetryPolicy({
        maxAttempts: 3,
        initialDelayMs: 100,
        maxDelayMs: 10000,
        multiplier: 2,
      });
      expect(policy.parseRetryAfter('invalid date')).toBeNull();
    });

    it('returns null for past dates', () => {
      const policy = new RetryPolicy({
        maxAttempts: 3,
        initialDelayMs: 100,
        maxDelayMs: 10000,
        multiplier: 2,
      });
      const pastDate = new Date(Date.now() - 5000);
      expect(policy.parseRetryAfter(pastDate.toUTCString())).toBeNull();
    });

    it('returns null for non-string, non-number input', () => {
      const policy = new RetryPolicy({
        maxAttempts: 3,
        initialDelayMs: 100,
        maxDelayMs: 10000,
        multiplier: 2,
      });
      expect(policy.parseRetryAfter(null as any)).toBeNull();
      expect(policy.parseRetryAfter(undefined as any)).toBeNull();
      expect(policy.parseRetryAfter({} as any)).toBeNull();
    });
  });

  describe('getOptions', () => {
    it('returns a copy of options', () => {
      const options = {
        maxAttempts: 3,
        initialDelayMs: 100,
        maxDelayMs: 10000,
        multiplier: 2,
        jitterRatio: 0.5,
      };
      const policy = new RetryPolicy(options);
      const retrievedOptions = policy.getOptions();
      
      expect(retrievedOptions).toEqual(options);
      expect(retrievedOptions).not.toBe(options); // Different reference
    });
  });
});
