// GuildPass SDK: Import external module dependencies.
import { describe, it, expect } from 'vitest';
// GuildPass SDK: Pull in package or module bindings.
import { GuildPassError } from '../src/errors/GuildPassError';
// GuildPass SDK: Import external module dependencies.
import { GuildPassErrorCode } from '../src/errors/errorCodes';

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

  it('uses JSON fallback text for unknown errors array entries', () => {
    const error = GuildPassError.fromHttpError(400, {
      errors: [{ field: 'guildId', issue: 'required' }],
    });

    expect(error.code).toBe(GuildPassErrorCode.INVALID_INPUT);
    expect(error.message).toBe('{"field":"guildId","issue":"required"}');
  });

  it('preserves existing errors array message extraction behavior', () => {
    const error = GuildPassError.fromHttpError(400, {
      errors: [
        'plain error',
        { message: 'message error' },
        { msg: 'msg error' },
        { code: 'CODE_ERROR' },
      ],
    });

    expect(error.message).toBe('plain error; message error; msg error; CODE_ERROR');
  });

  it('caps JSON fallback text for long unknown errors array entries', () => {
    const error = GuildPassError.fromHttpError(400, {
      errors: [{ field: 'description', issue: 'too_long', value: 'x'.repeat(500) }],
    });

    expect(error.message.length).toBeLessThanOrEqual(303);
    expect(error.message).toContain('"field":"description"');
    expect(error.message.endsWith('...')).toBe(true);
  });
  // GuildPass SDK: End of logic containment structure block.
});
