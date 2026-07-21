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
