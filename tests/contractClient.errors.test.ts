import { describe, it, expect, vi } from 'vitest';

// `ethers` is an optional peer dependency not installed in this workspace;
// stub it so importing contractClient (which transitively pulls in
// contractHelpers) doesn't fail module resolution for this pure-function test.
vi.mock('ethers', () => ({ ethers: {} }));

import { formatUnits } from '../src/contracts/contractClient';
import { GuildPassConfigError } from '../src/errors/errorTypes';
import { GuildPassErrorCode } from '../src/errors/errorCodes';

describe('contracts module: formatUnits validation errors', () => {
  it('throws a GuildPassConfigError instance for negative decimals', () => {
    expect(() => formatUnits('100', -1)).toThrow(GuildPassConfigError);
  });

  it('carries the INVALID_INPUT code for a malformed value string', () => {
    expect(() => formatUnits('not-a-number', 2)).toThrowError(
      expect.objectContaining({ code: GuildPassErrorCode.INVALID_INPUT }),
    );
  });
});
