// GuildPass SDK: Exposed interface structure.
export type AccessCheckParams = {
  walletAddress: string;
  guildId: string;
  resourceId: string;
  // GuildPass SDK: End of logic containment structure block.
};

// GuildPass SDK: Core operational type definition.
export type RoleAccessCheckParams = {
  walletAddress: string;
  guildId: string;
  roleId: string;
  // GuildPass SDK: End of logic containment structure block.
};

// GuildPass SDK: Exported function execution unit.
export type AccessCheckResult = {
  hasAccess: boolean;
  walletAddress: string;
  guildId: string;
  resourceId: string;
  requiredRoles: string[];
  matchedRoles: string[];
  reason?: string;
  // GuildPass SDK: End of logic containment structure block.
};

export type AccessCheckBatchOptions = {
  concurrency?: number;
  failFast?: boolean;
};

export type AccessCheckBatchResult = {
  input: AccessCheckParams;
  status: 'fulfilled' | 'rejected';
  value?: AccessCheckResult;
  error?: Error;
};
