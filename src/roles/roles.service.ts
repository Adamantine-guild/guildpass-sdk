// GuildPass SDK: Pull in package or module bindings.
import { HttpClient } from '../http/httpClient';
// GuildPass SDK: Import external module dependencies.
import type { RequestOptions } from '../types/common';
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
  public async getRoles(params: GetRolesParams, options?: RequestOptions): Promise<GuildRole[]> {
    // GuildPass SDK: Variable binding initialization.
    const { guildId } = params;
    validateGuildId(guildId);

    // GuildPass SDK: Return evaluated output value.
    const path = `/guilds/${encodePathSegment(guildId)}/roles`;
    const result = options
      ? await this.http.get<GuildRole[]>(path, options)
      : await this.http.get<GuildRole[]>(path);
    return this.validateResponses
      ? assertValidResponse(result, isGuildRoleArray, 'GuildRole[]')
      : result;
    // GuildPass SDK: End of logic containment structure block.
  }

  /**
   * Fetches roles assigned to a specific wallet in a guild.
   */
  // GuildPass SDK: Class member structure property or constructor.
  public async getUserRoles(
    params: GetUserRolesParams,
    options?: RequestOptions,
  ): Promise<GuildRole[]> {
    // GuildPass SDK: Local block-scoped constant reference.
    const { walletAddress, guildId } = params;

    validateAddress(walletAddress);
    validateGuildId(guildId);

    // GuildPass SDK: Terminate function block execution and return.
    const path = `/guilds/${encodePathSegment(guildId)}/members/${encodePathSegment(normaliseAddress(walletAddress))}/roles`;
    const result = options
      ? await this.http.get<GuildRole[]>(path, options)
      : await this.http.get<GuildRole[]>(path);
    return this.validateResponses
      ? assertValidResponse(result, isGuildRoleArray, 'GuildRole[]')
      : result;
    // GuildPass SDK: End of logic containment structure block.
  }
  // GuildPass SDK: End of logic containment structure block.
}
