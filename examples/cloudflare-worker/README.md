# GuildPass SDK — Cloudflare Workers Example

A minimal Cloudflare Worker that demonstrates how to integrate the GuildPass SDK in an edge runtime.

## What this example shows

| Feature | Where |
|:--------|:------|
| Module-scope `GuildPassClient` (reused across requests) | `src/index.ts` — `getClient()` |
| KV-backed `CacheAdapter` wiring | `src/index.ts` — `KVCacheAdapter` class |
| Access-check endpoint (`GET /check-access`) | `src/index.ts` — `handleCheckAccess()` |
| Wrangler config with KV binding and env var declarations | `wrangler.toml` |

The example is intentionally minimal — no extra dependencies beyond `@guildpass/sdk` and Wrangler.

---

## Prerequisites

- [Node.js](https://nodejs.org) 18+
- [Wrangler CLI](https://developers.cloudflare.com/workers/wrangler/) v3+

```bash
# Install Wrangler globally (or use npx)
npm install -g wrangler

# Authenticate with your Cloudflare account
wrangler login
```

---

## Setup

### 1. Install dependencies

From the **repository root**:

```bash
pnpm install
```

Or from this example directory directly (requires the SDK to be built first):

```bash
# Build the SDK
pnpm --filter @guildpass/sdk build

# Install example deps
cd examples/cloudflare-worker
npm install
```

### 2. Create the KV namespace

Workers KV is used as the cache backend. Create a namespace once:

```bash
npx wrangler kv:namespace create GUILDPASS_KV
```

Copy the `id` printed to the terminal and paste it into `wrangler.toml`:

```toml
[[kv_namespaces]]
binding  = "GUILDPASS_KV"
id       = "paste-your-id-here"
```

For local development, also create a preview namespace:

```bash
npx wrangler kv:namespace create GUILDPASS_KV --preview
```

Uncomment and fill in `preview_id` in `wrangler.toml`.

### 3. Configure environment variables

Non-secret variables (`GUILDPASS_API_URL`, `GUILDPASS_CHAIN_ID`, `GUILDPASS_CACHE_TTL`) are already set in `wrangler.toml`. Adjust them for your deployment target.

The API key is a **secret** and must never be committed to source control.

**For local development**, create a `.dev.vars` file in this directory (it is gitignored):

```
GUILDPASS_API_KEY=your-dev-api-key
```

**For deployed Workers**, use the Wrangler CLI:

```bash
npx wrangler secret put GUILDPASS_API_KEY
# Enter the value when prompted
```

Or set it in the [Workers dashboard](https://dash.cloudflare.com) under **Settings → Variables → Secret variables**.

### Environment variable reference

| Variable | Type | Required | Description |
|:---------|:-----|:--------:|:------------|
| `GUILDPASS_API_URL` | `string` | ✅ | GuildPass API base URL (e.g. `https://api.guildpass.xyz`) |
| `GUILDPASS_API_KEY` | `string` (secret) | ✅ | Your GuildPass API key |
| `GUILDPASS_CHAIN_ID` | `string` | ✅ | Numeric chain ID (e.g. `8453` for Base Mainnet, `1` for Ethereum) |
| `GUILDPASS_CACHE_TTL` | `string` | ✅ | Response cache TTL in **milliseconds** (e.g. `30000` = 30 s) |
| `GUILDPASS_KV` | `KVNamespace` | ✅ | Workers KV binding — configured via `wrangler.toml`, not a plain env var |

---

## Running locally

```bash
npx wrangler dev
```

Wrangler starts a local dev server (default `http://localhost:8787`). Test the endpoint:

```bash
# Access check
curl "http://localhost:8787/check-access?wallet=0x1234567890123456789012345678901234567890&guild=prime-guild&resource=premium-docs"

# Health probe
curl "http://localhost:8787/health"
```

### Example responses

**Access granted:**
```json
{
  "hasAccess": true,
  "reason": null,
  "matchedRoles": ["member"],
  "requiredRoles": ["member"]
}
```

**Access denied:**
```json
{
  "hasAccess": false,
  "reason": "No matching role",
  "matchedRoles": [],
  "requiredRoles": ["member"]
}
```

**Missing parameters (400):**
```json
{ "error": "Missing required query parameters: guild, resource" }
```

---

## Deploying

```bash
# Deploy to the default environment
npx wrangler deploy

# Deploy to the production environment
npx wrangler deploy --env production
```

---

## How it works

### Module-scope client

```typescript
let _client: GuildPassClient | null = null;

function getClient(env: Env): GuildPassClient {
  if (_client) return _client;
  _client = new GuildPassClient({ ... });
  return _client;
}
```

Cloudflare Workers reuse the same V8 isolate — and therefore the same module
scope — across multiple requests until the isolate is evicted. Initialising
the client once at module scope avoids redundant config validation and
connection overhead on every request. This is a standard Workers best
practice for any long-lived resource.

### KV-backed CacheAdapter

```typescript
class KVCacheAdapter implements CacheAdapter {
  constructor(private readonly kv: KVNamespace) {}

  async get<T>(key: string): Promise<T | null> { /* ... */ }
  async set<T>(key: string, value: T, ttl?: number): Promise<void> { /* ... */ }
  async delete(key: string): Promise<void> { /* ... */ }
  async clear(): Promise<void> { /* no-op — KV doesn't support flush from Workers */ }
}
```

The adapter implements the [`CacheAdapter`](../../docs/cache-adapters.md) interface. All methods swallow errors silently so a KV failure never prevents a live access check — the SDK falls through to the network automatically.

**KV TTL note:** Workers KV enforces a minimum `expirationTtl` of 60 seconds. If your `GUILDPASS_CACHE_TTL` is shorter (e.g. for local dev), the adapter clamps to 60 s. For sub-minute freshness, consider pairing the KV adapter with an in-process `InMemoryCacheAdapter` in front of it.

### Cache invalidation

Use the built-in client helpers when you need to evict stale entries:

```typescript
// Evict all entries for a specific guild (e.g. after an admin config change)
await client.invalidateGuildCache('prime-guild');

// Evict all entries for a wallet
await client.invalidateWalletCache('0x1234...5678');

// Full cache wipe (no-op on KV adapter — use Wrangler CLI instead)
await client.clearCache();
```

Because Workers KV does not expose a prefix-delete API from within Workers code,
`invalidateGuildCache` and `invalidateWalletCache` fall back to deleting known
exact keys. For production use, consider adding a management endpoint that calls
the [KV REST API](https://developers.cloudflare.com/api/resources/kv/subresources/namespaces/subresources/keys/) to bulk-delete by prefix.

---

## Further reading

- [Cache Adapters Guide](../../docs/cache-adapters.md)
- [Integration Guide](../../docs/integration-guide.md)
- [SDK Usage Guide](../../docs/sdk-guide.md)
- [Cloudflare Workers KV documentation](https://developers.cloudflare.com/kv/)
- [Wrangler CLI documentation](https://developers.cloudflare.com/workers/wrangler/)
