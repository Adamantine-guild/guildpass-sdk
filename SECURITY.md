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

### Disclosure Policy

- We ask for a **90-day** coordinated disclosure window.
- We will credit reporters in release notes unless you prefer anonymity.

Thank you for helping keep the GuildPass SDK secure.
