# SDK Guide

This guide covers advanced usage and patterns for the GuildPass SDK.

## Client Configuration Builder

As the SDK gains support for more options, configuring the `GuildPassClient` directly with an object can become complex. The `GuildPassClientBuilder` provides a fluent, strongly typed way to build and validate your client configuration before runtime.

```typescript
import { GuildPassClientBuilder } from "@guildpass/sdk";

// Validate and build fluently
const client = new GuildPassClientBuilder('https://api.guildpass.xyz')
  .withApiKey(process.env.GUILDPASS_API_KEY)
  .withTimeout(5000)
  .withRetry({ maxRetries: 3 })
  .build();
```

The builder validates your configuration when `.build()` is called, immediately throwing a `GuildPassConfigError` if any settings are invalid. Existing configuration methods (passing an object directly to the constructor) continue to work exactly as before.

## Error Handling

The SDK uses a custom `GuildPassError` class. You should always wrap SDK calls in try-catch blocks.

```typescript
import { GuildPassClient, GuildPassErrorCode } from "@guildpass/sdk";

try {
  await client.access.checkAccess({...});
} catch (error) {
  if (error instanceof GuildPassError) {
    switch (error.code) {
      case GuildPassErrorCode.UNAUTHORISED:
        // Handle invalid API key
        break;
      case GuildPassErrorCode.NOT_FOUND:
        // Handle missing guild or resource
        break;
      case GuildPassErrorCode.TIMEOUT:
        // Handle network timeout
        break;
      case GuildPassErrorCode.INVALID_RESPONSE:
        // Handle a malformed or unexpected non-JSON API response
        break;
    }
  }
}
```

### Typed error classes

Every SDK error extends `GuildPassError`, so a single `instanceof GuildPassError`
catch still works. On top of that, HTTP failures come back as subclasses of
`GuildPassApiError` keyed to the status code, which reads better than comparing
`error.status` yourself:

```typescript
import {
  GuildPassAuthenticationError, // 401: missing/invalid credentials
  GuildPassAuthorizationError,  // 403: authenticated but not allowed
  GuildPassValidationError,     // 400/422: server rejected the request payload
  GuildPassRateLimitError,      // 429: slow down, see retryAfterMs
  GuildPassServerError,         // 5xx: server-side failure, retrying is reasonable
  GuildPassTimeoutError,        // no response within the configured timeoutMs
  GuildPassCancellationError,   // the caller's AbortSignal fired
} from "@guildpass/sdk";

try {
  await client.access.checkAccess({...});
} catch (error) {
  if (error instanceof GuildPassRateLimitError) {
    // The server told us how long to wait.
    await sleep(error.retryAfterMs ?? 1000);
    // ... retry
  } else if (error instanceof GuildPassAuthenticationError) {
    // Refresh credentials, then retry.
  } else if (error instanceof GuildPassAuthorizationError) {
    // Don't retry: the account simply isn't allowed. Surface this to the user.
  } else if (error instanceof GuildPassServerError || error instanceof GuildPassTimeoutError) {
    // Transient: safe to retry with backoff.
  } else if (error instanceof GuildPassCancellationError) {
    // We cancelled this ourselves; usually nothing to do.
  }
}
```

Errors that received an HTTP response also carry `requestMeta` (request ID,
correlation ID, trace ID, duration) for support tickets and log correlation.
Cross-realm or duplicated-module setups (monorepos, `vm` contexts) where
`instanceof` fails can use the `isGuildPassError` type guard instead.

## Request Cancellation

You can cancel in-flight requests using an `AbortSignal`. This is useful for UI unmounting, manual cancellation, or server-side request propagation.

```typescript
const controller = new AbortController();

// Cancel after 2 seconds
setTimeout(() => controller.abort(), 2000);

try {
  await client.access.checkAccess({
    address: '0x...',
    guildId: '...',
  }, { signal: controller.signal });
} catch (error) {
  if (error.code === GuildPassErrorCode.REQUEST_CANCELLED) {
    console.log('Request was cancelled by the user');
  }
}
```

## Environment Support

### Node.js

The SDK works in Node.js 18+. If you are on an older version, you may need to polyfill `fetch`.

### Browser

The SDK is tree-shakeable and optimized for modern browsers. It does not include any Node-only dependencies.

## Safe Configuration Inspection

`client.getConfig()` returns a public snapshot of the SDK configuration for
debugging and diagnostics, but sensitive values are omitted. For example,
`apiKey` is not returned even when the client was constructed with one:

```typescript
const client = new GuildPassClient({
  apiUrl: 'https://api.guildpass.xyz',
  apiKey: process.env.GUILDPASS_API_KEY,
});

const config = client.getConfig();
console.log(config.apiUrl); // https://api.guildpass.xyz
console.log(config.apiKey); // undefined
```

The SDK keeps the real API key internally and continues to use it for
authenticated requests. Avoid logging the original constructor config object
directly if it contains secrets.

## Client Metadata Headers

The SDK can attach lightweight metadata headers to API requests, helping backend
services identify the SDK version, runtime, and integration source during
debugging and support.

### Default Behaviour

By default, every GuildPass API-relative request includes an
`X-GuildPass-SDK-Version` header with the bundled SDK version:

```typescript
const client = new GuildPassClient({
  apiUrl: 'https://api.guildpass.xyz',
  apiKey: process.env.GUILDPASS_API_KEY,
});

// Requests automatically include:
//   X-GuildPass-SDK-Version: 0.1.0
await client.guilds.getGuild({ guildId: 'prime-guild' });
```

### Custom Client Identification

Set `clientName` and `clientVersion` to identify your integration in the
`X-GuildPass-Client` header:

```typescript
const client = new GuildPassClient({
  apiUrl: 'https://api.guildpass.xyz',
  clientName: 'my-dapp',
  clientVersion: '2.1.0',
});

// Requests include:
//   X-GuildPass-SDK-Version: 0.1.0
//   X-GuildPass-Client: my-dapp/2.1.0
await client.access.checkAccess({ ... });
```

When `clientVersion` is omitted, only the client name is sent. When only
`clientVersion` is provided, it is sent alone.

### Disabling Metadata

Set `sendClientMetadata: false` to suppress all metadata headers:

```typescript
const client = new GuildPassClient({
  apiUrl: 'https://api.guildpass.xyz',
  sendClientMetadata: false,
});

// No X-GuildPass-* headers are attached.
await client.roles.getRoles({ guildId: 'guild-1' });
```

### Privacy and Security Considerations

- **Metadata headers are only sent to GuildPass API-relative requests.** External
  absolute URLs (e.g., custom RPC endpoints) never receive `X-GuildPass-*`
  headers. Similarly, the `X-API-Key` header is never sent to external URLs.
- **Metadata headers never include API keys, wallet secrets, or tokens.** The
  header values only contain the SDK version and the consumer-provided client
  name/version strings.
- **Client name and version are public by design.** Use generic identifiers if
  you prefer not to expose specific application names in network logs.
- **Configuration is inspectable.** `client.getConfig()` returns `clientName`,
  `clientVersion`, and `sendClientMetadata` (non-sensitive by design).

## Address Normalization and Checksums

Lowercase is the SDK's canonical internal form: it backs cache keys and every address
comparison, so `normaliseAddress` returns lowercase by default. Pass `{ checksum: true }`
when you want the EIP-55 checksummed form instead — typically for display.

`validateAddress` verifies the EIP-55 checksum automatically when the address is supplied
in mixed case, since mixed case is what carries checksum information. An all-lowercase or
all-uppercase address carries none, so it is accepted unchanged. `{ strict: true }` still
forces the check on any casing.

```typescript
import {
  normaliseAddress,
  toChecksumAddress,
  isChecksumAddress,
  validateAddress,
} from '@guildpass/sdk';

// Canonical lowercase form (default) — safe for cache keys and comparisons
const clean = normaliseAddress('0xD8DA6BF26964AF9D7EED9E03E53415D37AA96045');
// '0xd8da6bf26964af9d7eed9e03e53415d37aa96045'

// Opt-in EIP-55 checksummed form, for display
const display = normaliseAddress('0xd8da6bf26964af9d7eed9e03e53415d37aa96045', {
  checksum: true,
});
// '0xd8dA6BF26964aF9D7eEd9e03E53415D37aA96045'

// Convert to EIP-55 Checksum
const checksummed = toChecksumAddress('0xabc...');

// Check if an address has a valid checksum
const isValid = isChecksumAddress('0xd8dA6BF26964aF9D7eEd9e03E53415D37aA96045'); // true

// Mixed case → the checksum is verified automatically
validateAddress('0xd8dA6BF26964aF9D7eEd9e03E53415D37aA96045'); // ok
validateAddress('0xD8dA6BF26964aF9D7eEd9e03E53415D37aA96045'); // throws INVALID_ADDRESS

// All-lowercase / all-uppercase carry no checksum information → accepted as before
validateAddress('0xd8da6bf26964af9d7eed9e03e53415d37aa96045'); // ok

// Strict validation mode (forces the check regardless of casing)
validateAddress('0xd8da...', { strict: true });
```

## Multi-Chain Configuration

To support multiple GuildPass deployments across different networks, pass a `chains` map keyed by chain ID. Each entry can specify an `rpcUrl` and `contractAddress` for that chain.

```typescript
const client = new GuildPassClient({
  apiUrl: 'https://api.guildpass.xyz',
  chainId: 8453, // default chain
  chains: {
    1: {
      rpcUrl: 'https://eth-mainnet.example.com',
      contractAddress: '0xYourEthContract',
    },
    8453: {
      rpcUrl: 'https://base-mainnet.example.com',
      contractAddress: '0xYourBaseContract',
    },
    137: {
      rpcUrl: 'https://polygon-mainnet.example.com',
      contractAddress: '0xYourPolygonContract',
    },
  },
});

// Resolve config for a specific chain
const baseConfig = client.contracts.getChainConfig(8453);
// { rpcUrl: 'https://base-mainnet.example.com', contractAddress: '0xYourBaseContract' }

// Calling without an argument uses the client's default chainId
const defaultConfig = client.contracts.getChainConfig();
```

Entries in a `chains` map are overrides: a partial entry inherits the fields it does not
declare from the top-level config. Requesting a chain only throws a `GuildPassError` with
code `INVALID_CONFIG` when the merge leaves no usable RPC endpoint — and the error names
the chain and the missing field:

```typescript
// throws: No rpcUrl/contractAddress configured for chainId 42161
client.contracts.getChainConfig(42161);
```

The error's `details` carry `reason: 'NOT_FOUND'` when the chain has no entry at all, or
`reason: 'INCOMPLETE'` when it has one that leaves a required field unset, alongside a
`missing` array naming the fields.

The existing single-chain config (`rpcUrl` + `contractAddress` at the top level) remains fully backwards-compatible and is used as a fallback when no `chains` map is set.

## On-chain Validation Limitations

> [!NOTE]
> **Known limitations:** On-chain validation for `WHITELIST` access requirements is currently not supported and will throw a `NOT_IMPLEMENTED` error. For whitelist-style gating, we recommend using the SIWE-based or off-chain `client.access.checkAccess()` API instead.

## Client-side Rule Composition

Use `evaluateRule()` when you need to combine multiple independent access conditions on the client — for example, grant access if the backend check passes **or** the wallet holds enough membership tokens on-chain.

Each primitive delegates to the existing SDK service methods (`client.access.checkAccess`, `client.contracts.getMembershipTokenBalance`, `client.roles.hasRole`), so caching, retry, and error handling behave exactly as they do for direct calls. `and` / `or` nodes short-circuit: once the outcome is determined, remaining branches are not evaluated.

```typescript
import { GuildPassClient, evaluateRule } from '@guildpass/sdk';
import { InMemoryCacheAdapter } from '@guildpass/sdk';

const client = new GuildPassClient({
  apiUrl: 'https://api.guildpass.xyz',
  rpcUrl: 'https://mainnet.base.org',
  contractAddress: '0x...',
  cache: new InMemoryCacheAdapter(),
  cacheTtl: 60_000,
});

const { granted } = await evaluateRule(
  client,
  {
    type: 'or',
    rules: [
      { type: 'accessCheck', resourceId: 'premium-docs' },
      { type: 'tokenBalanceAtLeast', minAmount: '1000000000000000000' },
    ],
  },
  {
    walletAddress: '0x1234...5678',
    guildId: 'prime-guild',
  },
);

if (granted) {
  // hybrid gate passed
}
```

### Rule types

| Type | Delegates to | Notes |
| :--- | :--- | :--- |
| `accessCheck` | `client.access.checkAccess` | Requires `resourceId`; inherits `walletAddress` / `guildId` from context |
| `tokenBalanceAtLeast` | `client.contracts.getMembershipTokenBalance` | `minAmount` is raw base units (decimal string) |
| `hasRole` | `client.roles.hasRole` | Requires `roleId`; inherits `walletAddress` / `guildId` from context |
| `and` | recursive | All sub-rules must pass; short-circuits on first denial |
| `or` | recursive | Any sub-rule may grant; short-circuits on first grant |

Nested trees are supported:

```typescript
await evaluateRule(client, {
  type: 'or',
  rules: [
    {
      type: 'and',
      rules: [
        { type: 'accessCheck', resourceId: 'staff-tools' },
        { type: 'hasRole', roleId: 'moderator' },
      ],
    },
    { type: 'tokenBalanceAtLeast', minAmount: '5000000000000000000' },
  ],
}, context);
```

Pass `requestOptions` on the evaluation context to forward timeouts, retry policy, or cancellation signals to every primitive in the tree:

```typescript
await evaluateRule(client, rule, {
  walletAddress,
  guildId,
  requestOptions: { timeoutMs: 1500, signal: controller.signal },
});
```

## On-chain Guild Ownership

`client.contracts.getGuildOwner` queries the resolved chain contract through JSON-RPC:

```typescript
const ownerAddress = await client.contracts.getGuildOwner({
  guildId: 'guild_1',
});
```

You can override the target chain or contract per call:

```typescript
const ownerAddress = await client.contracts.getGuildOwner({
  guildId: '42',
  chainId: 8453,
  contractAddress: '0x1111111111111111111111111111111111111111',
});
```

The SDK validates the RPC and contract configuration before making the call,
encodes the guild ID as `bytes32`, calls `getGuildOwner(bytes32)`, and validates
that the RPC response decodes to an Ethereum address.

Contract reads inherit the SDK's transport configuration. This means they
support the same custom `fetch` transport, global `timeoutMs`, and `retry`
policy as standard API calls.

You can also provide per-call overrides for contract methods:

```typescript
const owner = await client.contracts.getGuildOwner({
  guildId: 'guild_1'
}, {
  timeoutMs: 2000,
  retry: { maxRetries: 2 }
});
```

## Batch Contract Reads

The batch helpers (`getMembershipTokenBalancesBatch`, `getGuildOwnersBatch`,
`batchEthCall`) combine multiple contract reads into a single JSON-RPC batch
request. By default, batches are limited to **100 calls** to stay within
common RPC provider payload limits.

If a batch exceeds the limit, the SDK throws a `GuildPassError` with code
`INVALID_INPUT`:

```typescript
// Throws: Batch size 200 exceeds maxBatchSize 100. Use chunk: true to split requests.
await client.contracts.getMembershipTokenBalancesBatch({
  walletAddresses: twoHundredAddresses,
});
```

### Automatic Chunking

Set `chunk: true` to automatically split oversized batches into sequential
requests of `maxBatchSize` each. Results are concatenated in order,
preserving the original input positions. Per-item errors remain isolated
across chunks.

```typescript
const results = await client.contracts.getMembershipTokenBalancesBatch({
  walletAddresses: twoHundredAddresses,
  chunk: true, // split into 2 × 100 sequential batch calls
});
// results.length === 200, order matches walletAddresses
```

### Tuning the Limit

Override the default limit with `maxBatchSize`:

```typescript
const results = await client.contracts.getGuildOwnersBatch({
  guildIds: largeGuildList,
  maxBatchSize: 50, // conservative limit for rate-limited provider
  chunk: true,
});
```

`maxBatchSize` must be a positive integer. Zero, negative and non-integer
values are rejected with an `INVALID_INPUT` error before any request is sent.
Omitting the option leaves the default of 100 in place.

The same options are available on the low-level `batchEthCall` method via
its `options` parameter:

```typescript
await client.contracts.batchEthCall(calls, rpcUrl, {
  maxBatchSize: 25,
  chunk: true,
});
```

## Caching and Request Deduplication

When a cache adapter is configured, the SDK automatically deduplicates concurrent
identical read requests. This ensures that if multiple callers request the same
data at the same time, only one network request is issued.

```typescript
import { GuildPassClient, InMemoryCacheAdapter } from '@guildpass/sdk';

const client = new GuildPassClient({
  apiUrl: 'https://api.guildpass.xyz',
  cache: new InMemoryCacheAdapter(),
});

// Concurrent identical reads share the same in-flight promise.
const [g1, g2] = await Promise.all([
  client.guilds.getGuild({ guildId: 'prime-guild' }),
  client.guilds.getGuild({ guildId: 'prime-guild' }),
]); // Only 1 network request is made.
```

The deduplication is scoped by the full cache key. If a request fails, the
in-flight promise is removed so that subsequent calls can retry the network
request.

The default timeout is 10 seconds. You can override this globally or for an individual service call:

```typescript
const client = new GuildPassClient({
  apiUrl: '...',
  timeoutMs: 5000, // 5 seconds
});

const access = await client.access.checkAccess(params, {
  timeoutMs: 1500, // override only this request
});

const guild = await client.guilds.getGuild(
  { guildId: 'prime-guild' },
  { timeoutMs: 2500 },
);
```

## Caching Resilience

The SDK treats caching as an optimization layer. Cache failures (e.g., a Redis
connection timeout or a malformed entry) are non-fatal and will never prevent a
successful API request.

- **Graceful Fallback**: If `cache.get()` fails, the SDK will continue with a
  network request.
- **Safe Persistence**: If `cache.set()` fails, the SDK will still return the
  successful API response.
- **Isolated Invalidation**: Failures during cache invalidation (`invalidateGuildCache`, `clearCache`) are caught and do not bubble up to the caller.

### Observing Cache Failures

Advanced users can observe cache failures by providing an `onCacheError` hook in the client configuration:

```typescript
const client = new GuildPassClient({
  apiUrl: '...',
  cache: new RedisCacheAdapter(),
  hooks: {
    onCacheError: (payload) => {
      console.error(`Cache ${payload.operation} failed for key: ${payload.key}`);
      console.error(payload.error);
    }
  }
});
```

The hook receives a `CacheErrorHookPayload` containing the operation name (`get`, `set`, `delete`, `clear`), the affected `key` (if any), and the original `error`.

For full details on implementing custom cache adapters — including TTL semantics, `deleteByPrefix`, serialisation, and production examples — see the [Cache Adapters Guide](./cache-adapters.md).

### Security Note

The SDK ensures that sensitive information such as API keys and authorization
headers are never passed to the cache layer. Cache keys only contain public
identifiers like guild IDs, wallet addresses, and resource IDs.

## Cancellation

Pass an `AbortSignal` via the `signal` option to cancel an in-flight request. The signal composes with the per-request timeout — whichever fires first wins.

```typescript
const controller = new AbortController();

// Cancel after 2 seconds (e.g. component unmount, route change)
setTimeout(() => controller.abort(), 2000);

try {
  // Standard API call
  const data = await client.guilds.getGuild({ guildId }, {
    signal: controller.signal,
  });

  // Contract read
  const balance = await client.contracts.getMembershipTokenBalance({
    walletAddress: '0x...',
  }, { signal: controller.signal });
} catch (err) {
  if (err instanceof GuildPassError && err.code === GuildPassErrorCode.REQUEST_CANCELLED) {
    // Request was cancelled by the caller
  } else if (err instanceof GuildPassError && err.code === GuildPassErrorCode.TIMEOUT) {
    // Request exceeded the configured timeout
  }
}
```

Passing an already-aborted signal throws `ABORTED` immediately without making a network request.

## Retry Policy

By default the SDK makes a single attempt and throws on failure. You can enable automatic retries with exponential backoff via the `retry` option.

### Global configuration
## Observability Hooks

The SDK supports optional request lifecycle hooks so you can integrate calls with logging, metrics, tracing, and debugging tools.

```typescript
const client = new GuildPassClient({
  apiUrl: 'https://api.guildpass.xyz',
  retry: {
    maxRetries: 3,        // number of retries after the initial attempt
    baseDelayMs: 200,     // starting backoff delay, doubles each attempt
    maxDelayMs: 5000,     // backoff ceiling
    retryableStatuses: [429, 500, 502, 503, 504], // default
  },
});
```

### Per-request retry overrides

Pass `retry` in the request options to change the retry policy for one call.
Each field is merged independently: local values win, fields omitted locally
inherit the global retry configuration, and fields omitted from both use the
library defaults listed below.

For example, normal or background work can use the global policy while a
latency-sensitive access check limits retries. This call uses one retry from
the local override and inherits the global `baseDelayMs` of 300 ms:

```typescript
import { GuildPassClient } from '@guildpass/sdk';

const client = new GuildPassClient({
  apiUrl: 'https://api.guildpass.xyz',
  retry: {
    maxRetries: 3,
    baseDelayMs: 300,
  },
});

const access = await client.access.checkAccess(
  {
    walletAddress: '0x1111111111111111111111111111111111111111',
    guildId: 'prime-guild',
    resourceId: 'members-area',
  },
  {
    retry: { maxRetries: 1 },
  },
);
```

### Defaults and safe usage

| Option | Default | Notes |
| :--- | :--- | :--- |
| `maxRetries` | `0` | Set to `0` to disable retries entirely. |
| `baseDelayMs` | `200` | Backoff starts here and doubles each attempt. |
| `maxDelayMs` | `5000` | Backoff will never exceed this value. |
| `retryableStatuses` | `[429, 500, 502, 503, 504]` | 4xx errors other than 429 are not retried. |
| `allowMutatingRetry` | `false` | POST/PUT/PATCH/DELETE are **not** retried unless this is `true`. |
| `jitter` | `true` | Randomizes each backoff by ±25% so many clients do not retry in lockstep. Set to `false` for deterministic delays (e.g. in tests). |

The SDK respects the `Retry-After` response header on retryable responses, waiting the server-specified duration before retrying rather than using the computed backoff. Every retry waits at least the computed backoff (or `Retry-After`, when present), whether or not a `rateLimit` bucket is configured.

Non-idempotent methods (POST, PATCH) are never retried unless you explicitly set `allowMutatingRetry: true`. Only enable this when you are certain the operation is safe to repeat.
  hooks: {
    onRequest: ({ method, path }) => {
      console.log('request started', method, path);
    },
    onResponse: ({ method, path, status, durationMs }) => {
      console.log('request succeeded', method, path, status, durationMs);
    },
    onError: ({ method, path, error, durationMs }) => {
      console.error('request failed', method, path, error.message, durationMs);
    },
  },
});
```

Hook payloads expose safe request metadata only. Sensitive values like the API key, `Authorization` and `Cookie` headers, and full request body are not included in hook payloads. Headers are redacted consistently before reaching your callbacks, and hook failures are logged without changing the normal SDK response behavior.

⚠️ **Warning:** Be careful not to log sensitive application data. Although the SDK automatically redacts known sensitive headers (`authorization`, `x-api-key`, `cookie`, `set-cookie`), any proprietary query parameters or custom headers containing sensitive info should be handled securely.

## Response Metadata

Pass `includeMeta: true` in any service call's `RequestOptions` to receive diagnostic metadata alongside the response data. This is useful for correlating client-side failures with backend logs and support tickets without changing the default ergonomic API.

```typescript
import { GuildPassClient } from '@guildpass/sdk';

const client = new GuildPassClient({ apiUrl: 'https://api.guildpass.xyz' });

// Default: returns plain data (backwards-compatible)
const guild = await client.guilds.getGuild({ guildId: 'prime-guild' });
// → { id: 'prime-guild', name: 'Prime Guild', ... }

// Opt-in: includeMeta returns { data, meta }
const result = await client.guilds.getGuild(
  { guildId: 'prime-guild' },
  { includeMeta: true },
);
console.log(result.data.name);          // 'Prime Guild'
console.log(result.meta.requestId);     // 'req-abc-123' (if present)
console.log(result.meta.correlationId); // 'corr-xyz-789' (if present)
console.log(result.meta.traceId);       // W3C traceparent (if present)
console.log(result.meta.status);        // 200
console.log(result.meta.durationMs);    // 142
```

### Metadata Fields

| Field | Type | Description |
| :--- | :--- | :--- |
| `requestId` | `string \| undefined` | Value of the `X-Request-ID` response header. |
| `correlationId` | `string \| undefined` | Value of the `X-Correlation-ID` response header. |
| `traceId` | `string \| undefined` | Value of the `Traceparent` (W3C) response header. |
| `status` | `number` | HTTP status code of the response. |
| `durationMs` | `number` | Round-trip duration in milliseconds. |

### Supported Services

All read-oriented service methods support `includeMeta`:

- `client.access.checkAccess(params, { includeMeta: true })`
- `client.access.checkRoleAccess(params, { includeMeta: true })`
- `client.membership.getMembership(params, { includeMeta: true })`
- `client.roles.getRoles(params, { includeMeta: true })`
- `client.roles.getUserRoles(params, { includeMeta: true })`
- `client.guilds.getGuild(params, { includeMeta: true })`
- `client.guilds.getGuildConfig(params, { includeMeta: true })`

### Metadata on Errors

When an HTTP error occurs (4xx, 5xx), the thrown `GuildPassError` includes a `requestMeta` property with the same diagnostic information. This lets you correlate failures with backend logs even in catch blocks:

```typescript
try {
  await client.guilds.getGuild({ guildId: 'unknown' });
} catch (error) {
  if (error instanceof GuildPassError) {
    console.error(`Request failed`, {
      code: error.code,
      status: error.status,
      requestId: error.requestMeta?.requestId,
      correlationId: error.requestMeta?.correlationId,
    });
  }
}
```

The `requestMeta` property is `undefined` for network errors, timeouts, and cancellations where no HTTP response was received.

### Security

Only the safe diagnostic headers (`X-Request-ID`, `X-Correlation-ID`, `Traceparent`) are captured. Sensitive headers like `Authorization`, `X-API-Key`, `Cookie`, and `Set-Cookie` are never exposed in response metadata. The metadata object is intentionally limited to fields useful for diagnostics and support.

## SIWE Replay Protection

`verifySiweSignature` checks a Sign-In With Ethereum (EIP-4361) message's
signature, domain, nonce, and expiry, but it does not track which nonces have
already been used. On its own, the exact same valid signed message can be
re-submitted and re-verified any number of times. The nonce exists to stop
this, but only if the relying party remembers which nonces it has already
accepted.

The SDK provides a pluggable `NonceStore` (mirroring the `CacheAdapter`
pattern), an in-memory reference implementation, and a
`verifySiweSignatureWithReplayProtection` wrapper that verifies the signature
and atomically consumes the nonce, rejecting any message whose nonce has
already been used.

```typescript
import {
  InMemoryNonceStore,
  verifySiweSignatureWithReplayProtection,
} from '@guildpass/sdk';

const nonceStore = new InMemoryNonceStore();

const result = await verifySiweSignatureWithReplayProtection(
  { message: rawSiweMessage, signature },
  nonceStore,
);

// Smart-contract wallets: add a contractProvider and the same call additionally
// falls back to EIP-1271 verification, so replay protection and contract-wallet
// support compose instead of being mutually exclusive.
//
//   await verifySiweSignatureWithReplayProtection(
//     { message: rawSiweMessage, signature, contractProvider },
//     nonceStore,
//   );

if (result.success) {
  // First time through: verified and the nonce is now consumed.
} else {
  // A second submission of the same message lands here with
  // result.code === 'SIWE_REPLAY_DETECTED'.
}
```

Verification runs first; the nonce is consumed only after the signature and all
EIP-4361 checks pass. A failed or malformed request therefore never burns a
nonce, so an attacker cannot grief a legitimate user by pre-consuming it. The
consumed marker's TTL is aligned with the message's `expirationTime`, so a nonce
is never pruned while the message it protects is still valid.

### Production Deployments Need a Shared Store

`InMemoryNonceStore` keeps its record in a single process. On a multi-instance
server (multiple nodes behind a load balancer, or serverless functions), a nonce
consumed on one instance is unknown to the others, which leaves a replay window
across the fleet. For those deployments, back the same `NonceStore` interface
with a shared store such as Redis.

The interface is deliberately small so this is straightforward:

```typescript
import type { NonceStore } from '@guildpass/sdk';
import type { Redis } from 'ioredis';

class RedisNonceStore implements NonceStore {
  constructor(private readonly redis: Redis) {}

  async consume(nonce: string, ttl?: number): Promise<boolean> {
    // SET key value NX PX <ttl> returns null when the key already exists.
    // NX makes the check-and-consume atomic in a single round-trip, so two
    // concurrent verifications of the same nonce cannot both succeed.
    const key = `siwe:nonce:${nonce}`;
    const outcome =
      ttl && ttl > 0
        ? await this.redis.set(key, '1', 'PX', ttl, 'NX')
        : await this.redis.set(key, '1', 'NX');
    return outcome === 'OK';
  }

  async has(nonce: string): Promise<boolean> {
    return (await this.redis.exists(`siwe:nonce:${nonce}`)) === 1;
  }
}
```

Redis `SET ... NX` gives the same atomic check-and-consume guarantee as the
in-memory store, and `PX` applies the TTL so consumed nonces expire on their own
without unbounded growth.

### Security Note

`consume` is the single authoritative replay gate: it returns `true` only when a
nonce was previously unused. Unlike the cache layer, a `NonceStore` failure is
not silently ignored. If the store throws while consuming, the wrapper fails
closed and rejects verification rather than risk accepting a replay it could not
rule out.
