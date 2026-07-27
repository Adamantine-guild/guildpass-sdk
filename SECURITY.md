# Security Policy

## Supported Versions

| Version      | Supported |
| ------------ | --------- |
| 0.1.x (main) | ✅ Yes    |

## Reporting a Vulnerability

If you discover a security vulnerability in the GuildPass SDK, **do not** open a public GitHub issue.

### How to report

1. **Email** **cerealboxx123@gmail.com** with subject `[SECURITY] guildpass-sdk — <brief description>`.
2. Include:
   - Description of the vulnerability
   - Steps or code to reproduce it
   - Potential impact (e.g., data exposure, authentication bypass)
   - Suggested mitigations (optional)
3. We will acknowledge receipt within **72 hours** and provide an initial assessment within **7 days**.

### Scope

The SDK is a client-side TypeScript library. Security concerns are primarily about how it handles and transmits data.

See [`docs/security/threat-model.md`](./docs/security/threat-model.md) for a consolidated analysis of `apiKey`, RPC, and cache trust boundaries.

**In-scope concerns:**

- Leakage of `apiKey` or other credentials in logs, error messages, or HTTP headers
- Incorrect validation of API responses that could lead to privilege escalation
- Prototype pollution or injection vulnerabilities in request/response handling
- Bundling of secret values that should remain server-side only

**Out-of-scope:**

- Vulnerabilities in `guildpass-core` backend — report to that repository
- Vulnerabilities in third-party bundlers or runtimes consuming the SDK
- Issues in the `dist/` build output that are caused by an outdated local build

### Hardening notes

Findings from internal hardening work, recorded here so the audited surface and its
limits are visible. These were found and fixed in-repo, not reported externally, so the
coordinated-disclosure window below does not apply to them.

**JSON-RPC response decoding** (see [#401](https://github.com/Adamantine-Guild/guildpass-sdk/issues/401)) — audited every path that
interprets bytes returned by an RPC endpoint.

Already correct, confirmed by review and now pinned by tests:

- The single-value decoders (`decodeAddressResult`, `decodeUint256Result`,
  `decodeBoolResult`, and the ERC-165 checks) validate the exact 32-byte word format
  before extracting anything, so truncated or over-long words are rejected rather than
  padded.
- JSON-RPC batch responses are correlated back to requests by their JSON-RPC `id`, never
  by array position, so a reordered batch cannot attribute one call's result to another.
- A batch response that is not an array is rejected outright.

Fixed:

- `aggregate3` return decoding interpreted node-controlled offsets and lengths without
  validation. A malformed envelope could decode into a plausible-looking result instead
  of an error — including a reported *success* carrying no data, and a reported contract
  *revert* that never happened — and an oversized array-length word drove an effectively
  unbounded loop. All offsets, lengths and flags are now bounds- and alignment-checked
  before use, and every rejection surfaces as `INVALID_RESPONSE`.
- Revert-reason decoding trusted an attacker-controlled string length; it is now bounded
  by the data actually present and still degrades to a generic message rather than
  throwing.

**Response size cap** — the SDK will not parse a single `eth_call` result larger than
**10 MiB**. The limit is checked on the payload length before any decoding work runs.
See [`docs/api-reference.md`](./docs/api-reference.md) for the full contract.

### Disclosure Policy

- We ask for a **90-day** coordinated disclosure window.
- We will credit reporters in release notes unless you prefer anonymity.

Thank you for helping keep the GuildPass SDK secure.
