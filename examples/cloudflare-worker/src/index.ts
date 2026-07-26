/**
 * GuildPass SDK — Cloudflare Workers example
 *
 * Demonstrates:
 *  1. Module-scope client instantiation (reused across requests in the same isolate)
 *  2. A KV-backed CacheAdapter that satisfies the SDK's CacheAdapter interface
 *  3. An access-check endpoint that reads walletAddress / guildId / resourceId
 *     from query parameters and returns a JSON AccessCheckResult
 *
 * Required environment bindings (set in wrangler.toml or the Workers dashboard):
 *  - GUILDPASS_API_URL   : string  — e.g. "https://api.guildpass.xyz"
 *  - GUILDPASS_API_KEY   : string  — your GuildPass API key (keep secret)
 *  - GUILDPASS_CHAIN_ID  : string  — numeric chain ID, e.g. "8453" (Base Mainnet)
 *  - GUILDPASS_CACHE_TTL : string  — TTL in milliseconds, e.g. "30000"
 *  - GUILDPASS_KV        : KVNamespace — Workers KV binding for response caching
 */

import { GuildPassClient, CacheAdapter } from '@guildpass/sdk';

// ---------------------------------------------------------------------------
// KV-backed CacheAdapter
// ---------------------------------------------------------------------------

/**
 * A CacheAdapter backed by Cloudflare Workers KV.
 *
 * TTL is forwarded to KV's native `expirationTtl` (seconds). The SDK passes
 * values in **milliseconds**, so we convert before storing.
 *
 * Per the CacheAdapter contract, every method silently swallows errors so
 * that a KV failure never breaks a live access check.
 */
class KVCacheAdapter implements CacheAdapter {
  constructor(private readonly kv: KVNamespace) {}

  async get<T>(key: string): Promise<T | null> {
    try {
      const raw = await this.kv.get(key, 'text');
      if (raw === null) return null;
      return JSON.parse(raw) as T;
    } catch {
      return null;
    }
  }

  async set<T>(key: string, value: T, ttl?: number): Promise<void> {
    try {
      const serialised = JSON.stringify(value);
      // KV expirationTtl is in seconds (minimum 60 s per KV docs).
      // If the SDK requests a shorter TTL we still store it — KV will evict
      // it at the earliest opportunity (60 s). For production use, consider
      // skipping the KV write when ttl < 60_000 ms and relying on per-isolate
      // in-memory caching instead.
      if (ttl !== undefined && ttl > 0) {
        const ttlSeconds = Math.max(60, Math.ceil(ttl / 1000));
        await this.kv.put(key, serialised, { expirationTtl: ttlSeconds });
      } else {
        // No TTL — store indefinitely until explicitly deleted.
        await this.kv.put(key, serialised);
      }
    } catch {
      // swallowed — SDK falls back to network
    }
  }

  async delete(key: string): Promise<void> {
    try {
      await this.kv.delete(key);
    } catch {
      // swallowed
    }
  }

  async clear(): Promise<void> {
    // Workers KV does not expose a "flush namespace" API from Workers code.
    // A full clear requires the REST API or Wrangler CLI. This is a no-op
    // that the SDK handles gracefully (it will continue without eviction).
  }

  /**
   * KV does not support prefix-range deletes from within a Worker.
   * Omitting this optional method lets the SDK fall back to its own strategy
   * (deleting known exact keys, or falling back to clear()).
   */
  // deleteByPrefix is intentionally omitted — KV doesn't support it natively.
}

// ---------------------------------------------------------------------------
// Env interface — typed bindings declared in wrangler.toml
// ---------------------------------------------------------------------------

export interface Env {
  GUILDPASS_API_URL: string;
  GUILDPASS_API_KEY: string;
  GUILDPASS_CHAIN_ID: string;
  GUILDPASS_CACHE_TTL: string;
  GUILDPASS_KV: KVNamespace;
}

// ---------------------------------------------------------------------------
// Module-scope client (lazily initialised once per isolate)
// ---------------------------------------------------------------------------

/**
 * We keep the client reference at module scope so it is reused across every
 * request handled by the same isolate — avoiding the overhead of recreating
 * HTTP connections, re-validating config, and warming up caches on every
 * request. This is the recommended Workers pattern for shared resources.
 *
 * The client is initialised on the first request (lazy init) so that `env`
 * bindings are available when we need them.
 */
let _client: GuildPassClient | null = null;

function getClient(env: Env): GuildPassClient {
  if (_client) return _client;

  const cacheTtl = parseInt(env.GUILDPASS_CACHE_TTL ?? '30000', 10);

  _client = new GuildPassClient({
    apiUrl: env.GUILDPASS_API_URL,
    apiKey: env.GUILDPASS_API_KEY,
    chainId: parseInt(env.GUILDPASS_CHAIN_ID ?? '1', 10),
    // Plug in the KV-backed cache adapter for cross-isolate response caching.
    cache: new KVCacheAdapter(env.GUILDPASS_KV),
    cacheTtl: Number.isFinite(cacheTtl) && cacheTtl >= 0 ? cacheTtl : 30_000,
  });

  return _client;
}

// ---------------------------------------------------------------------------
// Fetch handler
// ---------------------------------------------------------------------------

export default {
  async fetch(request: Request, env: Env, _ctx: ExecutionContext): Promise<Response> {
    const url = new URL(request.url);

    // Route: GET /check-access?wallet=0x…&guild=…&resource=…
    if (request.method === 'GET' && url.pathname === '/check-access') {
      return handleCheckAccess(request, env, url);
    }

    // Route: GET /health — simple liveness probe
    if (request.method === 'GET' && url.pathname === '/health') {
      return jsonResponse({ status: 'ok' });
    }

    return jsonResponse({ error: 'Not Found' }, 404);
  },
};

// ---------------------------------------------------------------------------
// Route handlers
// ---------------------------------------------------------------------------

/**
 * GET /check-access
 *
 * Query parameters:
 *  - wallet    (required) — EIP-55 checksummed or lowercase wallet address
 *  - guild     (required) — guild slug / ID registered in GuildPass
 *  - resource  (required) — resource ID to gate
 *
 * Response (200):
 * ```json
 * {
 *   "hasAccess": true,
 *   "matchedRoles": ["member"],
 *   "cached": false
 * }
 * ```
 *
 * Response (400) on missing params:
 * ```json
 * { "error": "Missing required query parameters: wallet, guild, resource" }
 * ```
 */
async function handleCheckAccess(
  _request: Request,
  env: Env,
  url: URL,
): Promise<Response> {
  const walletAddress = url.searchParams.get('wallet');
  const guildId = url.searchParams.get('guild');
  const resourceId = url.searchParams.get('resource');

  // Validate required parameters
  const missing: string[] = [];
  if (!walletAddress) missing.push('wallet');
  if (!guildId) missing.push('guild');
  if (!resourceId) missing.push('resource');

  if (missing.length > 0) {
    return jsonResponse(
      { error: `Missing required query parameters: ${missing.join(', ')}` },
      400,
    );
  }

  const client = getClient(env);

  try {
    const result = await client.access.checkAccess({
      walletAddress: walletAddress!,
      guildId: guildId!,
      resourceId: resourceId!,
    });

    return jsonResponse({
      hasAccess: result.hasAccess,
      reason: result.reason ?? null,
      matchedRoles: result.matchedRoles ?? [],
      requiredRoles: result.requiredRoles ?? [],
    });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : 'Internal error';
    console.error('[GuildPass] checkAccess failed:', message);
    return jsonResponse({ error: 'Failed to perform access check', detail: message }, 502);
  }
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: {
      'Content-Type': 'application/json',
      // Prevent caching of access-check responses at the CDN layer —
      // freshness is handled by the SDK's KV cache adapter above.
      'Cache-Control': 'no-store',
    },
  });
}
