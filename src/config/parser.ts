import type { GuildPassClientOptions, ValidatedConfig } from "./types.js";
import {
  ConfigError,
  ConfigErrorCode,
  DEFAULT_TIMEOUT_MS,
  MAX_TIMEOUT_MS,
  MIN_TIMEOUT_MS,
  ALLOWED_PROTOCOLS,
} from "./types.js";

/**
 * Validates and normalizes client configuration.
 * Performs runtime validation and creates an immutable configuration object.
 *
 * @param options - User-provided client options
 * @returns Validated and normalized configuration
 * @throws {ConfigError} If configuration is invalid
 */
export function parseConfig(options: GuildPassClientOptions): ValidatedConfig {
  const baseUrl = validateAndNormalizeBaseUrl(options.baseUrl);
  const timeoutMs = validateTimeout(options.timeoutMs);
  const headers = validateAndNormalizeHeaders(options.headers);

  return {
    baseUrl,
    timeoutMs,
    headers,
  };
}

/**
 * Validates and normalizes the base URL.
 */
function validateAndNormalizeBaseUrl(baseUrl: string): string {
  try {
    const url = new URL(baseUrl);

    // Check protocol
    if (!ALLOWED_PROTOCOLS.has(url.protocol)) {
      throw new ConfigError(
        ConfigErrorCode.UNSUPPORTED_PROTOCOL,
        `Unsupported protocol "${url.protocol}". Only ${Array.from(ALLOWED_PROTOCOLS).join(", ")} are allowed.`,
        "baseUrl"
      );
    }

    // Check for embedded credentials
    if (url.username || url.password) {
      throw new ConfigError(
        ConfigErrorCode.URL_HAS_CREDENTIALS,
        "URL must not contain embedded credentials (username/password).",
        "baseUrl"
      );
    }

    // Remove fragment and normalize
    url.hash = "";
    
    // Remove trailing slashes for consistency
    let normalized = url.toString();
    while (normalized.endsWith("/")) {
      normalized = normalized.slice(0, -1);
    }

    return normalized;
  } catch (error) {
    if (error instanceof ConfigError) {
      throw error;
    }
    throw new ConfigError(
      ConfigErrorCode.INVALID_URL,
      `Invalid URL: ${baseUrl}`,
      "baseUrl"
    );
  }
}

/**
 * Validates the timeout value.
 */
function validateTimeout(timeoutMs?: number): number {
  if (timeoutMs === undefined) {
    return DEFAULT_TIMEOUT_MS;
  }

  if (typeof timeoutMs !== "number" || !Number.isFinite(timeoutMs)) {
    throw new ConfigError(
      ConfigErrorCode.INVALID_TIMEOUT,
      `Timeout must be a finite number, got: ${typeof timeoutMs}`,
      "timeoutMs"
    );
  }

  if (timeoutMs <= 0) {
    throw new ConfigError(
      ConfigErrorCode.INVALID_TIMEOUT,
      `Timeout must be positive, got: ${timeoutMs}`,
      "timeoutMs"
    );
  }

  if (timeoutMs < MIN_TIMEOUT_MS) {
    throw new ConfigError(
      ConfigErrorCode.INVALID_TIMEOUT,
      `Timeout must be at least ${MIN_TIMEOUT_MS}ms, got: ${timeoutMs}ms`,
      "timeoutMs"
    );
  }

  if (timeoutMs > MAX_TIMEOUT_MS) {
    throw new ConfigError(
      ConfigErrorCode.INVALID_TIMEOUT,
      `Timeout must not exceed ${MAX_TIMEOUT_MS}ms, got: ${timeoutMs}ms`,
      "timeoutMs"
    );
  }

  return timeoutMs;
}

/**
 * Validates and normalizes headers.
 */
function validateAndNormalizeHeaders(
  headers?: Record<string, string>
): Readonly<Record<string, string>> {
  if (!headers) {
    return {};
  }

  const normalized: Record<string, string> = {};

  for (const [name, value] of Object.entries(headers)) {
    const normalizedName = normalizeHeaderName(name);
    const normalizedValue = validateHeaderValue(value);

    // Check for dangerous header names
    if (!isValidHeaderName(normalizedName)) {
      throw new ConfigError(
        ConfigErrorCode.INVALID_HEADER_NAME,
        `Invalid header name: "${name}"`,
        "headers"
      );
    }

    normalized[normalizedName] = normalizedValue;
  }

  // Return as frozen object to prevent mutation
  return Object.freeze(normalized);
}

/**
 * Normalizes header name to lowercase.
 */
function normalizeHeaderName(name: string): string {
  return name.toLowerCase();
}

/**
 * Validates header value for dangerous characters.
 */
function validateHeaderValue(value: string): string {
  // Check for embedded newlines or carriage returns
  if (/[\n\r]/.test(value)) {
    throw new ConfigError(
      ConfigErrorCode.INVALID_HEADER_VALUE,
      `Header value contains invalid characters (newline/carriage return): "${value}"`,
      "headers"
    );
  }

  // Check for null bytes
  if (value.includes("\0")) {
    throw new ConfigError(
      ConfigErrorCode.INVALID_HEADER_VALUE,
      `Header value contains null byte`,
      "headers"
    );
  }

  return value;
}

/**
 * Validates header name according to HTTP spec.
 */
function isValidHeaderName(name: string): boolean {
  // Header names should be alphanumeric with hyphens
  return /^[\w-]+$/.test(name) && name.length > 0;
}
