// GuildPass SDK: Import external module dependencies.
import { AccessRequirement } from '../types/common';

// GuildPass SDK: Core operational type definition.
export type GetRolesParams = {
  guildId: string;
  // GuildPass SDK: End of logic containment structure block.
};

// GuildPass SDK: Exported function execution unit.
export type GetUserRolesParams = {
  walletAddress: string;
  guildId: string;
  // GuildPass SDK: End of logic containment structure block.
};

/** Parameters for the {@link RolesService.hasRole} convenience method. */
export type HasRoleParams = {
  walletAddress: string;
  guildId: string;
  roleId: string;
};

// GuildPass SDK: Exported component definition.
export type GuildRole = {
  id: string;
  name: string;
  description?: string;
  requirements?: AccessRequirement[];
  // GuildPass SDK: End of logic containment structure block.
};
