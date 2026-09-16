import type { ValidatedConfig } from "../config/index.js";
import { parseConfig, type GuildPassClientOptions } from "../config/index.js";
import { HttpTransport } from "../transport/HttpTransport.js";
import { AccessResource } from "../resources/access.js";

export type { GuildPassClientOptions } from "../config/index.js";

export class GuildPassClient {
  private readonly config: ValidatedConfig;
  private readonly transport: HttpTransport;
  public readonly access: AccessResource;

  constructor(options: GuildPassClientOptions) {
    this.config = parseConfig(options);
    this.transport = new HttpTransport({
      baseUrl: this.config.baseUrl,
      defaultTimeoutMs: this.config.timeoutMs,
    });
    this.access = new AccessResource(this.transport, this.config.headers);
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

  /**
   * Get the internal transport instance.
   * This is exposed for internal SDK or testing use only.
   */
  get _internalTransport(): HttpTransport {
    return this.transport;
  }
}
