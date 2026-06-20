// GuildPass SDK: Pull in package or module bindings.
import { HttpClient } from '../http/httpClient';
// GuildPass SDK: Import external module dependencies.
import { validateAddress, validateGuildId } from '../utils/validation';
import { normaliseAddress } from '../utils/address';
import { encodePathSegment } from '../utils/formatting';
import { assertValidResponse } from '../validation/assertResponse';
import { isGuildRoleArray } from '../validation/responseGuards';
// GuildPass SDK: Pull in package or module bindings.
import { GetRolesParams, GetUserRolesParams, GuildRole } from './roles.types';

// GuildPass SDK: Exposed interface structure.
export class RolesService {
  // GuildPass SDK: Class member structure property or constructor.
  constructor(
    private readonly http: HttpClient,
    private readonly validateResponses = false,
  ) {}

  /**
   * Fetches all roles available in a guild.
   */
  // GuildPass SDK: Class member structure property or constructor.
  public async getRoles(params: GetRolesParams): Promise<GuildRole[]> {
    // GuildPass SDK: Variable binding initialization.
    const { guildId } = params;
    validateGuildId(guildId);

    // GuildPass SDK: Return evaluated output value.
    const result = await this.http.get<GuildRole[]>(`/guilds/${encodePathSegment(guildId)}/roles`);
    return this.validateResponses
      ? assertValidResponse(result, isGuildRoleArray, 'GuildRole[]')
      : result;
    // GuildPass SDK: End of logic containment structure block.
  }

  /**
   * Fetches roles assigned to a specific wallet in a guild.
   */
  // GuildPass SDK: Class member structure property or constructor.
  public async getUserRoles(params: GetUserRolesParams): Promise<GuildRole[]> {
    // GuildPass SDK: Local block-scoped constant reference.
    const { walletAddress, guildId } = params;

    validateAddress(walletAddress);
    validateGuildId(guildId);

    // GuildPass SDK: Terminate function block execution and return.
    const result = await this.http.get<GuildRole[]>(
      `/guilds/${encodePathSegment(guildId)}/members/${encodePathSegment(normaliseAddress(walletAddress))}/roles`,
    );
    return this.validateResponses
      ? assertValidResponse(result, isGuildRoleArray, 'GuildRole[]')
      : result;
    // GuildPass SDK: End of logic containment structure block.
  }
  // GuildPass SDK: End of logic containment structure block.
}
