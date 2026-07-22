# Threat Model — GuildPass SDK

> **Status:** Living document  
> **Scope:** `@guildpass/sdk` v0.1.x (client-side TypeScript library)  
> **Last updated:** 2026-07-21  

## Table of Contents

1. [Purpose](#purpose)
2. [Trust Boundaries](#trust-boundaries)
3. [Assumptions & Out-of-Scope](#assumptions--out-of-scope)
4. [Module-by-Module Analysis](#module-by-module-analysis)
   - [httpClient.ts — HTTP Transport](#httpclientts--http-transport)
   - [jsonRpcProvider.ts — JSON-RPC Transport](#jsonrpcproviderts--json-rpc-transport)
   - [webSocketProvider.ts — WebSocket Transport](#websocketproviderts--websocket-transport)
   - [contractHelpers.ts — ABI Encoders / Decoders](#contracthelpersts--abi-encoders--decoders)
   - [contractClient.ts — Contract Abstraction](#contractclientts--contract-abstraction)
   - [responseGuards.ts — Response Type Predicates](#responseguardsts--response-type-predicates)
   - [siwe.helpers.ts — SIWE (EIP-4361)](#siwehelpersts--siwe-eip-4361)
   - [wallet/helpers.ts — EIP-1193 Wallet Provider](#wallethelpersts--eip-1193-wallet-provider)
   - [cache/ — Cache Adapter Interface](#cache--cache-adapter-interface)
   - [utils/validation.ts — Input Validators](#utilsvalidationts--input-validators)
5. [Risk Register](#risk-register)
6. [Mitigation Matrix](#mitigation-matrix)
7. [Hardening Fixes (This Issue)](#hardening-fixes-this-issue)

---

## Purpose

This document systematically enumerates every trust boundary across the GuildPass SDK, identifies attacker capabilities per boundary, and catalogues the risks introduced by each adversarial input surface. It serves as the reference model for evaluating new features, prioritizing security work, and ensuring no class of attack is overlooked.

> **Configuration-focused summary:** For `apiKey`, `rpcUrl`, and `cache` trust boundaries with integrator guidance, see [`docs/security/threat-model.md`](./security/threat-model.md).

---

## Trust Boundaries

The SDK operates across **five distinct trust boundaries**. Data crossing any boundary is potentially adversarial and must be validated before use.

```
┌─────────────────────────────────────────────────────────────────┐
│                    CONSUMER APPLICATION                         │
│  (code calling @guildpass/sdk — partially trusted)              │
└────────────────┬────────────────────────────────────────────────┘
                 │ ① SDK method parameters (wallet, guildId, etc.)
                 ▼
┌─────────────────────────────────────────────────────────────────┐
│                     @guildpass/sdk CORE                         │
│  (this library — validation, orchestration)                     │
└───┬──────────────────────┬───────────────────┬──────────────────┘
    │ ② REST response      │ ③ RPC response    │ ④ cache read
    ▼                      ▼                    ▼
┌──────────┐       ┌──────────────┐       ┌──────────────┐
│ GuildPass│       │ RPC Provider │       │ Cache Adapter│
│  API     │       │ (eth_call)   │       │ (3rd-party)  │
│ (REST)   │       │              │       └──────────────┘
└──────────┘       └──────────────┘
                           ▲
                           │ ⑤ request
                    ┌──────┴──────┐
                    │ Wallet Prov.│
                    │ (EIP-1193)  │
                    └─────────────┘
```

| # | Boundary | Direction | Source | Adversarial? |
|---|----------|-----------|--------|-------------|
| ① | Consumer → SDK | In | Application code calling SDK methods | Partially — application is trusted by deployment but may pass malformed data |
| ② | API → SDK | Out | GuildPass REST API (`apiUrl`) | Yes — a compromised API could return crafted responses |
| ③ | RPC → SDK | Out | JSON-RPC endpoint(s) (`rpcUrl`/`rpcUrls`) | Yes — a malicious or MITM'd RPC endpoint can return arbitrary `eth_call` results |
| ④ | Cache → SDK | Out | Third-party cache adapter implementation | Yes — a malicious or buggy adapter could return poisoned data |
| ⑤ | Wallet → SDK | Out | `window.ethereum` / EIP-1193 provider | Yes — a malicious browser extension can spoof the provider |

---

## Assumptions & Out-of-Scope

- **Transport security**: TLS is assumed between SDK ↔ API and SDK ↔ RPC endpoints. The SDK does not pin certificates.
- **Server-side API backend**: Vulnerabilities in `guildpass-core` are out of scope (separate repository).
- **Bundler / runtime security**: Prototype pollution in the JS runtime itself, or injection via `eval()`/`Function()`- adjacent patterns in consumer code, are out of scope.
- **Physical access / side-channel**: The SDK is a pure-JS library; timing attacks via JIT/GC noise are acknowledged but not fully mitigable.

---

## Module-by-Module Analysis

### httpClient.ts — HTTP Transport

**Trust boundary:** ② (API → SDK)

**What it does:** Wraps `fetch` with base URL, API key injection, retry, rate-limiting, hooks, and JSON response parsing.

**Adversarial input:** The API response body and headers.

| Scenario | Code Path | Impact |
|----------|-----------|--------|
| API returns non-JSON with 200 status | `parseSuccessResponse` → `isJsonContentType` → `parseJsonResponse` | Throws `INVALID_RESPONSE` — safe |
| API returns valid JSON but unexpected shape | Returns `T` to caller; caller uses `responseGuards` only when `validateResponses` is enabled | **Gap** — default path trusts the shape blindly |
| API returns extremely large response body | `response.json()` parses the full body into memory | Memory exhaustion DoS — no size limit on response body |
| API returns `Content-Type` not including `application/json` with 200 status | `isJsonContentType` returns `false` → throws `INVALID_RESPONSE` | Safe |
| API returns `Retry-After` with a future date far in the past/future | `getRetryAfterMs` → `Date.parse` | Bounded — `Math.max(0, date - Date.now())` ensures non-negative delay |
| API returns redirect to `file://` or `data://` | The `fetch` transport follows redirects — no validation on redirect targets | **Gap** — open redirect via API compromise; consumer could receive unvalidated data |
| API returns headers with injection payloads | `extractResponseMeta` reads `x-request-id`, `x-correlation-id`, `traceparent`, `x-trace-id` via `.get()` | Low risk — metadata is only returned if `includeMeta` is set and passed to consumer |
| Sensitive header leak in hooks | `redactHeaders` masks `authorization`, `x-api-key`, `cookie`, `set-cookie` | Safe |
| API key sent to absolute URL | `request()` checks `!isAbsolute` before attaching `X-API-Key` | Safe — absolute URLs skip API key |

**Assessment:** Medium confidence. The main gap is the lack of response size limits and the blind trust of response shape when `validateResponses` is off.

---

### jsonRpcProvider.ts — JSON-RPC Transport

**Trust boundary:** ③ (RPC → SDK)

**What it does:** Sends `eth_call` and `eth_blockNumber` via JSON-RPC 2.0 over HTTP. Implements multi-URL failover for transient errors.

**Adversarial input:** The RPC response JSON body.

| Scenario | Code Path | Impact |
|----------|-----------|--------|
| RPC returns `result` that is not a hex string | `attemptEthCall` returns `payload?.result` as `unknown`; downstream `decodeAddressResult` / `decodeUint256Result` check `HEX_WORD_REGEX` | Safe — decoders reject non-conforming values |
| RPC returns `result` that is a valid 32-byte hex word but semantically crafted (e.g. `0x0000…0001` for an address decoder) | `decodeAddressResult` extracts last 20 bytes → `validateAddress` checks format → succeeds, returns `0x0000…0001` | **Gap** — the SDK returns whatever address the RPC provides. The consumer must verify the result against a trusted source. Documented as a design constraint, not a bug. |
| RPC returns `result` that is valid hex but encodes an extremely large `uint256` | `decodeUint256Result` → `BigInt(result).toString(10)` | Safe — `BigInt` handles up to 2^256-1 |
| RPC returns `result` that is `null` or `undefined` | `attemptEthCall` returns the value as-is; decoders will reject | Safe — decoders check `typeof result !== 'string'` |
| RPC returns a JSON-RPC error with crafted `code`/`message` | `attemptEthCall` throws `GuildPassError(HTTP_ERROR)`; `isTransientError` checks `details.code` is numeric → non-transient | Safe |
| RPC returns batch response with mismatched `id` fields | `attemptBatchEthCall` maps by `id`; missing IDs → `status: 'error'` | Safe — missing entries are reported as errors |
| RPC returns batch response with duplicate `id` fields | `responseMap.set(id, p)` — later entry overwrites earlier | **Gap** — duplicate IDs silently replace earlier results. A malicious RPC could inject a crafted response for a specific ID. |
| RPC returns non-array for batch request | `!Array.isArray(payloads)` → throws `INVALID_RESPONSE` | Safe |
| RPC returns result with `error` field alongside `result` | JSON-RPC 2.0 spec says these are mutually exclusive; `JsonRpcSuccess & JsonRpcError` intersection type means both may be present at runtime | **Gap** — if both `error` and `result` are present, `error` is checked first. But if `error` is falsy, `result` is used. A malicious RPC could send `{ error: null, result: crafted }` and bypass the error path. |

**Assessment:** The decoders are robust against malformed responses. The most realistic attack is a malicious RPC returning a valid-shaped but semantically incorrect result (e.g., a wrong balance) — this is inherent to trusting an RPC endpoint. The SDK documents failover mechanics but cannot validate the *truth* of RPC data.

---

### webSocketProvider.ts — WebSocket Transport

**Trust boundary:** ③ (RPC → SDK)

**What it does:** Manages a WebSocket connection to an RPC endpoint, subscribes to `eth_subscribe` for `Transfer` events, parses log subscriptions into `TransferEvent` objects.

**Adversarial input:** WebSocket frames from the RPC endpoint.

| Scenario | Code Path | Impact |
|----------|-----------|--------|
| RPC sends malformed JSON frame | `handleMessage` → `JSON.parse` throws → caught, returns | Safe — malformed frames are silently ignored |
| RPC sends `eth_subscription` with `topics[1]` shorter than 40 hex chars | `topicToAddress` → `topic.slice(-40)` returns a short string → address is malformed | **Gap** — no validation that `topics[1]` and `topics[2]` are 32-byte hex words before extraction. Produces invalid addresses in the event. |
| RPC sends `eth_subscription` with `topics[3]` as non-hex | `hexToBigInt(log.topics[3])` → `BigInt()` throws → caught by outer try/catch | Safe — caught, but the callback is silently not invoked |
| RPC sends `eth_subscription` with `data` as non-hex | `hexToBigInt(log.data ?? '0x0')` → `BigInt()` throws → caught | Safe — same as above |
| RPC sends response with `id` as a string that parses to `NaN` | `handleMessage` → `Number(payload.id)` → `NaN` → `this.pending.get(NaN)` returns undefined → return | Safe |
| RPC sends response with `id` that doesn't match any pending | `this.pending.get(id)` returns undefined → return | Safe — stale responses are ignored |
| RPC sends `eth_subscription` for a subscription ID that doesn't exist | `this.subscriptions.get(subId)` returns undefined → return | Safe |

**Assessment:** Good overall. The main gap is the lack of topic content validation in `handleSubscriptionNotification`. ERC-721 / ERC-20 Transfer logs have a well-defined shape that could be validated before consumption.

---

### contractHelpers.ts — ABI Encoders / Decoders

**Trust boundary:** ② + ③ (input → encoders, RPC → decoders)

**What it does:** Pure functions for encoding ABI arguments and decoding RPC results.

**Adversarial input:** Encoder inputs come from consumer application code (boundary ①) or from the API (boundary ②). Decoder inputs come from RPC responses (boundary ③).

| Scenario | Code Path | Impact |
|----------|-----------|--------|
| Extremely long string passed to `encodeBytes32` UTF-8 mode | `TextEncoder().encode(trimmed)` allocates memory proportional to input length *before* the `bytes.length > 32` check | **Gap** — memory-DoS vector. A guildId of 10MB would allocate a 10MB `Uint8Array` then immediately reject it. |
| `encodeUint256Argument` with a very long decimal string | `BigInt(trimmed)` | `BigInt` parsing is O(n) in input length — extremely long strings consume CPU. But regex `/^\d+$/` first rejects non-digit, and the length is bounded by JavaScript's BigInt limit (~ 10M digits in practice). Low risk. |
| `decodeAddressResult` with a valid 32-byte hex word that represents address `0x0000000000000000000000000000000000000000` | `validateAddress('0x0000…0000')` passes format check | Safe — zero address is valid by format. Up to consumer to check for zero. |
| `decodeBoolResult` with a valid 32-byte hex word where `BigInt(result) !== 0n` but result is e.g. `0x0000…0002` | Returns `true` | Safe — any non-zero is `true` per ABI spec |
| `encodeBytes32` hex mode with malicious `trimmed` that matches the regex but contains unexpected data | Returns `trimmed.slice(2).toLowerCase()` | Safe — already bounded by regex length constraint |
| `encodeBytes32` integer mode with extremely large BigInt | Checks `n > UINT256_MAX` | Safe — bounded |
| `encodeAddressArgument` with a non-address string | `address.slice(2).toLowerCase().padStart(HEX_32_BYTES_LENGTH, '0')` | **Gap** — no validation that input is a valid address. Called from `contractClient` which validates beforehand, but the function itself doesn't validate. |

**Assessment:** The most concrete risk is the memory-DoS in `encodeBytes32` UTF-8 mode. Adding a maximum input length guard before `TextEncoder().encode()` is the primary hardening fix.

---

### contractClient.ts — Contract Abstraction

**Trust boundary:** ① + ② + ③ (orchestrates calls)

**What it does:** High-level methods that validate inputs, call `provider.ethCall`, and decode results.

| Scenario | Code Path | Impact |
|----------|-----------|--------|
| Malicious RPC returns a valid-shaped but wrong `decimals()` (e.g., 255) | `getTokenDecimals` → `Number(decodeUint256Result(result))` → checks `decimals > 255` | Safe — bounded to 0–255 |
| Malicious RPC returns `decimals` as 0 | `formatUnits(value, 0)` returns whole string | Safe — no division by zero |
| `formatUnits` called with adversary-controlled `value` and `decimals` | Regex `/^\d+$/` check on value, `decimals` must be non-negative integer | Safe |
| Batch `getMembershipTokenBalancesBatch` with 100K addresses | Pre-validates addresses (100K regex checks), builds array, sends batch | CPU-DoS via large batch — mitigated by `maxBatchSize: 100` default and chunking requirement |
| `getGuildOwnersBatch` with adversarial guild IDs that are valid but very long | `encodeGuildId` → `encodeBytes32` → memory allocation | **Gap** — same as `encodeBytes32` issue above |

---

### responseGuards.ts — Response Type Predicates

**Trust boundary:** ② (API → SDK)

**What it does:** Hand-written type predicates that validate runtime response shapes.

**Adversarial input:** API responses that pass `typeof` checks but have semantically invalid content.

| Scenario | Code Path | Impact |
|----------|-----------|--------|
| `isAccessCheckResult` receives `{ hasAccess: true, walletAddress: "not-an-address", guildId: "", resourceId: "   ", requiredRoles: [], matchedRoles: [], reason: undefined }` | `isString(value.walletAddress)` → true, `isString(value.guildId)` → true | **Gap** — passes the guard but contains malformed data (non-address, empty strings). Downstream consumers may crash or behave unexpectedly. |
| `isGuild` receives `{ id: "", name: "", ownerAddress: "invalid" }` | All type checks pass | **Gap** — same class of issue |
| `isAccessRequirement` receives `{ type: "TOKEN", address: undefined, id: undefined }` | `value.address !== undefined` → false (address is optional), `value.id !== undefined` → false | Valid by guard — but `validateTokenRequirement` requires `address` and will throw `INVALID_INPUT` if it's missing. Not a security issue per se but inconsistent validation layers. |
| `isStringArray` receives an array with non-string elements after a string element | Short-circuit: `value.every(isString)` returns false at first non-string | Safe |
| `isAccessCheckResult` receives `requiredRoles` with extremely long array | `isStringArray` iterates the entire array | CPU-DoS via large array — no length cap |

**Assessment:** The guards are type-only. They should additionally validate content formats for known patterns (addresses, non-empty IDs) to catch malformed API responses earlier and more clearly.

---

### siwe.helpers.ts — SIWE (EIP-4361)

**Trust boundary:** ① + ② (message comes from API or consumer)

**What it does:** Formats, parses, and verifies EIP-4361 (Sign-In With Ethereum) messages using pure-JS secp256k1.

**Adversarial input:** The raw SIWE message string and the signature hex string.

| Scenario | Code Path | Impact |
|----------|-----------|--------|
| Extremely long raw message (100 MB) with many newlines | `raw.split('\n')` allocates array + strings | **Gap** — memory DoS. No max message length. |
| `parseSiweMessage` receives message with no `URI:` field | `lines.findIndex(l => l.startsWith('URI: '))` returns -1 → returns error | Safe |
| `parseSiweMessage` receives message with many `- ` prefixed resource lines | Loop iterates over all lines after `Resources:` | Bounded by message length |
| `parseSiweMessage` receives message with extremely long `domain` | `headerMatch[1]` captures the domain; no format validation | **Gap** — domain could be any string (e.g., `"<script>...</script>"`). Not an injection vector (SDK doesn't render it), but could be propagated to downstream consumers. |
| `verifySiweSignature` receives a signature with invalid hex characters or wrong length | Checked: `sigHex.length !== 130` → error | Safe |
| `verifySiweSignature` receives a signature with `v` not in {0, 1, 27, 28} | Checked: `v !== 0 && v !== 1` → error | Safe |
| `verifySiweSignature` receives an `s` value that is zero or exceeds secp256k1 order | `ecRecover` handles this — returns null if the point is invalid | Safe |
| `verifySiweSignature` receives a message with an expired `expirationTime` | Checked: `Date.now() > expiry` → error | Safe |
| Malicious API returns SIWE message with `resources` containing arbitrary data | Parsed and returned in `SiweMessage.data.resources` | Safe — data passes through without interpretation |
| `constantTimeEqual` with strings of differing lengths | `diff = aBytes.length ^ bBytes.length` catches length mismatch, loop iterates to max length | Safe — no early exit |

**Assessment:** Two gaps: no maximum message length (memory DoS) and no domain format validation after extraction.

---

### wallet/helpers.ts — EIP-1193 Wallet Provider

**Trust boundary:** ⑤ (Wallet → SDK)

**What it does:** Interacts with an injected EIP-1193 provider (`window.ethereum` or custom) to connect wallets, get chain IDs, switch chains.

**Adversarial input:** Return values from `provider.request()`.

| Scenario | Code Path | Impact |
|----------|-----------|--------|
| Malicious wallet provider returns non-array from `eth_requestAccounts` | `connectWallet` → `provider.request({ method: 'eth_requestAccounts' })` → `accounts || []` | **Gap** — no validation that accounts are address-formatted strings |
| Malicious wallet provider returns wrong chain ID | `getChainId` returns whatever the provider says | **Gap** — consumer should verify the chain ID independently |
| Malicious wallet provider returns a non-string chain ID | `getChainId` → `return await provider.request(...)` typed as `Promise<string>` but runtime could be anything | **Gap** — no type validation |
| `switchChain` with a malicious `chainParams` that includes malicious RPC URLs | RPC URLs are passed to `wallet_addEthereumChain`; wallet handles them | Out of SDK scope — wallet should prompt user |

**Assessment:** The wallet helpers are thin wrappers with minimal validation. The main risk is that a malicious browser extension could return arbitrary accounts or chain IDs, and the SDK passes them through without validation. This is partially intentional — the consumer application is expected to validate the returned accounts. However, adding format validation would provide defense-in-depth.

---

### cache/ — Cache Adapter Interface

**Trust boundary:** ④ (Cache → SDK)

**What it does:** Defines the `CacheAdapter` interface; the SDK wraps every service method with `coalesce` (request deduplication) and optional caching.

**Adversarial input:** Data returned from a third-party cache adapter's `get()` method.

The cache-adapter boundary is currently partially documented (see `docs/cache-adapters.md` and Issue #52 for conformance testing). The key risk is:

| Scenario | Code Path | Impact |
|----------|-----------|--------|
| Cache adapter returns stale/poisoned data for a guild's access check | `AccessService.checkAccess` → cache hit → returns cached value without re-validation | **Gap** — cache data is trusted as authoritative. A malicious adapter could return arbitrary data. |
| Cache adapter returns data of wrong type | Cache hit in `coalesce` returns the value as-is to the caller | **Gap** — no type validation on cache returns (but `validateResponses` flag applies after cache) |

**Mitigations in progress:** Issue #52 adds conformance/smoke tests for adapter implementations. The `validateResponses` config flag applies the same response guards to cached data as to fresh API calls — but only when enabled (default: `false`).

---

### utils/validation.ts — Input Validators

**Trust boundary:** ① (Consumer → SDK)

**What it does:** Validates addresses, guild IDs, resource IDs, role IDs, and config fields. Throws `GuildPassError` on failure.

**Adversarial input:** Parameters from consumer application code or from parsed API responses.

| Scenario | Code Path | Impact |
|----------|-----------|--------|
| `validateAddress` receives a string that passes regex but fails EIP-55 checksum | Checksum check only when `strict: true` | Safe — by design, strict mode is opt-in |
| `validateGuildId` receives a 10MB string | `guildId.trim().length` would compute a very long string, but only `.length` (O(1)) and `.trim()` (O(n)) | **Gap** — no maximum length, allowing very long strings to propagate to downstream functions like `encodeBytes32` |
| `validateResourceId` with a string full of null bytes (`\0`) | Passes all checks (non-empty string) | **Gap** — potential issues in downstream consumers that use this in file paths or SQL queries (though the SDK doesn't do either) |
| `throwValidationError` with sensitive field names | Checks `sensitiveKeys.includes(field.toLowerCase())` → deletes `details.value` | Safe |

**Assessment:** The main gap is the lack of maximum-length constraints on ID fields.

---

## Risk Register

| ID | Module | Risk | Severity | Status |
|----|--------|------|----------|--------|
| R-01 | `httpClient.ts` | No response body size limit — memory DoS via large API response | Medium | Open |
| R-02 | `httpClient.ts` | No redirect-target validation — open redirect via compromised API | Low | Open |
| R-03 | `jsonRpcProvider.ts` | Duplicate batch response IDs silently overwrite earlier results | Low | Open |
| R-04 | `jsonRpcProvider.ts` | Response with both `error: null` and `result` bypasses error path | Low | Open |
| R-05 | `webSocketProvider.ts` | No validation that log topic strings are valid 32-byte hex words | Medium | **Fixed** (H-01) |
| R-06 | `contractHelpers.ts` | `encodeBytes32` UTF-8 mode allocates memory proportional to input before length check | Medium | **Fixed** (H-02) |
| R-07 | `contractHelpers.ts` | `encodeAddressArgument` does not validate its input is a valid address | Low | **Fixed** (H-03) |
| R-08 | `contractClient.ts` | Batch size CPU-DoS via large request array (mitigated by `maxBatchSize: 100`) | Low | Accepted |
| R-09 | `responseGuards.ts` | Guards check types only, not content format (addresses, empty strings) | Medium | **Fixed** (H-04) |
| R-10 | `responseGuards.ts` | No length cap on array fields — CPU-DoS via large arrays | Low | Open |
| R-11 | `siwe.helpers.ts` | No maximum message length — memory DoS via `raw.split('\n')` | Medium | **Fixed** (H-05) |
| R-12 | `siwe.helpers.ts` | No domain format validation after extraction | Medium | **Fixed** (H-05) |
| R-13 | `wallet/helpers.ts` | No validation on `eth_requestAccounts` results | Medium | Open |
| R-14 | `wallet/helpers.ts` | No validation on `eth_chainId` return value | Low | Open |
| R-15 | `cache/` | Cache returns stale/poisoned data | Medium | Issue #52 |
| R-16 | `utils/validation.ts` | No maximum-length bounds on ID validators | Medium | **Fixed** (H-06) |
| R-17 | `utils/validation.ts` | Resource IDs not validated for printable characters | Low | Open |

---

## Mitigation Matrix

| Risk ID | Existing Safeguard | Backlog Issue | New Fix (this issue) |
|---------|-------------------|---------------|---------------------|
| R-01 | None | — | — |
| R-02 | None | — | — |
| R-03 | Low severity (only one overwrite per ID); batch responses are ephemeral | — | — |
| R-04 | `error` field is checked first; this requires an RPC to intentionally bypass | — | — |
| R-05 | None | — | H-01 (topic hex validation) |
| R-06 | Length check *after* allocation catches the issue, but too late | — | H-02 (pre-check before TextEncoder) |
| R-07 | Callers (`contractClient`) validate before calling | — | H-03 (defense-in-depth in encoder) |
| R-08 | `maxBatchSize` default of 100 with chunking requirement | — | — |
| R-09 | `validateResponses` opt-in flag | — | H-04 (content-level checks in guards) |
| R-10 | None | — | — |
| R-11 | None | — | H-05 (max length + domain validation) |
| R-12 | None | — | H-05 |
| R-13 | None | — | — |
| R-14 | None | — | — |
| R-15 | `validateResponses` (when enabled) applies guards to cached data | Issue #52 | — |
| R-16 | None | — | H-06 (max-length in validators) |
| R-17 | None | — | — |

---

## Hardening Fixes (This Issue)

The following fixes are implemented as part of this threat-modeling exercise. Each is traced to a specific risk register entry.

| Fix ID | Risk(s) | File(s) | Description |
|--------|---------|---------|-------------|
| H-01 | R-05 | `src/contracts/providers/webSocketProvider.ts` | Validate that log `topics[1]` and `topics[2]` are valid 32-byte hex words before extracting addresses |
| H-02 | R-06 | `src/contracts/contractHelpers.ts` | Add pre-check in `encodeBytes32` that rejects input strings longer than a reasonable limit before `TextEncoder().encode()` |
| H-03 | R-07 | `src/contracts/contractHelpers.ts` | Add address format validation to `encodeAddressArgument` |
| H-04 | R-09 | `src/validation/responseGuards.ts` | Add content-level validation (address regex, non-empty strings) to all response type predicates |
| H-05 | R-11, R-12 | `src/siwe/siwe.helpers.ts` | Add max message length (10 KB) guard in `parseSiweMessage`; validate domain format |
| H-06 | R-16 | `src/utils/validation.ts` | Add maximum-length constraints (256 chars) to `validateGuildId`, `validateResourceId`, `validateRoleId` |

---

*This document should be reviewed and updated when new features, new trust boundaries, or new data flow paths are introduced.*
