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
- **🧩 Modular Architecture**: Clean service-based design for minimal bundle size.
- **💪 Type Safe**: First-class TypeScript support with comprehensive definitions.
- **🌐 Universal**: Seamless integration with Node.js, modern browsers, and Edge runtimes.

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

| Module              | Purpose                                              |
| :------------------ | :--------------------------------------------------- |
| `client.access`     | Handle resource gating and role-based access checks. |
| `client.membership` | Query wallet membership status and join dates.       |
| `client.roles`      | Retrieve available roles and user assignments.       |
| `client.guilds`     | Fetch guild metadata, themes, and social links.      |
| `client.contracts`  | Future on-chain interaction stubs (MVP).             |

## ⚙️ Configuration

```typescript
const client = new GuildPassClient({
  apiUrl: string;           // Base API endpoint
  chainId?: number;         // Default chain (default: 1)
  apiKey?: string;          // Optional API key for restricted access
  timeoutMs?: number;       // Request timeout (default: 10000)
  rpcUrl?: string;          // Optional RPC provider for on-chain checks
  contractAddress?: string; // Optional default contract address
});
```

## 📚 Documentation

For more detailed guides and API references, check out:

- [Architecture Overview](./docs/architecture.md)
- [SDK Usage Guide](./docs/sdk-guide.md)
- [Full API Reference](./docs/api-reference.md)
- [Integration Guide](./docs/integration-guide.md)

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
```

## 🗺️ Roadmap

- [ ] **On-chain Support**: Native integration with `viem` and `ethers`.
- [ ] **Auth**: Wallet signature verification (SIWE) helpers.
- [ ] **React**: Official `@guildpass/react` hooks package.
- [ ] **Caching**: Pluggable caching layer for high-performance apps.

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
