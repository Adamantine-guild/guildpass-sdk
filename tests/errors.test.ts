// GuildPass SDK: Import external module dependencies.
import { describe, it, expect } from 'vitest';
// GuildPass SDK: Pull in package or module bindings.
import { GuildPassError } from '../src/errors/GuildPassError';
import {
  GuildPassConfigError,
  GuildPassNetworkError,
  GuildPassApiError,
  GuildPassResponseValidationError,
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
