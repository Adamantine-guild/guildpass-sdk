import { describe, it, expect } from 'vitest';
import {
  diffApiReports,
  formatDiffReport,
  hasBreakingChanges,
  parseApiReport,
  pickLatestSemverTag,
  recommendVersionBump,
} from '../scripts/lib/api-report-diff.mjs';

const SAMPLE_BASELINE = `
## API Report File for "@guildpass/sdk"

\`\`\`ts

// @public
export type Foo = {
    id: string;
};

// @public
export function greet(name: string): string;

// @public
export class Widget {
    run(): void;
}

\`\`\`
`;

const SAMPLE_ADDITIVE = `
## API Report File for "@guildpass/sdk"

\`\`\`ts

// @public
export type Foo = {
    id: string;
};

// @public
export function greet(name: string): string;

// @public
export class Widget {
    run(): void;
}

// @public
export type Bar = {
    value: number;
};

\`\`\`
`;

const SAMPLE_BREAKING_REMOVED = `
## API Report File for "@guildpass/sdk"

\`\`\`ts

// @public
export type Foo = {
    id: string;
};

// @public
export class Widget {
    run(): void;
}

\`\`\`
`;

const SAMPLE_BREAKING_CHANGED = `
## API Report File for "@guildpass/sdk"

\`\`\`ts

// @public
export type Foo = {
    id: string;
};

// @public
export function greet(name: string, formal?: boolean): string;

// @public
export class Widget {
    run(): void;
}

\`\`\`
`;

describe('parseApiReport', () => {
  it('extracts named exports from the TypeScript block', () => {
    const exports = parseApiReport(SAMPLE_BASELINE);
    expect([...exports.keys()].sort()).toEqual(['Foo', 'Widget', 'greet']);
    expect(exports.get('Foo')?.kind).toBe('type');
    expect(exports.get('greet')?.kind).toBe('function');
    expect(exports.get('Widget')?.kind).toBe('class');
  });
});

describe('diffApiReports', () => {
  it('classifies additive exports as non-breaking', () => {
    const diff = diffApiReports(parseApiReport(SAMPLE_BASELINE), parseApiReport(SAMPLE_ADDITIVE));
    expect(diff.added.map((entry) => entry.name)).toEqual(['Bar']);
    expect(diff.removed).toHaveLength(0);
    expect(diff.changed).toHaveLength(0);
    expect(hasBreakingChanges(diff)).toBe(false);
  });

  it('classifies removed exports as breaking', () => {
    const diff = diffApiReports(parseApiReport(SAMPLE_BASELINE), parseApiReport(SAMPLE_BREAKING_REMOVED));
    expect(diff.removed.map((entry) => entry.name)).toEqual(['greet']);
    expect(hasBreakingChanges(diff)).toBe(true);
  });

  it('classifies signature changes as breaking', () => {
    const diff = diffApiReports(parseApiReport(SAMPLE_BASELINE), parseApiReport(SAMPLE_BREAKING_CHANGED));
    expect(diff.changed.map((entry) => entry.name)).toEqual(['greet']);
    expect(hasBreakingChanges(diff)).toBe(true);
  });
});

describe('recommendVersionBump', () => {
  it('recommends a patch bump for additive pre-1.0 changes', () => {
    const diff = diffApiReports(parseApiReport(SAMPLE_BASELINE), parseApiReport(SAMPLE_ADDITIVE));
    expect(recommendVersionBump('0.1.0', diff)).toMatchObject({
      level: 'patch',
      suggested: '0.1.1',
    });
  });

  it('recommends a minor bump for breaking pre-1.0 changes', () => {
    const diff = diffApiReports(parseApiReport(SAMPLE_BASELINE), parseApiReport(SAMPLE_BREAKING_REMOVED));
    expect(recommendVersionBump('0.1.0', diff)).toMatchObject({
      level: 'minor',
      suggested: '0.2.0',
    });
  });

  it('recommends a major bump for breaking post-1.0 changes', () => {
    const diff = diffApiReports(parseApiReport(SAMPLE_BASELINE), parseApiReport(SAMPLE_BREAKING_REMOVED));
    expect(recommendVersionBump('1.4.2', diff)).toMatchObject({
      level: 'major',
      suggested: '2.0.0',
    });
  });
});

describe('pickLatestSemverTag', () => {
  it('returns the highest semver tag', () => {
    expect(pickLatestSemverTag(['v0.1.0', 'v0.2.0', 'v0.1.5', 'not-a-tag'])).toBe('v0.2.0');
  });
});

describe('formatDiffReport', () => {
  it('marks breaking diffs clearly in the summary', () => {
    const diff = diffApiReports(parseApiReport(SAMPLE_BASELINE), parseApiReport(SAMPLE_BREAKING_REMOVED));
    const recommendation = recommendVersionBump('0.1.0', diff);
    const report = formatDiffReport(diff, recommendation, {
      baselineLabel: 'git tag v0.1.0',
      currentLabel: 'working tree',
      packageVersion: '0.1.0',
    });

    expect(report).toContain('Removed exports');
    expect(report).toContain('BREAKING');
    expect(report).toContain('0.1.0 → 0.2.0');
  });
});
