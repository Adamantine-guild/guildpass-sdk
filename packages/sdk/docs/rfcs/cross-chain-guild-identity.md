# RFC: Cross-Chain Guild Identity Resolution and Conflict Handling

- **Issue:** #236
- **Status:** Draft — for discussion (no implementation until the model is agreed)
- **Type:** Architecture (protocol-level)

> This is a proposal to open discussion, not a finalized design. Sections marked
> **OPEN** are decisions I believe need maintainer / protocol-level input before
> implementation. Nothing here should be treated as settled.

## 1. Problem

`getGuildOwner({ guildId, chainId })` resolves a guild's on-chain owner
independently per chain. The same `guildId` (a `bytes32` encoding) could, in
principle, be deployed against different — and potentially conflicting —
GuildPass-compatible contracts on different chains. The SDK today has:

- no concept of which chain is a guild's authoritative ("canonical") home, and
- no way to detect or reconcile conflicting ownership/config claims across
  chains for a guild that exists on more than one chain.

As the roadmap's multi-chain config (`chains: Record<number, ChainConfig>`)
anticipates genuine multi-chain deployments, "what is the authoritative state of
guild X?" has no answer. This RFC proposes a model for that.

## 2. Goals / Non-goals

**Goals**
- A declared notion of a guild's "home chain."
- A defined trust model for how non-home chains relate to the home chain.
- A resolution primitive that queries multiple chains concurrently and reports
  agreement, disagreement, and partial failure **without silently choosing a
  winner**.

**Non-goals (for this RFC)**
- Changing on-chain contracts (unless the home-chain decision in §3 requires it —
  flagged as OPEN).
- Automatic conflict *resolution*. This RFC surfaces conflicts; deciding what a
  consumer does with a conflict is out of scope.

## 3. Home-chain declaration — OPEN

`getGuildConfig()` returns `GuildConfig` from the GuildPass API
(`/guilds/{guildId}/config`), so `GuildConfig` is currently API metadata, not
on-chain state. That shapes the choice:

| Option | Where `homeChainId` lives | Pros | Cons |
| --- | --- | --- | --- |
| A. API metadata | New `homeChainId` on `GuildConfig` | Easy; no contract change | "Home chain" is an API assertion, not trustless |
| B. On-chain | New contract field / method | Trustless, verifiable | Contract change + migration |
| C. Derived | Not stored (e.g. lowest chainId with a valid deployment) | No schema change | Implicit; ambiguous |

**Question for maintainers:** what trust level does "canonical chain" require? If
it must be trustless, Option B is implied (a contract-team decision). If an
API-level assertion is acceptable, Option A is lightest. Tentative lean: **A with
a documented fallback**, but this is the load-bearing decision and shouldn't be
made by the SDK alone.

## 4. Trust model: mirror vs. federation — OPEN

When a guild is queried on a non-home chain, how is its state there treated?

- **Mirror mode:** non-home chains are replicas; the home chain is
  authoritative; divergence is a fault to surface.
- **Federation mode:** each chain's deployment is independently valid;
  divergence is expected.

**Question for maintainers:** should the mode be declared per guild (on
`GuildConfig`), chosen by the consumer at query time, or both (config default,
per-call override)?

## 5. `resolveGuildIdentity(guildId, chainIds)` — proposed contract

New surface on the contracts client. It must never silently pick a winner; it
reports and lets the caller decide.

```ts
interface GuildIdentityResult {
  guildId: string;
  homeChainId?: number;              // present if declared (see §3)
  perChain: Array<{
    chainId: number;
    owner: string | null;            // null when unreachable
    reachable: boolean;
  }>;
  agreement: "unanimous" | "divergent" | "partial";
  //  unanimous — all reachable chains agree
  //  divergent — reachable chains disagree
  //  partial   — at least one chain was unreachable
  conflicts?: Array<{
    field: "owner";
    values: Array<{ chainId: number; value: unknown }>;
  }>;
}

resolveGuildIdentity(
  guildId: string,
  chainIds: number[],
  options?: RequestOptions,
): Promise<GuildIdentityResult>;
```

### Behaviour

1. Query the specified `chainIds` concurrently, reusing the existing
   chunked-concurrency path in `contractClient.ts` (behind `getGuildOwnersBatch`)
   rather than a new mechanism.
2. Collect each chain's `getGuildOwner` result; mark a chain `reachable: false`
   when its RPC call fails (see §6).
3. Compare results across reachable chains:
   - all agree → `unanimous`.
   - reachable chains disagree → `divergent`, with `conflicts` enumerating the
     differing values per chain.
   - one or more chains unreachable → `partial`.

**OPEN:** how to combine "partial" with "divergent" (reachable chains disagree
*and* one is down). Options: precedence, or a small status object rather than a
single enum. To settle in review.

## 6. Partial-failure handling

If a chain's RPC is unreachable, `resolveGuildIdentity` does not throw. That
chain is reported `reachable: false, owner: null`, and overall `agreement`
reflects `partial`. Rationale: a single down RPC should not prevent the caller
from seeing the chains that did respond.

## 7. Consumer guidance

Because the SDK reports rather than resolves, docs should show how a consumer
handles each `agreement` value — e.g. `divergent` in mirror mode is an alert, in
federation mode is expected; `partial` means retry or degrade. To be fleshed out
once §3–§4 are decided.

## 8. Rollout / migration — OPEN

Depends on §3. Option A needs an API schema addition and a default for guilds
without `homeChainId`. Option B needs a contract change and migration. To detail
once the home-chain decision is made.

## 9. Testing plan

Per the issue's acceptance criteria, once implementation proceeds:

- **Agreement:** chains return the same owner → `unanimous`.
- **Disagreement:** chains return different owners → `divergent`, `conflicts`
  populated.
- **Partial failure:** one chain unreachable → `partial`, that chain
  `reachable: false`, others still reported.
- **Concurrency:** the specified chains are queried in parallel via the batch
  path.

## 10. Open questions (summary)

1. **Home chain (§3):** `homeChainId` on `GuildConfig` (API) vs. on-chain vs.
   derived — which trust level does "canonical" need?
2. **Trust model (§4):** mirror vs. federation — on `GuildConfig`, query-time,
   or both?
3. **Result shape (§5):** is `agreement` + `conflicts` right, and how should
   `partial` combine with `divergent`?
4. **Prior art:** any existing multi-chain-identity discussion to build on?

---

*Once §3 and §4 are agreed, this RFC will be updated with the concrete schema,
the finalized `resolveGuildIdentity` contract, and a prototype implementation.*
