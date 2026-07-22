# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/), and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

### Added
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

## [0.1.0] - 2026-06-29

### Added
- Made the main logo clickable, directing to the root README.md file.
- Fixed logo display by using the local logo file instead of an external URL.
