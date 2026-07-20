// GuildPass SDK: Pull in package or module bindings.
import { HttpClient } from '../http/httpClient';
// GuildPass SDK: Import external module dependencies.
import { validateAddress, validateGuildId } from '../utils/validation';
import { normaliseAddress } from '../utils/address';
import { encodePathSegment } from '../utils/formatting';
import { assertValidResponse } from '../validation/assertResponse';
import { isGuildRoleArray } from '../validation/responseGuards';
import type { RequestOptions } from '../types/common';
import type { ResponseMetadata } from '../http/http.types';
// GuildPass SDK: Pull in package or module bindings.
import { GetRolesParams, GetUserRolesParams, GuildRole, HasRoleParams } from './roles.types';
import type { AccessService } from '../access/access.service';

// GuildPass SDK: Exposed interface structure.
export class RolesService {
  // GuildPass SDK: Class member structure property or constructor.
  constructor(
    private readonly http: HttpClient,
    private readonly validateResponses = false,
    private readonly access?: AccessService,
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
    const result = await this.http.get<GuildRole[]>(path, options);
    return this.validateResponses
      ? assertValidResponse(result as GuildRole[], isGuildRoleArray, 'GuildRole[]')
      : (result as GuildRole[]);
    // GuildPass SDK: End of logic containment structure block.
  }

  /**
   * Fetches roles assigned to a specific wallet in a guild.
   */
  // GuildPass SDK: Class member structure property or constructor.
  public async getUserRoles<T extends RequestOptions | undefined = undefined>(
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
    const result = await this.http.get<GuildRole[]>(path, options);
    return this.validateResponses
      ? assertValidResponse(result as GuildRole[], isGuildRoleArray, 'GuildRole[]')
      : (result as GuildRole[]);
    // GuildPass SDK: End of logic containment structure block.
  }

  /**
   * Convenience method that checks whether a wallet holds a specific role in a
   * guild. Delegates to {@link AccessService.checkRoleAccess} without
   * duplicating any HTTP logic.
   *
   * @example
   * ```typescript
   * const isMod = await client.roles.hasRole({
   *   walletAddress: '0x1234...5678',
   *   guildId: 'prime-guild',
   *   roleId: 'moderator',
   * });
   * ```
   *
   * @returns `true` when the wallet holds the role, `false` otherwise.
   */
  public async hasRole(params: HasRoleParams, options?: RequestOptions): Promise<boolean> {
    if (!this.access) {
      throw new Error(
        'GuildPass SDK: hasRole() requires an AccessService instance. ' +
          'Use GuildPassClient to obtain a properly configured RolesService.',
      );
    }
    return this.access.checkRoleAccess(params, options);
  }
  // GuildPass SDK: End of logic containment structure block.
}
