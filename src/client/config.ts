import { composeHeaders } from "../headers/compose.js";
import { InvalidConfigurationError } from "./configErrors.js";

export interface GuildPassClientOptions {
  /**
   * The base URL for the GuildPass API.
   * Must use https: protocol (or http: for local development).
   * @default "https://api.guildpass.com"
   */
  baseUrl?: string | URL;

  /**
   * Request timeout in milliseconds.
   * Must be a finite positive integer.
   * Maximum allowed value is 300000 (5 minutes).
   * @default 30000
   */
  timeout?: number;

  /**
   * Optional custom headers to include with every request.
   */
  headers?: Record<string, string> | Headers;
}

export interface GuildPassConfig {
  readonly baseUrl: URL;
  readonly timeout: number;
  readonly headers: Readonly<Record<string, string>>;
}

const DEFAULT_BASE_URL = "https://api.guildpass.com";
const DEFAULT_TIMEOUT = 30000;
const MAX_TIMEOUT = 300000;
const ALLOWED_PROTOCOLS = new Set(["https:", "http:"]);

export function parseConfiguration(
  options: GuildPassClientOptions = {}
): GuildPassConfig {
  // 1. Validate Base URL
  let parsedUrl: URL;
  try {
    parsedUrl = new URL(options.baseUrl ?? DEFAULT_BASE_URL);
  } catch (err) {
    throw new InvalidConfigurationError(
      "baseUrl",
      "Must be a valid URL string or URL object."
    );
  }

  if (!ALLOWED_PROTOCOLS.has(parsedUrl.protocol)) {
    throw new InvalidConfigurationError(
      "baseUrl",
      `Protocol '${parsedUrl.protocol}' is not allowed. Supported protocols are: https:, http:`
    );
  }

  if (parsedUrl.username || parsedUrl.password) {
    throw new InvalidConfigurationError(
      "baseUrl",
      "Embedded credentials are not allowed."
    );
  }

  // Remove URL fragments
  parsedUrl.hash = "";

  // Normalize trailing slash consistently
  // If it's just the root "/", URL keeps it.
  // We'll strip trailing slashes to avoid issues with path appending, 
  // unless it's strictly "/".
  let normalizedPath = parsedUrl.pathname;
  if (normalizedPath !== "/" && normalizedPath.endsWith("/")) {
    normalizedPath = normalizedPath.replace(/\/+$/, "");
    parsedUrl.pathname = normalizedPath;
  }

  // 2. Validate Timeout
  const timeout = options.timeout ?? DEFAULT_TIMEOUT;
  if (!Number.isFinite(timeout) || timeout <= 0 || !Number.isInteger(timeout)) {
    throw new InvalidConfigurationError(
      "timeout",
      "Must be a finite positive integer."
    );
  }
  if (timeout > MAX_TIMEOUT) {
    throw new InvalidConfigurationError(
      "timeout",
      `Cannot exceed maximum timeout of ${MAX_TIMEOUT}ms.`
    );
  }

  // 3. Headers
  let finalHeaders: Record<string, string>;
  if (options.headers) {
    // composeHeaders handles defensively copying, validating names/values, normalizing keys.
    finalHeaders = composeHeaders([options.headers], {
      // By default composeHeaders applies its DEFAULT_PROTECTED_HEADERS which is probably good.
      // We'll let it use the defaults.
    });
  } else {
    finalHeaders = {};
  }

  return Object.freeze({
    // We clone URL to prevent mutation of the internal config object
    baseUrl: new URL(parsedUrl.href),
    timeout,
    headers: Object.freeze({ ...finalHeaders }),
  });
}
