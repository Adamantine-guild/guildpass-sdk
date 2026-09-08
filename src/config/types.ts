/**
 * Public configuration options provided by SDK consumers.
 * These are user-provided values that need runtime validation.
 */
export interface GuildPassClientOptions {
  /** Base URL for the GuildPass API */
  baseUrl: string;
  /** Request timeout in milliseconds. @default 30000 */
  timeoutMs?: number;
  /** Additional headers to include in all requests */
  headers?: Record<string, string>;
}

/**
 * Internal validated and normalized configuration.
 * This object is immutable and safe for internal SDK use.
 */
export interface ValidatedConfig {
  /** Normalized base URL without trailing slash */
  readonly baseUrl: string;
  /** Validated timeout in milliseconds */
  readonly timeoutMs: number;
  /** Normalized headers with defensive copying */
  readonly headers: Readonly<Record<string, string>>;
}

/**
 * Configuration validation error codes.
 */
export enum ConfigErrorCode {
  /** Invalid URL format */
  INVALID_URL = "INVALID_URL",
  /** Unsupported protocol (only https and optionally http allowed) */
  UNSUPPORTED_PROTOCOL = "UNSUPPORTED_PROTOCOL",
  /** URL contains embedded credentials */
  URL_HAS_CREDENTIALS = "URL_HAS_CREDENTIALS",
  /** Invalid timeout value */
  INVALID_TIMEOUT = "INVALID_TIMEOUT",
  /** Invalid header name */
  INVALID_HEADER_NAME = "INVALID_HEADER_NAME",
  /** Invalid header value */
  INVALID_HEADER_VALUE = "INVALID_HEADER_VALUE",
}

/**
 * Configuration-specific validation error.
 */
export class ConfigError extends Error {
  public readonly code: ConfigErrorCode;
  public readonly field?: string;

  constructor(code: ConfigErrorCode, message: string, field?: string) {
    super(message);
    this.name = "ConfigError";
    this.code = code;
    this.field = field;
    Object.setPrototypeOf(this, ConfigError.prototype);
  }
}

/** Default timeout in milliseconds */
export const DEFAULT_TIMEOUT_MS = 30000;

/** Maximum allowed timeout in milliseconds (5 minutes) */
export const MAX_TIMEOUT_MS = 300000;

/** Minimum allowed timeout in milliseconds (100ms) */
export const MIN_TIMEOUT_MS = 100;

/** Allowed URL protocols */
export const ALLOWED_PROTOCOLS = new Set(["https:", "http:"]);
