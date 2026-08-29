import { GuildPassClientOptions, GuildPassConfig, parseConfiguration } from "./config.js";

export class GuildPassClient {
  public readonly config: GuildPassConfig;

  constructor(options?: GuildPassClientOptions) {
    this.config = parseConfiguration(options);
  }
}
