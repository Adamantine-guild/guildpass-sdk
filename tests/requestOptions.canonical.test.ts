import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import type { RequestOptions } from '../src/types/common';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const read = (p: string) => readFileSync(join(root, p), 'utf8');

// Guards the #83 fix: there must be exactly ONE canonical `RequestOptions` type
// (in src/types/common.ts) and every service must import it from there.
describe('RequestOptions import structure (#83)', () => {
  it('http.types.ts no longer declares a duplicate RequestOptions', () => {
    const httpTypes = read('src/http/http.types.ts');
    expect(httpTypes).not.toMatch(/export\s+type\s+RequestOptions\b/);
  });

  it('types/common.ts owns the canonical RequestOptions', () => {
    const common = read('src/types/common.ts');
    expect(common).toMatch(/export\s+type\s+RequestOptions\s*=/);
  });

  it('every service imports RequestOptions from ../types/common', () => {
    const services = [
      'src/access/access.service.ts',
      'src/guilds/guilds.service.ts',
      'src/membership/membership.service.ts',
      'src/roles/roles.service.ts',
      'src/contracts/contractClient.ts',
    ];
    for (const file of services) {
      const src = read(file);
      // It references RequestOptions...
      expect(src, `${file} should use RequestOptions`).toMatch(/\bRequestOptions\b/);
      // ...and only ever imports it from the canonical module.
      const importLines = src
        .split('\n')
        .filter((l) => l.includes('RequestOptions') && l.includes('import'));
      for (const line of importLines) {
        expect(line, `${file} must import RequestOptions from ../types/common`).toMatch(
          /from\s+['"]\.\.\/types\/common['"]/
        );
      }
    }
  });

  it('the canonical RequestOptions carries the richer service-level fields', () => {
    // Compile-time proof that the canonical type includes retry/timeout/signal.
    const opts: RequestOptions = {
      timeoutMs: 1000,
      retry: { maxRetries: 2 },
      signal: new AbortController().signal,
    };
    expect(opts.timeoutMs).toBe(1000);
    expect(opts.retry).toEqual({ maxRetries: 2 });
  });
});
