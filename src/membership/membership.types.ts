// GuildPass SDK: Exported function execution unit.
export type MembershipParams = {
  walletAddress: string;
  guildId: string;
  // GuildPass SDK: End of logic containment structure block.
};

export type MembershipHistoryParams = MembershipParams & {
  limit?: number;
  cursor?: string;
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

export type MembershipHistoryEntry = {
  id: string;
  walletAddress: string;
  guildId: string;
  type: 'joined' | 'left' | 'role_added' | 'role_removed' | 'status_changed';
  occurredAt: string;
  roleId?: string;
  metadata?: Record<string, unknown>;
};

export type MembershipHistoryResult = {
  events: MembershipHistoryEntry[];
  nextCursor?: string;
};
