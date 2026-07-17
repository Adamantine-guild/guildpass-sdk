# API Reference

## Import Paths

The SDK supports tree-shakeable subpath imports. You can import focused modules directly to minimize your bundle size:

- `@guildpass/sdk/client`: Main `GuildPassClient` class.
- `@guildpass/sdk/errors`: Error classes and codes (`GuildPassError`, `GuildPassErrorCode`).
- `@guildpass/sdk/utils`: Utility functions (`normaliseAddress`, `validateAddress`, `formatIsoDate`, etc.).
- `@guildpass/sdk/types`: TypeScript definitions.
- `@guildpass/sdk/adapters/viem`: `viemContractProvider` — wrap a viem `PublicClient` as the SDK's contract provider.
- `@guildpass/sdk/adapters/ethers`: `ethersContractProvider` — wrap an ethers `Provider` as the SDK's contract provider.

You can also import everything from the root `@guildpass/sdk` (the adapter subpaths are intentionally excluded from the root export so they never affect your bundle unless imported).

## GuildPassClient

The main constructor.

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

### `checkRoleAccess(params: RoleAccessCheckParams, options?: RequestOptions)`

Checks if a wallet has a specific role.

- **Returns**: `Promise<boolean>`

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

Fetches all roles for a guild.

- **Returns**: `Promise<GuildRole[]>`

### `getUserRoles(params: GetUserRolesParams, options?: RequestOptions)`

Fetches roles assigned to a user.

- **Returns**: `Promise<GuildRole[]>`

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

---

## Contract Module (`client.contracts`)

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

- **Errors**: throws `INVALID_CONFIG` for missing RPC/contract config, `INVALID_INPUT` for invalid guild IDs (uint256 overflow or UTF-8 length > 32 bytes), `INVALID_ADDRESS` for invalid contract addresses, `HTTP_ERROR` for RPC failures, and `INVALID_RESPONSE` for malformed RPC return data

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
- **Errors**: throws `INVALID_CONFIG` for missing RPC/contract config, `INVALID_ADDRESS` for invalid wallet or contract addresses, `HTTP_ERROR` for RPC failures, and `INVALID_RESPONSE` for malformed RPC return data

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
the SDK method to throw a `GuildPassError` with
`code: GuildPassErrorCode.INVALID_RESPONSE`, instead of silently
returning malformed data:

```typescript
try {
  await client.access.checkAccess({ ... });
} catch (error) {
  if (error instanceof GuildPassError && error.code === GuildPassErrorCode.INVALID_RESPONSE) {
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
