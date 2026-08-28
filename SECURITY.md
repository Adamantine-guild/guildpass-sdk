# Security Policy

Security-sensitive behaviour in GuildPass SDK V2 should remain small, explicit, testable, and isolated from unrelated SDK functionality.

GuildPass SDK is a client-side TypeScript package. Security concerns therefore focus primarily on how the SDK validates untrusted data, handles credentials, constructs requests, verifies cryptographic material, and exposes errors to consumers.

---

## Supported Versions

GuildPass SDK V2 is currently under active development.

| Version          | Supported   |
| ---------------- | ----------- |
| `0.2.x` / `main` | Yes         |
| `0.1.x`          | Legacy only |

Security fixes are expected to target the current V2 codebase unless a maintainer explicitly decides otherwise.

---

## Reporting a Vulnerability

Do not open a public GitHub issue for a suspected security vulnerability.

Report security issues privately.

### Preferred Reporting Method

If GitHub private vulnerability reporting is enabled for the repository, use the repository's **Security** tab and submit a private vulnerability report.

Otherwise, email:

```text
cerealboxx123@gmail.com
```

Suggested subject:

```text
[SECURITY] guildpass-sdk - brief description
```

Include as much of the following as possible:

- a clear description of the vulnerability;
- affected SDK version or commit;
- affected module or file;
- reproduction steps;
- proof-of-concept code where appropriate;
- potential impact;
- expected behaviour;
- suggested mitigation, if known.

Avoid sending real credentials, private keys, Stellar secret seeds, production API keys, or other unnecessary sensitive data.

---

## What Not to Do

When investigating a vulnerability:

- do not access data that does not belong to you;
- do not attempt destructive testing;
- do not disrupt production services;
- do not publish exploit details before maintainers have had a reasonable opportunity to investigate;
- do not include real secrets in public reproductions.

Use minimal, controlled test cases whenever possible.

---

# Security Scope

GuildPass SDK V2 has a deliberately smaller security surface than the legacy SDK.

Relevant areas include:

- HTTP transport;
- runtime response validation;
- configuration parsing;
- Stellar address and signature handling;
- request signing;
- capability or authentication tokens;
- API-key handling;
- secret redaction;
- request fingerprinting;
- cancellation and timeout behaviour;
- cache boundaries;
- webhook verification;
- cryptographic helpers;
- package exports;
- dependency security.

Not every area above is necessarily implemented yet. Security documentation must distinguish between implemented behaviour and planned functionality.

---

# Credential Handling

The SDK must not expose credentials through:

- logs;
- errors;
- debug metadata;
- serialized request contexts;
- diagnostic events;
- thrown configuration objects.

Sensitive values may include:

```text
API keys
Bearer tokens
session tokens
capability tokens
webhook secrets
signing secrets
private keys
Stellar secret seeds
```

Where diagnostics require identifying a credential, prefer a non-reversible fingerprint rather than the original value.

---

# Stellar Secret Keys

GuildPass SDK should never require a consumer to provide a Stellar secret seed merely to perform read-only SDK operations.

Where signing is required, signing should remain with the caller's wallet, signer, or explicitly trusted signing component.

Never:

```text
log a Stellar secret seed
persist it in SDK state
include it in diagnostics
send it to GuildPass Core
embed it in browser bundles
```

---

# Untrusted Input

Data crossing a trust boundary must be treated as untrusted.

Examples include:

- GuildPass API responses;
- configuration values;
- HTTP headers;
- URLs;
- query parameters;
- Stellar addresses;
- encoded signatures;
- webhook payloads;
- JSON metadata;
- cached external data.

TypeScript types alone are not sufficient protection because they do not exist at runtime.

Security-sensitive modules should validate inputs before relying on them.

---

# HTTP Transport Security

Transport code should take care when handling:

- request URLs;
- headers;
- authentication credentials;
- redirects;
- timeouts;
- cancellation;
- response parsing;
- response size limits.

Do not automatically forward sensitive headers to a different origin after URL manipulation or redirects unless that behaviour is explicitly safe.

Transport errors should not expose complete request objects when those objects may contain secrets.

---

# Response Validation

External API responses should not be assumed to match TypeScript interfaces.

When a response controls SDK behaviour, validate the relevant runtime shape before using it.

Malformed data should produce a controlled SDK error rather than:

- silently producing incorrect state;
- causing unsafe type assumptions;
- being interpreted as valid authorization data.

---

# Error Handling

Public errors should reveal enough information for consumers to handle failures without exposing secrets or unnecessary internal state.

Prefer:

- stable error codes;
- safe error messages;
- structured metadata;
- preserved internal causes where appropriate.

Avoid exposing:

- authorization headers;
- complete request objects;
- secret configuration;
- raw sensitive payloads;
- private cryptographic material.

---

# Logging and Diagnostics

SDK diagnostics must assume that logs can leave the application boundary.

Do not emit sensitive values by default.

Where structured metadata is supported, sanitize it before exposing it to:

- loggers;
- event listeners;
- telemetry systems;
- debugging hooks.

Nested data should be considered, not only top-level keys.

---

# Cryptographic Operations

Cryptographic code should use standard, reviewed primitives.

Do not invent custom cryptographic algorithms.

Security-sensitive code should define:

- exact byte encoding;
- canonical message format;
- hashing algorithm;
- signature format;
- domain separation where applicable;
- replay behaviour;
- timestamp handling where applicable.

Equivalent logical inputs should not produce ambiguous byte representations.

---

# Signature Verification

Where the SDK verifies signatures:

- verify against the exact expected bytes;
- validate encoding before cryptographic operations;
- reject malformed signatures;
- distinguish signature mismatch from parser failure where appropriate;
- avoid accepting alternate representations unintentionally.

A syntactically valid account identifier is not proof that the caller controls the corresponding account.

---

# Replay Protection

Signed payloads may require replay protection depending on their use.

Possible controls include:

- nonces;
- expiration timestamps;
- network binding;
- domain binding;
- unique request identifiers.

Do not assume that signature validity alone prevents replay.

---

# API Keys

If API-key functionality is implemented, API keys should be:

- treated as secrets;
- scoped where possible;
- removable from logs;
- rotatable;
- revocable.

The SDK should avoid unnecessarily copying API keys into broadly accessible objects.

---

# Request Headers

Header composition should guard against:

- accidental credential overwrite;
- newline injection;
- unsafe forwarding;
- duplicate protected headers;
- leaking secrets through diagnostics.

Authentication headers should be handled separately from arbitrary user metadata where practical.

---

# URL Handling

Avoid constructing URLs through unchecked string concatenation.

Prefer standard URL primitives.

Validate configuration such as:

```text
baseUrl
```

before using it for network requests.

Security-sensitive code should consider whether credentials could accidentally be sent to an unexpected host.

---

# Prototype Pollution and Object Injection

Code that merges external objects into configuration, headers, metadata, or request state should avoid unsafe generic assignment patterns.

Treat special keys such as:

```text
__proto__
constructor
prototype
```

carefully when processing untrusted data.

Prefer creating narrow validated objects instead of copying arbitrary input wholesale.

---

# Cancellation and Timeouts

Cancellation and timeout behaviour can affect security and resource exhaustion.

Operations should avoid leaving uncontrolled work running after a caller reasonably expects cancellation.

Where an operation cannot be forcibly interrupted, document that limitation.

Timeouts should be bounded and validated.

---

# Resource Exhaustion

Security-sensitive parsers and utilities should consider:

- oversized payloads;
- deeply nested data;
- unbounded loops;
- unbounded concurrency;
- attacker-controlled lengths;
- excessive retry behaviour.

Where practical, enforce reasonable bounds before expensive processing begins.

---

# Caching

Cached data should not silently cross security boundaries.

Cache keys should include all values necessary to distinguish security-relevant contexts.

Do not reuse cached authorization or identity data across:

- different users;
- different communities;
- different networks;
- different credentials;

unless the cache contract explicitly makes that safe.

---

# Request Deduplication

Concurrent request deduplication must not cause one caller's sensitive context to be reused for another incompatible request.

A request fingerprint should include all security-relevant request attributes.

Do not deduplicate solely by URL when headers, body, network, or authentication context can change the meaning of the request.

---

# Webhook Verification

Webhook verification code should authenticate the original raw request bytes.

Do not:

```text
parse JSON
serialize it again
then verify the signature
```

unless the provider's signing protocol explicitly specifies such canonicalisation.

Timestamp validation only limits replay duration. It does not automatically guarantee single-use delivery.

---

# Browser Security

Consumers may use the SDK in browser environments.

Never assume that values embedded in frontend JavaScript are secret.

Long-lived privileged credentials should not be shipped inside browser bundles.

The SDK should not encourage consumers to expose server-side secrets through frontend configuration.

---

# Dependency Security

Runtime dependencies should remain minimal.

New dependencies should be evaluated for:

- maintenance status;
- published security vulnerabilities;
- transitive dependency size;
- runtime privileges;
- browser compatibility;
- necessity.

Avoid introducing a large dependency for functionality that can be implemented safely using standard platform APIs.

---

# Supply Chain Security

Changes affecting:

```text
package.json
pnpm-lock.yaml
.github/workflows/
release configuration
package publishing
```

have elevated security significance.

Review unexpected dependency or workflow changes carefully.

Never commit registry tokens or publishing credentials.

---

# GitHub Actions

Workflow changes may alter repository permissions or execute attacker-controlled code.

Changes under:

```text
.github/workflows/
```

should receive additional review.

PR automation should never bypass required security checks simply because a pull request is otherwise mergeable.

---

# Generated Build Output

Files under:

```text
dist/
```

are generated artifacts.

Security fixes should be made in source code, not only in generated output.

Generated output should correspond to reviewed source before release.

---

# Out-of-Scope Reports

The following normally belong elsewhere:

- vulnerabilities in `guildpass-core`;
- vulnerabilities entirely within Stellar infrastructure;
- vulnerabilities entirely inside a third-party runtime;
- local environment compromise unrelated to the SDK;
- stale generated `dist/` output when the source itself is already fixed.

If the SDK contributes to or amplifies the vulnerability, the report may still be relevant.

---

# Testing Security-Sensitive Changes

Security-related changes should include tests for failure cases.

Depending on the module, consider:

```text
malformed input
invalid signatures
incorrect network
expired values
replayed values
oversized payloads
unexpected object keys
secret redaction
incorrect response types
concurrent callers
timeout boundaries
```

A security fix should preferably include a regression test that would fail without the fix.

---

# Disclosure

Please allow maintainers reasonable time to investigate and remediate confirmed vulnerabilities before public disclosure.

Where appropriate, reporters may be credited in release notes unless anonymity is requested.

---

# Legacy V1 Security Notes

Security documentation from SDK V1 may reference:

- EVM JSON-RPC;
- `eth_call`;
- ERC-165;
- `aggregate3`;
- Solidity ABI decoding;
- EIP-712;
- SIWE;
- ethers;
- viem.

Those mechanisms are not part of the default GuildPass SDK V2 architecture.

Do not treat previous V1 hardening notes as descriptions of the current V2 attack surface.

Historical fixes remain relevant to repository history, but should not be presented as active V2 implementation guarantees.

---

Thank you for helping keep GuildPass SDK secure.
