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
running *inside* each retry attempt. Concretely:

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

The adapters are *structurally typed* — they accept anything with a compatible `call()`
method and never `import` viem or ethers. Both libraries are optional peer dependencies
only; the core package stays zero-runtime-dependency, and consumers who don't import the
adapter subpaths see no bundle-size increase.

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
    }
  }
});
```


### 7. Caching Layer

The SDK includes a resilient caching layer that wraps service methods.

- **CacheAdapter**: An interface for implementing custom cache backends (e.g., Redis).
- **InMemoryCacheAdapter**: A default, zero-dependency in-memory cache.
- **Resilience**: Caching is non-blocking and failure-tolerant. Cache errors are isolated from the main request flow.
- **Observability**: Developers can monitor cache health via lifecycle hooks.

## Data Flow

1. Developer initializes `GuildPassClient` with an optional `cache`.
2. Developer calls a method on a service (e.g., `client.access.checkAccess`).
3. If caching is enabled:
   - The SDK attempts to retrieve the value from the `cache`.
   - If successful (cache hit), the value is returned immediately.
   - If a cache failure occurs, the SDK logs the error via hooks and proceeds to the network.
4. Service validates input using `src/utils/validation.ts`.
5. Service calls `HttpClient` with the appropriate path and params.
6. `HttpClient` executes the fetch request.
7. If successful:
   - The SDK attempts to store the result in the `cache`.
   - If a cache failure occurs, the SDK logs the error via hooks and returns the response.
8. If the request fails, a `GuildPassError` is thrown with a specific `GuildPassErrorCode`.
9. The typed response is returned to the developer.

## Design Principles

- **Zero External Dependencies**: The SDK relies on native platform features (like `fetch`, `AbortController`, and `WebSocket`) to keep the bundle size small.
- **Strong Typing**: Everything is typed with TypeScript for the best developer experience.
- **Fail Fast**: Input validation happens before network requests.
- **Environment Agnostic**: Works in Node.js (18+), Browsers, and Edge runtimes.
- **Optional Advanced Features**: Real-time event subscriptions via `WebSocketContractProvider` are opt-in and do not affect the default HTTP RPC path.
