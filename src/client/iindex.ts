export interface GuildPassClientOptions {
  baseUrl: string;
}

export class GuildPassClient {
  readonly baseUrl: string;

  constructor(options: GuildPassClientOptions) {
    this.baseUrl = options.baseUrl;
  }
}
