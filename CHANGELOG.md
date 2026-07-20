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

## [0.1.0] - 2026-06-29

### Added
- Made the main logo clickable, directing to the root README.md file.
- Fixed logo display by using the local logo file instead of an external URL.
