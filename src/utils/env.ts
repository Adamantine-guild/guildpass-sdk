/**
 * Shared environment-detection utilities.
 *
 * Centralises all runtime-environment sniffing so that individual modules do
 * not need to repeat `typeof` checks or sprinkle `require()` calls for
 * Node.js-only APIs. Every function in this module is safe to call in any
 * environment (Node.js, browser, Edge/V8-isolate) — they never import or
 * reference a platform-specific API themselves.
 *
 * @module env
 */

function hasEdgeRuntimeMarker(): boolean {
  return (
    typeof globalThis !== 'undefined' &&
    typeof (globalThis as { EdgeRuntime?: unknown }).EdgeRuntime === 'string'
  );
}

/** True when the global `process` object looks like a real Node.js process. */
export function isNodeEnvironment(): boolean {
  // Vitest's Edge runtime can expose a process-like shim from the host runner.
  // Prefer the explicit Edge marker so we do not misclassify a V8 isolate as Node.
  if (hasEdgeRuntimeMarker()) {
    return false;
  }

  return (
    typeof globalThis !== 'undefined' &&
    typeof (globalThis as Record<string, unknown>).process !== 'undefined' &&
    (globalThis as Record<string, unknown>).process !== null &&
    (((globalThis as Record<string, unknown>).process as Record<string, unknown>)
      .release as Record<string, unknown> | undefined)?.name === 'node' &&
    typeof (
      ((globalThis as Record<string, unknown>).process as Record<string, unknown>)
        .versions as Record<string, string | undefined>
    )?.node === 'string' &&
    typeof (globalThis as Record<string, unknown>).EdgeRuntime === 'undefined'
  );
}

/** True when the runtime supports the full Web Crypto API (crypto.subtle). */
export function hasWebCrypto(): boolean {
  return (
    typeof globalThis !== 'undefined' &&
    typeof globalThis.crypto !== 'undefined' &&
    typeof globalThis.crypto.getRandomValues === 'function'
  );
}

/** True when running in a Cloudflare Worker or similar V8-isolate Edge runtime. */
export function isEdgeRuntime(): boolean {
  return (
    typeof (globalThis as Record<string, unknown>).EdgeRuntime === 'string' ||
    (!isNodeEnvironment() &&
      typeof globalThis !== 'undefined' &&
      typeof (globalThis as { addEventListener?: unknown }).addEventListener === 'function' &&
      typeof navigator === 'undefined')
  );
}

/**
 * True when running in a browser environment (including JSDOM).
 * Note: some Edge runtimes (like CF Workers) also have a `navigator` in newer
 * versions, so this checks for browser-specific APIs like `window` and `document`.
 */
export function isBrowser(): boolean {
  return (
    typeof globalThis !== 'undefined' &&
    typeof (globalThis as { window?: unknown }).window !== 'undefined' &&
    typeof (globalThis as { document?: unknown }).document !== 'undefined'
  );
}
