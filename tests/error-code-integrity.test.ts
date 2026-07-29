/**
 * Guards the integrity of `GuildPassErrorCode` itself.
 *
 * Every structured-error feature in the SDK — `isGuildPassError`, `toErrorCode`,
 * `BatchItemResult.code`, and any consumer branching on `error.code` — assumes
 * that `GuildPassErrorCode.SOMETHING` resolves to a real string at runtime.
 *
 * A TypeScript enum gives no protection against a member that was referenced
 * but never declared: `GuildPassErrorCode.MISSING` is a *compile-time* error,
 * but Vitest strips types without typechecking, so such a reference silently
 * evaluates to `undefined` at runtime. An error then ships `code: undefined`,
 * which defeats `isGuildPassError` for any error that has crossed a realm or a
 * JSON round-trip — and a test asserting `code: GuildPassErrorCode.MISSING`
 * compares `undefined` to `undefined` and passes while proving nothing.
 *
 * That is not hypothetical: `WS_CONNECTION_ERROR` was referenced at six sites
 * in `webSocketProvider.ts` and asserted in ten tests without ever being
 * declared. These tests fail loudly instead.
 */
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { GuildPassErrorCode } from '../src/errors/errorCodes';
import { GuildPassError } from '../src/errors/GuildPassError';
import { isGuildPassError } from '../src/errors/guards';

const SRC_DIR = join(__dirname, '..', 'src');

/** Every `.ts` file under src/, recursively. */
function sourceFiles(dir: string): string[] {
  return readdirSync(dir).flatMap((entry) => {
    const full = join(dir, entry);
    if (statSync(full).isDirectory()) return sourceFiles(full);
    return full.endsWith('.ts') ? [full] : [];
  });
}

/**
 * Strips block and line comments so that TSDoc prose naming a hypothetical
 * code (`GuildPassErrorCode.TYPO` as an illustration) is not mistaken for a
 * real reference. Only executable code can produce an `undefined` at runtime.
 */
function stripComments(source: string): string {
  return source.replace(/\/\*[\s\S]*?\*\//g, '').replace(/\/\/[^\n]*/g, '');
}

describe('GuildPassErrorCode integrity', () => {
  it('every member resolves to its own name as a string', () => {
    for (const [name, value] of Object.entries(GuildPassErrorCode)) {
      expect(typeof value, `${name} must be a string`).toBe('string');
      // The enum is used as a wire/JSON value, so name and value must agree.
      expect(value, `${name} must equal its own name`).toBe(name);
    }
  });

  it('every GuildPassErrorCode.X referenced in src/ is a declared member', () => {
    const declared = new Set(Object.keys(GuildPassErrorCode));
    const offenders: string[] = [];

    for (const file of sourceFiles(SRC_DIR)) {
      const text = stripComments(readFileSync(file, 'utf8'));
      for (const match of text.matchAll(/GuildPassErrorCode\.([A-Za-z_][A-Za-z0-9_]*)/g)) {
        const member = match[1];
        if (!declared.has(member)) {
          offenders.push(`${file.replace(SRC_DIR, 'src')} -> GuildPassErrorCode.${member}`);
        }
      }
    }

    // A phantom member evaluates to `undefined` at runtime, so the error it
    // builds carries no code at all.
    expect(offenders).toEqual([]);
  });

  it('an error built from any member survives the cross-realm guard and JSON', () => {
    // The `instanceof` fast path hides a missing code locally; these are the
    // two routes where it actually bites.
    for (const code of Object.values(GuildPassErrorCode)) {
      const err = new GuildPassError('boom', code);

      const crossRealm = { name: err.name, code: err.code, message: err.message };
      expect(isGuildPassError(crossRealm), `${code} must survive a realm boundary`).toBe(true);

      const roundTripped = JSON.parse(JSON.stringify(err.toJSON()));
      expect(roundTripped.code, `${code} must survive JSON`).toBe(code);
    }
  });
});
