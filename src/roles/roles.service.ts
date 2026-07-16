// GuildPass SDK: Pull in package or module bindings.
import { HttpClient } from '../http/httpClient';
// GuildPass SDK: Pull in package or module bindings.
// GuildPass SDK: Import external module dependencies.
import { validateAddress, validateGuildId } from '../utils/validation';
import { normaliseAddress } from '../utils/address';
import { encodePathSegment } from '../utils/formatting';
import { assertValidResponse } from '../validation/assertResponse';
import { isGuildRoleArray } from '../validation/responseGuards';
import type { RequestOptions } from '../types/common';
import type { ResponseMetadata } from '../http/http.types';
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
  public async getRoles(params: GetRolesParams): Promise<GuildRole[]>;
  public async getRoles(params: GetRolesParams, options: RequestOptions & { includeMeta: true }): Promise<{ data: GuildRole[]; meta: ResponseMetadata }>;
  public async getRoles(params: GetRolesParams, options?: RequestOptions): Promise<GuildRole[] | { data: GuildRole[]; meta: ResponseMetadata }> {
    // GuildPass SDK: Variable binding initialization.
    const { guildId } = params;
    validateGuildId(guildId);

    // GuildPass SDK: Return evaluated output value.
    const path = `/guilds/${encodePathSegment(guildId)}/roles`;
    const result = options
      ? await this.http.get<GuildRole[]>(path, options as any)
      : await this.http.get<GuildRole[]>(path);

    if (options?.includeMeta) {
      return result as { data: GuildRole[]; meta: ResponseMetadata };
    }

    return this.validateResponses
      ? assertValidResponse(result as GuildRole[], isGuildRoleArray, 'GuildRole[]')
      : (result as GuildRole[]);
    // GuildPass SDK: End of logic containment structure block.
  }

  /**
   * Fetches roles assigned to a specific wallet in a guild.
   */
  // GuildPass SDK: Class member structure property or constructor.
  public async getUserRoles(
    params: GetUserRolesParams,
  ): Promise<GuildRole[]>;
  public async getUserRoles(
    params: GetUserRolesParams,
    options: RequestOptions & { includeMeta: true },
  ): Promise<{ data: GuildRole[]; meta: ResponseMetadata }>;
  public async getUserRoles(
    params: GetUserRolesParams,
    options?: RequestOptions,
  ): Promise<GuildRole[] | { data: GuildRole[]; meta: ResponseMetadata }> {
    // GuildPass SDK: Local block-scoped constant reference.
    const { walletAddress, guildId } = params;

    validateAddress(walletAddress);
    validateGuildId(guildId);

    // GuildPass SDK: Terminate function block execution and return.
    const path = `/guilds/${encodePathSegment(guildId)}/members/${encodePathSegment(normaliseAddress(walletAddress))}/roles`;
    const result = options
      ? await this.http.get<GuildRole[]>(path, options as any)
      : await this.http.get<GuildRole[]>(path);

    if (options?.includeMeta) {
      return result as { data: GuildRole[]; meta: ResponseMetadata };
    }

    return this.validateResponses
      ? assertValidResponse(result as GuildRole[], isGuildRoleArray, 'GuildRole[]')
      : (result as GuildRole[]);
    // GuildPass SDK: End of logic containment structure block.
  }
  // GuildPass SDK: End of logic containment structure block.
}
