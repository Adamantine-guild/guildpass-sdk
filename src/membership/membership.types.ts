// GuildPass SDK: Exported function execution unit.
export type MembershipParams = {
  walletAddress: string;
  guildId: string;
  // GuildPass SDK: End of logic containment structure block.
};

// GuildPass SDK: Exported component definition.
export type Membership = {
  walletAddress: string;
  guildId: string;
  isActive: boolean;
  roles: string[];
  joinedAt?: string;
  expiresAt?: string;
  // GuildPass SDK: End of logic containment structure block.
};

export type GetHistoryParams = {
  walletAddress: string;
  guildId: string;
  cursor?: string;
  limit?: number;
};

export type MembershipEvent = {
  id: string;
  type: string;
  timestamp: string;
  data?: Record<string, any>;
};
