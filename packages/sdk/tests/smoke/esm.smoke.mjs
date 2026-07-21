// Verifies that the built package can be consumed via a native ESM `import`,
// exactly as a downstream consumer would via the "import" condition in
// package.json#exports. Run after `pnpm build` (requires dist/index.mjs).
import assert from 'node:assert/strict';
import {
  GuildPassClient,
  GuildPassError,
  GuildPassErrorCode,
  normaliseAddress,
  validateAddress,
  formatIsoDate,
  DEFAULT_CONFIG,
  SUPPORTED_NETWORKS,
} from '../../dist/index.mjs';
import { GuildPassClient as ClientExport } from '../../dist/client.mjs';
import { GuildPassError as ErrorExport, GuildPassErrorCode as ErrorCodeExport } from '../../dist/errors.mjs';
import { normaliseAddress as normaliseExport } from '../../dist/utils.mjs';


function expectExport(name, value, expectedType) {
  if (typeof value !== expectedType) {
    throw new Error(
      `[smoke:esm] Expected "${name}" to be exported as a ${expectedType} from dist/index.mjs, ` +
        `got ${typeof value}. Check src/index.ts and tsup.config.ts for a missing or misconfigured export.`,
    );
  }
}

expectExport('GuildPassClient', GuildPassClient, 'function');
expectExport('GuildPassError', GuildPassError, 'function');
expectExport('GuildPassErrorCode', GuildPassErrorCode, 'object');
expectExport('normaliseAddress', normaliseAddress, 'function');
expectExport('validateAddress', validateAddress, 'function');
expectExport('formatIsoDate', formatIsoDate, 'function');
expectExport('DEFAULT_CONFIG', DEFAULT_CONFIG, 'object');
expectExport('SUPPORTED_NETWORKS', SUPPORTED_NETWORKS, 'object');

assert.equal(ClientExport, GuildPassClient, 'Subpath client export matches root export');
assert.equal(ErrorExport, GuildPassError, 'Subpath error export matches root export');
assert.equal(ErrorCodeExport, GuildPassErrorCode, 'Subpath error codes match root export');
assert.equal(normaliseExport, normaliseAddress, 'Subpath utils export matches root export');

const client = new GuildPassClient({ apiUrl: 'https://smoke-test.invalid' });
assert.equal(client.getConfig().apiUrl, 'https://smoke-test.invalid');
assert.ok(client.access, 'client.access should be initialised');
assert.ok(client.membership, 'client.membership should be initialised');
assert.ok(client.roles, 'client.roles should be initialised');
assert.ok(client.guilds, 'client.guilds should be initialised');
assert.ok(client.contracts, 'client.contracts should be initialised');
assert.equal(GuildPassErrorCode.NOT_FOUND, 'NOT_FOUND');

const error = GuildPassError.fromHttpError(404);
assert.ok(
  error instanceof GuildPassError,
  'GuildPassError.fromHttpError should return a GuildPassError',
);
assert.equal(error.code, GuildPassErrorCode.NOT_FOUND);

console.log('[smoke:esm] dist/index.mjs exports resolved and behave as expected.');
