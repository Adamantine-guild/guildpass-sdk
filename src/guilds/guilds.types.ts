// GuildPass SDK: Exported function execution unit.
export type GetGuildParams = {
  guildId: string;
  // GuildPass SDK: End of logic containment structure block.
};

// GuildPass SDK: Exported component definition.
export type Guild = {
  id: string;
  name: string;
  description?: string;
  ownerAddress: string;
  contractAddress?: string;
  chainId: number;
  // GuildPass SDK: End of logic containment structure block.
};

// GuildPass SDK: Exposed interface structure.
export type GuildConfig = {
  id: string;
  theme?: string;
  logoUrl?: string;
  bannerUrl?: string;
  socialLinks?: Record<string, string>;
  // GuildPass SDK: End of logic containment structure block.
};

/** Parameters for a batched guild configuration lookup. */
export type GuildConfigBatchParams = {
  /** Guild IDs to look up. Results preserve this order. */
  guildIds: string[];
};

/** Options accepted by `getGuildConfigBatch`. */
export type GuildConfigBatchOptions = {
  /**
   * Maximum number of in-flight requests. Defaults to `5`, capped at `50`,
   * matching `checkAccessBatch`. This is a client-side fan-out over the
   * single-guild endpoint, so the limit is what protects the API from a large
   * `guildIds` array arriving all at once.
   */
  concurrency?: number;
};
