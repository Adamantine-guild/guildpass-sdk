import type {
  HeadersSource,
  HeaderCompositionOptions,
} from "./types.js";
import {
  InvalidHeaderNameError,
  InvalidHeaderValueError,
  ProtectedHeaderOverrideError,
} from "./types.js";

/**
 * Default set of protected headers that should not be overridden without explicit opt-in.
 */
const DEFAULT_PROTECTED_HEADERS = new Set([
  "authorization",
  "content-type",
  "content-length",
  "user-agent",
  "host",
  "cookie",
  "set-cookie",
]);

/**
 * Validates a header name according to HTTP specification.
 * @param name - The header name to validate
 * @throws {InvalidHeaderNameError} If the header name is invalid
 */
function validateHeaderName(name: string): void {
  if (name.length === 0) {
    throw new InvalidHeaderNameError(name, "header name cannot be empty");
  }

  // Check for invalid characters (RFC 7230)
  // Header names must be tokens: !#$%&'*+-.^_`|~ and alphanumeric
  const validNameRegex = /^[!#$%&'*+\-.^_`|~0-9A-Za-z]+$/;
  if (!validNameRegex.test(name)) {
    throw new InvalidHeaderNameError(
      name,
      "contains invalid characters"
    );
  }

  // Check for newline or carriage return (injection prevention)
  if (name.includes("\n") || name.includes("\r")) {
    throw new InvalidHeaderNameError(
      name,
      "contains newline or carriage return"
    );
  }
}

/**
 * Validates a header value according to HTTP specification.
 * @param name - The header name (for error reporting)
 * @param value - The header value to validate
 * @throws {InvalidHeaderValueError} If the header value is invalid
 */
function validateHeaderValue(name: string, value: string): void {
  // Check for newline or carriage return (injection prevention)
  if (value.includes("\n") || value.includes("\r")) {
    throw new InvalidHeaderValueError(
      name,
      "contains newline or carriage return"
    );
  }

  // Check for null bytes
  if (value.includes("\0")) {
    throw new InvalidHeaderValueError(name, "contains null byte");
  }
}

/**
 * Normalizes a header name to lowercase for case-insensitive comparison.
 * @param name - The header name to normalize
 * @returns The normalized (lowercase) header name
 */
function normalizeHeaderName(name: string): string {
  return name.toLowerCase();
}

/**
 * Converts a HeadersSource to a normalized Record<string, string>.
 * @param source - The header source to convert
 * @returns A normalized record of headers
 */
function normalizeHeadersSource(
  source: HeadersSource
): Record<string, string> {
  if (source instanceof Headers) {
    const result: Record<string, string> = {};
    source.forEach((value, name) => {
      validateHeaderName(name);
      validateHeaderValue(name, value);
      result[normalizeHeaderName(name)] = value;
    });
    return result;
  }

  // It's a plain object
  const result: Record<string, string> = {};
  for (const [name, value] of Object.entries(source)) {
    validateHeaderName(name);
    validateHeaderValue(name, value);
    result[normalizeHeaderName(name)] = value;
  }
  return result;
}

/**
 * Composes multiple header sources into a single headers object.
 * 
 * Headers are merged case-insensitively with deterministic precedence:
 * - Later sources override earlier sources (except for protected headers)
 * - Protected headers cannot be overridden unless allowOverride is true
 * - Header names are normalized to lowercase unless preserveCase is true
 * 
 * @param sources - Ordered array of header sources to merge (later sources have higher precedence)
 * @param options - Composition options
 * @returns A composed headers object
 * @throws {InvalidHeaderNameError} If any header name is invalid
 * @throws {InvalidHeaderValueError} If any header value is invalid
 * @throws {ProtectedHeaderOverrideError} If attempting to override a protected header without allowOverride
 */
export function composeHeaders(
  sources: HeadersSource[],
  options: HeaderCompositionOptions = {}
): Record<string, string> {
  const {
    protectedHeaders = DEFAULT_PROTECTED_HEADERS,
    allowOverride = false,
    preserveCase = false,
  } = options;

  // Normalize protected headers to lowercase for case-insensitive comparison
  const normalizedProtectedHeaders = new Set(
    Array.from(protectedHeaders).map(normalizeHeaderName)
  );

  // Track the original case of the first occurrence of each header
  const originalCaseMap = new Map<string, string>();

  // Compose headers with precedence (later sources override earlier ones)
  const composed: Record<string, string> = {};

  for (const source of sources) {
    const normalizedSource = normalizeHeadersSource(source);

    for (const [normalizedName, value] of Object.entries(normalizedSource)) {
      // Check if this is a protected header
      const isProtected = normalizedProtectedHeaders.has(normalizedName);

      // Check if we're trying to override an existing protected header
      if (isProtected && composed[normalizedName] !== undefined) {
        if (!allowOverride) {
          throw new ProtectedHeaderOverrideError(normalizedName);
        }
        // If allowOverride is true, we allow the override
      }

      // Store the original case if this is the first occurrence
      if (!originalCaseMap.has(normalizedName)) {
        // Try to get the original case from the source
        let originalName = normalizedName;
        if (source instanceof Headers) {
          // Headers API doesn't preserve original case, use normalized
          originalName = normalizedName;
        } else {
          // For plain objects, find the original case
          for (const [key] of Object.entries(source)) {
            if (normalizeHeaderName(key) === normalizedName) {
              originalName = key;
              break;
            }
          }
        }
        originalCaseMap.set(normalizedName, originalName);
      }

      // Set the value
      composed[normalizedName] = value;
    }
  }

  // Preserve original case if requested
  if (preserveCase) {
    const result: Record<string, string> = {};
    for (const [normalizedName, value] of Object.entries(composed)) {
      const originalName = originalCaseMap.get(normalizedName) ?? normalizedName;
      result[originalName] = value;
    }
    return result;
  }

  return composed;
}

/**
 * Creates a new Headers instance from composed headers.
 * This is a convenience wrapper around composeHeaders that returns a Headers object.
 * 
 * @param sources - Ordered array of header sources to merge
 * @param options - Composition options
 * @returns A Headers instance
 */
export function composeHeadersInstance(
  sources: HeadersSource[],
  options?: HeaderCompositionOptions
): Headers {
  const composed = composeHeaders(sources, options);
  return new Headers(composed);
}
