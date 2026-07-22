<div align="center">
  <a href="./README.md">
    <img src="./logo/Guidlpass SDK Logo.png" alt="GuildPass Logo" width="120" />
  </a>
  <h1>GuildPass SDK</h1>
  <p><strong>The official TypeScript SDK for the GuildPass protocol.</strong></p>

  <p>
    <a href="https://www.npmjs.com/package/@guildpass/sdk"><img src="https://img.shields.io/npm/v/@guildpass/sdk?style=flat-square&color=6366f1" alt="npm version" /></a>
    <a href="https://github.com/Adamantine-Guild/guildpass-sdk/actions"><img src="https://img.shields.io/github/actions/workflow/status/Adamantine-Guild/guildpass-sdk/test.yml?branch=main&style=flat-square" alt="build status" /></a>
    <a href="https://opensource.org/licenses/MIT"><img src="https://img.shields.io/badge/license-MIT-blue?style=flat-square" alt="license" /></a>
    <a href="https://typescriptlang.org"><img src="https://img.shields.io/badge/typescript-%23007acc.svg?style=flat-square&logo=typescript&logoColor=white" alt="typescript" /></a>
  </p>

  <p align="center">
    <a href="#-features">Features</a> •
    <a href="#-installation">Installation</a> •
    <a href="#-quick-start">Quick Start</a> •
    <a href="#-documentation">Documentation</a> •
    <a href="#-development">Development</a> •
    <a href="#-contributing">Contributing</a>
  </p>
</div>

---

> **Part of the [Adamantine-Guild](https://github.com/Adamantine-Guild) project** — a Web3 membership and token-gated community platform for the open-source ecosystem.

## 🛡️ About GuildPass

GuildPass is a Web3 membership and access-control protocol designed for token-gated communities, guilds, dashboards, and ecosystem integrations. This SDK provides a production-grade interface for developers to build secure, gated experiences in both **Node.js** and **Browser** environments.

## ✨ Features

- **🛡️ Access Control**: Check wallet access for resources and roles with ease.
- **💎 Membership Management**: Verify active membership status and user roles.
- **🏗️ Guild Configuration**: Fetch metadata and custom configurations for any guild.
- **⚡ Pluggable Caching**: Built-in TTL cache with optional custom adapter support (Redis, etc.).
- **🧩 Modular Architecture**: Clean service-based design for minimal bundle size.
- **💪 Type Safe**: First-class TypeScript support with comprehensive definitions.
- **🌐 Universal**: Seamless integration with Node.js (18+), modern browsers (JSDOM verified), and Edge runtimes (V8/Cloudflare Workers verified). Fully tested in continuous integration across all environments.

## 📦 Installation

```bash
# Using pnpm (recommended)
pnpm add @guildpass/sdk

# Using npm
npm install @guildpass/sdk

# Using yarn
yarn add @guildpass/sdk
```

## 🚀 Quick Start

Initialize the client and check access in seconds.

```typescript
import { GuildPassClient } from '@guildpass/sdk';

// 1. Initialize the client
const client = new GuildPassClient({
  apiUrl: 'https://api.guildpass.xyz',
  chainId: 8453, // Base Mainnet
});

// 2. Perform an access check
const result = await client.access.checkAccess({
  walletAddress: '0x1234...5678',
  guildId: 'prime-guild',
  resourceId: 'premium-docs',
});

if (result.hasAccess) {
  console.log('✅ Access Granted');
} else {
  console.log(`❌ Denied: ${result.reason}`);
}
```

## 🛠️ Service Modules

The SDK is organized into focused service modules accessible via the main client:

| Module              | Purpose                                                        |
| :------------------ | :------------------------------------------------------------- |
| `client.access`     | Handle resource gating and role-based access checks.           |
| `client.membership` | Query wallet membership status and join dates.                 |
| `client.roles`      | Retrieve available roles and user assignments.                 |
| `client.guilds`     | Fetch guild metadata, themes, and social links.                |
| `client.contracts`  | Resolve chain config and read on-chain GuildPass contract data. |

## ⚙️ Configuration

```typescript
const client = new GuildPassClient({
  apiUrl: string;           // Base API endpoint
  chainId?: number;         // Default chain (default: 1)
  apiKey?: string;          // Optional API key for restricted access (server-side only — see Security)
  validateResponses?: boolean; // Validate response shapes at runtime (default: false)
  cache?: CacheAdapter;         // Optional cache adapter (see Caching section below)
  cacheTtl?: number;            // Default TTL in ms for all cached entries
  rpcUrl?: string;          // Optional RPC provider for on-chain checks
  contractAddress?: string; // Optional default contract address
  chains?: Record<number, { // Optional per-chain RPC/contract overrides
    rpcUrl?: string;
    contractAddress?: string;
  }>;
});
```

## ⚡ Caching

Passing a `cache` adapter enables transparent memoization of all read operations (access checks, membership, roles, guild metadata). The public API of every service method is **unchanged** — caching is completely invisible to callers.

Concurrent calls for the same not-yet-cached key are single-flighted: only one network request is made, and every caller — with or without a `cache` adapter configured — shares that request's resolved (or rejected) result. Once the in-flight request settles, the de-duplication entry is cleared, so a failed request never blocks subsequent legitimate retries.

### Built-in: `InMemoryCacheAdapter`

```typescript
import { GuildPassClient, InMemoryCacheAdapter } from '@guildpass/sdk';

const client = new GuildPassClient({
  apiUrl: 'https://api.guildpass.xyz',
  cache: new InMemoryCacheAdapter(),
  cacheTtl: 60_000, // entries expire after 60 s
});

// First call hits the network; subsequent calls with the same arguments return
// the cached response instantly.
const guild = await client.guilds.getGuild({ guildId: 'prime-guild' });
```

### Custom adapter (e.g. Redis)

Implement the `CacheAdapter` interface and pass it in. A minimal example:

```typescript
import { CacheAdapter } from '@guildpass/sdk';
import { createClient } from 'redis';

const redis = createClient();
await redis.connect();

const redisAdapter: CacheAdapter = {
  async get<T>(key: string): Promise<T | null> {
    const raw = await redis.get(key);
    return raw ? (JSON.parse(raw) as T) : null;
  },
  async set<T>(key: string, value: T, ttl?: number): Promise<void> {
    const opts = ttl ? { PX: ttl } : undefined;
    await redis.set(key, JSON.stringify(value), opts);
  },
  async delete(key: string): Promise<void> {
    await redis.del(key);
  },
  async clear(): Promise<void> {
    await redis.flushDb();
  },
};
```

For production adapters — including TTL semantics, prefix deletion, error isolation, serialisation expectations, and a full Redis example with `deleteByPrefix` — see the [Cache Adapters Guide](./docs/cache-adapters.md).

**Access decisions vs guild metadata:** The global `cacheTtl` applies to all cached reads, but the SDK **caps access-check entries** (`checkAccess`, `checkRoleAccess`, `hasRole`) at five minutes and recommends **≤ 60 seconds** for production gating. Guild metadata can safely use longer TTLs. Omitting `cacheTtl` while enabling `cache` triggers a constructor warning and defaults access entries to 60 seconds. See [Security — Threat Model](./docs/security/threat-model.md#33-cache--cachettl--poisoned-or-stale-access-grants).

### Cache invalidation

```typescript
// Evict all entries tied to a specific guild (e.g. after an admin change).
await client.invalidateGuildCache('prime-guild');

// Evict all wallet-scoped entries.
await client.invalidateWalletCache('0x1234...5678');

// Full wipe.
await client.clearCache();
```

### Membership token balances

Configure `rpcUrl` and `contractAddress` to query the configured membership token:

```typescript
const client = new GuildPassClient({
  apiUrl: 'https://api.guildpass.xyz',
  rpcUrl: 'https://mainnet.base.org',
  contractAddress: '0x0000000000000000000000000000000000000000',
});

const balance = await client.contracts.getMembershipTokenBalance({
  walletAddress: '0x1234567890123456789012345678901234567890',
});
```

The lookup uses an `eth_call` against `balanceOf(address)` and returns the raw
token balance as a decimal string.

## 🔒 Security

The SDK runs in **Node.js, browsers, and Edge** — each environment has different trust properties for secrets and backends.

| Concern | Safe pattern |
|---------|--------------|
| `apiKey` | Keep on your **backend** only. Browser apps should proxy GuildPass API calls through your server — never embed production keys in client bundles. |
| `rpcUrl` | Use RPC providers you trust. For high-value gates, use `client.access.checkAccessVerified()` to cross-check API and on-chain state. |
| `cache` / `cacheTtl` | Use **≤ 60 s** for access decisions; longer TTLs are fine for guild metadata. Call `invalidateGuildCache` / `invalidateWalletCache` after mutations. |

The SDK redacts `apiKey` from `getConfig()` and HTTP hook payloads, omits the key from absolute RPC requests, and emits runtime warnings for risky browser or cache configuration.

Full analysis: [Threat Model](./docs/security/threat-model.md) · [Security Policy](./SECURITY.md)

## 📚 Documentation

For more detailed guides and API references, check out:

- [Threat Model — Configuration & Trust Boundaries](./docs/security/threat-model.md)
- [Architecture Overview](./docs/architecture.md)
- [SDK Usage Guide](./docs/sdk-guide.md)
- [Full API Reference](./docs/api-reference.md)
- [Integration Guide](./docs/integration-guide.md)
- [Cache Adapters Guide](./docs/cache-adapters.md)

## 🏗️ Development

```bash
# Install dependencies
pnpm install

# Build for production (tsup)
pnpm build

# Watch mode for development
pnpm dev

# Run unit tests (watch)
pnpm test

# Run tests once (CI mode)
pnpm test:run

# Lint
pnpm lint

# Format
pnpm format

# Type checking
pnpm typecheck

# Generate TypeDoc API docs
pnpm docs

# Validate package metadata (publint — catches malformed exports, missing files, etc.)
pnpm validate

# Diff public API against the last release tag (local release prep — not CI)
pnpm check-api-diff

# Run the same quality gates used by releases
pnpm release:check
```

## 🚢 Release process

Releases are automated by the [`Release`](./.github/workflows/release.yml) GitHub Actions workflow. Maintainers can test the workflow safely with **Run workflow** by leaving `dry_run` enabled; tag pushes publish to npm only after all quality gates pass.

### Quality gates

The workflow installs dependencies with `pnpm install --frozen-lockfile` and then runs:

1. `pnpm lint`
2. `pnpm typecheck`
3. `pnpm test:run`
4. `pnpm build`
5. `pnpm test:smoke`
6. `pnpm docs`
7. `pnpm validate`
8. `pnpm pack --pack-destination ./artifacts`

### Versioning and changelog

Release tags must use the package version prefixed with `v`, for example `v0.1.0` for package version `0.1.0`. Before creating a tag, update `package.json` and add a matching `## [x.y.z]` entry to `CHANGELOG.md`; the workflow fails if the tag and package version do not match or if the changelog entry is missing.

Maintainers can run `pnpm check-api-diff` locally before tagging to compare the regenerated `api-report/` against the previous release and confirm the correct semver bump. This check is intentionally **not** wired into the release workflow.

### Publishing and provenance

Production publishing runs only for pushed `v*.*.*` tags. The workflow uses `npm publish --provenance --access public`, requires the `id-token: write` permission for npm provenance, and reads the npm automation token from the `NPM_TOKEN` repository or environment secret. Do not hard-code maintainer tokens in the repository. The workflow is assigned to the `npm` GitHub environment so maintainers can add environment protection rules before publishing.

## 🗺️ Roadmap

- [ ] **On-chain Support**: Native integration with `viem` and `ethers`.
- [ ] **Auth**: Wallet signature verification (SIWE) helpers.
- [ ] **React**: Official `@guildpass/react` hooks package.

## 🤝 Contributing

We welcome contributions from the community! See [CONTRIBUTING.md](./CONTRIBUTING.md) for the full guide.

1. Browse open issues tagged [`good first issue`](https://github.com/Adamantine-Guild/guildpass-sdk/issues?q=label%3A%22good+first+issue%22) or [`help wanted`](https://github.com/Adamantine-Guild/guildpass-sdk/issues?q=label%3A%22help+wanted%22).
2. Comment on the GitHub issue you'd like to work on.
3. Fork the repo, create a feature branch, implement your change, open a PR.

### Maintainer contact

- Contact: cerealboxx123@gmail.com

## 📄 License

Distributed under the MIT License. See [LICENSE](./LICENSE) for more information.

---

<div align="center">
  <p>Built with ❤️ by the <b>GuildPass</b> team</p>
  <a href="https://guildpass.xyz">guildpass.xyz</a>
</div>
