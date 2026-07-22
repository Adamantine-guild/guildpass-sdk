import type { GuildPassClientConfig } from './sdkConfig';

/**
 * Recommended TTL (ms) for access-decision cache entries (`checkAccess`,
 * `checkRoleAccess`, `hasRole`). Guild metadata may safely use longer values.
 */
export const RECOMMENDED_ACCESS_CACHE_TTL_MS = 60_000;

/**
 * Maximum TTL (ms) enforced for access-decision cache entries. Values above this
 * trigger a constructor warning and are silently capped for access keys only.
 */
export const MAX_ACCESS_CACHE_TTL_MS = 300_000;

const ACCESS_CACHE_TTL_WARNING =
  'GuildPass SDK: cacheTtl exceeds the recommended maximum for access decisions ' +
  `(>${MAX_ACCESS_CACHE_TTL_MS}ms). Access checks will be capped at ${MAX_ACCESS_CACHE_TTL_MS}ms; ` +
  'guild metadata may still use the configured TTL. See docs/security/threat-model.md.';

const INDEFINITE_ACCESS_CACHE_WARNING =
  'GuildPass SDK: cache is enabled without cacheTtl. Access decisions would never ' +
  `expire without an explicit TTL; they are capped at ${RECOMMENDED_ACCESS_CACHE_TTL_MS}ms. ` +
  'Set cacheTtl explicitly (e.g. 60_000 for access, 300_000+ for guild metadata). ' +
  'See docs/security/threat-model.md.';

const BROWSER_API_KEY_WARNING =
  'GuildPass SDK: apiKey is configured in a browser-like runtime. Any secret embedded ' +
  'in client-side bundles can be extracted by users. Proxy GuildPass API calls through ' +
  'your backend and keep apiKey server-side. See docs/security/threat-model.md.';

function isBrowserLikeRuntime(): boolean {
  return (
    typeof globalThis !== 'undefined' &&
    typeof (globalThis as { window?: unknown }).window !== 'undefined' &&
    (globalThis as { window: unknown }).window === globalThis
  );
}

/**
 * Resolves the TTL applied when caching access-decision results.
 * Caps overly long or absent TTLs; `0` disables effective caching.
 */
export function resolveAccessCacheTtl(cacheTtl: number | undefined): number | undefined {
  if (cacheTtl === 0) {
    return 0;
  }
  if (cacheTtl === undefined) {
    return RECOMMENDED_ACCESS_CACHE_TTL_MS;
  }
  return Math.min(cacheTtl, MAX_ACCESS_CACHE_TTL_MS);
}

/**
 * Emits one-time security warnings for risky client configuration.
 * Called from {@link GuildPassClient} during construction.
 */
export function emitSecurityConfigWarnings(config: GuildPassClientConfig): void {
  if (!config.cache) {
    return;
  }

  if (config.cacheTtl === undefined) {
    console.warn(INDEFINITE_ACCESS_CACHE_WARNING);
  } else if (config.cacheTtl > MAX_ACCESS_CACHE_TTL_MS) {
    console.warn(ACCESS_CACHE_TTL_WARNING);
  }

  if (config.apiKey && isBrowserLikeRuntime()) {
    console.warn(BROWSER_API_KEY_WARNING);
  }
}
