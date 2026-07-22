#!/usr/bin/env node

import { execSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  diffApiReports,
  formatDiffReport,
  hasBreakingChanges,
  parseApiReport,
  pickLatestSemverTag,
  recommendVersionBump,
} from './lib/api-report-diff.mjs';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const projectRoot = path.resolve(__dirname, '..');
const reportRelativePath = 'api-report/guildpass-sdk.api.md';
const reportAbsolutePath = path.join(projectRoot, reportRelativePath);

const args = process.argv.slice(2);
const skipRegenerate = args.includes('--skip-regenerate');
const baselineTagArg = readFlagValue(args, '--baseline-tag');
const baselineFileArg = readFlagValue(args, '--baseline-file');

function readFlagValue(argv, flag) {
  const index = argv.indexOf(flag);
  if (index === -1) {
    return undefined;
  }
  return argv[index + 1];
}

function run(command) {
  execSync(command, {
    cwd: projectRoot,
    stdio: 'inherit',
    env: process.env,
  });
}

function readPackageVersion() {
  const packageJson = JSON.parse(
    fs.readFileSync(path.join(projectRoot, 'package.json'), 'utf8'),
  );
  return packageJson.version;
}

function listSemverTags() {
  try {
    const output = execSync('git tag -l "v*.*.*"', {
      cwd: projectRoot,
      encoding: 'utf8',
    });
    return output
      .split('\n')
      .map((line) => line.trim())
      .filter(Boolean);
  } catch {
    return [];
  }
}

function readGitFile(ref, filePath) {
  return execSync(`git show ${ref}:${filePath}`, {
    cwd: projectRoot,
    encoding: 'utf8',
  });
}

function resolveBaseline() {
  if (baselineFileArg) {
    const absolute = path.resolve(projectRoot, baselineFileArg);
    return {
      label: absolute,
      content: fs.readFileSync(absolute, 'utf8'),
      source: 'file',
    };
  }

  const explicitTag = baselineTagArg;
  if (explicitTag) {
    return {
      label: `git tag ${explicitTag}`,
      content: readGitFile(explicitTag, reportRelativePath),
      source: 'tag',
    };
  }

  const latestTag = pickLatestSemverTag(listSemverTags());
  if (latestTag) {
    return {
      label: `git tag ${latestTag}`,
      content: readGitFile(latestTag, reportRelativePath),
      source: 'tag',
    };
  }

  try {
    return {
      label: 'git HEAD (committed api-report; no release tags found yet)',
      content: readGitFile('HEAD', reportRelativePath),
      source: 'head',
    };
  } catch (error) {
    throw new Error(
      'No semver release tag found and no committed api-report/guildpass-sdk.api.md at HEAD. ' +
        'Commit an API baseline or pass --baseline-tag / --baseline-file.',
      { cause: error },
    );
  }
}

async function main() {
  const packageVersion = readPackageVersion();

  if (!skipRegenerate) {
    console.log('Regenerating API report (pnpm build && pnpm api-report:ci)...\n');
    run('pnpm build');
    run('pnpm api-report:ci');
  } else if (!fs.existsSync(reportAbsolutePath)) {
    throw new Error(
      `Missing ${reportRelativePath}. Run without --skip-regenerate or generate the report first.`,
    );
  }

  const baseline = resolveBaseline();
  const currentContent = fs.readFileSync(reportAbsolutePath, 'utf8');

  const baselineExports = parseApiReport(baseline.content);
  const currentExports = parseApiReport(currentContent);
  const diff = diffApiReports(baselineExports, currentExports);
  const recommendation = recommendVersionBump(packageVersion, diff);

  const report = formatDiffReport(diff, recommendation, {
    baselineLabel: baseline.label,
    currentLabel: 'working tree api-report/guildpass-sdk.api.md',
    packageVersion,
  });

  console.log(report);

  if (baseline.source === 'head') {
    console.log('');
    console.log(
      'Note: no v*.*.* release tags exist yet — baseline is the last committed api-report on HEAD.',
    );
    console.log(
      'After the first release, this script will compare against the latest tag automatically.',
    );
  }

  if (hasBreakingChanges(diff)) {
    process.exit(1);
  }
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : error);
  process.exit(1);
});
