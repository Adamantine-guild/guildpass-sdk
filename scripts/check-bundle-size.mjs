import { build } from 'esbuild';
import fs from 'fs';
import zlib from 'zlib';

const BUDGET_FILE = 'bundle-size-budget.json';
const GENERATE_MODE = process.argv.includes('--generate');

const exportMap = {
  ".": "src/index.ts",
  "./client": "src/client.ts",
  "./errors": "src/errors/index.ts",
  "./utils": "src/utils/index.ts",
  "./types": "src/types/index.ts",
  "./adapters/viem": "src/adapters/viem.ts",
  "./adapters/ethers": "src/adapters/ethers.ts"
};

async function checkSize() {
  const budget = fs.existsSync(BUDGET_FILE) ? JSON.parse(fs.readFileSync(BUDGET_FILE, 'utf-8')) : {};
  const results = [];
  let failed = false;

  console.log(`Checking bundle sizes...${GENERATE_MODE ? ' (Generating New Budget)' : ''}\n`);

  for (const [entry, source] of Object.entries(exportMap)) {
    if (!fs.existsSync(source)) continue;

    const result = await build({
      entryPoints: [source],
      bundle: true,
      minify: true,
      format: 'esm',
      write: false,
      platform: 'browser',
      // Match the real build (tsup treats peer deps as external): without
      // this, esbuild bundles all of `ethers`/`viem` into the measurement,
      // which both crashes on `merkleTree.ts`'s deep `ethers/lib/utils`
      // import and, once resolved, wildly overstates every entry's size.
      external: ['node:crypto', 'ethers', 'viem'],
    });

    const buffer = Buffer.from(result.outputFiles[0].contents);
    const gzipped = zlib.gzipSync(buffer);
    const size = gzipped.length;

    const limit = budget[entry] || 0;
    const isOver = !GENERATE_MODE && size > limit;

    results.push({ entry, size, limit: GENERATE_MODE ? size : limit, status: isOver ? '❌ FAIL' : '✅ PASS' });
    if (isOver) failed = true;
  }

  console.table(results);

  if (GENERATE_MODE) {
    const newBudget = Object.fromEntries(results.map(r => [r.entry, r.size]));
    fs.writeFileSync(BUDGET_FILE, JSON.stringify(newBudget, null, 2));
    console.log(`\nBudget file updated at ${BUDGET_FILE}`);
  } else if (failed) {
    console.error(`\nBudget exceeded! Please check the table above.`);
    process.exit(1);
  } else {
    console.log(`\nAll bundles within budget.`);
  }
}

checkSize().catch(err => {
  console.error(err);
  process.exit(1);
});