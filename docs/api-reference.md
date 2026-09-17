# GuildPass SDK V2 API Reference

Comprehensive reference documentation for the GuildPass TypeScript SDK V2.

---

## Table of Contents
- [Installation](#installation)
- [Client Initialization](#client-initialization)
  - [Configuration Options](#configuration-options)
- [Stellar Helpers](#stellar-helpers)
  - [Account Validation & Parsing](#account-validation--parsing)
- [Access Resource](#access-resource)
  - [client.access.check](#clientaccesscheck)
  - [Access Decision Types](#access-decision-types)
- [Pagination Helpers](#pagination-helpers)
  - [paginate](#paginate)
  - [collectAll](#collectall)
  - [createPaginatedApi](#createpaginatedapi)
- [Error Handling](#error-handling)
  - [Error Hierarchy](#error-hierarchy)
  - [Error Handling Pattern](#error-handling-pattern)
- [Diagnostics & Telemetry](#diagnostics--telemetry)
- [Security & Redaction](#security--redaction)

---

## Installation

```bash
pnpm add @guildpass/sdk
# or npm
npm install @guildpass/sdk
# or yarn
yarn add @guildpass/sdk
```

---

## Client Initialization

The primary entry point is `GuildPassClient`.

```ts
import { GuildPassClient } from "@guildpass/sdk";

// Initialize with a base URL
const client = new GuildPassClient({
  baseUrl: "https://api.testnet.guildpass.io",
  timeoutMs: 10_000,
  headers: {
    "x-api-key": "your-api-key-here",
  },
});
```

### Configuration Options

| Option | Type | Default | Description |
|---|---|---|---|
| `baseUrl` | `string` | **Required** | The GuildPass Core API URL (must be `http:` or `https:`, no credentials). |
| `timeoutMs` | `number` | `10000` | Request timeout in milliseconds (between `100` and `60000`). |
| `headers` | `Record<string, string>` | `{}` | Custom HTTP headers sent with every request (keys normalized to lowercase). |

---

## Stellar Helpers

GuildPass SDK V2 provides lightweight, zero-dependency Stellar StrKey validation utilities.

### Account Validation & Parsing

```ts
import {
  parseStellarAccountId,
  isStellarAccountId,
  safeParseStellarAccountId,
} from "@guildpass/sdk";

const account = "GAAZI4TCR3TY5OJHCTJC2A4QSY6CJWJH5IAJTGKIN2ER7LBNVKOCCWN7";

// 1. Boolean check
if (isStellarAccountId(account)) {
  console.log("Valid Stellar account format");
}

// 2. Strongly typed parser (throws Error on invalid StrKey/checksum)
const parsed = parseStellarAccountId(account);

// 3. Safe parser without throwing
const result = safeParseStellarAccountId(account);
if (result.success) {
  console.log("Parsed account:", result.data);
} else {
  console.error("Validation failed:", result.error.message);
}
```

---

## Access Resource

### `client.access.check`

Evaluates whether a Stellar account is authorized to perform an action or access a resource within a guild. Policy evaluation is delegated solely to GuildPass Core.

```ts
import { GuildPassClient, type AccessDecision } from "@guildpass/sdk";

const client = new GuildPassClient({
  baseUrl: "https://api.testnet.guildpass.io",
});

const decision: AccessDecision = await client.access.check({
  guildId: "guild-alpha",
  account: "GAAZI4TCR3TY5OJHCTJC2A4QSY6CJWJH5IAJTGKIN2ER7LBNVKOCCWN7",
  resource: "premium-content",
  action: "read",
  context: {
    ipCountry: "US",
  },
});

if (decision.allowed) {
  console.log("Access granted!");
} else {
  console.log("Access denied:", decision.reason);
}
```

> **Note**: An HTTP 403 Forbidden response from GuildPass Core is treated as an intentional access denial and returns an `AccessDecision` with `allowed: false` rather than throwing an exception.

### Access Decision Types

```ts
export interface AccessCheckRequest {
  guildId: string;
  account: string;
  resource?: string;
  action?: string;
  context?: Record<string, unknown>;
}

export interface AccessDecision {
  allowed: boolean;
  reason?: string;
  guildId: string;
  account: string;
  resource?: string;
  action?: string;
  metadata?: Record<string, unknown>;
}
```

---

## Pagination Helpers

GuildPass provides standard cursor-based pagination utilities.

### `paginate`

Asynchronously iterates over items across multiple pages:

```ts
import { paginate, type Page, type PageRequest } from "@guildpass/sdk";

interface Member {
  id: string;
  account: string;
}

async function fetchMembersPage(req: PageRequest): Promise<Page<Member>> {
  // Fetch a page from your API
  return {
    items: [{ id: "1", account: "GAAZI4TCR3TY5OJHCTJC2A4QSY6CJWJH5IAJTGKIN2ER7LBNVKOCCWN7" }],
    nextCursor: null,
  };
}

// Iterate over each item asynchronously
for await (const member of paginate(fetchMembersPage, { maxPages: 5 })) {
  console.log("Member:", member.account);
}
```

### `collectAll`

Fetches all items across pages into a single array:

```ts
import { collectAll } from "@guildpass/sdk";

const allMembers = await collectAll(fetchMembersPage, { maxPages: 10 });
console.log("Total fetched:", allMembers.length);
```

---

## Error Handling

### Error Hierarchy

All SDK errors inherit from `GuildPassError` and expose a machine-readable `GuildPassErrorCode`.

```text
Error
  └── GuildPassError
        ├── ConfigurationError (CONFIGURATION_ERROR)
        ├── ValidationFailedError (VALIDATION_ERROR)
        ├── TransportError (TRANSPORT_ERROR)
        │     └── NetworkError
        ├── HttpError (HTTP_ERROR)
        ├── TimeoutError (TIMEOUT)
        ├── CancellationError (ABORTED)
        └── MalformedResponseError (RESPONSE_ERROR)
```

### Error Handling Pattern

```ts
import {
  GuildPassClient,
  isGuildPassError,
  HttpError,
  NetworkError,
  TimeoutError,
  ConfigError,
} from "@guildpass/sdk";

try {
  const client = new GuildPassClient({
    baseUrl: "https://api.testnet.guildpass.io",
  });
  const decision = await client.access.check({
    guildId: "guild-xyz",
    account: "GAAZI4TCR3TY5OJHCTJC2A4QSY6CJWJH5IAJTGKIN2ER7LBNVKOCCWN7",
  });
} catch (error: unknown) {
  if (error instanceof HttpError) {
    console.error(`API Error HTTP ${error.status}: ${error.message}`);
  } else if (error instanceof TimeoutError) {
    console.error("Request timed out:", error.message);
  } else if (error instanceof NetworkError) {
    console.error("Network connection failed:", error.message);
  } else if (error instanceof ConfigError) {
    console.error("Invalid SDK configuration:", error.message);
  } else if (isGuildPassError(error)) {
    console.error(`GuildPass Error [${error.code}]: ${error.message}`);
  } else {
    console.error("Unexpected error:", error);
  }
}
```

---

## Security & Redaction

GuildPass SDK provides built-in utilities to sanitize secrets and generate diagnostic fingerprints:

```ts
import { redactSecret, fingerprintSecret, REDACTED_DISPLAY_VALUE } from "@guildpass/sdk";

const result = redactSecret("my-super-secret-api-key", { namespace: "api-key" });
console.log(result.display);     // "[REDACTED]"
console.log(result.fingerprint); // 16-character deterministic hex fingerprint
console.log(result.namespace);   // "api-key"
```
