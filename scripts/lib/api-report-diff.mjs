function extractTypescriptBlock(report) {
  const match = report.match(/```ts\s*([\s\S]*?)```/m);
  return match ? match[1] : '';
}

function normaliseBlock(text) {
  return text
    .replace(/\r\n/g, '\n')
    .split('\n')
    .map((line) => line.trimEnd())
    .join('\n')
    .trim();
}

function parseSemver(input) {
  const match = String(input).trim().match(/^v?(\d+)\.(\d+)\.(\d+)$/);
  if (!match) return null;
  return {
    major: Number(match[1]),
    minor: Number(match[2]),
    patch: Number(match[3]),
  };
}

function formatSemver(version) {
  return `${version.major}.${version.minor}.${version.patch}`;
}

function compareSemver(a, b) {
  if (a.major !== b.major) return a.major - b.major;
  if (a.minor !== b.minor) return a.minor - b.minor;
  return a.patch - b.patch;
}

function sortEntries(entries) {
  return [...entries].sort((left, right) => left.name.localeCompare(right.name));
}

export function parseApiReport(report) {
  const block = extractTypescriptBlock(report);
  const sections = block
    .split(/(?=\/\/ @public[^\n]*\n)/g)
    .map((section) => normaliseBlock(section))
    .filter((section) => section.startsWith('// @public'));

  const exportsMap = new Map();

  for (const section of sections) {
    const exportMatch = section.match(
      /\nexport\s+(?:declare\s+)?(type|interface|class|function|const|enum)\s+([A-Za-z_$][\w$]*)\b/m,
    );

    if (!exportMatch) {
      continue;
    }

    const [, kind, name] = exportMatch;
    exportsMap.set(name, {
      name,
      kind,
      signature: section,
    });
  }

  return exportsMap;
}

export function diffApiReports(baseline, current) {
  const added = [];
  const removed = [];
  const changed = [];

  for (const [name, baselineEntry] of baseline.entries()) {
    const currentEntry = current.get(name);
    if (!currentEntry) {
      removed.push(baselineEntry);
      continue;
    }

    if (baselineEntry.signature !== currentEntry.signature) {
      changed.push({
        name,
        kind: currentEntry.kind,
        before: baselineEntry.signature,
        after: currentEntry.signature,
      });
    }
  }

  for (const [name, currentEntry] of current.entries()) {
    if (!baseline.has(name)) {
      added.push(currentEntry);
    }
  }

  return {
    added: sortEntries(added),
    removed: sortEntries(removed),
    changed: sortEntries(changed),
  };
}

export function hasBreakingChanges(diff) {
  return diff.removed.length > 0 || diff.changed.length > 0;
}

export function recommendVersionBump(currentVersion, diff) {
  const parsed = parseSemver(currentVersion);
  if (!parsed) {
    throw new Error(`Invalid semver version: "${currentVersion}"`);
  }

  const next = { ...parsed };
  let level = 'none';

  if (hasBreakingChanges(diff)) {
    if (parsed.major === 0) {
      next.minor += 1;
      next.patch = 0;
      level = 'minor';
    } else {
      next.major += 1;
      next.minor = 0;
      next.patch = 0;
      level = 'major';
    }
  } else if (diff.added.length > 0) {
    if (parsed.major === 0) {
      next.patch += 1;
      level = 'patch';
    } else {
      next.minor += 1;
      next.patch = 0;
      level = 'minor';
    }
  }

  return {
    level,
    current: formatSemver(parsed),
    suggested: formatSemver(next),
  };
}

export function pickLatestSemverTag(tags) {
  const candidates = tags
    .map((tag) => ({ tag, parsed: parseSemver(tag) }))
    .filter((entry) => entry.parsed !== null);

  if (candidates.length === 0) {
    return undefined;
  }

  candidates.sort((left, right) => compareSemver(left.parsed, right.parsed));
  return candidates[candidates.length - 1].tag;
}

function formatEntryList(title, entries) {
  if (entries.length === 0) {
    return `${title}: none`;
  }

  return `${title}:\n${entries.map((entry) => `- ${entry.name} (${entry.kind})`).join('\n')}`;
}

export function formatDiffReport(diff, recommendation, context) {
  const lines = [
    `API report diff: ${context.baselineLabel} -> ${context.currentLabel}`,
    `Package version: ${context.packageVersion}`,
    '',
    formatEntryList('Added exports', diff.added),
    '',
    formatEntryList('Removed exports', diff.removed),
    '',
    formatEntryList('Changed exports', diff.changed),
    '',
    hasBreakingChanges(diff) ? 'Compatibility: BREAKING' : 'Compatibility: non-breaking',
    `Recommended version bump: ${recommendation.current} → ${recommendation.suggested} (${recommendation.level})`,
  ];

  return lines.join('\n');
}
