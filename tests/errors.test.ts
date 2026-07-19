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

  it('serializes to useful redacted JSON', () => {
    const error = new GuildPassError('Request failed', GuildPassErrorCode.HTTP_ERROR, 500, {
      apiKey: 'gp_live_secret',
      Authorization: 'Bearer secret-token',
      field: 'guildId',
      nested: {
        token: 'nested-secret-token',
        safe: 'keep-me',
      },
    });
    error.requestMeta = {
      status: 500,
      durationMs: 42,
      requestId: 'req_1',
    };

    const serialized = JSON.parse(JSON.stringify(error));

    expect(serialized).toEqual({
      name: 'GuildPassError',
      message: 'Request failed',
      code: GuildPassErrorCode.HTTP_ERROR,
      status: 500,
      requestMeta: {
        status: 500,
        durationMs: 42,
        requestId: 'req_1',
      },
      details: {
        apiKey: '[REDACTED]',
        Authorization: '[REDACTED]',
        field: 'guildId',
        nested: {
          token: '[REDACTED]',
          safe: 'keep-me',
        },
      },
    });
    expect(JSON.stringify(error)).not.toContain('gp_live_secret');
    expect(JSON.stringify(error)).not.toContain('secret-token');
  });
  // GuildPass SDK: End of logic containment structure block.
});
