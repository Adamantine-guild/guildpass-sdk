# Threat Model — GuildPass SDK Configuration Surface

> **Status:** Living document  
> **Scope:** `@guildpass/sdk` client configuration, service modules, and pluggable backends  
> **Related:** Module-level analysis in [`docs/THREAT_MODEL.md`](../THREAT_MODEL.md) · Reporting in [`SECURITY.md`](../../SECURITY.md)

This document consolidates the **SDK-specific trust boundaries** introduced by `GuildPassClientConfig` and maps each to threats, existing mitigations, and accepted residual risk. It is written for integrators choosing where to run the SDK (Node.js, browser, Edge) and which backends to trust.

---

## 1. Assets

| Asset | Location | Sensitivity |
|-------|----------|-------------|
| `apiKey` | `GuildPassClientConfig.apiKey` → `HttpClient` `X-API-Key` header on relative API requests | **High** — grants elevated or rate-limited API access |
| Access decisions | `AccessCheckResult.hasAccess` from API and cache | **High** — gates premium content, mints, admin actions |
| On-chain read results | `ContractClient` via `rpcUrl` / `rpcUrls` / `contractProvider` | **Medium–High** — balances, role requirements, ownership |
| Guild / role metadata | `GuildsService`, `RolesService` cached responses | **Low–Medium** — public-ish configuration data |
| Wallet addresses | Method parameters, cache keys | **Medium** — pseudonymous identifiers |
| SIWE nonces / signatures | `siwe/` helpers, optional `NonceStore` | **High** — authentication artifacts |

---

## 2. Trust Boundaries

```
┌──────────────────────────────────────────────────────────────────┐
│  Consumer application (your code)                                │
│  Passes: walletAddress, guildId, apiKey, rpcUrl, CacheAdapter  │
└────────────┬─────────────────────────────────────────────────────┘
             │ ① Config & method inputs
             ▼
┌──────────────────────────────────────────────────────────────────┐
│  GuildPassClient + services                                      │
│  access · membership · roles · guilds · contracts · http         │
└───┬─────────────────┬────────────────────┬───────────────────────┘
    │ ② REST          │ ③ JSON-RPC         │ ④ CacheAdapter.get()
    ▼                 ▼                    ▼
 GuildPass API    RPC provider(s)      Redis / in-memory / custom
 (apiUrl)         (rpcUrl/rpcUrls)     (config.cache)
```

| Boundary | Config surface | Trusted by default? | Primary modules |
|----------|----------------|---------------------|-----------------|
| ① App → SDK | `apiKey`, `rpcUrl`, `cache`, `cacheTtl`, method args | Partially — app is deployment-trusted but may misconfigure | `GuildPassClient`, `validateConfig` |
| ② API → SDK | `apiUrl` responses | Shape trusted unless `validateResponses: true` | `HttpClient`, `AccessService`, `responseGuards` |
| ③ RPC → SDK | `rpcUrl`, `rpcUrls`, `chains`, `contractProvider` | **Yes** — `eth_call` results decoded without cross-check | `ContractClient`, `jsonRpcProvider` |
| ④ Cache → SDK | `cache`, `cacheTtl` | **Yes** — cache hits skip the network | `GuildPassClient.withCache` |

---

## 3. Threats & Mitigations

### 3.1 `apiKey` — leakage and browser exposure

**Threats**

| ID | Threat | Scenario |
|----|--------|----------|
| T-API-1 | Key bundled into browser JavaScript | Attacker reads minified bundle or DevTools → reuses key against GuildPass API |
| T-API-2 | Key logged via hooks or error paths | Custom `onRequest` / logging middleware serialises headers |
| T-API-3 | Key sent to wrong host | Misconfigured absolute URL receives credentials |

**Mitigations (implemented)**

| Mitigation | Location |
|------------|----------|
| `getConfig()` omits `apiKey` | `GuildPassClient.getConfig()` |
| Hook payloads redact `X-API-Key` | `HttpClient` `redactHeaders` |
| API key attached **only** to relative paths under `apiUrl`, never absolute RPC URLs | `HttpClient.request()` — see `tests/apiKeyProtection.test.ts` |
| Config errors omit sensitive field values | `validateConfig` / `throwConfigError` |
| **Runtime warning** when `apiKey` is set in a browser-like runtime | `emitSecurityConfigWarnings()` in `src/config/securityLimits.ts` |

**Guidance (integrators)**

- **Node.js / Edge (server):** `apiKey` from environment variables is appropriate.
- **Browser:** Do **not** embed production `apiKey` values. Proxy GuildPass calls through your backend; the browser talks to your API, your server holds the key.
- **Development:** Use scoped test keys; never commit real keys (see `SECURITY.md`).

**Planned**

- Cryptographic **signed API responses** (referenced in [#303](https://github.com/Adamantine-Guild/guildpass-sdk/issues/303)) would let clients verify integrity of access payloads independent of TLS — not yet implemented in this SDK.

---

### 3.2 `rpcUrl` / `contractProvider` — malicious on-chain data

**Threats**

| ID | Threat | Scenario |
|----|--------|----------|
| T-RPC-1 | False `eth_call` result | Malicious RPC returns `balanceOf > 0` or valid-shaped but wrong address |
| T-RPC-2 | Stale fork / wrong chain | RPC serves outdated state; SDK has no chain-state proof |
| T-RPC-3 | MITM on RPC (TLS assumed) | Altered JSON-RPC body |

**Mitigations (implemented)**

| Mitigation | Location |
|------------|----------|
| ABI decoders reject malformed hex | `contractHelpers.ts` |
| Multi-URL failover for **transient** errors only (not semantic lies) | `mergeRpcUrls`, `AdaptiveContractProvider` |
| `checkAccessVerified()` cross-checks API vs on-chain for high-value gates | `AccessService.checkAccessVerified()` |
| `strictInterfaceChecking` optional ERC-165 gate | `GuildPassClientConfig` |
| Custom `contractProvider` for bring-your-own-trusted-node | `contractProvider` config |

**Guidance**

- Use RPC endpoints you operate or trust (Alchemy, Infura, your own node).
- For high-value actions (mints, transfers), prefer `checkAccessVerified()` over `checkAccess()` alone.
- The SDK **cannot** prove global chain truth — only that the configured provider returned a well-formed ABI decode.

---

### 3.3 `cache` / `cacheTtl` — poisoned or stale access grants

**Threats**

| ID | Threat | Scenario |
|----|--------|----------|
| T-CACHE-1 | Poisoned cache entry | Compromised Redis returns `{ hasAccess: true }` indefinitely |
| T-CACHE-2 | Over-long TTL | Revoked access still served from cache for minutes or hours |
| T-CACHE-3 | Missing invalidation after mutation | Admin revokes role; cached grant persists until TTL |
| T-CACHE-4 | Type confusion in stored JSON | Malformed adapter data returned without re-validation |

**Mitigations (implemented)**

| Mitigation | Location |
|------------|----------|
| Cache errors never break API calls | `GuildPassClient.handleCacheError` |
| `validateResponses: true` applies guards to fresh **and** cached data | Service layer + `assertValidResponse` |
| Invalidation helpers | `invalidateGuildCache`, `invalidateWalletCache`, `clearCache` |
| **Access-decision TTL cap** (`MAX_ACCESS_CACHE_TTL_MS` = 5 min) enforced for `checkAccess`, `checkRoleAccess`, `hasRole` | `resolveAccessCacheTtl()` |
| **Runtime warnings** for missing `cacheTtl` or `cacheTtl` above the access cap | `emitSecurityConfigWarnings()` |
| Cache adapter conformance suite for third-party adapters | `tests/cacheAdapterConformance.ts` ([#52](https://github.com/Adamantine-Guild/guildpass-sdk/issues/52)) |

**TTL guidance**

| Data class | Recommended `cacheTtl` | Enforced by SDK |
|------------|------------------------|-----------------|
| Access decisions (`checkAccess`, role checks) | **≤ 60 s** (`RECOMMENDED_ACCESS_CACHE_TTL_MS`) | Capped at **5 min** regardless of global `cacheTtl` |
| Membership / roles | 30–120 s | Uses configured `cacheTtl` |
| Guild metadata | 5–15 min | Uses configured `cacheTtl` |

When `cache` is enabled but `cacheTtl` is omitted, access entries default to **60 s** instead of never expiring.

**Planned**

- Signed API responses ([#303](https://github.com/Adamantine-Guild/guildpass-sdk/issues/303)) would detect tampering before results enter the cache.
- The pluggable cache layer itself was introduced in [#15](https://github.com/Adamantine-Guild/guildpass-sdk/issues/15).

---

### 3.4 Service module summary

| Module | Boundary | High-risk methods | Notes |
|--------|----------|-------------------|-------|
| `client.access` | ②, ④ | `checkAccess`, `checkRoleAccess` | Cached; use `checkAccessVerified` for assurance |
| `client.membership` | ②, ④ | `getMembership`, `isMember` | Lower sensitivity than access grants |
| `client.roles` | ②, ④ | `getUserRoles`, `hasRole` | `hasRole` shares access cache cap |
| `client.guilds` | ②, ④ | `getGuild`, `getGuildConfig` | Longer TTL acceptable |
| `client.contracts` | ③ | `getMembershipTokenBalance`, `validateRoleRequirement` | Trusts RPC entirely |
| `siwe/*` | ①, ② | `verifySiweSignature`, replay wrapper | Pure crypto; no network trust |

---

## 4. Residual Risk (Explicitly Accepted)

| Risk | Justification |
|------|---------------|
| **Browser-exposed `apiKey` extraction** | Any secret shipped to a client runtime is recoverable by a determined attacker with code execution (DevTools, extension, modified bundle). The SDK warns but cannot prevent embedding. Mitigation is architectural: backend proxy. |
| **Malicious RPC semantic lies** | JSON-RPC has no built-in proof of state. Failover helps availability, not honesty. Consumers must choose trusted providers or use `checkAccessVerified` / independent verification. |
| **Poisoned cache with `validateResponses: false`** | Default config trusts cached object shapes. Adapters and Redis ACLs are an operational control; `validateResponses: true` adds shape checks but not freshness or cryptographic integrity. |
| **Stale access within capped TTL window** | A 60 s–5 min cap balances performance vs revocation latency. Real-time revocation requires shorter TTL, no cache, or proactive `invalidateWalletCache` / `invalidateGuildCache` after mutations. |
| **TLS without pinning** | Standard HTTPS is assumed; certificate pinning is not implemented (complexity vs benefit for a library). |

---

## 5. Configuration Checklist

Before production:

- [ ] `apiKey` only in server-side runtimes, or proxied via your backend
- [ ] `rpcUrl` / `rpcUrls` point to providers you trust; consider failover URLs
- [ ] `cacheTtl` set explicitly; **≤ 60 s** if access caching is enabled
- [ ] `validateResponses: true` when integrating with a new or self-hosted API
- [ ] `invalidateGuildCache` / `invalidateWalletCache` wired to admin mutations
- [ ] Custom `CacheAdapter` passes `runCacheAdapterConformanceTests`
- [ ] High-value gates use `checkAccessVerified()` with configured RPC

---

## 6. Net-New Mitigations (This Document)

| ID | Description | Implementation |
|----|-------------|----------------|
| M-01 | Access-decision cache TTL cap | `resolveAccessCacheTtl()` — `GuildPassClient` |
| M-02 | Constructor warnings for risky cache / browser `apiKey` config | `emitSecurityConfigWarnings()` |
| M-03 | README and this document | Operator guidance |

---

*Review this document when adding new config options, transport layers, or cached service methods.*
