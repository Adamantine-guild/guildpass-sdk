<p align="center">
  <img src="./logo/Guidlpass%20SDK%20Logo.png" alt="GuildPass SDK Logo" width="220" />
</p>

<h1 align="center">GuildPass SDK</h1>

<p align="center">
  <strong>The official TypeScript SDK for building applications on top of GuildPass.</strong>
</p>

<p align="center">
  A developer-friendly interface for connecting applications, communities and services to GuildPass.
</p>

<p align="center">
  <img src="https://img.shields.io/badge/TypeScript-5.x-3178C6?logo=typescript&logoColor=white" alt="TypeScript" />
  <img src="https://img.shields.io/badge/Node.js-24+-339933?logo=node.js&logoColor=white" alt="Node.js" />
  <img src="https://img.shields.io/badge/Stellar-Ready-7C3AED" alt="Stellar" />
  <img src="https://img.shields.io/badge/Package-@guildpass%2Fsdk-6F42C1" alt="@guildpass/sdk" />
  <img src="https://img.shields.io/badge/License-MIT-blue" alt="MIT License" />
</p>

---

## What is GuildPass SDK?

GuildPass SDK is the TypeScript library applications use to interact with the wider GuildPass ecosystem.

GuildPass itself is designed as infrastructure for programmable communities, including areas such as:

- digital membership;
- access control;
- community roles;
- governance;
- contribution tracking;
- rewards;
- Stellar-based identity and membership infrastructure.

The SDK sits between an application and GuildPass Core.

Instead of every application manually constructing HTTP requests, validating responses, handling errors and understanding every internal GuildPass service, the SDK provides a cleaner developer-facing interface.

Conceptually:

```text
Application
    │
    │ uses
    ▼
GuildPass SDK
    │
    │ communicates with
    ▼
GuildPass Core
    │
    ├── Membership
    ├── Access Control
    ├── Governance
    ├── Contributions
    ├── Rewards
    └── Stellar / Soroban
```

---

# For Non-Technical Readers

GuildPass SDK can be thought of as a **bridge between GuildPass and applications**.

Imagine a community application needs to answer:

> Is this person a member?

or:

> Does this member have permission to access this feature?

or eventually:

> What role does this member have?

> Is this membership associated with a valid Stellar identity?

> What GuildPass community does this user belong to?

The application should not need to understand all of the infrastructure behind those questions.

The SDK is intended to give developers straightforward functions that handle those interactions for them.

For example, a developer should eventually be able to write code conceptually similar to:

```ts
const membership = await guildpass.memberships.get({
  communityId: "community_123",
  memberId: "member_456",
});
```

instead of manually constructing network requests and interpreting internal GuildPass responses.

---

# GuildPass SDK V2

The current repository contains **GuildPass SDK V2**, a clean rebuild of the original SDK.

The previous version had accumulated a broad set of functionality including:

- EVM providers;
- ethers adapters;
- viem adapters;
- SIWE authentication;
- EIP-712 utilities;
- contract providers;
- multicall infrastructure;
- caching;
- Merkle utilities;
- multiple transports;
- multi-chain abstractions.

GuildPass is now moving toward a cleaner **Stellar-first architecture**, so V2 intentionally starts with a much smaller foundation.

The goal is to grow the SDK around actual GuildPass requirements rather than preserving unnecessary complexity from the old implementation.

The previous SDK remains available through Git history and the preserved pre-rebuild branch and tag.

---

# Current Status

> GuildPass SDK V2 is under active development.

The current baseline includes:

- a TypeScript SDK package;
- strict TypeScript configuration;
- ESM output;
- declaration generation;
- source maps;
- a minimal `GuildPassClient`;
- shared SDK types;
- Vitest test infrastructure;
- tsup packaging;
- pnpm dependency management;
- CI-ready build commands.

The SDK deliberately does **not** yet contain every capability described in the long-term GuildPass architecture.

Features are being added incrementally through scoped contributor issues.

---

# Repository Structure

```text
guildpass-sdk/
│
├── .github/
│   ├── ISSUE_TEMPLATE/
│   ├── workflows/
│   └── PULL_REQUEST_TEMPLATE.md
│
├── logo/
│   └── Guidlpass SDK Logo.png
│
├── src/
│   ├── client/
│   │   └── SDK client implementation
│   │
│   ├── config/
│   │   └── SDK configuration
│   │
│   ├── errors/
│   │   └── SDK error contracts
│   │
│   ├── stellar/
│   │   └── Stellar-specific functionality
│   │
│   ├── testing/
│   │   └── Testing utilities
│   │
│   ├── transport/
│   │   └── Communication infrastructure
│   │
│   ├── types/
│   │   └── Public TypeScript types
│   │
│   └── index.ts
│
├── tests/
│   └── SDK unit tests
│
├── package.json
├── pnpm-lock.yaml
├── tsconfig.json
├── tsup.config.ts
├── vitest.config.ts
├── LICENSE
├── CONTRIBUTING.md
├── CODE_OF_CONDUCT.md
├── SECURITY.md
└── README.md
```

Some directories may currently contain only the initial V2 foundation and will expand as new functionality is implemented.

---

# Technology Stack

GuildPass SDK V2 uses a deliberately small toolchain.

| Technology | Purpose                             |
| ---------- | ----------------------------------- |
| TypeScript | SDK implementation and public types |
| Node.js    | Development and build runtime       |
| pnpm       | Dependency management               |
| tsup       | SDK bundling                        |
| Vitest     | Unit testing                        |
| ESLint     | Static code analysis                |
| Prettier   | Code formatting                     |

The SDK currently targets:

```text
Node.js >= 24
```

and uses:

```text
pnpm 11.16.0
```

---

# Package Design

GuildPass SDK is designed to be consumed as:

```ts
import { GuildPassClient } from "@guildpass/sdk";
```

The current client foundation looks conceptually like:

```ts
const client = new GuildPassClient({
  baseUrl: "https://api.guildpass.example",
});
```

As V2 develops, additional APIs will be introduced through this package while keeping the public interface predictable and strongly typed.

---

# Why TypeScript?

GuildPass deals with domain concepts that benefit from explicit contracts, including:

- membership state;
- community identifiers;
- Stellar addresses;
- access decisions;
- governance data;
- API errors;
- SDK configuration.

TypeScript helps surface mistakes before applications reach production.

For example, the SDK can expose a constrained type such as:

```ts
export type GuildPassNetwork = "stellar";
```

rather than allowing arbitrary unsupported network values throughout an application.

---

# Installation

Once the package is published, applications will be able to install it using:

```bash
pnpm add @guildpass/sdk
```

or:

```bash
npm install @guildpass/sdk
```

or:

```bash
yarn add @guildpass/sdk
```

> The V2 package is currently under active development. Check the repository or package registry for the latest published availability.

---

# Running the Repository Locally

The following steps are for developers who want to contribute to the SDK itself.

## Prerequisites

Install:

- Git
- Node.js 24 or newer
- pnpm 11.x

Check Node:

```bash
node --version
```

Expected:

```text
v24.x.x
```

or newer.

Check pnpm:

```bash
pnpm --version
```

The repository currently uses:

```text
11.16.0
```

---

## 1. Fork the Repository

Fork:

```text
Adamantine-guild/guildpass-sdk
```

into your GitHub account.

---

## 2. Clone Your Fork

```bash
git clone https://github.com/<YOUR_USERNAME>/guildpass-sdk.git
cd guildpass-sdk
```

---

## 3. Add the Upstream Repository

```bash
git remote add upstream https://github.com/Adamantine-guild/guildpass-sdk.git
```

Verify:

```bash
git remote -v
```

You should see:

```text
origin    your fork
upstream  Adamantine-guild/guildpass-sdk
```

---

## 4. Install Dependencies

```bash
pnpm install
```

For reproducible installs in CI or when testing the existing lockfile:

```bash
pnpm install --frozen-lockfile
```

pnpm may request approval for packages that require installation-time build scripts.

If prompted:

```bash
pnpm approve-builds
```

Only approve expected dependencies.

For the current toolchain, `esbuild` is required by the SDK build/test infrastructure.

---

# Development Commands

## Typecheck

```bash
pnpm typecheck
```

This runs:

```text
tsc --noEmit
```

and validates the TypeScript source without generating build output.

---

## Build

```bash
pnpm build
```

This creates the distributable package under:

```text
dist/
```

The current V2 build produces files such as:

```text
dist/index.js
dist/index.js.map
dist/index.d.ts
```

---

## Run Tests

```bash
pnpm test
```

Tests use Vitest.

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

This runs tsup in watch mode and rebuilds the SDK as files change.

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

# Recommended Local Validation

Before opening a pull request, run:

```bash
pnpm install --frozen-lockfile
pnpm typecheck
pnpm build
pnpm test
```

A contribution should not be considered ready when any of these checks fail.

---

# SDK Build Output

The SDK uses `tsup` to create its distributable output.

Source:

```text
src/index.ts
```

becomes:

```text
dist/index.js
dist/index.d.ts
dist/index.js.map
```

The package exposes the built output through:

```json
{
  "exports": {
    ".": {
      "types": "./dist/index.d.ts",
      "import": "./dist/index.js"
    }
  }
}
```

This means consumers interact with the public package entry point rather than importing files directly from `src/`.

---

# Public API Design

A key V2 principle is to keep the public SDK interface intentionally small.

Not every internal helper should become part of the package's public API.

Code exported through:

```ts
src / index.ts;
```

should be treated as part of the SDK's external contract.

Changes to those exports therefore require more care than changes to internal implementation details.

---

# Design Principles

## 1. Keep the SDK Simple

Applications should not need to understand GuildPass internals to use GuildPass.

The SDK should hide infrastructure complexity without hiding meaningful errors.

---

## 2. Strong Types First

Public APIs should expose clear TypeScript contracts.

Avoid returning unstructured objects where meaningful domain types can be used.

---

## 3. Stellar First

GuildPass SDK V2 is being rebuilt around the current GuildPass Stellar direction.

Legacy EVM abstractions should not be reintroduced unless there is an explicit architectural decision to support them.

---

## 4. Avoid Unnecessary Dependencies

Every dependency added to an SDK affects downstream applications.

Dependencies should therefore be introduced carefully.

A small utility should preferably use platform capabilities where practical rather than pulling in a large dependency tree.

---

## 5. Browser and Runtime Safety

SDK code should avoid unnecessary assumptions about:

- Node-only globals;
- browser-only globals;
- filesystem access;
- process state.

Runtime-specific features should have explicit boundaries.

---

## 6. Deterministic Behaviour

Validation, parsing, encoding and policy-related utilities should return predictable results for the same inputs.

This makes the SDK easier to test and safer for consuming applications.

---

## 7. Preserve Public Compatibility

Once a public V2 API is established, avoid breaking it casually.

Breaking SDK changes affect every application consuming the package.

---

# Stellar Direction

GuildPass SDK V2 is being designed around Stellar and Soroban integration.

Future SDK capabilities may include abstractions around:

- Stellar account validation;
- Stellar network configuration;
- Soroban contract interactions;
- membership contracts;
- community access checks;
- transaction construction;
- typed GuildPass contract responses.

Blockchain-specific logic should remain isolated from unrelated SDK functionality.

For example:

```text
Application
     │
     ▼
GuildPassClient
     │
     ├── Core API
     │
     └── Stellar / Soroban
```

The exact public APIs will be introduced incrementally as the corresponding GuildPass infrastructure stabilises.

---

# Error Handling

SDK consumers should eventually be able to distinguish between different classes of failure instead of handling every error as an arbitrary string.

Examples may include:

```text
configuration errors
validation errors
transport errors
GuildPass API errors
Stellar errors
contract errors
```

Errors exposed publicly should contain useful context without leaking credentials or sensitive implementation details.

---

# Testing Philosophy

The SDK should favour focused deterministic tests.

Tests should cover:

- expected behaviour;
- invalid input;
- boundary conditions;
- malformed data;
- compatibility behaviour;
- security-sensitive edge cases;
- public API contracts.

A bug fix should preferably include a regression test demonstrating the original failure.

---

# Continuous Integration

GuildPass SDK uses GitHub Actions to validate contributor changes.

The intended validation path is:

```text
Pull Request
     │
     ▼
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
     │
     ▼
Required checks pass
```

Pull requests should not be merged while required SDK checks are failing.

---

# Pull Request Automation

GuildPass repositories use central PR automation maintained by Adamantine Guild.

The automation can evaluate:

- workflow status;
- failed checks;
- pending checks;
- merge conflicts;
- merge eligibility.

Where configured, eligible pull requests may be automatically merged after their required CI checks pass.

A failed pipeline should never be treated as a successful contribution.

Workflow changes under:

```text
.github/workflows/
```

may require additional maintainer review.

---

# Contributing

Contributions are welcome.

Before contributing, read:

```text
CONTRIBUTING.md
CODE_OF_CONDUCT.md
SECURITY.md
```

---

# Contributor Workflow

## 1. Sync Your Fork

```bash
git checkout main
git fetch upstream
git pull upstream main
git push origin main
```

---

## 2. Create a Branch

Do not work directly on `main`.

Example:

```bash
git checkout -b feat/stellar-address-validator
```

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

---

## 3. Work on One Issue

Contributor issues are intentionally scoped so different contributors can work concurrently.

Do not make your implementation depend on another open campaign issue unless the issue explicitly states otherwise.

---

## 4. Validate Your Changes

Run:

```bash
pnpm typecheck
pnpm build
pnpm test
```

---

## 5. Open a Pull Request

Reference the issue being solved:

```text
Closes #123
```

Your pull request should explain:

- what was changed;
- why it was changed;
- how the implementation works;
- which tests were added;
- any important design decisions.

---

# Contributor Issues

GuildPass SDK development is divided into focused contributor tasks.

Issues may carry labels such as:

```text
Third Campaign
advanced
expert
stellar
security
testing
type-safety
performance
backend
```

Tasks are designed, where possible, so multiple contributors can work on different capabilities concurrently.

---

# Commit Messages

Use clear commit messages.

Recommended format:

```text
type(scope): description
```

Examples:

```text
feat(stellar): add Stellar address validation
feat(client): add access-check client method
fix(config): reject malformed API URL
test(client): cover transport timeout behaviour
docs(sdk): document Stellar configuration
```

---

# What Should Not Be Added Casually

The V2 rebuild deliberately removed a large amount of legacy complexity.

Do not reintroduce components such as:

```text
ethers adapters
viem adapters
SIWE
EIP-712
EVM multicall
generic multichain abstractions
```

unless there is a specific approved issue or architectural decision requiring them.

The goal of V2 is not to reproduce V1 file-for-file.

---

# Repository History

GuildPass SDK V2 is a rebuild of the original SDK, but the original work has not been lost.

The pre-rebuild implementation remains accessible through the repository's history and preserved archive references.

This allows maintainers to inspect previous implementations where useful while keeping the V2 architecture clean.

Contributors should build against the current `main` branch rather than restoring legacy V1 modules.

---

# Security

Do not commit:

- private keys;
- Stellar secret keys;
- seed phrases;
- API tokens;
- credentials;
- production environment files;
- authentication secrets.

Security vulnerabilities should not be disclosed through public GitHub issues.

Follow:

```text
SECURITY.md
```

for responsible disclosure guidance.

---

# Licence

GuildPass SDK is licensed under the MIT License.

See:

```text
LICENSE
```

for the complete licence terms.

---

# Adamantine Guild

GuildPass is part of the Adamantine Guild open-source ecosystem.

### GuildPass SDK

```text
https://github.com/Adamantine-guild/guildpass-sdk
```

### Adamantine Guild

```text
https://github.com/Adamantine-guild
```

---

<p align="center">
  <img src="./logo/Guidlpass%20SDK%20Logo.png" alt="GuildPass SDK Logo" width="110" />
</p>

<p align="center">
  <strong>GuildPass SDK</strong><br />
  A simpler way to build on GuildPass.
</p>
