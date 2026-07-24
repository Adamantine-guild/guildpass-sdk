// GuildPass SDK: Import external module dependencies.
import { describe, it, expect } from 'vitest';
// GuildPass SDK: Pull in package or module bindings.
import { GuildPassError } from '../src/errors/GuildPassError';
import {
  GuildPassConfigError,
  GuildPassNetworkError,
  GuildPassApiError,
  GuildPassResponseValidationError,
  GuildPassAuthenticationError,
  GuildPassAuthorizationError,
  GuildPassValidationError,
  GuildPassRateLimitError,
  GuildPassServerError,
  GuildPassTimeoutError,
} from '../src/errors/errorTypes';
// GuildPass SDK: Import external module dependencies.
import { GuildPassErrorCode } from '../src/errors/errorCodes';
import { isGuildPassError } from '../src/errors/guards';

// GuildPass SDK: Validate unit assertion test case.
describe('GuildPassError', () => {
  // GuildPass SDK: Test suite container block.
  it('should create an error with correct properties', () => {
    // GuildPass SDK: Define internal reference identifier.
    const error = new GuildPassError('Test error', GuildPassErrorCode.INVALID_INPUT, 400, {
      foo: 'bar',
    });

    expect(error.message).toBe('Test error');
    expect(error.code).toBe(GuildPassErrorCode.INVALID_INPUT);
    expect(error.status).toBe(400);
    expect(error.details).toEqual({ foo: 'bar' });
    expect(error.name).toBe('GuildPassError');
    // GuildPass SDK: End of logic containment structure block.
  });

  // GuildPass SDK: Validate unit assertion test case.
  it('should create from HTTP error status', () => {
    // GuildPass SDK: Variable binding initialization.
    const error404 = GuildPassError.fromHttpError(404);
    expect(error404.code).toBe(GuildPassErrorCode.NOT_FOUND);

    // GuildPass SDK: Local block-scoped constant reference.
    const error401 = GuildPassError.fromHttpError(401);
    expect(error401.code).toBe(GuildPassErrorCode.UNAUTHORISED);

    // GuildPass SDK: Define internal reference identifier.
    const error500 = GuildPassError.fromHttpError(500);
    expect(error500.code).toBe(GuildPassErrorCode.SERVER_ERROR);
    // GuildPass SDK: End of logic containment structure block.
  });
  // GuildPass SDK: End of logic containment structure block.
});

describe('GuildPassError subclass hierarchy', () => {
  it('every subclass is instanceof both itself and the GuildPassError base', () => {
    const config = new GuildPassConfigError('bad config', GuildPassErrorCode.INVALID_CONFIG);
    const network = new GuildPassNetworkError('no response', GuildPassErrorCode.TIMEOUT);
    const api = new GuildPassApiError('server said no', GuildPassErrorCode.SERVER_ERROR, 503);
    const validation = new GuildPassResponseValidationError('bad shape', GuildPassErrorCode.INVALID_RESPONSE);

    expect(config).toBeInstanceOf(GuildPassConfigError);
    expect(config).toBeInstanceOf(GuildPassError);
    expect(network).toBeInstanceOf(GuildPassNetworkError);
    expect(network).toBeInstanceOf(GuildPassError);
    expect(api).toBeInstanceOf(GuildPassApiError);
    expect(api).toBeInstanceOf(GuildPassError);
    expect(validation).toBeInstanceOf(GuildPassResponseValidationError);
    expect(validation).toBeInstanceOf(GuildPassError);
  });

  it('distinguishes subclasses from each other via instanceof', () => {
    const config = new GuildPassConfigError('bad config');
    // A caller can now tell "misconfigured" apart from "server responded 5xx"
    // without string-matching messages.
    expect(config).not.toBeInstanceOf(GuildPassApiError);
    expect(config).not.toBeInstanceOf(GuildPassNetworkError);
  });

  it('GuildPassNetworkError never carries a status code', () => {
    const network = new GuildPassNetworkError('connection refused', GuildPassErrorCode.HTTP_ERROR);
    expect(network.status).toBeUndefined();
  });

  it('GuildPassApiError.fromHttpError carries the response status', () => {
    const notFound = GuildPassApiError.fromHttpError(404);
    expect(notFound).toBeInstanceOf(GuildPassApiError);
    expect(notFound.status).toBe(404);
    expect(notFound.code).toBe(GuildPassErrorCode.NOT_FOUND);
  });

  it('fromHttpError returns a specialized subclass per status', () => {
    expect(GuildPassApiError.fromHttpError(401)).toBeInstanceOf(GuildPassAuthenticationError);
    expect(GuildPassApiError.fromHttpError(403)).toBeInstanceOf(GuildPassAuthorizationError);
    expect(GuildPassApiError.fromHttpError(400)).toBeInstanceOf(GuildPassValidationError);
    expect(GuildPassApiError.fromHttpError(422)).toBeInstanceOf(GuildPassValidationError);
    expect(GuildPassApiError.fromHttpError(429)).toBeInstanceOf(GuildPassRateLimitError);
    expect(GuildPassApiError.fromHttpError(500)).toBeInstanceOf(GuildPassServerError);
    expect(GuildPassApiError.fromHttpError(503)).toBeInstanceOf(GuildPassServerError);
    expect(GuildPassApiError.fromHttpError(404)).toBeInstanceOf(GuildPassApiError);
    expect(GuildPassApiError.fromHttpError(404)).not.toBeInstanceOf(GuildPassServerError);
  });

  it('specialized subclasses stay backward compatible with existing matching', () => {
    const auth = GuildPassApiError.fromHttpError(401);
    expect(auth).toBeInstanceOf(GuildPassApiError);
    expect(auth).toBeInstanceOf(GuildPassError);
    expect(auth.code).toBe(GuildPassErrorCode.UNAUTHORISED);
    expect(auth.status).toBe(401);

    const forbidden = GuildPassApiError.fromHttpError(403);
    expect(forbidden.code).toBe(GuildPassErrorCode.UNAUTHORISED);
    expect(forbidden.status).toBe(403);

    const server = GuildPassApiError.fromHttpError(502);
    expect(server.code).toBe(GuildPassErrorCode.SERVER_ERROR);
    expect(server.status).toBe(502);

    const rateLimited = GuildPassApiError.fromHttpError(429);
    expect(rateLimited.code).toBe(GuildPassErrorCode.RATE_LIMITED);
    expect(rateLimited.status).toBe(429);
  });

  it('401 and 403 are distinguishable via instanceof', () => {
    const auth = GuildPassApiError.fromHttpError(401);
    const forbidden = GuildPassApiError.fromHttpError(403);
    expect(auth).not.toBeInstanceOf(GuildPassAuthorizationError);
    expect(forbidden).not.toBeInstanceOf(GuildPassAuthenticationError);
  });

  it('GuildPassRateLimitError carries the Retry-After delay when provided', () => {
    const withRetry = GuildPassApiError.fromHttpError(429, undefined, { retryAfterMs: 3000 });
    expect(withRetry).toBeInstanceOf(GuildPassRateLimitError);
    expect((withRetry as GuildPassRateLimitError).retryAfterMs).toBe(3000);

    const withoutRetry = GuildPassApiError.fromHttpError(429);
    expect((withoutRetry as GuildPassRateLimitError).retryAfterMs).toBeUndefined();

    // retryAfterMs is meaningless on non-429 statuses and must not leak
    const server = GuildPassApiError.fromHttpError(500, undefined, { retryAfterMs: 1000 });
    expect((server as GuildPassRateLimitError).retryAfterMs).toBeUndefined();
  });

  it('GuildPassTimeoutError is a network error with the TIMEOUT code', () => {
    const timeout = new GuildPassTimeoutError('Request timed out after 5000ms');
    expect(timeout).toBeInstanceOf(GuildPassNetworkError);
    expect(timeout).toBeInstanceOf(GuildPassError);
    expect(timeout).not.toBeInstanceOf(GuildPassApiError);
    expect(timeout.code).toBe(GuildPassErrorCode.TIMEOUT);
    expect(timeout.status).toBeUndefined();
    expect(timeout.name).toBe('GuildPassTimeoutError');
  });
});

describe('isGuildPassError', () => {
  it('should return true for real GuildPassError instances', () => {
    const error = new GuildPassError('Test error', GuildPassErrorCode.NOT_FOUND, 404);
    expect(isGuildPassError(error)).toBe(true);
  });

  it('should return true for structurally identical plain objects', () => {
    const fakeError = {
      name: 'GuildPassError',
      code: GuildPassErrorCode.RATE_LIMITED,
      message: 'Too many requests',
    };
    expect(isGuildPassError(fakeError)).toBe(true);
  });

  it('should match subclass instances and subclass-shaped objects cross-realm', () => {
    expect(isGuildPassError(new GuildPassRateLimitError('slow down'))).toBe(true);
    expect(isGuildPassError(new GuildPassTimeoutError('timed out'))).toBe(true);
    expect(
      isGuildPassError({ name: 'GuildPassRateLimitError', code: GuildPassErrorCode.RATE_LIMITED })
    ).toBe(true);
    expect(
      isGuildPassError({ name: 'GuildPassAuthenticationError', code: GuildPassErrorCode.UNAUTHORISED })
    ).toBe(true);
    expect(
      isGuildPassError({ name: 'GuildPassRateLimitError', code: 'NOT_A_REAL_CODE' })
    ).toBe(false);
  });

  it('should return false for arbitrary errors and objects', () => {
    expect(isGuildPassError(new Error('plain error'))).toBe(false);
    expect(isGuildPassError({ name: 'GuildPassError', code: 'NOT_A_REAL_CODE' })).toBe(false);
    expect(
      isGuildPassError({ name: 'SomethingElse', code: GuildPassErrorCode.NOT_FOUND })
    ).toBe(false);
    expect(isGuildPassError(null)).toBe(false);
    expect(isGuildPassError(undefined)).toBe(false);
    expect(isGuildPassError('string error')).toBe(false);
    expect(isGuildPassError(42)).toBe(false);
  });
});
