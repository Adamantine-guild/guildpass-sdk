import type { ValidatedConfig } from "../config/index.js";
import { parseConfig, type GuildPassClientOptions } from "../config/index.js";

export type { GuildPassClientOptions } from "../config/index.js";

export class GuildPassClient {
  private readonly config: ValidatedConfig;

  constructor(options: GuildPassClientOptions) {
    this.config = parseConfig(options);
  }

  /**
   * Get the normalized base URL.
   */
  get baseUrl(): string {
    return this.config.baseUrl;
  }

  /**
   * Get the validated timeout in milliseconds.
   */
  get timeoutMs(): number {
    return this.config.timeoutMs;
  }

  /**
   * Get the normalized headers (readonly).
   */
  get headers(): Readonly<Record<string, string>> {
    return this.config.headers;
  }

  /**
   * Get the internal validated configuration.
   * This is exposed for internal SDK use only.
   */
  get _internalConfig(): ValidatedConfig {
    return this.config;
  }
}
