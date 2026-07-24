// Benchmark: in-flight request deduplication (issue #354).
//
// Measures how many underlying HTTP requests the SDK issues when N concurrent
// identical read calls are made, with deduplication enabled vs disabled.
//
// Run: node scripts/benchmark-deduplication.mjs
import { build } from 'esbuild';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { dirname, join } from 'node:path';
import { tmpdir } from 'node:os';
import { writeFileSync } from 'node:fs';

const here = dirname(fileURLToPath(import.meta.url));
const root = join(here, '..');

const outfile = join(tmpdir(), `guildpass-sdk-bench-${process.pid}.mjs`);
// The contract client has a pre-existing broken import on main (also fails
// `tsc --noEmit` and `tsup`); it is irrelevant to request deduplication, so
// stub it out of the benchmark bundle.
const stubContracts = {
  name: 'stub-contracts',
  setup(b) {
    b.onResolve({ filter: /contracts\/contractClient$/ }, () => ({ path: 'contractClient-stub', namespace: 'stub' }));
    b.onLoad({ filter: /.*/, namespace: 'stub' }, () => ({
      contents: 'export class ContractClient { constructor() {} }',
    }));
  },
};
await build({
  entryPoints: [join(root, 'src/client/GuildPassClient.ts')],
  bundle: true,
  format: 'esm',
  platform: 'node',
  outfile,
  plugins: [stubContracts],
  logLevel: 'silent',
});
const { GuildPassClient } = await import(pathToFileURL(outfile).href);

const ADDR = '0x1234567890123456789012345678901234567890';
const mockAccess = {
  hasAccess: true,
  walletAddress: ADDR,
  guildId: 'g1',
  resourceId: 'r1',
  requiredRoles: ['member'],
  matchedRoles: ['member'],
  reason: null,
};

// A fetch stub that counts requests and simulates 5 ms of network latency.
const makeCountingFetch = () => {
  let count = 0;
  const fetchStub = async () => {
    count += 1;
    await new Promise((r) => setTimeout(r, 5));
    return new Response(JSON.stringify(mockAccess), {
      status: 200,
      headers: { 'content-type': 'application/json' },
    });
  };
  return { fetchStub, getCount: () => count };
};

const run = async (concurrency, deduplication) => {
  const { fetchStub, getCount } = makeCountingFetch();
  const client = new GuildPassClient({
    apiUrl: 'https://api.guildpass.xyz',
    fetch: fetchStub,
    deduplication,
  });
  const start = performance.now();
  await Promise.all(
    Array.from({ length: concurrency }, () =>
      client.access.checkAccess({ walletAddress: ADDR, guildId: 'g1', resourceId: 'r1' }),
    ),
  );
  const elapsedMs = performance.now() - start;
  return { httpRequests: getCount(), elapsedMs };
};

const N = 100;
const on = await run(N, true);
const off = await run(N, false);

console.log(`concurrent identical checkAccess calls: ${N}`);
console.log('');
console.log(`deduplication ON : ${on.httpRequests} HTTP request(s), ${on.elapsedMs.toFixed(1)} ms`);
console.log(`deduplication OFF: ${off.httpRequests} HTTP request(s), ${off.elapsedMs.toFixed(1)} ms`);
console.log('');
console.log(
  `network utilization reduced ${(off.httpRequests / on.httpRequests).toFixed(0)}x ` +
    `(${off.httpRequests} -> ${on.httpRequests} requests)`,
);
