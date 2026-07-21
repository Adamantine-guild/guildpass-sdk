// GuildPass SDK: Import external module dependencies.
import { describe, it, expect } from 'vitest';
// GuildPass SDK: Pull in package or module bindings.
import { GuildPassError } from '../src/errors/GuildPassError';
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

  it('preserves unrecognized nested error entries in HTTP error messages', () => {
    const error = GuildPassError.fromHttpError(422, {
      errors: [{ field: 'guildId', issue: 'required' }, { message: 'walletAddress is invalid' }],
    });

    expect(error.code).toBe(GuildPassErrorCode.INVALID_INPUT);
    expect(error.message).toContain('{"field":"guildId","issue":"required"}');
    expect(error.message).toContain('walletAddress is invalid');
  });

  it('caps long unrecognized nested error fallbacks in HTTP error messages', () => {
    const error = GuildPassError.fromHttpError(422, {
      errors: [{ issue: 'x'.repeat(600) }],
    });

    expect(error.message.length).toBeLessThanOrEqual(500);
    expect(error.message.endsWith('...')).toBe(true);
  });
  // GuildPass SDK: End of logic containment structure block.
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
