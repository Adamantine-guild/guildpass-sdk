# Contributing to GuildPass SDK

Thank you for contributing to GuildPass SDK.

GuildPass SDK V2 is the official TypeScript SDK for interacting with the GuildPass ecosystem. The current SDK is being rebuilt as a smaller, Stellar-first package with a strong focus on predictable APIs, strict typing, runtime safety, low dependency overhead, and independently testable modules.

This guide explains how to contribute to the current V2 codebase.

---

## Before You Start

Please read:

- `README.md`
- `CODE_OF_CONDUCT.md`
- `SECURITY.md`

If you are working from an issue, read the full issue before starting.

GuildPass campaign issues normally define:

- the problem;
- the expected outcome;
- suggested implementation boundaries;
- acceptance criteria;
- likely affected files;
- an independence requirement.

Treat the issue as the primary source of truth for your contribution.

---

# Current SDK Direction

GuildPass SDK V2 is a clean rebuild of the previous SDK.

The current direction is:

- TypeScript-first;
- Stellar-first;
- ESM-first;
- runtime-safe public APIs;
- minimal runtime dependencies;
- small independently testable modules;
- predictable public exports;
- compatibility with modern JavaScript runtimes.

The previous SDK contained functionality such as:

- ethers adapters;
- viem adapters;
- SIWE;
- EIP-712;
- EVM contract providers;
- multicall infrastructure;
- generic multichain abstractions.

Those are not part of the default V2 architecture.

Do not restore legacy V1 functionality unless an issue explicitly asks for it.

---

# Repository Structure

The current SDK V2 structure is intentionally small.

```text
guildpass-sdk/
│
├── src/
│   ├── client/
│   ├── config/
│   ├── errors/
│   ├── stellar/
│   ├── testing/
│   ├── transport/
│   ├── types/
│   └── index.ts
│
├── tests/
├── logo/
├── .github/
├── package.json
├── pnpm-lock.yaml
├── tsconfig.json
├── tsup.config.ts
├── vitest.config.ts
├── README.md
├── CONTRIBUTING.md
├── CODE_OF_CONDUCT.md
├── SECURITY.md
└── LICENSE
```

Some directories may be introduced or expanded as new features are added.

---

# Contribution Principles

## 1. Keep Contributions Focused

A pull request should solve one issue.

Avoid combining unrelated:

- features;
- refactors;
- formatting changes;
- dependency upgrades;
- documentation rewrites;
- tooling changes.

Small PRs are easier to review, test, and merge.

---

## 2. Keep Campaign Issues Independent

GuildPass contributor issues are intentionally designed so different contributors can work concurrently.

Do not make your implementation depend on another open issue unless the issue explicitly requires it.

Do not import code from another contributor's unmerged branch.

If your task needs a small helper that does not yet exist, implement the minimum self-contained functionality required for your issue.

---

## 3. Keep the Public API Small

Anything exported through:

```ts
src / index.ts;
```

should be treated as part of the SDK's public contract.

Do not export internal helpers simply because they are reusable internally.

Before adding a public export, consider whether SDK consumers genuinely need it.

---

## 4. Prefer Strong Types

Use TypeScript deliberately.

Prefer:

- discriminated unions;
- explicit interfaces;
- readonly values where appropriate;
- narrow function contracts;
- `unknown` at untrusted boundaries;
- runtime validation where TypeScript alone is insufficient.

Avoid:

- unnecessary `any`;
- broad unsafe casts;
- `as unknown as`;
- suppressing type errors instead of fixing them.

---

## 5. Runtime Validation Matters

TypeScript types disappear at runtime.

Any data coming from:

- HTTP responses;
- user configuration;
- Stellar values;
- encoded payloads;
- external APIs;

should be treated as untrusted until validated.

---

## 6. Keep Runtime Dependencies Minimal

SDK dependencies affect every application that installs the package.

Before adding a runtime dependency, consider:

- whether the platform already provides the required functionality;
- whether the functionality can be implemented safely in a small local module;
- bundle-size impact;
- browser/runtime compatibility;
- maintenance status;
- security implications.

New runtime dependencies should be justified in the PR description.

---

## 7. Preserve Deterministic Behaviour

Equivalent inputs should produce equivalent outputs.

Avoid behaviour that unnecessarily depends on:

- object insertion order;
- global mutable state;
- system time;
- uncontrolled randomness;
- network availability.

Where time or randomness is needed, design it so tests can control it.

---

# Development Setup

## Prerequisites

Install:

- Git
- Node.js 24 or newer
- pnpm 11.x

Check your versions:

```bash
node --version
pnpm --version
```

The repository currently uses:

```text
pnpm 11.16.0
```

---

# Fork and Clone

Fork:

```text
Adamantine-guild/guildpass-sdk
```

Then clone your fork:

```bash
git clone https://github.com/<YOUR_USERNAME>/guildpass-sdk.git
cd guildpass-sdk
```

Add the upstream repository:

```bash
git remote add upstream https://github.com/Adamantine-guild/guildpass-sdk.git
```

Verify:

```bash
git remote -v
```

You should have:

```text
origin    your fork
upstream  Adamantine-guild/guildpass-sdk
```

---

# Sync Before Starting Work

Before creating a feature branch:

```bash
git checkout main
git fetch upstream
git pull upstream main
git push origin main
```

Always branch from the latest `main`.

---

# Create a Branch

Do not work directly on `main`.

Recommended branch prefixes:

```text
feat/
fix/
test/
docs/
refactor/
chore/
ci/
```

Examples:

```bash
git checkout -b feat/stellar-account-parser
```

```bash
git checkout -b feat/request-transport
```

```bash
git checkout -b fix/config-validation
```

---

# Install Dependencies

Run:

```bash
pnpm install
```

For reproducible verification:

```bash
pnpm install --frozen-lockfile
```

pnpm may request approval for expected dependency build scripts.

If required:

```bash
pnpm approve-builds
```

Only approve packages you recognise and that are required by the SDK toolchain.

---

# Development Commands

## Typecheck

```bash
pnpm typecheck
```

This runs TypeScript without producing build output.

---

## Build

```bash
pnpm build
```

The SDK uses `tsup`.

Current build output includes:

```text
dist/index.js
dist/index.js.map
dist/index.d.ts
```

Do not edit files inside `dist/` manually.

---

## Run Tests

```bash
pnpm test
```

The SDK uses Vitest.

---

## Watch Tests

```bash
pnpm test:watch
```

---

## Development Build

```bash
pnpm dev
```

This runs `tsup` in watch mode.

---

## Lint

```bash
pnpm lint
```

---

## Format

```bash
pnpm format
```

---

# Required Validation

Before opening a pull request, run:

```bash
pnpm install --frozen-lockfile
pnpm typecheck
pnpm build
pnpm test
```

All applicable checks should pass.

If your contribution changes linted files, also run:

```bash
pnpm lint
```

---

# Testing Expectations

Tests are part of the implementation.

New behaviour should include appropriate tests.

Tests should cover, where relevant:

- expected behaviour;
- malformed input;
- boundary values;
- deterministic ordering;
- cancellation;
- timeouts;
- concurrency;
- security-sensitive input;
- runtime type failures.

Bug fixes should preferably include a regression test demonstrating the previous failure.

---

# Test Design

Prefer isolated tests that do not depend on external services.

For most SDK utilities:

```text
Input
  │
  ▼
Module
  │
  ▼
Deterministic output
```

should be testable without:

- network access;
- GuildPass Core running;
- Stellar RPC;
- Redis;
- PostgreSQL.

Mock external behaviour only where the issue genuinely concerns integration boundaries.

---

# Stellar Contributions

GuildPass SDK V2 is Stellar-first.

When implementing Stellar functionality:

- validate real Stellar formats rather than only prefixes;
- distinguish supported and unsupported StrKey types;
- avoid unnecessary network requests;
- keep network-specific functionality isolated;
- avoid introducing EVM dependencies unless explicitly requested.

For example, this is not sufficient validation:

```ts
address.startsWith("G");
```

Proper Stellar validation should use the appropriate encoding and checksum rules.

---

# SDK Client Contributions

The SDK client should remain a thin developer-facing interface.

A client method should typically:

```text
Validate caller input
        │
        ▼
Build request
        │
        ▼
Use transport
        │
        ▼
Validate response
        │
        ▼
Return typed result
```

Avoid embedding unrelated:

- retry logic;
- validation logic;
- request serialisation;
- domain calculations;

directly inside every client method.

Reusable behaviour should live in focused modules.

---

# Transport Contributions

Transport code should remain independent of GuildPass domain endpoints where possible.

Transport concerns include:

- HTTP methods;
- headers;
- URL construction;
- timeouts;
- cancellation;
- response parsing;
- transport errors.

Transport modules should not contain membership or governance business logic.

---

# Error Handling

Public SDK errors should be predictable.

Prefer:

- stable error codes;
- structured metadata;
- safe public messages;
- preserved causes internally where useful.

Do not expose:

- raw credentials;
- private keys;
- authentication headers;
- arbitrary secret-bearing objects;
- sensitive raw payloads.

Do not make consumers parse free-form error strings to determine error categories.

---

# Security-Sensitive Code

Take additional care when working on:

- Stellar signatures;
- authentication;
- capability tokens;
- webhook verification;
- API keys;
- cryptographic hashing;
- request signing;
- secret handling;
- replay protection.

Security-sensitive changes should include targeted failure tests.

---

# Cancellation

SDK operations that may wait on external work should use `AbortSignal` where appropriate.

Cancellation behaviour should be explicit.

Do not silently swallow caller cancellation.

Distinguish between:

- caller cancellation;
- timeout;
- transport failure;

where the public API needs to expose those differences.

---

# Timeouts

Timeout behaviour should be:

- bounded;
- documented;
- testable;
- distinct from ordinary request failure.

Avoid tests that depend on long real-time waits when controllable time or small deterministic timers can be used instead.

---

# Concurrency

Concurrency-sensitive utilities should define their atomic behaviour.

Examples include:

- request deduplication;
- batching;
- async task scheduling;
- cache coordination.

Avoid naive:

```text
check
then set
```

patterns where concurrent callers can race.

---

# Immutability

SDK code should avoid unexpectedly mutating caller-owned objects.

Prefer defensive copies for:

- configuration;
- headers;
- arrays;
- metadata;
- registry definitions.

Public APIs should document mutation behaviour when mutation is unavoidable.

---

# Browser and Runtime Compatibility

Avoid unnecessary reliance on Node-only APIs in code intended to run in browser-compatible environments.

Prefer standard APIs such as:

- `fetch`;
- `AbortController`;
- `URL`;
- `URLSearchParams`;
- Web-compatible cryptographic APIs where appropriate.

Node-specific behaviour should be introduced only when clearly required.

---

# Package Output

The SDK currently builds as ESM.

The public package entry point is:

```text
dist/index.js
```

with declarations:

```text
dist/index.d.ts
```

Do not add CommonJS output unless there is a documented compatibility requirement.

---

# Public Exports

Public SDK exports are defined through:

```ts
src / index.ts;
```

Avoid deep imports such as:

```ts
import { something } from "@guildpass/sdk/src/internal";
```

Consumers should use documented package exports only.

---

# Adding Dependencies

If you add a dependency, explain in your PR:

- why it is needed;
- why existing platform APIs are insufficient;
- whether it is runtime or development-only;
- any impact on bundle size;
- any security or compatibility implications.

Avoid adding large dependencies to solve small utility problems.

---

# Code Style

Prefer:

- small focused functions;
- explicit naming;
- readable control flow;
- clear public contracts;
- limited side effects;
- meaningful tests.

Avoid comments that merely repeat what the code already says.

Comments are most useful when documenting:

- security assumptions;
- non-obvious edge cases;
- protocol requirements;
- compatibility decisions.

---

# Commit Messages

Use clear scoped commit messages.

Recommended format:

```text
type(scope): description
```

Examples:

```text
feat(stellar): add Stellar account parser
feat(transport): add timeout-aware request handling
fix(config): reject malformed base URLs
test(validation): cover nested response failures
docs(sdk): update contribution guide
```

---

# Submitting a Pull Request

Push your branch:

```bash
git push origin <YOUR_BRANCH>
```

Then open a pull request against:

```text
Adamantine-guild/guildpass-sdk
```

Target:

```text
main
```

Reference the issue using:

```text
Closes #123
```

---

# Pull Request Expectations

A good PR should explain:

## What changed?

Describe the implementation.

## Why?

Explain the problem being solved.

## How was it tested?

List the commands you ran.

For example:

```text
pnpm typecheck
pnpm build
pnpm test
```

## Important design decisions

Document any:

- trade-offs;
- security decisions;
- compatibility implications;
- intentionally excluded functionality.

---

# Issue Scope

Do not expand an issue significantly beyond its acceptance criteria.

If you discover another problem:

- mention it separately;
- suggest or create another issue;
- keep the current PR focused.

---

# Independent Issue Policy

Many GuildPass SDK campaign issues contain an **Independence Requirement**.

This means your implementation must:

- work from the current `main`;
- not wait for another open issue;
- not depend on another contributor's branch;
- remain independently mergeable.

This requirement exists so multiple contributors can work concurrently.

---

# Continuous Integration

GuildPass SDK uses GitHub Actions to validate changes.

The expected CI path is:

```text
Install dependencies
        │
        ▼
Typecheck
        │
        ▼
Build
        │
        ▼
Tests
```

Pull requests with failing required checks are not ready to merge.

---

# PR Automation

GuildPass repositories use central PR automation maintained by Adamantine Guild.

The automation can:

- inspect workflow status;
- detect failed checks;
- wait for pending checks;
- detect merge conflicts;
- comment when intervention is required;
- merge eligible pull requests.

CI should be treated as part of the contribution contract.

---

# Workflow Changes

Changes under:

```text
.github/workflows/
```

are security-sensitive.

Do not modify workflows as part of an unrelated feature.

Workflow changes may require manual maintainer review because they can affect repository permissions and automation behaviour.

---

# Documentation

Update documentation when your change materially affects:

- installation;
- public SDK APIs;
- configuration;
- runtime behaviour;
- supported Stellar behaviour;
- contributor workflow.

Do not document functionality that has not actually been implemented unless it is clearly labelled as planned.

---

# Security Reporting

Do not report vulnerabilities through public issues.

Follow:

```text
SECURITY.md
```

for responsible disclosure instructions.

---

# Code of Conduct

All contributors must follow:

```text
CODE_OF_CONDUCT.md
```

---

# Need Help?

If an issue is unclear, ask a focused question on the issue before implementing a substantially different interpretation.

Avoid large speculative pull requests without alignment.

---

Thank you for helping build GuildPass SDK V2.
