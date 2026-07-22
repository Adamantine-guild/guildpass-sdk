# GuildPass SDK Tasks

This document lists tasks suitable for open contributions.

---

## 🟢 Ready to Contribute

### TASK-SDK-001: Add TypeDoc comments to all public exported functions

- **Difficulty**: Easy
- **Labels**: `good first issue`, `documentation`, `types`
- **Description**: Several exported functions and types in `src/` are missing TypeDoc `/** */` comments. Add JSDoc/TypeDoc comments describing parameters, return values, and usage.
- **Files to change**: `src/services/*.ts`, `src/types.ts` (or equivalent)
- **Acceptance criteria**:
  - All public exports have at minimum `@param` and `@returns` tags
  - `pnpm docs` (TypeDoc) generates without warnings
  - Comments are accurate and match current behaviour
- **Tests**: `pnpm typecheck` and `pnpm docs` pass
- **Reviewer expectations**: Accurate descriptions; TypeDoc format (`/** */`)

---

### TASK-SDK-002: Add unit tests for the `client.access` service

- **Difficulty**: Easy–Medium
- **Labels**: `good first issue`, `tests`
- **Description**: The `client.access` service has limited or no unit tests. Add Vitest tests that mock HTTP responses and verify correct return values and error handling.
- **Files to change**: `tests/` (add or expand access service tests)
- **Acceptance criteria**:
  - Tests for successful `checkAccess` response (allowed and denied cases)
  - Tests for network error handling (timeout, 500 response)
  - All tests mock HTTP — no real network calls
  - `pnpm test:run` passes
- **Tests**: `pnpm test:run`
- **Reviewer expectations**: Clear test names; use `vi.mock` or similar to mock HTTP; no real API calls

---

### TASK-SDK-003: Add a Node.js usage example to examples/

- **Difficulty**: Easy
- **Labels**: `good first issue`, `documentation`, `examples`
- **Description**: The `examples/` directory is sparse. Add a complete, runnable Node.js example demonstrating initialisation, membership check, and access check.
- **Files to change**: `examples/node-basic/` (new directory)
- **Acceptance criteria**:
  - Self-contained `index.ts` with GuildPassClient usage
  - `README.md` explaining how to run it
  - Uses environment variables for API URL and wallet address (not hardcoded)
  - Syntactically valid TypeScript — compiles with `tsc`
- **Tests**: `tsc` compiles the example without errors
- **Reviewer expectations**: Clean code, comments explaining each step, `.env.example` included

---

### TASK-SDK-004: Add a CI workflow for test, typecheck, and build

- **Difficulty**: Easy
- **Labels**: `good first issue`, `tests`
- **Description**: Add a GitHub Actions workflow that runs on every push and PR: `pnpm typecheck`, `pnpm lint`, `pnpm test:run`, and `pnpm build`.
- **Files to change**: `.github/workflows/ci.yml` (new)
- **Acceptance criteria**:
  - Triggers on `push` and `pull_request` to `main`
  - Node 18, pnpm setup, all four commands
  - Publishes `dist/` as a workflow artifact
- **Tests**: Workflow passes on a draft PR
- **Reviewer expectations**: Use `pnpm/action-setup`; clean YAML

---

### TASK-SDK-005: Improve error messages in access check error responses

- **Difficulty**: Easy–Medium
- **Labels**: `good first issue`, `feature`
- **Description**: When `client.access.checkAccess()` receives a non-200 response, the error thrown has a generic message. Improve it to include the HTTP status code, the URL called, and the server-returned error body (if any).
- **Files to change**: `src/services/access.ts` (or equivalent HTTP error handling utility)
- **Acceptance criteria**:
  - Error message includes: status code, URL, server error message (if available)
  - Error is typed (not a plain `Error`) — create or extend a `GuildPassError` class
  - Unit tests cover the new error format
  - Backwards compatible — does not change the return type of `checkAccess`
- **Tests**: `pnpm test:run` — new error format tests pass
- **Reviewer expectations**: Typed error class; no breaking API changes

---

## 🟡 Planned (not yet open)

- Add `client.membership.getHistory()` method
- Implement pluggable caching layer (LRU cache adapter)
- Add SIWE (Sign-In with Ethereum) signature helper
- Publish `@guildpass/react` hooks package

---

*To work on a task, comment on the linked GitHub issue.*
