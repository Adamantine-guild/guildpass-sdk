// GuildPass SDK: Import external module dependencies.
import { AccessRequirement } from '../types/common';

/** Per-chain RPC and contract address configuration. */
export type ChainConfig = {
  rpcUrl?: string;
  contractAddress?: string;
};

// GuildPass SDK: Exposed interface structure.
export type TokenBalanceParams = {
  walletAddress: string;
  contractAddress?: string;
  // GuildPass SDK: End of logic containment structure block.
};

// GuildPass SDK: Core operational type definition.
export type RoleRequirementParams = {
  walletAddress: string;
  requirement: AccessRequirement;
  // GuildPass SDK: End of logic containment structure block.
};
