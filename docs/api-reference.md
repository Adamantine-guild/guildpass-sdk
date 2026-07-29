# API Reference

## Import Paths

The SDK supports tree-shakeable subpath imports. You can import focused modules directly to minimize your bundle size:

- `@guildpass/sdk/client`: Main `GuildPassClient` class.
- `@guildpass/sdk/errors`: Error classes and codes (`GuildPassError`, `GuildPassConfigError`,
  `GuildPassNetworkError`, `GuildPassApiError`, `GuildPassResponseValidationError`, `GuildPassErrorCode`).
- `@guildpass/sdk/utils`: Utility functions (`normaliseAddress`, `validateAddress`, `formatIsoDate`, etc.).
- `@guildpass/sdk/types`: TypeScript definitions.
- `@guildpass/sdk/adapters/viem`: `viemContractProvider` — wrap a viem `PublicClient` as the SDK's contract provider.
- `@guildpass/sdk/adapters/ethers`: `ethersContractProvider` — wrap an ethers `Provider` as the SDK's contract provider.

ABI encoding helpers and contract decoders are re-exported from the root package:

```typescript
import {
  getFunctionSelector,
  encodeAbiParams,
  buildFunctionSignature,
  decodeAddressResult,
  decodeUint256Result,
  decodeBoolResult,
} from '@guildpass/sdk';
```

You can also import everything from the root `@guildpass/sdk` (the adapter subpaths are intentionally excluded from the root export so they never affect your bundle unless imported).

## GuildPassClient

The main constructor. You can initialize the client by passing a config object directly, or by using the `GuildPassClientBuilder` for a fluent interface.

### Initialization

**Using the Builder (Recommended):**
```typescript
import { GuildPassClientBuilder } from '@guildpass/sdk';

const client = new GuildPassClientBuilder('https://api.guildpass.xyz')
  .withApiKey('secret-key')
  .withTimeout(5000)
  .build();
```

**Using the Constructor:**
```typescript
new GuildPassClient(config: GuildPassClientConfig)
```

### Methods

- `getConfig()`: Returns the current non-sensitive configuration. Sensitive
  values such as `apiKey` are omitted from this public snapshot.

---

## Access Module (`client.access`)

### `checkAccess(params: AccessCheckParams, options?: RequestOptions)`

Checks if a wallet can access a resource.

- **Returns**: `Promise<AccessCheckResult>` (or `Promise<{ data: AccessCheckResult; meta: ResponseMetadata }>` when `options.includeMeta` is `true`)
- **Options**: Supports `timeoutMs`, `retry`, `includeMeta`

### `checkAccessBatch(items: AccessCheckParams[], options?: AccessCheckBatchOptions & RequestOptions)`

Checks access for multiple resources or wallets concurrently.

- **Returns**: `Promise<AccessCheckBatchResult[]>`
- **Options**:
  - `concurrency` (default `5`, max `50`): static in-flight limit.
  - `failFast` (default `false`): abort the batch on the first failure.
  - `adaptiveConcurrency` (default `false`): opt-in AIMD mode. The effective
    in-flight limit starts at `concurrency`, halves whenever the backend
    responds with HTTP 429 or 5xx, and grows back by one after every
    `currentLimit` consecutive successes (capped at `concurrency`). Use this
    for large batches against a backend whose health may degrade mid-batch.

### `checkAccessBatch(params: { walletAddress, guildId, resourceIds }, options?: AccessCheckBatchOptions & RequestOptions)`

Single-wallet form for gating a page of resources in one call. Duplicate
`resourceIds` are collapsed to a single request. Each resource flows through
the configured cache independently, so repeat batches and follow-up
`checkAccess` calls for the same resource are cache hits.

- **Returns**: `Promise<Record<string, { status: 'fulfilled'; value: AccessCheckResult } | { status: 'rejected'; error: Error }>>` keyed by resourceId

```typescript
const results = await client.access.checkAccessBatch({
  walletAddress: '0x123...',
  guildId: 'guild-a',
  resourceIds: ['res-1', 'res-2', 'res-3'],
});

for (const [resourceId, entry] of Object.entries(results)) {
  if (entry.status === 'fulfilled') {
    console.log(resourceId, entry.value.hasAccess);
  } else {
    console.error(resourceId, entry.error);
  }
}
```

A server-side batch endpoint is a natural follow-up; today the method
parallelizes the existing single-resource checks internally with the
`concurrency` option (default 5, max 50).

### `checkRoleAccess(params: RoleAccessCheckParams, options?: RequestOptions)`

Checks if a wallet has a specific role.

- **Returns**: `Promise<boolean>`

> [!NOTE]
> **Known limitations:** On-chain validation for `WHITELIST` access requirements is currently not supported and will throw a `NOT_IMPLEMENTED` error. For whitelist-style gating, we recommend using the SIWE-based or off-chain `client.access.checkAccess()` API instead.

---

## Membership Module (`client.membership`)

### `getMembership(params: MembershipParams, options?: RequestOptions)`

Fetches detailed membership status.

- **Returns**: `Promise<Membership>`

### `isMember(params: MembershipParams, options?: RequestOptions)`

Quick check for active membership.

- **Returns**: `Promise<boolean>`

---

## Roles Module (`client.roles`)

### `getRoles(params: GetRolesParams, options?: RequestOptions)`

Fetches roles for a guild.

- **Params**: `{ guildId: string; cursor?: string; limit?: number }`
- **Returns**: `Promise<GuildRole[]>` when `cursor`/`limit` are omitted (matches
  pre-pagination behavior). `Promise<PaginatedResult<GuildRole>>` (`{ items,
  nextCursor, hasMore }`) when either `cursor` or `limit` is supplied.
- **Caching**: when a `cache` adapter is configured, each distinct
  `cursor`/`limit` combination is cached under its own key, so paging through
  results never returns a stale/incorrect page from the cache. Calling
  `client.invalidateGuildCache(guildId)` clears the default page as well as
  every paginated entry for that guild.

```typescript
// Page through all roles in a guild.
let cursor: string | undefined;
do {
  const page = await client.roles.getRoles({ guildId: 'prime-guild', cursor, limit: 50 });
  console.log(page.items);
  cursor = page.nextCursor;
} while (cursor);

// Or use the paginateAll helper to iterate every item across all pages:
import { paginateAll } from '@guildpass/sdk';
for await (const role of paginateAll((cursor) => client.roles.getRoles({ guildId: 'prime-guild', cursor, limit: 50 }))) {
  console.log(role.name);
}
```

### `getUserRoles(params: GetUserRolesParams, options?: RequestOptions)`

Fetches roles assigned to a user. Supports the same `cursor`/`limit`
pagination parameters and caching behavior as `getRoles` above.

- **Params**: `{ walletAddress: string; guildId: string; cursor?: string; limit?: number }`
- **Returns**: `Promise<GuildRole[]>` (or `Promise<PaginatedResult<GuildRole>>` when paginated)

### `hasRole(params: HasRoleParams, options?: RequestOptions)`

Convenience method that checks whether a wallet holds a specific role in a
guild. Delegates to `client.access.checkRoleAccess` internally — no HTTP logic
is duplicated and the result is cached the same way as any other role check.

- **Params**: `{ walletAddress: string; guildId: string; roleId: string }`
- **Returns**: `Promise<boolean>` — `true` if the wallet holds the role, `false` otherwise.

**Example**:

```typescript
const isModerator = await client.roles.hasRole({
  walletAddress: '0x1234...5678',
  guildId: 'prime-guild',
  roleId: 'moderator',
});

if (isModerator) {
  console.log('Wallet is a moderator');
}
```

---

## Guilds Module (`client.guilds`)

### `getGuild(params: GetGuildParams, options?: RequestOptions)`

Fetches basic guild metadata.

- **Returns**: `Promise<Guild>`

### `getGuildConfig(params: GetGuildParams, options?: RequestOptions)`

Fetches full guild configuration.

- **Returns**: `Promise<GuildConfig>`

### `getGuildConfigBatch(params: { guildIds: string[] }, options?: RequestOptions & { concurrency?: number })`

Fetches configuration for several guilds in one call, with the same
order-preserving, per-item error isolation as the rest of the batch surface
(`checkAccessBatch`, `getGuildOwnersBatch`).

```typescript
const results = await client.guilds.getGuildConfigBatch({
  guildIds: ['prime-guild', 'second-guild', 'missing-guild'],
});

results.forEach((entry, i) => {
  if (entry.status === 'success') {
    console.log(entry.result.theme);
  } else {
    console.error(`guild ${i} failed:`, entry.error);
  }
});
```

- **Returns**: `Promise<BatchItemResult<GuildConfig>[]>` — one entry per input
  guild ID, in input order. `BatchItemResult<T>` is the shape already used by the
  contract batch methods; `T` defaults to `string` (raw hex) there, and is
  parameterised to `GuildConfig` here.
- **Client-side fan-out.** There is no batch endpoint on the API: this issues one
  `GET /guilds/:id/config` per ID through a bounded worker pool. It saves the
  caller the orchestration, not the round trips.
- **Concurrency**: defaults to `5`, capped at `50`, matching `checkAccessBatch`.
  Out-of-range values throw `INVALID_INPUT`.
- **Partial failures**: a guild that 404s or fails response validation becomes an
  `'error'` entry; its siblings are unaffected and the batch still resolves.
- **Caching**: each guild is cached individually under
  `guilds:getGuildConfig:{guildId}`, so a batch call warms the cache for later
  single lookups and reuses entries a previous call already stored. In-flight
  deduplication is deliberately disabled inside a batch, so one caller's failure
  or cancellation cannot affect another sharing the same key.
- **Duplicate IDs** are preserved: each input position gets its own result.
- **Errors**: throws `INVALID_INPUT` when `guildIds` is missing, is not an array,
  or is empty.

---

## Contract Module (`client.contracts`)

The contract module provides typed convenience methods for common token-gating
patterns (ERC-20 balance, ERC-721 ownership, ERC-1155 balance), plus a generic
`readContract` escape hatch for any read-only function not covered by the
built-in methods. All methods participate in the same per-chain resolution
(issue #1) and multi-RPC failover (issue #14) logic — no duplicate
chain-selection code.

### Per-chain configuration errors

Entries in the `chains` map are **overrides, not replacements**: a partial entry inherits
every field it does not declare from the top-level config, so
`chains: { 8453: { contractAddress: '0x…' } }` still resolves the top-level `rpcUrl`.

A chain is rejected only when the merge leaves no usable RPC endpoint. The resulting
`INVALID_CONFIG` error names the chain and the missing fields — `No rpcUrl/contractAddress
configured for chainId 8543` — and its `details` carry `field: 'chainId'`, a `missing`
array, and `reason: 'NOT_FOUND'` (no entry for that chain) or `'INCOMPLETE'` (an entry
exists but leaves a required field unset).

A missing `contractAddress` alone does not fail chain resolution: it can be supplied per
call via `params.contractAddress`, and the individual methods raise their own more specific
errors (for example `contractAddress is required for guild owner lookup`).

When a call supplies an explicit `chainId`, provider-level failures name it too
(`No rpcUrl configured for chainId 8453`). Calls that do not name a chain keep the
long-standing generic wording (`rpcUrl is required for contract calls`).

### `getGuildOwner(params: GuildOwnerParams)`

Fetches the owner wallet address for a guild through the configured JSON-RPC
provider and contract address.

```typescript
await client.contracts.getGuildOwner({
  guildId: 'guild_1',
  chainId: 8453, // optional chain override
  contractAddress: '0x0000000000000000000000000000000000000000', // optional contract override
});
```

- **Returns**: `Promise<string>`
- **Requires**: an `rpcUrl` and a contract address from the resolved chain config or per-call `contractAddress`
- **Contract call**: `eth_call` to `getGuildOwner(bytes32)`
- **Guild ID encoding**: guild IDs are encoded to a 32-byte (bytes32) ABI value using the following strict, mutually exclusive rules applied in order:

  | Priority | Rule | Input example | Encoding |
  |----------|------|---------------|----------|
  | 1 | **Hex mode** — input matches `/^0x[a-fA-F0-9]{64}$/` exactly (case-insensitive, `0x` prefix + exactly 64 hex digits). | `"0xabcd…0001"` | Strip `0x`, lowercase. |
  | 2 | **Integer mode** — input matches `/^\d+$/` (only ASCII decimal digits, no leading spaces after trim) AND the value is ≤ `2^256 − 1`. Throws `INVALID_INPUT` if the value exceeds uint256 max. | `"42"`, `"0"` | `BigInt` → left-zero-padded 32-byte hex. |
  | 3 | **UTF-8 mode** — everything else. The raw string is UTF-8 encoded and right-zero-padded to 32 bytes. Throws `INVALID_INPUT` if the UTF-8 encoding exceeds 32 bytes. | `"prime-guild"`, `"guild_1"` | UTF-8 bytes → right-zero-padded 32-byte hex. |

  > **Disambiguation rules:**
  > - A string that starts with `0x` but is shorter than 66 characters or contains non-hex characters is **not** treated as a hex value — it falls through to UTF-8 mode (e.g. `"0xdeadbeef"` → UTF-8 bytes of that literal string).
  > - A string of only ASCII decimal digits (e.g. `"42"`) is **always** integer mode; it is never encoded as UTF-8, even though `"42"` and the integer 42 produce different byte sequences.
  > - These rules are mutually exclusive: an input is classified by exactly one mode, eliminating all ambiguity.

- **Errors**: throws `INVALID_CONFIG` for missing RPC/contract config (naming the chain and missing field when a `chainId` is in play — see [Per-chain configuration errors](#per-chain-configuration-errors)), `INVALID_INPUT` for invalid guild IDs (uint256 overflow or UTF-8 length > 32 bytes), `INVALID_ADDRESS` for invalid contract addresses, `HTTP_ERROR` for RPC failures, and `INVALID_RESPONSE` for malformed RPC return data

### `getMembershipTokenBalance(params: TokenBalanceParams)`

Fetches the raw membership token balance for a wallet through the configured
JSON-RPC provider and contract address.

```typescript
await client.contracts.getMembershipTokenBalance({
  walletAddress: '0x1234567890123456789012345678901234567890',
  chainId: 8453, // optional chain override
  contractAddress: '0x0000000000000000000000000000000000000000', // optional contract override
});
```

- **Returns**: `Promise<string>`
- **Requires**: `rpcUrl` and either `contractAddress` in client config or a per-call override
- **Contract call**: `eth_call` to `balanceOf(address)`
- **Errors**: throws `INVALID_CONFIG` for missing RPC/contract config (naming the chain and missing field when a `chainId` is in play — see [Per-chain configuration errors](#per-chain-configuration-errors)), `INVALID_ADDRESS` for invalid wallet or contract addresses, `HTTP_ERROR` for RPC failures, and `INVALID_RESPONSE` for malformed RPC return data

### `getERC20Balance(params: ERC20BalanceParams)`

Fetches the ERC-20 token balance for a wallet via `balanceOf(address)`.

```typescript
await client.contracts.getERC20Balance({
  walletAddress: '0x1234567890123456789012345678901234567890',
  contractAddress: '0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48', // USDC
  chainId: 1, // optional chain override
});
```

- **Returns**: `Promise<string>` — the raw balance in base units (decimal string).
- **Requires**: `contractAddress` (always required — there is no single "membership token" for arbitrary ERC-20 tokens).
- **Contract call**: `eth_call` to `balanceOf(address)`.
- **Errors**: throws `INVALID_CONFIG` for missing RPC config, `INVALID_ADDRESS` for invalid wallet/contract addresses, `HTTP_ERROR` for RPC failures, `INVALID_RESPONSE` for malformed return data.

### `ownsERC721Token(params: ERC721TokenParams)`

Checks whether a wallet owns a specific ERC-721 token via `ownerOf(uint256)`.

```typescript
await client.contracts.ownsERC721Token({
  walletAddress: '0x1234567890123456789012345678901234567890',
  tokenId: '42',
  contractAddress: '0xBC4CA0EdA7647A8aB7C2061c2E118A18a936f13D', // BAYC
  chainId: 1, // optional chain override
});
```

- **Returns**: `Promise<boolean>` — `true` if the wallet owns the token, `false` otherwise.
- **Requires**: `contractAddress` and `tokenId`.
- **Contract call**: `eth_call` to `ownerOf(uint256)`.
- **Errors**: throws `INVALID_CONFIG` for missing RPC config, `INVALID_ADDRESS` for invalid addresses, `HTTP_ERROR` for RPC failures, `INVALID_RESPONSE` for malformed return data.

### `getERC1155Balance(params: ERC1155BalanceParams)`

Fetches the ERC-1155 token balance for a wallet and token ID via `balanceOf(address,uint256)`.

```typescript
await client.contracts.getERC1155Balance({
  walletAddress: '0x1234567890123456789012345678901234567890',
  tokenId: '1',
  contractAddress: '0x495f947276749Ce646f68AC8c248420045cb7b5e', // OpenSea Shared Storefront
  chainId: 1, // optional chain override
});
```

- **Returns**: `Promise<string>` — the raw balance in base units (decimal string).
- **Requires**: `contractAddress` and `tokenId`.
- **Contract call**: `eth_call` to `balanceOf(address,uint256)`.
- **Errors**: throws `INVALID_CONFIG` for missing RPC config, `INVALID_ADDRESS` for invalid addresses, `HTTP_ERROR` for RPC failures, `INVALID_RESPONSE` for malformed return data.

### `readContract(params: ReadContractParams)`

Generic escape hatch for arbitrary read-only contract calls. Accepts an ABI fragment, function name, and arguments, then encodes and executes a single `eth_call`.

Use this when the built-in convenience methods (`getERC20Balance`, `ownsERC721Token`, `getERC1155Balance`) do not cover your use case.

```typescript
const result = await client.contracts.readContract({
  contractAddress: '0x...',
  abi: {
    type: 'function',
    name: 'totalSupply',
    inputs: [],
    outputs: [{ type: 'uint256' }],
  },
  functionName: 'totalSupply',
  args: [],
  chainId: 1, // optional chain override
});
// `result` is the raw hex response; decode with the exported helpers:
import { decodeUint256Result } from '@guildpass/sdk/contracts';
const supply = decodeUint256Result(result);
```

- **Returns**: `Promise<string>` — the raw hex result of the `eth_call`. Decode it with the exported helpers (`decodeUint256Result`, `decodeAddressResult`, `decodeBoolResult`).
- **Supported ABI types**: `address`, `bool`, `uint*` (all fixed-width variants up to `uint256`), `int*`, `bytes32`. Dynamic types (`bytes`, `string`) and tuples are **not** supported. For calls requiring dynamic encoding, use `batchEthCall` with pre-encoded calldata.
- **Requires**: `contractAddress`, `abi`, `functionName`, and `args` (an empty array for parameterless functions).
- **Contract call**: `eth_call` using the dynamically encoded selector + arguments from the supplied ABI fragment.
- **Errors**: throws `INVALID_CONFIG` for missing RPC config, `INVALID_ADDRESS` for invalid contract addresses, `INVALID_INPUT` when `functionName` does not match `abi.name`, when argument count/type mismatches occur, or when an unsupported ABI type is used, `HTTP_ERROR` for RPC failures, `INVALID_RESPONSE` for non-hex results.

### `getMembershipTokenBalances(params: MembershipTokenBalancesParams)`

Fetches the membership token balance for a wallet across **every** chain
configured in the client's `chains` map (or the single default `chainId` when
no per-chain map is set), in a single call.

All chain queries run in parallel. A failure on one chain's RPC does **not**
prevent results from the other chains — each chain's outcome is reported
independently via the `ChainBalanceResult` discriminated union.

```typescript
const client = new GuildPassClient({
  apiUrl: 'https://api.guildpass.xyz',
  chains: {
    1: {
      rpcUrl: 'https://eth.rpc.example',
      contractAddress: '0x1111111111111111111111111111111111111111',
    },
    8453: {
      rpcUrl: 'https://base.rpc.example',
      contractAddress: '0x2222222222222222222222222222222222222222',
    },
  },
});

const balances = await client.contracts.getMembershipTokenBalances({
  walletAddress: '0x1234567890123456789012345678901234567890',
  contractAddress: '0x...', // optional: override the contract on every chain
});

// balances: Record<number, ChainBalanceResult>
// {
//   1:    { status: 'success', balance: '1000000000000000000' },
//   8453: { status: 'error',   error:   'HTTP 503: Service Unavailable' },
// }

for (const [chainId, result] of Object.entries(balances)) {
  if (result.status === 'success') {
    console.log(`Chain ${chainId}: ${result.balance}`);
  } else {
    console.warn(`Chain ${chainId} failed: ${result.error}`);
  }
}
```

- **Returns**: `Promise<MembershipTokenBalancesResult>` — `Record<number, ChainBalanceResult>` keyed by chain ID.
  Each entry is either `{ status: 'success'; balance: string }` or `{ status: 'error'; error: string }`.
- **Requires**: at least one chain must be determinable from `chainId` or `chains` in the client config; throws `INVALID_CONFIG` otherwise.
- **Contract call**: one parallel `eth_call` to `balanceOf(address)` per configured chain.
- **Partial failures**: a failed chain is reported per-chain; all other chains are unaffected and returned normally.
- **Errors**: throws `INVALID_CONFIG` when no chains are configured, `INVALID_ADDRESS` for invalid wallet addresses. Per-chain RPC and contract errors are captured inside each chain's `ChainBalanceResult` rather than surfaced as thrown exceptions.

### `getMembershipTokenBalancesBatch(params: TokenBalancesBatchParams)`

Fetches membership token balances for multiple wallet addresses in a single
JSON-RPC batch request. Preserves the input order of wallet addresses.

```typescript
await client.contracts.getMembershipTokenBalancesBatch({
  walletAddresses: [
    '0x1234567890123456789012345678901234567890',
    '0xabcdefabcdefabcdefabcdefabcdefabcdefabcd',
  ],
  chainId: 8453, // optional chain override
  contractAddress: '0x0000000000000000000000000000000000000000', // optional contract override
  maxBatchSize: 100, // optional limit to avoid provider payload limits (default 100)
  chunk: true, // optional automatic splitting
});
```

- **Returns**: `Promise<BatchItemResult[]>` — ordered results, one per input address.
  Each result has `{ status: 'success', result: '<balance-as-string>' }` or
  `{ status: 'error', error: '<reason>' }`.
- **Requires**: same config as `getMembershipTokenBalance`
- **Contract call**: single JSON-RPC batch of `eth_call` to `balanceOf(address)`
- **Partial failures**: a failed address is reported individually; other addresses are unaffected
- **Errors**: throws `INVALID_INPUT` for empty arrays, `INVALID_ADDRESS` if any address is invalid (pre-flight), `INVALID_CONFIG` for missing RPC/contract config, `INVALID_RESPONSE` for non-array or malformed batch responses

### `getGuildOwnersBatch(params: GuildOwnersBatchParams)`

Fetches owners for multiple guild IDs in a single JSON-RPC batch request.
Preserves the input order of guild IDs.

```typescript
await client.contracts.getGuildOwnersBatch({
  guildIds: ['guild_1', 'guild_2', '42'],
  chainId: 8453, // optional chain override
  contractAddress: '0x0000000000000000000000000000000000000000', // optional contract override
  maxBatchSize: 100, // optional limit (default 100)
  chunk: true, // automatically split if guildIds exceeds maxBatchSize
});
```

- **Returns**: `Promise<BatchItemResult[]>` — ordered results, one per input guild ID.
  Each result has `{ status: 'success', result: '<owner-address>' }` or
  `{ status: 'error', error: '<reason>' }`.
- **Requires**: same config as `getGuildOwner`
- **Contract call**: single JSON-RPC batch of `eth_call` to `getGuildOwner(bytes32)`
- **Guild ID encoding**: each guild ID in the array is encoded using the same strict three-mode rules as `getGuildOwner` (see above)
- **Partial failures**: a failed guild is reported individually; other guilds are unaffected
- **Errors**: throws `INVALID_INPUT` for empty arrays, `INVALID_INPUT` if any guild ID is invalid (pre-flight), `INVALID_CONFIG` for missing RPC/contract config, `INVALID_RESPONSE` for non-array or malformed batch responses

### RPC Failover (`rpcUrls`)

When multiple RPC endpoints are provided via `rpcUrls` (or `chains[chainId].rpcUrls`),
the SDK automatically fails over across them on transient errors. No method signatures
change — failover is transparent to existing code.

```typescript
const client = new GuildPassClient({
  apiUrl: 'https://api.guildpass.xyz',
  rpcUrls: [
    'https://primary.rpc.example',
    'https://fallback.rpc.example',
    'https://emergency.rpc.example',
  ],
  contractAddress: '0x...',
});

// If primary.rpc.example returns a 503, the SDK silently retries
// on fallback.rpc.example. All contract methods benefit automatically.
const balance = await client.contracts.getMembershipTokenBalance({
  walletAddress: '0x...',
});
```

**What triggers failover**: Network errors (ECONNREFUSED, ETIMEDOUT), HTTP 429
(rate-limited), and any 5xx server error. Contract-level errors (execution reverted,
invalid parameters) are **not** retried on a different endpoint — they would fail on
every node.

**Interaction with retry**: Failover happens *inside* each retry attempt. When a URL
gets a transient error, the SDK first retries the same URL (if `retry.maxRetries` is
configured), then fails over to the next URL, where retry counters reset.

Upper-bound latency with N URLs and retry enabled:

```
N × (1 + maxRetries) × (timeoutMs + maxDelayMs)
```

**Observability hook**: Use `hooks.onRpcFailover` to monitor endpoint health:

```typescript
const client = new GuildPassClient({
  apiUrl: 'https://api.guildpass.xyz',
  rpcUrls: ['https://rpc1.example', 'https://rpc2.example', 'https://rpc3.example'],
  hooks: {
    onRpcFailover: ({ chainId, failedUrl, nextUrl, error }) => {
      // Emit metrics, log warnings, trigger alerts
      logger.warn('RPC failover', { chainId, from: failedUrl, to: nextUrl });
    },
  },
});
```

The hook fires each time the provider switches to a fallback URL. It does **not** fire
when the last URL fails (no next URL to promote). Hook failures are silently caught —
they never affect the failover flow.

### Pluggable RPC providers (`contractProvider`)

All contract reads go through the `ContractProvider` interface. By default the SDK builds a
raw JSON-RPC provider from `rpcUrl`, but you can supply your own via
`GuildPassClientConfig.contractProvider`, which **takes precedence over `rpcUrl`** (including
per-chain `chains[].rpcUrl`):

```typescript
interface ContractProvider {
  ethCall(request: { to: string; data: string }, options?: RequestOptions): Promise<unknown>;
  batchEthCall(requests: EthCallRequest[], options?: RequestOptions): Promise<BatchItemResult[]>;
}
```

Reuse an existing viem or ethers provider via the tree-shakeable adapter subpaths
(viem/ethers are optional peer dependencies — never bundled unless you import an adapter):

```typescript
// viem
import { createPublicClient, http } from 'viem';
import { viemContractProvider } from '@guildpass/sdk/adapters/viem';

const client = new GuildPassClient({
  apiUrl: 'https://api.example.com',
  contractAddress: '0x...',
  contractProvider: viemContractProvider(createPublicClient({ transport: http(rpcUrl) })),
});

// ethers
import { JsonRpcProvider } from 'ethers';
import { ethersContractProvider } from '@guildpass/sdk/adapters/ethers';

const client = new GuildPassClient({
  apiUrl: 'https://api.example.com',
  contractAddress: '0x...',
  contractProvider: ethersContractProvider(new JsonRpcProvider(rpcUrl)),
});
```

All contract methods behave identically regardless of provider, including error codes:
provider-level failures throw `HTTP_ERROR`, undecodable results throw `INVALID_RESPONSE`,
and missing configuration throws `INVALID_CONFIG`. The default `JsonRpcContractProvider`
is also exported from the root for advanced use.

#### RPC response size cap

Everything an RPC endpoint returns is untrusted input. The SDK therefore refuses to
parse any single `eth_call` result larger than **10 MiB** (10,485,760 bytes), so a
hostile or misbehaving node cannot force unbounded allocation. The limit is checked
against the payload's length *before* any decoding work touches it.

The value is an internal safety limit, not configurable API. It is far above any
legitimate return: a 1,000-call Multicall3 batch of 32-byte results is roughly 100 KiB.

- Single `eth_call` (including the Multicall3 `aggregate3` envelope): exceeding the cap
  throws `INVALID_RESPONSE`, which the failover logic treats as an endpoint failure.
- JSON-RPC batch: an oversized *item* is reported as that item's error entry and does not
  fail its siblings, matching the existing per-item contract.

Structurally malformed responses are rejected the same way — a non-hex body, a truncated
ABI word, an offset that is not 32-byte aligned or points outside the payload, a
`returnData` length that overruns the payload, or an array longer than the number of
calls actually requested all raise `INVALID_RESPONSE` rather than decoding to a
plausible-looking result.

### `batchEthCall(calls: BatchEthCallItem[], rpcUrl?: string, options?: RequestOptions & { maxBatchSize?: number, chunk?: boolean })`

Low-level helper for sending multiple arbitrary `eth_call` requests in one
JSON-RPC batch. Returns ordered per-item results. By default, it limits batches to 100 calls and throws an error if exceeded, unless `chunk: true` is passed.

```typescript
const results = await client.contracts.batchEthCall(
  [
    { to: '0xContractA', data: '0x70a08231...' },
    { to: '0xContractB', data: '0xab4511dc...' },
  ],
  'https://rpc.example.com',
  { maxBatchSize: 50, chunk: true }
);
```

- **Returns**: `Promise<BatchItemResult[]>` — ordered results, one per input call
- **Partial failures**: each call is individually resolved; errors do not affect sibling calls
- **Input validation**: each `to` address is validated as an Ethereum address before the RPC request is built
- **Errors**: throws `INVALID_INPUT` for empty/ invalid call descriptors, `INVALID_CONFIG` for missing `rpcUrl`, `INVALID_ADDRESS` for malformed `to` addresses, `HTTP_ERROR` for HTTP or RPC-level failures, `INVALID_RESPONSE` for non-array or structurally malformed batch responses
- **Provider compatibility**: works with any JSON-RPC provider that supports [batch requests](https://www.jsonrpc.org/specification#batch)
- **Custom providers**: when a `contractProvider` is configured it takes precedence and `rpcUrl` may be omitted; `INVALID_CONFIG` is only thrown when neither is available

---

## Response Metadata

Pass `includeMeta: true` in the `RequestOptions` of any service method to receive an object `{ data, meta }` instead of just `data`.

```typescript
const result = await client.guilds.getGuild(
  { guildId: 'prime-guild' },
  { includeMeta: true },
);
// result.data   → Guild
// result.meta   → ResponseMetadata
```

### `ResponseMetadata`

| Field | Type | Description |
| :--- | :--- | :--- |
| `requestId` | `string \| undefined` | `X-Request-ID` response header. |
| `correlationId` | `string \| undefined` | `X-Correlation-ID` response header. |
| `traceId` | `string \| undefined` | `Traceparent` (W3C) response header. |
| `status` | `number` | HTTP status code. |
| `durationMs` | `number` | Round-trip duration in milliseconds. |

On HTTP errors, `GuildPassError.requestMeta` carries the same metadata for correlation with backend logs.

---

## Address Utilities

Exported from the root package and from `@guildpass/sdk/utils`.

### `normaliseAddress(address: string, options?: { checksum?: boolean })`

Returns the canonical form of an address.

| Option | Type | Default | Description |
| --- | --- | --- | --- |
| `checksum` | `boolean` | `false` | When `true`, returns the EIP-55 checksummed form instead of lowercase. |

By default the address is trimmed and lowercased. Lowercase is the SDK's canonical
internal form — `GuildPassClient` derives its cache keys from it and `areAddressesEqual`
compares through it — so the default must stay lowercase for any value used as a key or
in a comparison. Use `{ checksum: true }` for display output only.

If `checksum: true` is passed a string that is not a well-formed `0x` + 40 hex-digit
address, the trimmed lowercase form is returned rather than a meaningless checksum.
`normaliseAddress` never throws; use `validateAddress` to reject malformed input.

```typescript
normaliseAddress('  0xD8DA6BF26964AF9D7EED9E03E53415D37AA96045  ');
// '0xd8da6bf26964af9d7eed9e03e53415d37aa96045'

normaliseAddress('0xd8da6bf26964af9d7eed9e03e53415d37aa96045', { checksum: true });
// '0xd8dA6BF26964aF9D7eEd9e03E53415D37aA96045'
```

### `validateAddress(address: string, options?: { strict?: boolean })`

Throws `GuildPassConfigError` with `GuildPassErrorCode.INVALID_ADDRESS` if the address is
not a well-formed `0x` + 40 hex-digit string, or `GuildPassErrorCode.INVALID_INPUT` if it
is empty. Returns `void` otherwise.

The EIP-55 checksum is verified automatically when the hex payload is **mixed case**,
because only mixed case carries checksum information. All-lowercase and all-uppercase
addresses carry none and are accepted without a checksum check.

| Option | Type | Default | Description |
| --- | --- | --- | --- |
| `strict` | `boolean` | `false` | Forces the checksum check on any casing, including all-lowercase. |

A checksum failure throws `INVALID_ADDRESS` with `details.reason === 'checksum_failed'`.

```typescript
validateAddress('0xd8dA6BF26964aF9D7eEd9e03E53415D37aA96045'); // ok — valid checksum
validateAddress('0xD8dA6BF26964aF9D7eEd9e03E53415D37aA96045'); // throws — bad checksum
validateAddress('0xd8da6bf26964af9d7eed9e03e53415d37aa96045'); // ok — no checksum info
validateAddress('0xd8da6bf26964af9d7eed9e03e53415d37aa96045', { strict: true }); // throws
```

---

## Error Handling

Every error the SDK throws is an instance of `GuildPassError`, but you
rarely want to catch that base class alone — a denied access check
("the wallet is correctly blocked") looks nothing like a network
outage ("the check itself never ran"), and string-matching `error.message`
to tell them apart is fragile. Instead, catch one of four typed
subclasses, exported from every entry point (`@guildpass/sdk`,
`@guildpass/sdk/errors`) and used consistently across `access`,
`membership`, `roles`, `guilds`, and `contracts`:

| Class | Thrown when | Carries `status`? |
| :--- | :--- | :--- |
| `GuildPassConfigError` | Local problem detected before any request: missing/invalid SDK config, bad call parameters, a misconfigured service instance. | No |
| `GuildPassNetworkError` | The request never received a response: connection failures, timeouts, cancellations. | No |
| `GuildPassApiError` | The server responded with a non-2xx status. | Yes |
| `GuildPassResponseValidationError` | A response was received but couldn't be trusted: malformed JSON, failed shape validation, signature/consensus verification failure. | Sometimes |

All four extend `GuildPassError`, so existing `instanceof GuildPassError`
and `error.code` checks keep working unchanged:

```typescript
import {
  GuildPassApiError,
  GuildPassNetworkError,
  GuildPassConfigError,
} from '@guildpass/sdk';

try {
  await client.access.checkAccess({ ... });
} catch (error) {
  if (error instanceof GuildPassApiError) {
    // error.status is guaranteed to be set (e.g. 500, 429)
  } else if (error instanceof GuildPassNetworkError) {
    // the request never reached the server — safe to retry
  } else if (error instanceof GuildPassConfigError) {
    // fix the call site or client config, retrying won't help
  }
}
```

---

## Response Validation

By default, service methods trust that the API response matches the
declared TypeScript return type. Since that's only a compile-time
guarantee, a malformed or incompatible response from the API (or a
misbehaving mock/proxy in front of it) would otherwise be returned to
your code as-is.

Set `validateResponses: true` in the client config to opt into runtime
checks on responses for the core public types (`AccessCheckResult`,
`Membership`, `GuildRole`, `Guild`, `GuildConfig`):

```typescript
const client = new GuildPassClient({
  apiUrl: '...',
  validateResponses: true,
});
```

When enabled, a response that doesn't match the expected shape causes
the SDK method to throw a `GuildPassResponseValidationError` with
`code: GuildPassErrorCode.INVALID_RESPONSE`, instead of silently
returning malformed data:

```typescript
try {
  await client.access.checkAccess({ ... });
} catch (error) {
  if (error instanceof GuildPassResponseValidationError) {
    // The API returned a response that doesn't match AccessCheckResult.
  }
}
```

This flag defaults to `false` to preserve existing behaviour for
current consumers. The guards themselves (`isAccessCheckResult`,
`isMembership`, `isGuildRoleArray`, `isGuild`, `isGuildConfig`) are
also exported directly from the package if you want to validate
responses yourself without enabling the flag:

```typescript
import { isGuild } from '@guildpass/sdk';

if (!isGuild(someUnknownValue)) {
  // handle the malformed payload
}
```

The guards are hand-written, dependency-free type predicates — no
schema validation library is used, so enabling this option has a
negligible effect on bundle size.

## Contract Testing

The SDK maintains an API schema fixture to ensure request and response assumptions are valid. Contract tests (`tests/services.test.ts`) assert that SDK method parameters map to the correct API endpoint and match expected schema response structures.

When the API contract changes, you must update the fixture (`tests/fixtures/api-contract.json`) to reflect the new structure:

1. Locate the endpoint within `api-contract.json`.
2. Update the `request.path` or `request.query` array if parameters change.
3. Update the `response.success` object to match the new successful response.
4. Update the `response.error` object if error formats change.
5. Run `npm test` to verify your SDK methods conform to the new API schema.

## Merkle-Proof Whitelist

### validateWhitelistRequirement

Validates a whitelist requirement by resolving the current root and verifying the proof.

```ts
function validateWhitelistRequirement(
  address: string,
  proof: string[],
  options: WhitelistValidationOptions
): Promise<boolean>
function buildTree(addresses: string[]): {
  root: string;
  getProof: (address: string) => string[];
  tree: MerkleTree;
}
function publishRoot(root: string, version?: number): Promise<void>
function rotateWhitelist(newRoot: string, version?: number): Promise<void>
```

## SIWE (Sign-In With Ethereum)

### `verifySiweSignature(params: SiweVerifyParams): SiweVerifyResult`

Synchronous EIP-4361 verification. Parses the message, checks domain, nonce,
expiry and `notBefore`, then recovers the signer with secp256k1 and compares it
against the address in the message. Purely local — **no network access**. Never
throws: every failure comes back as `{ success: false, error, code }`.

### `verifySiweSignatureAsync(params: SiweVerifyAsyncParams): Promise<SiweVerifyResult>`

Same checks, plus an **EIP-1271 fallback for smart-contract wallets** (Safe,
Argent, and account-abstraction wallets generally), which have no single ECDSA
keypair to recover from and instead answer `isValidSignature(bytes32,bytes)`
on-chain.

```typescript
import { verifySiweSignatureAsync } from '@guildpass/sdk';

const result = await verifySiweSignatureAsync({
  message: rawSiweMessage,
  signature,
  expectedDomain: 'example.com',
  contractProvider, // any ContractProvider — this is what enables the fallback
});
```

- **Requires RPC access**, unlike the synchronous function: when the fallback
  runs it performs an `eth_call` against the address claimed by the message.
  Omit `contractProvider` and the behaviour is identical to
  `verifySiweSignature`, with no request made.
- **The fallback only runs after a signature failure** (`SIWE_INVALID_SIGNATURE`).
  A domain, nonce, expiry or `notBefore` failure is terminal and returned
  unchanged — a contract signature cannot rescue a message addressed elsewhere.
- **It covers every signature failure, not just an address mismatch.** An
  EIP-1271 signature has no fixed length, so a multi-owner Safe signature is
  rejected by the 65-byte guard before ECDSA recovery is even attempted.
- **A valid EOA signature never touches the network** — the synchronous path
  succeeds first.
- **RPC failures do not reject.** A refused connection, a non-contract address
  or a reverting `isValidSignature` all resolve to
  `{ success: false, code: 'SIWE_INVALID_SIGNATURE' }`, preserving the
  never-throws contract.
- Verification succeeds only when the contract returns the EIP-1271 magic value
  as a full 32-byte word (`0x1626ba7e` followed by 28 zero bytes), exported as
  `EIP1271_MAGIC_VALUE`. A result that merely starts with the selector is
  rejected.

`verifySiweSignatureWithReplayProtection` accepts the same
`SiweVerifyAsyncParams`, so EIP-1271 verification and replay protection compose:
pass `contractProvider` and a smart-contract wallet gets both.

## EIP-712 (Typed-Data Signing)

Generic `eth_signTypedData_v4` support — `encodeType` / `hashStruct` /
`hashTypedData` implemented from scratch per the EIP-712 spec (no extra
runtime dependency), reusing the SDK's existing secp256k1 `ecRecover` for
verification (the same primitive `verifySiweSignature` uses). Values are
signed by the caller's own wallet/library (e.g. viem's `signTypedData`,
ethers' `signTypedData`, or a raw `eth_signTypedData_v4` RPC call) — this
module only encodes/hashes/verifies, it never signs.

### Generic primitives

```ts
function hashTypedData(typedData: EIP712TypedData): Uint8Array
function hashDomain(domain: EIP712Domain): Uint8Array
function hashStruct(primaryType: string, data: EIP712Message, types: EIP712Types): Uint8Array
function encodeType(primaryType: string, types: EIP712Types): string
function typeHash(primaryType: string, types: EIP712Types): Uint8Array

function verifyTypedDataSignature(
  domain: EIP712Domain,
  types: EIP712Types,
  primaryType: string,
  message: EIP712Message,
  signature: string,
  expectedSigner: string,
): EIP712VerifyResult
```

`verifyTypedDataSignature` never throws — failures are reported via
`EIP712VerifyResult.success === false` with a `code` from
`GuildPassErrorCode` (`EIP712_INVALID_SIGNATURE`, `EIP712_INVALID_TYPED_DATA`,
`EIP712_SIGNER_MISMATCH`).

### GuildRoleDelegation (reference schema)

A concrete typed-data schema for delegating a guild role from one wallet to
another, demonstrating the generic primitives above for a real GuildPass use
case:

```ts
interface GuildRoleDelegation {
  delegator: string; // address
  delegate: string;  // address
  guildId: string;   // bytes32
  roleId: string;    // bytes32
  expiry: bigint | number; // uint256, unix seconds
  nonce: bigint | number;  // uint256
}

function buildGuildRoleDelegationTypedData(
  domain: EIP712Domain,
  delegation: GuildRoleDelegation,
): EIP712TypedData

function verifyGuildRoleDelegationSignature(
  domain: EIP712Domain,
  delegation: GuildRoleDelegation,
  signature: string,
  options?: { checkExpiry?: boolean }, // default true
): EIP712VerifyResult

function verifyGuildRoleDelegationWithReplayProtection(
  domain: EIP712Domain,
  delegation: GuildRoleDelegation,
  signature: string,
  nonceStore: NonceStore,
  options?: { checkExpiry?: boolean },
): Promise<EIP712VerifyResult>
```

`verifyGuildRoleDelegationWithReplayProtection` reuses the same `NonceStore`
abstraction as SIWE's replay protection (`InMemoryNonceStore` or a
shared/Redis-backed implementation), consuming a
`guildId:roleId:delegator:nonce`-scoped key only after signature and expiry
checks fully succeed — a failed verification never burns a nonce.

> **Security note:** this module has not been through the same external
> audit as `crypto/secp256k1.ts` (see
> `docs/cryptographic-audit-secp256k1.md`, Issue #62). It reuses that
> audited `ecRecover` for the actual signature recovery, and its
> `hashTypedData` output is cross-checked byte-for-byte against `viem`'s
> independent implementation in `tests/eip712/eip712.test.ts`, but the
> EIP-712 encoding/hashing logic itself (`encodeType`, `hashStruct`, value
> encoding for each Solidity type) is new and should get its own security
> review before being relied on for anything high-value.
