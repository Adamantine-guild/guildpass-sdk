# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/), and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

### Added
- **`client.guilds.getGuildConfigBatch(params, options?)`** — resolves [#389](https://github.com/Adamantine-Guild/guildpass-sdk/issues/389). Fetches configuration for several guilds in one call, returning `BatchItemResult<GuildConfig>[]` in input order with per-guild failure isolation, matching the contract of `checkAccessBatch` and `getGuildOwnersBatch`.
  - **`BatchItemResult` is now generic**, `BatchItemResult<T = string>`. The default preserves the existing meaning (raw hex from the contract batch methods) so every current call site and consumer type stays source-compatible; batch methods resolving richer values parameterise it instead.
  - Client-side fan-out over the existing `GET /guilds/:id/config` endpoint — no batch endpoint is assumed — through a bounded worker pool. `concurrency` defaults to `5` and is capped at `50`, matching `checkAccessBatch`.
  - Each guild is cached individually under `guilds:getGuildConfig:{guildId}`, so a batch call warms the cache for later single lookups and reuses entries already stored. In-flight deduplication is disabled inside the batch so one caller's failure or cancellation cannot affect another sharing a key.
  - Throws `INVALID_INPUT` for a missing, non-array or empty `guildIds`, and for a `concurrency` outside `1..50`.
- **EIP-1271 smart-contract wallet support for SIWE** — resolves [#213](https://github.com/Adamantine-Guild/guildpass-sdk/issues/213). New `verifySiweSignatureAsync(params)` runs the same EIP-4361 checks as `verifySiweSignature` and, when the signature does not verify as an EOA signature, asks the claimed address's contract via `isValidSignature(bytes32,bytes)`. Safe, Argent and other account-abstraction wallets can now sign in.
  - The fallback fires on **any** signature failure, not only a recovered-address mismatch. This is load-bearing: an EIP-1271 signature has no fixed length, so a multi-owner Safe signature is rejected by the 65-byte guard before ECDSA recovery is ever attempted — a fallback keyed on the mismatch alone would never reach a real contract wallet.
  - Domain, nonce, expiry and `notBefore` failures stay terminal and are returned unchanged; a contract signature cannot rescue a message addressed to the wrong domain.
  - Verification requires the returned `bytes4` magic value to fill its whole 32-byte word (`0x1626ba7e` plus 28 zero bytes, exported as `EIP1271_MAGIC_VALUE`); a result that merely starts with the selector is rejected.
  - RPC failures, non-contract addresses and reverting `isValidSignature` calls all resolve to `{ success: false, code: 'SIWE_INVALID_SIGNATURE' }` — the never-throws contract of `SiweVerifyResult` is preserved.
  - `verifySiweSignatureWithReplayProtection` now accepts the same `SiweVerifyAsyncParams`, so EIP-1271 verification and replay protection compose. This widens the accepted parameter type and is backward compatible.
  - **`verifySiweSignature` is unchanged**, along with all of its tests: the synchronous EOA path performs no network I/O and behaves exactly as before. Omitting `contractProvider` makes the async variant identical to it.
- **`InMemoryCacheAdapter` supports optional `maxEntries` LRU eviction** — resolves [#386](https://github.com/Adamantine-Guild/guildpass-sdk/issues/386). `new InMemoryCacheAdapter({ maxEntries: 5_000 })` caps the cache; once full, the least-recently-used entry is evicted on the next write. This closes a long-standing contradiction: [`docs/cache-adapters.md`](docs/cache-adapters.md) already documented a `ttl: undefined` entry as stored *"until explicitly deleted or evicted by LRU"*, but the adapter had no eviction of any kind.
  - Recency is refreshed by `get` as well as `set`, so a frequently-read key survives even when it was inserted first. Both paths re-insert rather than overwrite: `Map.set` on an existing key keeps its original insertion position, which would have made the eviction order FIFO while still passing the simple cases.
  - Within `get`, the TTL sweep runs before the recency refresh, so an expired entry is dropped rather than promoted to most-recently-used.
  - New `size()` method reports the number of entries held. It **includes** entries whose TTL has elapsed but which have not been swept yet, since expiry is lazy and happens on read.
  - `maxEntries` must be a positive integer; anything else throws `INVALID_CONFIG` at construction. Eviction itself never throws.
  - Omitting `maxEntries` preserves the previous unbounded behaviour exactly — the recency bookkeeping is skipped entirely in that mode, so there is no added cost for existing users.
  - `InMemoryCacheAdapterOptions` is exported for consumers who want to type their options.

### Fixed
- **`chains` entries are now resolved as overrides instead of replacements** — resolves [#393](https://github.com/Adamantine-Guild/guildpass-sdk/issues/393). `resolveChainConfig` returned the matching `chains[chainId]` entry verbatim, so a partial entry such as `chains: { 8453: { contractAddress: '0x…' } }` silently discarded the top-level `rpcUrl` and the call failed with a generic error that never mentioned the chain. Every field a `chains` entry does not declare is now inherited from the top level, matching what the README has always documented.
  - Fields are merged individually rather than by spreading, so a field an entry declares as `undefined` no longer clobbers a usable top-level value.
  - Whether an RPC endpoint is present is decided through `mergeRpcUrls`, so a config supplying only `rpcUrls` is no longer misreported as missing `rpcUrl`.
  - Unresolvable chains now throw `INVALID_CONFIG` naming the chain and the missing fields — `No rpcUrl/contractAddress configured for chainId 8543` — with `details.missing` and `details.reason` of `'NOT_FOUND'` (no entry) or `'INCOMPLETE'` (entry present but insufficient).
  - **Behaviour change:** a `chains` map that lacks the requested chain no longer throws unconditionally; it throws only when the top-level fallback also leaves no usable RPC endpoint. A missing `contractAddress` alone never fails chain resolution, since it can be supplied per call and the individual methods raise their own more specific errors.
  - Provider-level RPC errors name the chain when the caller passed an explicit `chainId` (`No rpcUrl configured for chainId 8453`). Calls that do not name a chain keep the existing `rpcUrl is required for contract calls` wording unchanged.

### Security
- **Hardened JSON-RPC response decoding against malformed and adversarial node responses** — resolves [#401](https://github.com/Adamantine-Guild/guildpass-sdk/issues/401). `aggregate3` return decoding interpreted node-controlled offsets and lengths with no validation, so a malformed envelope could decode into a plausible-looking result rather than an error: a reported success carrying no data, a reported contract revert that never happened, or an all-items-missing batch that looked like an honest partial response and therefore never triggered failover. An oversized array-length word also drove an effectively unbounded loop.
  - Every offset, length and flag is now bounds- and alignment-checked before use, ABI words are parsed as `BigInt` instead of `parseInt` (which silently lost precision and returned `NaN` for unparseable input), and the array length is bounded by the number of calls actually requested. All rejections surface as `GuildPassErrorCode.INVALID_RESPONSE`.
  - Revert-reason decoding no longer trusts an attacker-controlled string length; it is bounded by the data present and still degrades to a generic message instead of throwing.
  - Added a **10 MiB cap** on any single `eth_call` result, checked against the payload length before decoding. A single call over the cap throws `INVALID_RESPONSE`; an oversized item inside a JSON-RPC batch becomes that item's error entry, preserving the per-item contract. Documented in [`docs/api-reference.md`](docs/api-reference.md) and [`SECURITY.md`](SECURITY.md).
  - No public API change: the guards are internal and the per-item contract of `allowFailure=true` batches is unchanged.

### Changed
- **`validateAddress` now verifies the EIP-55 checksum automatically for mixed-case addresses** — resolves [#394](https://github.com/Adamantine-Guild/guildpass-sdk/issues/394). Previously the checksum was only checked under `{ strict: true }`, so a mixed-case address with a corrupted checksum (a typo, a truncated copy-paste, a tampered value) passed validation silently.
  - Detection follows the intent of EIP-55: only a mixed-case hex payload carries checksum information, so only that case is verified. An all-lowercase or all-uppercase address carries none and is accepted exactly as before — no regression for the common lowercase path.
  - `{ strict: true }` is unchanged and still forces the check on any casing, including all-lowercase.
  - Failures keep the existing error shape: `GuildPassErrorCode.INVALID_ADDRESS` with `reason: 'checksum_failed'`.
  - This is a behavior change only for input that is mixed-case *and* fails its checksum — input that was previously accepted by mistake. Any address a wallet or block explorer produces is correctly checksummed and keeps working.
- **`validateResponses` now defaults to `true`** (was `false`). Every response from `AccessService.checkAccess`/`checkRoleAccess`, `MembershipService.getMembership`, `RolesService.getRoles`/`getUserRoles`, and `GuildsService.getGuild`/`getGuildConfig` is now shape-checked before being returned, out of the box — no config needed. Set `validateResponses: false` on `GuildPassClientConfig` to restore the previous unchecked behavior.
  - Unknown/extra response fields are always passed through untouched (never stripped, never rejected) — see the passthrough policy in [`docs/serialization-validation.md`](docs/serialization-validation.md). Only a missing required field or a wrong primitive type fails validation.
  - Fixed two over-strict validation bugs found while making this the default, both of which would have rejected common, legitimate API responses:
    - `AccessCheckResult.requiredRoles`/`matchedRoles` were validated as `nonEmptyArray()`, rejecting the legitimate empty-array case (public resource with no required roles, or a denial with no matched roles). Both are now `array()`.
    - The `optional()` schema combinator only accepted `undefined`, not `null`, for an absent field — but a JSON API response can only omit a key or send `null`; it has no way to produce a literal `undefined`. Every optional field across every response guard (`AccessCheckResult.reason`, `Guild.description`, etc.) now accepts `null` too.
  - This is a behavior change for any consumer relying on receiving a malformed/incomplete API response unchecked; per this project's pre-1.0 versioning policy (see README → Versioning) this ships as a **minor** bump.

### Added
- **`normaliseAddress(address, { checksum })`** — opt-in EIP-55 checksummed output, part of [#394](https://github.com/Adamantine-Guild/guildpass-sdk/issues/394). `normaliseAddress(addr, { checksum: true })` returns the checksummed form for display; the default (no options) still returns lowercase and is unchanged.
  - The lowercase default is deliberate and load-bearing: `GuildPassClient` builds cache keys from `normaliseAddress`, and `areAddressesEqual` compares through it. Emitting mixed-case by default would split cache entries for the same wallet across casings.
  - Purely additive — the parameter is optional, so every existing call site keeps its current behavior and type.
  - No new runtime dependency: reuses the `js-sha3` keccak-256 already used by `toChecksumAddress`.
- **Unified request/response validation layer.** Every HTTP domain service call (`AccessService.checkAccess`/`checkRoleAccess`, `MembershipService.getMembership`, `RolesService.getRoles`/`getUserRoles`, `GuildsService.getGuild`/`getGuildConfig`) now validates its request parameters structurally before transmission, pairing the response-shape guards that already existed for each model. See [`docs/serialization-validation.md`](docs/serialization-validation.md) for the schema/error/unknown-field policy.
  - New: `assertValidRequest`, and per-model guards `isAccessCheckParams`, `isRoleAccessCheckParams`, `isMembershipParams`, `isGetRolesParams`, `isGetUserRolesParams`, `isGetGuildParams` (exported from the root package, mirroring the existing `responseGuards`/`assertValidResponse`).
  - No new runtime dependency — built on the existing zero-dependency combinator DSL in `src/validation/schema.ts`.
  - Backward compatible: request guards are structural-only (type/presence checks) and run before, not instead of, the existing field-level validators (`validateAddress`, `validateGuildId`, ...), so no existing error code or message changes for any input that was already valid or already rejected.
- `RequestOptions.confirmations?: BlockTag` is now part of the public type (previously used internally via an `as any` cast in `JsonRpcContractProvider`, undocumented and inaccessible to TypeScript consumers).
- **SIWE (Sign-In With Ethereum) helpers** — resolves [#158](https://github.com/Adamantine-Guild/guildpass-sdk/issues/158).
  - `formatSiweMessage(msg)` — formats a `SiweMessage` object into a canonical EIP-4361 string ready for wallet signing.
  - `parseSiweMessage(raw)` — parses a raw EIP-4361 string into a typed `SiweMessage`; returns a `SiweParseResult` (never throws).
  - `verifySiweSignature(params)` — verifies an EIP-4361 signature against the embedded address; optionally checks domain, nonce and expiry. Returns a `SiweVerifyResult` (never throws). Pure implementation using secp256k1 ecrecover + `js-sha3` — no extra runtime dependencies.
  - `generateSiweNonce()` — generates a 16-character cryptographically random alphanumeric nonce.
  - Four new `GuildPassErrorCode` values: `SIWE_INVALID_SIGNATURE`, `SIWE_EXPIRED`, `SIWE_DOMAIN_MISMATCH`, `SIWE_INVALID_MESSAGE`.
  - All types (`SiweMessage`, `SiweVerifyParams`, `SiweVerifyResult`, `SiweParseResult`) are exported from the root package.
- Added automated release workflow documentation and npm provenance publishing configuration.
- **Cross-provider consensus verification for on-chain reads** — resolves [#307](https://github.com/Adamantine-Guild/guildpass-sdk/issues/307). Merged in two parts: PR [#338](https://github.com/Adamantine-Guild/guildpass-sdk/pull/338) (v1) and PR [#339](https://github.com/Adamantine-Guild/guildpass-sdk/pull/339) (followup).
  - New opt-in `contractReadConsensus` config (`{ providers: string[]; minProviders: number }`). When set, every supported on-chain read is fanned out across the listed RPC endpoints in parallel via `Promise.allSettled` and only returns a value when at least `minProviders` of them agree on the same raw hex result.
  - Coverage: `getMembershipTokenBalance`, `getERC20Balance`, `ownsERC721Token`, `getERC1155Balance`, `getGuildOwner`, `readContract` (v1) plus `batchEthCall`, `getMembershipTokenBalancesBatch`, `getGuildOwnersBatch` and every internal `eth_call` inside `validateRoleRequirement` (followup).
  - New error code `CONSENSUS_MISMATCH` — extends `GuildPassError.details` with structured per-provider groups + per-provider failures + quorum metadata so operators can identify the lying provider.
  - `batchStrategy: "multicall3"` is explicitly incompatible with `contractReadConsensus` and now rejected with `INVALID_CONFIG`. Multicall3 collapses calls into a single on-chain transaction per provider, which defeats cross-provider verification.
  - Opt-in invariant: when the config is unset, every method falls back to its previous behaviour (single-URL JSON-RPC + failover or Multicall3 — zero behaviour change).
  - Precedence chain: `contractProvider` > `contractReadConsensus` > default.
  - Per-item batch quorum: items whose front-runner is below `minProviders` become `{ status: "error", error: "Consensus mismatch at batch index i: ..." }` rather than throwing the whole batch.

### Fixed
- **`pnpm build` was broken** on `main` (missing `constantTimeEqual` export from `src/utils/index.ts`, `Middleware` type not re-exported from `http.types.ts`, a `strictPropertyInitialization` violation in `HttpClient`, an ethers v5-only import path in `src/utils/merkleTree.ts`, stale v5-style `ethers.providers.Provider`/`BigNumber` usage in `src/contracts/contractHelpers.ts`, and a `Headers` typing mismatch in `src/network/fetchTransport.ts`). All fixed; `pnpm build`, `pnpm typecheck`, and `pnpm lint` are green again.
- **`FetchTransport` captured `globalThis.fetch` once, at construction time**, instead of resolving it lazily per request. A `fetch` installed or replaced after the client was constructed (a polyfill, or `vi.stubGlobal` in tests) was silently never used — the client kept issuing requests through whatever `fetch` existed when it was built.
- **Cross-caller cancellation leak in request coalescing**: two concurrent calls sharing a cache key but only one carrying an `AbortSignal` shared a single in-flight request, so aborting the signalled caller also rejected the other, unrelated caller. A signal now opts a call out of coalescing by default (override with `deduplicate: true`); `checkAccessBatch` never coalesces its items with each other or with a concurrent lone call.
- **Errors on HTTP error responses (4xx/5xx) never carried `requestMeta`** (`requestId`, `correlationId`, `traceId`) — `extractMeta()` expected a `Headers`-like object with `.get()`, but was called with the plain `Record<string, string>` returned by `TransportResponse.getHeaders()`, so every lookup silently returned `undefined`.
- **A pre-aborted `AbortSignal` threw a generic `GuildPassNetworkError`** instead of the more specific `GuildPassCancellationError` that every other cancellation path already threw.
- Several service method overloads (`getMembership`, `getGuild`, `getGuildConfig`, `checkAccess`, `checkRoleAccess`) were missing the general `(params, options?: RequestOptions)` overload declaration — TypeScript consumers calling them with plain options (`{ timeoutMs }`, `{ signal }`, `{ retry }`, no `includeMeta`) got a real compile error in their own code, even though the call worked fine at runtime.
- `scripts/check-bundle-size.mjs` didn't mark `ethers`/`viem` as external, so `pnpm size` either crashed or wildly overstated every entry's size by bundling the full libraries into the measurement.

## [0.1.0] - 2026-06-29

### Added
- Made the main logo clickable, directing to the root README.md file.
- Fixed logo display by using the local logo file instead of an external URL.
