# SDK Architecture

The GuildPass SDK is designed to be lightweight, modular, and easy to extend.

## Core Components

### 1. GuildPassClient

The main entry point. It orchestrates the various services and holds the configuration.

### 2. HttpClient

A wrapper around the native `fetch` API. It handles:

- Base URL management
- API Key injection
- Timeout handling
- Error normalization
- JSON parsing

### 3. Services

Each service corresponds to a specific domain of the GuildPass protocol:

- **AccessService**: Handles `/access` endpoints.
- **MembershipService**: Handles `/membership` endpoints.
- **RolesService**: Handles `/guilds/:id/roles` endpoints.
- **GuildsService**: Handles `/guilds` configuration endpoints.

### 4. ContractClient

Designed for future on-chain support. Currently provides stubs and validation patterns for:

- Token balance checks
- On-chain role requirement validation
- Guild ownership lookup

All on-chain reads flow through a pluggable **ContractProvider** abstraction (see below).

### 5. RPC Failover

When `rpcUrls` (or `chains[chainId].rpcUrls`) is configured with multiple endpoints, the SDK
automatically fails over across them on transient errors. This is implemented inside
`JsonRpcContractProvider`, which tries each URL in sequence:

1. The primary URL (`rpcUrl` or the first entry in `rpcUrls`) is attempted first.
2. On a **transient error** (network failure, 429 rate-limit, 5xx server error, timeout) the
   provider moves on to the next URL without surfacing the error to the caller.
3. On a **non-transient error** (contract revert, invalid parameters, malformed response)
   the error is propagated immediately — there is no point retrying a different node for a
   contract-level failure.
4. When all URLs are exhausted with transient errors, the last error is thrown.

**Failover vs retry ordering**: Failover and retry are independent layers with failover
running _inside_ each retry attempt. Concretely:

- If `retry.maxRetries` is configured, `HttpClient` retries the same URL with exponential
  backoff first.
- When HttpClient gives up (max retries hit or a non-retryable error), the error propagates
  up to `JsonRpcContractProvider`, which then moves to the next RPC URL.
- Retry counters reset for each new URL — the next URL gets its own full set of retry
  attempts.

This means the upper-bound latency is:

```
(N_rpc_urls) × (1 + maxRetries) × (timeoutMs + maxDelayMs)
```

For example, with 3 RPC URLs, `retry.maxRetries = 2`, `timeoutMs = 10_000`, and
`retry.maxDelayMs = 5_000`, the upper bound is `3 × 3 × 15_000 = 135_000ms`.

**Observability**: Configure the `onRpcFailover` hook to get notified each time the SDK
switches endpoints:

```ts
const client = new GuildPassClient({
  apiUrl: '...',
  rpcUrls: ['https://rpc1.example', 'https://rpc2.example'],
  hooks: {
    onRpcFailover: ({ chainId, failedUrl, nextUrl, error }) => {
      console.warn(`RPC failover on chain ${chainId}: ${failedUrl} → ${nextUrl}`);
    },
  },
});
```

Hook failures are silently caught and never affect the failover flow.

### 6. ContractProvider (pluggable RPC layer)

`ContractClient` never talks to a chain directly. Instead, every read goes through the
`ContractProvider` interface (`src/contracts/providers/provider.types.ts`):

```ts
interface ContractProvider {
  ethCall(request: { to: string; data: string }, options?: RequestOptions): Promise<unknown>;
  batchEthCall(requests: EthCallRequest[], options?: RequestOptions): Promise<BatchItemResult[]>;
}
```

**Provider resolution** (per call):

1. If `GuildPassClientConfig.contractProvider` is set, it is used for every contract read
   and takes precedence over `rpcUrl` (including per-chain `chains[].rpcUrl`).
2. Otherwise the default `JsonRpcContractProvider` is constructed from the resolved
   `rpcUrl` — the original raw JSON-RPC-over-fetch behavior, unchanged.
3. If neither is available, the call fails fast with `INVALID_CONFIG`
   (`"rpcUrl is required for contract calls"`), exactly as before.

**Responsibility split**: `ContractClient` owns input validation, chain/contract-address
resolution, batch size limits/chunking, and result decoding. Providers own only transport —
"make an eth_call reach a chain". This keeps error semantics uniform: provider-level
failures are always `HTTP_ERROR`, undecodable results are always `INVALID_RESPONSE`,
regardless of which provider is in use.

**Adapters** for viem and ethers live in dedicated subpath exports so they are only ever
bundled when explicitly imported:

- `@guildpass/sdk/adapters/viem` → `viemContractProvider(publicClient)`
- `@guildpass/sdk/adapters/ethers` → `ethersContractProvider(provider)`

The adapters are _structurally typed_ — they accept anything with a compatible `call()`
method and never `import` viem or ethers. Both libraries are optional peer dependencies
only; the core package stays zero-runtime-dependency, and consumers who don't import the
adapter subpaths see no bundle-size increase.

### 7. ChainWatcher (Real-time Cache Invalidation)

A stateful, long-lived background component (`src/chain/ChainWatcher.ts`) that proactively invalidates cached SDK data by watching on-chain events.

- **Lifecycle**: Initialized lazily via `GuildPassClient.watchWallet` or `watchGuild`. It maintains active WebSocket subscriptions (`eth_subscribe`) or HTTP polling intervals (`setInterval` + `eth_getLogs`) depending on the configured RPC transport.
- **Teardown**: Because it introduces a long-lived process into an otherwise request-response library, applications must explicitly call `client.stopWatching()` or `client.dispose()` to clear timers and sockets before exiting, avoiding memory leaks.
- **Degradation**: Falls back to interval-based HTTP polling when WebSockets are unavailable, ensuring compatibility with Edge and serverless environments.
- **Consistency**: It is strictly eventual and best-effort; it intentionally does not buffer deep reorganizations, choosing speed of invalidation over theoretical reorg safety.

### 8. Cross-Provider Consensus Verification (issue #307)

The opt-in `contractReadConsensus` config adds a second, complementary guarantee on top
of `rpcUrls` failover: not just _availability_ (the primary URL answers) but also
_correctness_ (the answer matches what other independent endpoints reported).

```ts
const client = new GuildPassClient({
  apiUrl: 'https://api.guildpass.xyz',
  contractAddress: '0x...',
  contractReadConsensus: {
    providers: [
      'https://rpc-a.example',   // independently operated RPCs
      'https://rpc-b.example',   // (typically run by different infra providers)
      'https://rpc-c.example',
    ],
    minProviders: 2,             // at least 2 must agree
  },
});
```

**Why this matters.** Multi-RPC failover (see `### 5. RPC Failover`) only catches
_responses that never arrive_, not responses that arrive with a wrong-but-well-formed
payload. A compromised, misconfigured, or malicious RPC returning a fabricated balance
_could_ grant (or deny) access without the SDK noticing, because the JSON-RPC reply was
structurally valid. Consensus mode forces cross-provider agreement on the raw hex
response before the SDK trusts it.

**Operation.** When `contractReadConsensus` is set, every supported single-call read
(`getMembershipTokenBalance`, `getERC20Balance`, `ownsERC721Token`,
`getERC1155Balance`, `getGuildOwner`, `readContract`) is fanned out to every URL in
`providers` in parallel via `Promise.allSettled`. The successful results are grouped
by raw-hex equality (case-insensitive, leading-zero-insensitive) and the SDK returns
the largest group's value iff its size is ≥ `minProviders`. Anything else surfaces as
`GuildPassError` with `code === CONSENSUS_MISMATCH` and a structured `details` payload
listing every disagreeing provider, the raw values each returned, and any per-provider
failures (network errors, reverts) so operators can attribute the lie.

**Batch reads** (`batchEthCall`, `getMembershipTokenBalancesBatch`,
`getGuildOwnersBatch`) follow the same precedence chain (custom `contractProvider` →
consensus → default) and apply the **same consensus logic but per item**. Each index of a
batch ballots its N raw hex results independently: a successful index returns the
front-runner value when ≥ `minProviders` agree; otherwise the index becomes
`{ status: 'error', error: 'Consensus mismatch at batch index i: ...' }` instead of a
throw. **A batch never throws for item-level disagreement** — only when every provider
rejected the batch outright (no per-item ballot to attribute) does the SDK surface a
batch-level `CONSENSUS_MISMATCH`. Chunked batches
(`getMembershipTokenBalancesBatch({ chunk: true })`) run the per-item quorum on each
chunk sequentially, so a 200-wallet input at `maxBatchSize=50` produces 4 sequential
consensus ballots preserving v1's chunked ordering guarantees.

**`validateRoleRequirement`** routes every internal `eth_call` (ERC-165 `supportsInterface`,
ERC-20 `balanceOf`, ERC-721 `ownerOf`, AccessControl `hasRole`) through the same
`resolveSingleEthCall` precedence chain used by the convenience methods, so TOKEN/NFT/ROLE
on-chain requirements benefit from consensus automatically. Each individual call (one
or more per requirement) holds the quorum; if any of them fails to meet it, the SDK
surfaces a single-call `CONSENSUS_MISMATCH` so the requirement fails-closed.

**Precedence.** Consensus sits in this order, top wins:

1. `contractProvider` (custom viem/ethers adapter) — bypasses consensus entirely.
2. `contractReadConsensus` — fans out across `consensus.providers`.
3. The default JSON-RPC/Multicall3 + failover path.

So consumers who wrap an existing RPC infrastructure retain their custom transport; consumers
who only need *correctness* opt in by listing multiple public endpoints. The two features
are orthogonal — `contractReadConsensus.providers` and the failover `rpcUrls` list are
deliberately separate arrays so a single endpoint exhaustion in failover cannot mask a
disagreement in consensus.

**Block tag.** Consensus-mode reads always use `'latest'` — a quorum over historical
`confirmations`-based reads would require out-of-band block-height agreement across
providers, which is reserved for a future enhancement. Verify on receipt: the parallel
providers should observe the same logical head block modulo a few-second chain tip
differences between providers, which is exactly what we want for fast token-gating
checks.

**Cancellation.** A caller-provided `AbortSignal` is honoured: any provider that
rejected with `REQUEST_CANCELLED` / `ABORTED` is re-thrown immediately rather than
folded into a generic mismatch — the user explicitly asked to cancel, and the SDK
respects that before running any consensus math.

**Multicall3 collision.** Setting `batchStrategy: 'multicall3'` AND
`contractReadConsensus` together is rejected with `INVALID_CONFIG` at the call site.
Multicall3 collapses multiple calls into a single on-chain transaction per provider,
which means an attacker that controls the provider's view of Multicall3 can dictate
every item's result and defeat cross-provider verification. Disable one of the two —
the SDK surfaces an error rather than silently picking whichever you probably didn't
intend.

**Validation.** `contractReadConsensus` is enforced at construction time by
`validateConfig` in `src/config/sdkConfig.ts`:

- `providers` must be a non-empty array of unique http(s) URLs (duplicates are
  rejected because they would inflate the apparent agreeing count from one physical
  endpoint).
- `minProviders` must be an integer in `[2, providers.length]`. A quorum of 1 has no
  majority-over-lying-RPC value, so it is explicitly rejected.

**Failure-mode code-style error details.** When the throw happens, the resulting
`GuildPassError.details` carries:

```ts
{
  totalProviders: number,    // length of consensus.providers
  successfulCount: number,   // providers that returned a usable raw hex
  failedCount: number,       // providers that errored out
  quorum: number,            // minProviders the SDK was configured to require
  groups: [
    { value: '0x...', urls: ['url1', 'url2'], count: 2 }, // distinct values
    ...
  ],
  failures: [
    { url: 'urlN', code: 'HTTP_ERROR', message: 'execution reverted' },
    ...
  ],
}
```

This lets operators identify the lying endpoint at a glance — no forensic
cross-referencing of logs.

## Batch Call Strategies

The SDK offers two strategies for executing batch `eth_call` contract reads:

1. **JSON-RPC Batching (`'jsonrpc'`)**

   - **How it works**: Sends a raw JSON-RPC array containing multiple `eth_call` requests inside a single HTTP POST payload.
   - **Pros**: Simple, does not require any on-chain smart contract deployments (completely client-side aggregation).
   - **Cons**: Many public or free-tier RPC providers (e.g. Infura on certain tiers, Cloudflare, or local rate-limited endpoints) throttle, disable, or return truncated arrays/single errors for JSON-RPC batch requests.
   - **When to prefer**: On private or paid RPC endpoints that explicitly support large JSON-RPC array payloads, and where you want to avoid overhead/gas associated with an on-chain read.

2. **Multicall3 Aggregation (`'multicall3'`)**
   - **How it works**: ABI-encodes the individual batch calls into a single call to `Multicall3.aggregate3(Call3[] calldata calls)` on-chain, targetting the canonical Multicall3 contract (`0xcA11bde05977b3631167028862bE2a173976CA11`). The provider sends this as a single standard `eth_call` request, then decodes the returned `Result[]` back into individual results.
   - **Pros**: Bypasses HTTP JSON-RPC batch limits/throttles entirely. Guarantees atomic/consistent reads from the same block, and isolates failures on a per-call basis via `allowFailure: true`.
   - **Cons**: Requires the canonical Multicall3 contract to be deployed on the target chain (which is true for almost all public EVM networks).
   - **When to prefer**: On public, free, or shared RPC endpoints to prevent silent batch truncation or HTTP throttling failures.

### Configuring the Batch Strategy

The default strategy is `'jsonrpc'` to maintain backwards compatibility. You can opt in globally or override it:

```ts
const client = new GuildPassClient({
  apiUrl: '...',
  rpcUrl: 'https://...',
  batchStrategy: 'multicall3', // Opt into Multicall3 globally
});
```

You can also override the Multicall3 contract address on custom chains:

```ts
const client = new GuildPassClient({
  apiUrl: '...',
  batchStrategy: 'multicall3',
  chains: {
    1337: {
      rpcUrl: 'https://localhost:8545',
      multicallAddress: '0xCustomMulticallAddress...',
    },
  },
});
```

### 8. Caching Layer

The SDK includes a resilient caching layer that wraps service methods.

- **CacheAdapter**: An interface for implementing custom cache backends (e.g., Redis).
- **InMemoryCacheAdapter**: A default, zero-dependency in-memory cache.
- **Resilience**: Caching is non-blocking and failure-tolerant. Cache errors are isolated from the main request flow.
- **Observability**: Developers can monitor cache health via lifecycle hooks.
- **Key format**: See [Cache Adapters → Key Composition](./cache-adapters.md#key-composition) for the exact cache key templates and [TTL Precedence](./cache-adapters.md#ttl-precedence) for expiry behaviour.

**In-flight request coalescing.** When `deduplication` is enabled (the
default), concurrent calls with identical arguments share a single
underlying HTTP request instead of each issuing their own — see
`GuildPassClient.coalesce()`/`withCache()` in `src/client/GuildPassClient.ts`.
Two exceptions, both there to stop one caller's request from affecting an
unrelated caller's:

- **A caller-supplied `signal` opts that call out of coalescing by
  default.** If two callers share the same cache key but only one passes an
  `AbortSignal`, they get independent requests — otherwise the signalled
  caller aborting would reject the other caller too, who never asked to be
  cancelled. Pass `deduplicate: true` explicitly to opt back in despite a
  signal being present; `deduplicate: false` always opts out.
- **`checkAccessBatch` never coalesces its items with each other or with a
  concurrent lone `checkAccess` call**, regardless of the `deduplication`
  config — see the `neverCoalesce` proxy in
  `GuildPassClient.buildCachedAccessService()`. Cache reads/writes still
  happen per item; only in-flight sharing is skipped.

`deduplicate` is a client-orchestration-only option — it is never present in
the object handed to the underlying service method or `HttpClient` (see
`stripDeduplicate()` in `GuildPassClient.ts`), so it can't leak into request
options a service forwards to the transport.

### 9. Middleware (Interceptor) Pipeline

The SDK provides a middleware mechanism for consumers to intercept, observe, or modify
every HTTP request and response without monkey-patching or forking the SDK.

#### Configuration

Pass an ordered `middleware` array in the client config:

```ts
import { GuildPassClient, createMiddleware } from '@guildpass/sdk';

const telemetry = createMiddleware('telemetry', {
  onRequest(payload) {
    payload.headers['X-Request-Source'] = 'my-app';
    payload.headers['X-Correlation-ID'] = crypto.randomUUID();
  },
  onResponse(payload) {
    console.log(`[${payload.request.method}] ${payload.request.path} → ${payload.status} (${payload.durationMs}ms)`);
  },
  onError(payload) {
    console.error(`[${payload.request.method}] ${payload.request.path} failed`, payload.error);
  },
});

const client = new GuildPassClient({
  apiUrl: 'https://api.guildpass.xyz',
  middleware: [telemetry],
});
```

#### Middleware Interface

```ts
interface Middleware {
  name: string;
  onRequest?(payload: RequestMiddlewarePayload): void | Promise<void>;
  onResponse?(payload: ResponseMiddlewarePayload): void | Promise<void>;
  onError?(payload: ErrorMiddlewarePayload): void | Promise<void>;
}
```

- `onRequest`: Called before the HTTP request is dispatched. Mutations to
  `payload.headers` and `payload.body` are carried forward to the actual fetch call.
- `onResponse`: Called after a successful HTTP response. Receives parsed data,
  status, response headers, and wall-clock duration. Throwing here triggers the error path.
- `onError`: Called when `onRequest`, `onResponse`, or the network itself fails.
  Error-phase middleware runs in reverse registration order.

#### Execution Order

```
Request:  M1 → M2 → M3 → HttpClient → Backend
Response: M1 ← M2 ← M3 ← HttpClient ← Backend
```

Registered middleware executes in registration order on the request path and in
reverse registration order on the response/error path.

#### Interaction with Other Layers

The middleware pipeline sits at a specific point in the SDK's layered architecture.
Understanding this ordering is critical for correct middleware design:

```
┌─────────────────────────────────────────────────────────┐
│  Service Layer (checkAccess, getMembership, etc.)        │
│  ┌───────────────────────────────────────────────────┐  │
│  │  Caching (withCache)                              │  │
│  │  • Cache hit → return immediately, no middleware  │  │
│  │  • Cache miss → continue below                    │  │
│  │  ┌─────────────────────────────────────────────┐  │  │
│  │  │  HttpClient                                  │  │  │
│  │  │  1. Middleware request phase (forward)       │  │  │
│  │  │  2. Pre-request hooks (legacy)              │  │  │
│  │  │  ┌───────────────────────────────────────┐  │  │  │
│  │  │  │  Retry Loop                           │  │  │  │
│  │  │  │  3. Rate limit (TokenBucket.acquire)  │  │  │  │
│  │  │  │  4. Transport.execute (fetch)         │  │  │  │
│  │  │  │  5. Retry on retryable status         │  │  │  │
│  │  │  └───────────────────────────────────────┘  │  │  │
│  │  │  6. Post-response hooks (legacy)            │  │  │
│  │  │  7. Middleware response phase (reverse)     │  │  │
│  │  └─────────────────────────────────────────────┘  │  │
│  │  • Store result in cache                          │  │
│  └───────────────────────────────────────────────────┘  │
└─────────────────────────────────────────────────────────┘
```

**Key interactions:**

| Layer | Relationship to Middleware | Notes |
|-------|---------------------------|-------|
| **Caching** | Wraps middleware (outside) | Middleware never fires on cache hits. Only fires on cache misses and after cache store. |
| **Retry** | Wraps transport (inside) | Middleware request fires once before the retry loop. Middleware response fires once after the final attempt. |
| **Rate limiting** | Inside retry loop | Per-attempt throttling; middleware does not see individual retry attempts. |
| **Hooks** (legacy) | Alongside middleware | Hooks fire after middleware on the request path, and before middleware on the response path. Hooks are observation-only; middleware can mutate. |

#### Error Handling

If `onRequest` throws, the remaining pipeline is skipped and the error is passed to
each downstream middleware's `onError` in reverse order, then re-thrown. The real
network call is never made.

If `onResponse` throws, the same reverse-order error propagation occurs through the
error path before the error is re-thrown to the caller.

Errors thrown inside `onError` handlers are silently swallowed to prevent infinite
error loops.

#### Usage Patterns

**Adding telemetry headers:**
```ts
createMiddleware('telemetry', {
  onRequest(payload) {
    payload.headers['X-Request-ID'] = crypto.randomUUID();
    payload.headers['X-Client-Version'] = '1.0.0';
  },
});
```

**Request/response logging:**
```ts
createMiddleware('logger', {
  onRequest(payload) {
    console.log(`→ ${payload.method} ${payload.path}`);
  },
  onResponse(payload) {
    console.log(`← ${payload.status} ${payload.request.path} (${payload.durationMs}ms)`);
  },
  onError(payload) {
    console.error(`✗ ${payload.request.path}`, payload.error);
  },
});
```

**Short-circuiting (e.g. for testing):**
```ts
const mockMiddleware: Middleware = {
  name: 'mock',
  onRequest() {
    throw new Error('SYNTHETIC'); // Prevents real network call
  },
  onError(payload) {
    if (payload.error.message === 'SYNTHETIC') {
      // Could store synthetic data for retrieval
    }
  },
};
```

## Data Flow

1. Developer initializes `GuildPassClient` with an optional `cache`.
2. Developer calls a method on a service (e.g., `client.access.checkAccess`).
3. If caching is enabled:
   - The SDK attempts to retrieve the value from the `cache`.
   - If successful (cache hit), the value is returned immediately.
   - If a cache failure occurs, the SDK logs the error via hooks and proceeds to the network.
4. Service validates input — a structural schema check first (for the
   subset of models covered so far, see
   [`docs/serialization-validation.md`](./serialization-validation.md)),
   then the field-level checks in `src/utils/validation.ts`.
5. Service calls `HttpClient` with the appropriate path and params.
6. `HttpClient` executes the fetch request.
7. If successful:
   - The SDK attempts to store the result in the `cache`.
   - If a cache failure occurs, the SDK logs the error via hooks and returns the response.
8. If the request fails, a `GuildPassError` is thrown with a specific `GuildPassErrorCode`.
9. The typed response is returned to the developer.

- **Zero External Dependencies**: The SDK relies on native platform features (like `fetch`, `AbortController`, and `WebSocket`) to keep the bundle size small.

## Security

### Signed API Responses

To prevent intermediaries from tampering with access decisions or guild metadata, the SDK provides an opt-in signature verification feature.

When `verifySignedResponses: true` and a `trustedSignerAddress` is configured, the SDK requires API endpoints for access checks and guild configuration to return a cryptographically signed envelope:

```json
{
  "data": { ...original payload... },
  "signature": "0x...",
  "signer": "0x..."
}
```

The SDK canonicalizes the `data` payload via standard JSON stringification and verifies the ECDSA signature against the configured `trustedSignerAddress` using either `viem` or `ethers` (which must be installed if this feature is used). If verification fails, a `GuildPassError` with code `UNVERIFIABLE_RESPONSE` is thrown.
- **Strong Typing**: Everything is typed with TypeScript for the best developer experience.
- **Fail Fast**: Input validation happens before network requests.
- **Environment Agnostic**: Works in Node.js (18+), Browsers, and Edge runtimes.
- **Optional Advanced Features**: Real-time event subscriptions via `WebSocketContractProvider` are opt-in and do not affect the default HTTP RPC path.

## Runtime Compatibility

The SDK targets three runtime environments, each with a distinct API surface. The table below documents
which Node.js-specific APIs are used, where they are isolated, and what the Edge-runtime behaviour is.

| Module                                           | Node.js API                                           | Edge alternative                                                             | Status                |
| ------------------------------------------------ | ----------------------------------------------------- | ---------------------------------------------------------------------------- | --------------------- |
| `src/utils/address.ts`                           | `import { createHash } from 'node:crypto'` (SHA3-256) | Replaced with `js-sha3`'s `keccak256` (universal pure-JS)                    | ✅ Edge-safe          |
| `src/siwe/siwe.helpers.ts` (`generateSiweNonce`) | `require('node:crypto').randomBytes`                  | `globalThis.crypto.getRandomValues` (Web Crypto) + `Math.random` last-resort | ✅ Edge-safe          |
| `src/utils/constantTime.ts`                      | —                                                     | Uses only `TextEncoder` (universal)                                          | ✅ Edge-safe natively |
| `src/crypto/secp256k1.ts`                        | —                                                     | Pure bigint arithmetic + `js-sha3`                                           | ✅ Edge-safe natively |
| `src/http/tokenBucket.ts`                        | —                                                     | Uses only `setTimeout` / `Date.now` (universal)                              | ✅ Edge-safe natively |
| `src/cache/cache.types.ts`                       | —                                                     | Uses only `Map` + `Date.now` (universal)                                     | ✅ Edge-safe natively |
| `src/errors/`                                    | —                                                     | Pure structural types                                                        | ✅ Edge-safe natively |
| `src/validation/schema.ts`                       | —                                                     | Pure runtime type predicates                                                 | ✅ Edge-safe natively |
| `src/http/httpClient.ts`                         | —                                                     | Uses `globalThis.fetch` (universal)                                          | ✅ Edge-safe natively |
| `src/contracts/providers/webSocketProvider.ts`   | —                                                     | Uses `WebSocket` (universal)                                                 | ✅ Edge-safe natively |
| `src/contracts/providers/jsonRpcProvider.ts`     | —                                                     | Uses `HttpClient` (fetch)                                                    | ✅ Edge-safe natively |

### Environment Detection

The SDK provides a shared environment-detection module at `src/utils/env.ts` with four predicates:

- `isNodeEnvironment()` — true when `globalThis.process.versions.node` exists.
- `hasWebCrypto()` — true when `globalThis.crypto.getRandomValues` is a function.
- `isEdgeRuntime()` — true when not Node.js, has `addEventListener`, and no `navigator`.
- `isBrowser()` — true when `window` and `document` are defined.

All four functions are safe to call in any environment — they never import platform-specific APIs.

### Known Limitations

1. **`generateSiweNonce()` crypto quality in exotic environments**: When neither Web Crypto nor
   Node.js `crypto` module is available (e.g., a severely restricted V8 sandbox), the function
   falls back to `Math.random()`. This is **not cryptographically secure** — the function will
   still produce a valid 16-character nonce, but it should not be relied upon for security in
   such environments. All mainstream runtimes (Node.js 18+, modern browsers, Cloudflare Workers,
   Deno, Bun) provide Web Crypto, so this fallback is purely defensive.

2. **`InMemoryNonceStore` sweep timer**: The optional background sweep interval uses `setInterval`
   with `unref()`. Edge runtimes may not support `unref()` — this is handled gracefully: the timer
   simply keeps the event loop alive if `unref` is unavailable. Users of `InMemoryNonceStore` in
   Edge environments should omit the `sweepIntervalMs` option or plan for manual `sweepExpired()` calls.

### Testing

The full test suite runs in three environments configured via `vitest.workspace.ts`:

- **Node** (`vitest environment: 'node'`): All tests in `tests/**/*.test.ts` (excluding `tests/compat/`).
- **Browser (JSDOM)** (`vitest environment: 'jsdom'`): `tests/compat/browser/**/*.test.ts`.
- **Edge (V8-isolate)** (`vitest environment: 'edge-runtime'`): `tests/compat/edge/**/*.test.ts`.

Run all three with:

```bash
pnpm test:compat
```
