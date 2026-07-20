# Contributing to GuildPass SDK

Thank you for your interest in contributing to the GuildPass SDK! This is the official TypeScript SDK for the GuildPass protocol.

## Table of Contents

- [Code of Conduct](#code-of-conduct)
- [Ways to Contribute](#ways-to-contribute)
- [Finding Issues](#finding-issues)
- [Development Setup](#development-setup)
- [Coding Standards](#coding-standards)
- [Branching & Commits](#branching--commits)
- [Submitting a Pull Request](#submitting-a-pull-request)
- [Review Process](#review-process)
- [Communication](#communication)

---

## Code of Conduct

By participating you agree to our [Code of Conduct](./CODE_OF_CONDUCT.md).

---

## Ways to Contribute

- Fix bugs in existing service modules
- Add new service methods with full TypeScript types
- Write or improve Vitest unit tests
- Improve TypeDoc documentation comments on public APIs
- Improve the usage guides in `docs/`
- Add new code examples in `examples/`
- Fix TypeScript strict mode issues
- Improve error messages and error types

---

## Finding Issues

1. Browse issues directly on GitHub:
   - [`good first issue`](https://github.com/Adamantine-Guild/guildpass-sdk/issues?q=label%3A%22good+first+issue%22)
   - [`help wanted`](https://github.com/Adamantine-Guild/guildpass-sdk/issues?q=label%3A%22help+wanted%22)
2. Comment `I'd like to work on this` on the GitHub issue you'd like to work on.
3. Wait for a maintainer to assign it before starting — this avoids duplicate effort.

---

## Development Setup

### Prerequisites

- Node.js 18+
- pnpm (recommended)

### Steps

```bash
# 1. Fork and clone
git clone https://github.com/<your-username>/guildpass-sdk.git
cd guildpass-sdk

# 2. Install dependencies
pnpm install

# 3. Build the SDK (tsup)
pnpm build

# 4. Run tests to confirm everything works
pnpm test:run
```

### Project structure

| Path           | Purpose                                   |
| -------------- | ----------------------------------------- |
| `src/`         | SDK source code (services, types, client) |
| `src/index.ts` | Public API entry point                    |
| `tests/`       | Vitest unit tests                         |
| `docs/`        | Markdown documentation guides             |
| `examples/`    | Usage examples                            |
| `dist/`        | Build output (generated, do not edit)     |

---

## Coding Standards

- **TypeScript only** — no plain JavaScript files.
- **No `any`** without a clear comment explaining why.
- **Public APIs must have TypeDoc comments** — every exported function, class, and type.
- **Tests required** — every new public method must have at least one Vitest unit test.
- **No side effects** — the package sets `"sideEffects": false`. Keep it that way.
- **Minimal dependencies** — the SDK has zero runtime dependencies by design. Do not add any without prior discussion with a maintainer.
- **Formatting** — run `pnpm format` (Prettier) before submitting.
- **Linting** — run `pnpm lint` (ESLint) and fix all reported issues.
- **Keep the public API clean** — prefer extending existing interfaces over adding new ones.

---

## Branching & Commits

- Branch off `main`: `git checkout -b feat/short-description` or `fix/short-description`
- Conventional commits:
  - `feat: add client.membership.getHistory() method`
  - `fix: handle 404 response from access.checkAccess()`
  - `test: add unit tests for roles service`
  - `docs: add SIWE authentication example`
  - `chore: upgrade vitest to 2.x`
  - `refactor: extract HTTP client into shared utility`

---

## Submitting a Pull Request

1. Push your branch to your fork.
2. Open a PR against `Adamantine-Guild/guildpass-sdk` on `main`.
3. Fill in the [PR template](.github/PULL_REQUEST_TEMPLATE.md) completely.
4. Ensure these pass before submitting:

```bash
pnpm typecheck    # Must pass with no errors
pnpm lint         # Fix all reported issues
pnpm test:run     # All tests must pass
pnpm build        # Build must succeed
```

### PR Quality Expectations

- All new public methods/types have TypeDoc comments.
- New behaviour is covered by at least one Vitest test.
- No new runtime dependencies without prior maintainer approval.
- Public API changes include documentation updates in `docs/`.
- Semver impact is noted in the PR description (patch / minor / major).

---

## Review Process

- A maintainer will review your PR within **5 business days**.
- Address requested changes promptly.
- Breaking changes (major version) require additional design discussion.
- Once approved and CI passes, a maintainer merges and releases.

---

## Communication

- GitHub Issues: preferred for all task discussion
- Contact: cerealboxx123@gmail.com

---

## Public API Changes

We monitor changes to our public API surface closely to prevent accidental breaking changes.

If you modify exported classes, interfaces, or types:
1. Run `pnpm api-report` locally to update the API baseline file (`api-report/guildpass-sdk.api.md`).
2. Commit the updated `guildpass-sdk.api.md` file alongside your code changes.
3. Your pull request will display a diff of the API changes for maintainer review.