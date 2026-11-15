# Changelog

All notable changes to `@guildpass/sdk` are documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## Semantic Versioning & Pre-Release Policy

- **Patch (`0.2.x`)**: Backwards-compatible bug fixes, transport edge-case handling, and internal refactors.
- **Minor (`0.x.0`)**: Backwards-compatible new resource endpoints, domain types, or helper utilities.
- **Major (`x.0.0`)**: Breaking changes to `GuildPassClient`, resource signatures, error hierarchies, or removal of public exports.
- **Pre-Releases (`x.y.z-alpha.N`, `x.y.z-beta.N`)**: Tagged preview builds validated through `pnpm release:validate` prior to stable promotion.

## [0.2.0] - 2026-11-15

### Added
- Canonical V2 public domain types (`Guild`, `Member`, `Pass`, `AccessPolicy`, `ActivityEvent`).
- `GuildPassClient` initialization, configuration parser, and `HttpTransport` with timeout and cancellation support.
- `AccessResource` (`client.access.check`) with structured `AccessDecision` normalization.
- Stellar network and account (`G...` / `C...`) validation and formatting helpers.
- Cursor pagination (`paginate`, `collectAll`, `createPaginatedApi`), retry policy, and secret redaction utilities.
