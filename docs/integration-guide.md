# Integration Guide

How to use GuildPass SDK in different scenarios.

## 1. Token-Gated Website (Next.js)

In a Next.js application, you can check access on the server-side inside `getServerSideProps` or Middleware.

```typescript
// middleware.ts
import { GuildPassClient } from '@guildpass/sdk';

const client = new GuildPassClient({ apiUrl: process.env.GUILDPASS_API });

export async function middleware(req) {
  const wallet = req.cookies.get('wallet_address');

  const { hasAccess } = await client.access.checkAccess({
    walletAddress: wallet,
    guildId: 'premium-guild',
    resourceId: req.nextUrl.pathname,
  });

  if (!hasAccess) {
    return NextResponse.redirect('/join');
  }
}
```

## 2. Discord Bot Integration

Use the SDK inside your Discord bot command handlers to verify roles or membership before granting access to channels.

```typescript
// commands/verify.ts
import { GuildPassClient } from '@guildpass/sdk';

export async function execute(interaction) {
  const wallet = getWalletFromDb(interaction.user.id);

  const isMember = await client.membership.isMember({
    walletAddress: wallet,
    guildId: 'my-discord-guild',
  });

  if (isMember) {
    await interaction.member.roles.add(GUILD_ROLE_ID);
  }
}
```

## 3. Admin Tools

Fetch guild configurations to build custom management dashboards.

```typescript
const config = await client.guilds.getGuildConfig({ guildId: 'my-guild' });
// Use config.theme, config.socialLinks etc to render the UI
```

## 4. Per-Request Timeout

Override the global timeout on a per-call basis when certain endpoints need tighter or looser bounds:

```typescript
import { GuildPassClient } from '@guildpass/sdk';

const client = new GuildPassClient({
  apiUrl: 'https://api.guildpass.xyz',
  timeoutMs: 10_000, // 10s global default
});

// Use a shorter timeout for a fast health-check endpoint
const status = await client.access.checkAccess(
  { walletAddress: wallet, guildId: 'g', resourceId: 'r' },
  { timeoutMs: 2_000 }, // 2s for this call only
);

// Use a longer timeout for a complex batch operation
const results = await client.access.checkAccessBatch(items, {
  timeoutMs: 30_000, // 30s for the batch
  concurrency: 10,
});
```

The per-request `timeoutMs` takes precedence over the client-level `timeoutMs`. If omitted, the global value is used. An `AbortSignal` can also be passed for cancellation:

```typescript
const controller = new AbortController();
setTimeout(() => controller.abort(), 5_000);

const result = await client.guilds.getGuild(
  { guildId: 'my-guild' },
  { signal: controller.signal },
);
```

## 5. Custom Transport (Proxies, Logging, etc.)

The SDK allows you to provide a custom `fetch` implementation. This is useful for:
- Supporting legacy Node.js versions (using `node-fetch` or `undici`)
- Adding custom logging or tracing
- Routing requests through a proxy
- Testing with custom stubs

```typescript
import { GuildPassClient } from '@guildpass/sdk';
import myCustomFetch from './my-fetch-wrapper';

const client = new GuildPassClient({
  apiUrl: 'https://api.guildpass.xyz',
  fetch: myCustomFetch, // Injected transport
## 6. Batch Access Checking

If you need to verify access for multiple resources or multiple users at once, use the batch access helper to manage concurrency and gracefully handle partial failures.

```typescript
import { GuildPassClient } from '@guildpass/sdk';

const client = new GuildPassClient({ apiUrl: process.env.GUILDPASS_API });

const items = [
  { walletAddress: '0x123...', guildId: 'guild-a', resourceId: 'res-1' },
  { walletAddress: '0x456...', guildId: 'guild-a', resourceId: 'res-2' },
];

const results = await client.access.checkAccessBatch(items, { concurrency: 2 });

results.forEach((result) => {
  if (result.status === 'fulfilled') {
    console.log(`Access for ${result.input.walletAddress}: ${result.value.hasAccess}`);
  } else {
    console.error(`Failed to check access for ${result.input.walletAddress}`, result.error);
  }
});
```

For very large batches, `adaptiveConcurrency: true` makes the worker pool
back off automatically when the API starts returning 429s or 5xxs and ramp
back up as it recovers:

```typescript
const results = await client.access.checkAccessBatch(items, {
  concurrency: 10,          // starting (and maximum) in-flight limit
  adaptiveConcurrency: true,
});
```

## 5. Custom Fetch Transport

Use the `fetch` config option when you need a runtime-specific transport,
request tracing, proxy routing, or tests that should not stub `globalThis.fetch`.
The function must be fetch-compatible and return a `Response`.

```typescript
import { GuildPassClient } from '@guildpass/sdk';

const tracedFetch: typeof fetch = async (input, init) => {
  const startedAt = Date.now();
  const response = await fetch(input, init);

  console.log('guildpass request', {
    input,
    status: response.status,
    durationMs: Date.now() - startedAt,
  });

  return response;
};

const client = new GuildPassClient({
  apiUrl: process.env.GUILDPASS_API,
  fetch: tracedFetch,
});
```

## 6. Batch Contract Read Calls

When you need to check membership token balances or guild owners for many
wallets or guilds at once, use the SDK's batch helpers to reduce RPC
overhead. Each batch sends a single JSON-RPC request containing multiple
`eth_call` sub-requests.

### Batch Token Balances

```typescript
const results = await client.contracts.getMembershipTokenBalancesBatch({
  walletAddresses: [
    '0x1234567890123456789012345678901234567890',
    '0xAbcdefabcdefabcdefabcdefabcdefabcdefabcd',
    '0x1111111111111111111111111111111111111111',
  ],
});

results.forEach((item, index) => {
  if (item.status === 'success') {
    console.log(`Wallet ${index} balance: ${item.result}`);
  } else {
    console.error(`Wallet ${index} failed: ${item.error}`);
  }
});
```

### Batch Guild Owners

```typescript
const results = await client.contracts.getGuildOwnersBatch({
  guildIds: ['guild_1', 'guild_2', '42'],
});

results.forEach((item, index) => {
  if (item.status === 'success') {
    console.log(`Guild ${index} owner: ${item.result}`);
  } else {
    console.error(`Guild ${index} failed: ${item.error}`);
  }
});
```

### Provider Compatibility

JSON-RPC batch requests work with most modern RPC providers (Infura,
Alchemy, QuickNode, public nodes, etc.). Some providers may impose limits
on the number of calls per batch — if you encounter errors with large
batches, split your input into smaller chunks (e.g., 50–100 items per
batch).

The SDK does **not** batch mutating operations. Only read-only `eth_call`
requests are sent through these helpers. For write operations, use the
individual contract methods or the REST API.

### Partial Failure Handling

Batch calls never fail entirely because of a single problematic item.
Each sub-request is individually resolved in the response:

- **Success**: `{ status: 'success', result: '<decoded-value>' }`
- **RPC error**: `{ status: 'error', error: '<rpc-error-message>' }`
- **Missing response**: `{ status: 'error', error: 'No response for batch item N' }`
- **Malformed result**: `{ status: 'error', error: 'Failed to decode ...' }`

This makes batch calls suitable for production use where you want to
gracefully handle individual failures without losing all results.

## 7. Cache Configuration

The SDK supports transparent response caching via a `cache` adapter and a `cacheTtl` (in **milliseconds**):

```typescript
import { GuildPassClient, InMemoryCacheAdapter } from '@guildpass/sdk';

const client = new GuildPassClient({
  apiUrl: 'https://api.guildpass.xyz',
  cache: new InMemoryCacheAdapter(),
  cacheTtl: 30_000, // 30s TTL for all cached entries
});
```

### Validation

Invalid cache configuration is rejected at construction time with a clear error:

- `cacheTtl` must be a non-negative finite number (milliseconds)
- Custom `cache` adapters must implement `get`, `set`, `delete`, and `clear` as functions

```typescript
// These throw GuildPassError with code INVALID_CONFIG:
new GuildPassClient({ apiUrl: '...', cacheTtl: -1 });
new GuildPassClient({ apiUrl: '...', cache: { get: 'nope' } }); // missing methods

## 8. Cross-Provider Consensus Verification

For high-value access decisions, a single RPC provider can be a single
point of failure: a lying endpoint can return a fabricated balance, a
spurious token ownership, or a forged `hasRole` answer without the SDK
noticing. The SDK accepts an opt-in `contractReadConsensus` config that
fans every on-chain read out across multiple independent RPC endpoints in
parallel via `Promise.allSettled` and only returns a value when at least
`minProviders` of them agree on the same raw hex result.

Issue: [#307](https://github.com/Adamantine-Guild/guildpass-sdk/issues/307)
· Merged in PR [#338](https://github.com/Adamantine-Guild/guildpass-sdk/pull/338)
(v1) and PR [#339](https://github.com/Adamantine-Guild/guildpass-sdk/pull/339)
(followup).

### Configuration

```typescript
import { GuildPassClient } from '@guildpass/sdk';

const client = new GuildPassClient({
  apiUrl: 'https://api.guildpass.xyz',
  chainId: 8453, // Base
  contractAddress: '0x000000000000000000000000000000000000beef',
  contractReadConsensus: {
    providers: [
      'https://your-rpc-a.example.com',
      'https://your-rpc-b.example.com',
      'https://your-rpc-c.example.com',
    ],
    minProviders: 3,
  },
});
```

The `providers` list must contain distinct URLs from **different
infrastructure providers**. Running multiple URLs that all proxy the
same backend gives a false sense of diversity and would not actually
surface a lying value. `minProviders` must be an integer `>= 2` and
`<= providers.length`; `validateConfig` rejects anything else with
a descriptive `INVALID_CONFIG` error.

### Coverage

Once configured, every on-chain read route fans out through the quorum:

- **Single-call reads**: `getMembershipTokenBalance`, `getERC20Balance`,
  `ownsERC721Token`, `getERC1155Balance`, `getGuildOwner`, `readContract`.
- **Batch reads** (per-item quorum): `batchEthCall`,
  `getMembershipTokenBalancesBatch`, `getGuildOwnersBatch`.
- **Access requirements**: `validateRoleRequirement` — every internal
  `eth_call` (ERC-165 `supportsInterface`, ERC-20 `balanceOf`,
  ERC-721 `ownerOf`, AccessControl `hasRole`) honours the same quorum.

When the batch consensus ballot fails to reach quorum for an individual
index, that index becomes `{ status: 'error', error: 'Consensus mismatch
at batch index i: ...' }` rather than rejecting the whole batch. This
mirrors the existing batch semantics where per-item failures are
reported as results, not rejected promises. When **every** provider
fails the batch outright, the SDK throws `CONSENSUS_MISMATCH` at the
call site because there is no per-item ballot to attribute.

### Error Handling

On disagreement the SDK throws `GuildPassError` with code
`CONSENSUS_MISMATCH` and a structured `details` payload that lets
operators identify the lying provider:

```typescript
import { GuildPassErrorCode } from '@guildpass/sdk';

try {
  const balance = await client.contracts.getMembershipTokenBalance({
    walletAddress,
  });
} catch (err) {
  if (err.code === GuildPassErrorCode.CONSENSUS_MISMATCH) {
    console.error('Providers disagreed:', JSON.stringify(err.details, null, 2));
    // details = {
    //   totalProviders: 3,
    //   successfulCount: 3,
    //   failedCount: 0,
    //   quorum: 3,
    //   groups: [
    //     { value: '0x2a', count: 2, urls: ['https://your-rpc-a.example.com', 'https://your-rpc-b.example.com'] },
    //     { value: '0x7',  count: 1, urls: ['https://your-rpc-c.example.com'] },
    //   ],
    //   failures: [],
    // }
  } else {
    throw err;
  }
}
```

`groups` is sorted by descending `count` so the front-runner always
indexes `[0]`. `failures` lists every provider that returned an error
(network failure, RPC error, non-string result) with its error code and
message. Together they let you pinpoint which provider to drop or
investigate.

### Multicall3 Conflict

`batchStrategy: "multicall3"` is **not** compatible with
`contractReadConsensus`. Multicall3 collapses multiple `eth_call`
requests into a single on-chain transaction per provider, so the
provider's response is itself an aggregated result that cannot be
cross-verified. The SDK rejects this combination at any batch-method
call (`batchEthCall`, `getMembershipTokenBalancesBatch`,
`getGuildOwnersBatch`) with `GuildPassError(INVALID_CONFIG)`. To use
cross-provider verification, either disable Multicall3 (`batchStrategy`
unset) or disable the consensus config for that client.

### Opt-out

When `contractReadConsensus` is unset, every method falls back to its
default behaviour: single-URL JSON-RPC with transparent failover across
`rpcUrls`, or Multicall3 when `batchStrategy === 'multicall3'`. The
feature is fully opt-in and zero behaviour change applies when the
config is not configured.

A configured `contractProvider` (custom read aggregator, viem/ethers
wrapper, cache layer, signed-response backend) takes precedence over the
consensus path. Use this when you have an end-to-end trusted aggregator
and want to opt out of cross-provider verification for that specific
client.

### Run a Full Demo

A complete runnable example covering single-call, batch,
`validateRoleRequirement`, and the `contractProvider` precedence
override is available at
[`examples/consensus-verification.ts`](../examples/consensus-verification.ts).
Run it locally with:

```bash
pnpm tsx examples/consensus-verification.ts
```

The example defaults to querying live public RPCs. Set
`GUILDPASS_DEMO_CONTRACT_PROVIDER=1` to also exercise the precedence
override path with a stub provider.
```
