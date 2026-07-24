// GuildPass SDK: Pull in package or module bindings.
import { HttpClient } from '../http/httpClient';
import { GuildPassConfigError } from '../errors/errorTypes';
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
import { PaginatedResult } from '../utils/pagination';

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
  public async getRoles(params: GetRolesParams & ({ cursor: string } | { limit: number }), options: RequestOptions & { includeMeta: true }): Promise<{ data: PaginatedResult<GuildRole>; meta: ResponseMetadata }>;
  public async getRoles(params: GetRolesParams & ({ cursor: string } | { limit: number }), options?: RequestOptions): Promise<PaginatedResult<GuildRole>>;
  public async getRoles(params: GetRolesParams, options: RequestOptions & { includeMeta: true }): Promise<{ data: GuildRole[]; meta: ResponseMetadata }>;
  public async getRoles(params: GetRolesParams, options?: RequestOptions): Promise<GuildRole[]>;
  public async getRoles(params: GetRolesParams, options?: RequestOptions): Promise<any> {
    const { guildId, cursor, limit } = params;
    validateGuildId(guildId);

    const path = `/guilds/${encodePathSegment(guildId)}/roles`;
    
    const reqOptions: any = { ...options };
    if (cursor !== undefined || limit !== undefined) {
      reqOptions.params = { ...reqOptions.params, ...(cursor !== undefined && { cursor }), ...(limit !== undefined && { limit }) };
    }

    const result = await this.http.get<any>(path, reqOptions);
    const hasPagination = cursor !== undefined || limit !== undefined;

    return this.handlePaginatedResponse(result, options, hasPagination, isGuildRoleArray, 'GuildRole[]', `GET ${path}`);
  }

  /**
   * Fetches roles assigned to a specific wallet in a guild.
   */
  // GuildPass SDK: Class member structure property or constructor.
  public async getUserRoles(params: GetUserRolesParams & ({ cursor: string } | { limit: number }), options: RequestOptions & { includeMeta: true }): Promise<{ data: PaginatedResult<GuildRole>; meta: ResponseMetadata }>;
  public async getUserRoles(params: GetUserRolesParams & ({ cursor: string } | { limit: number }), options?: RequestOptions): Promise<PaginatedResult<GuildRole>>;
  public async getUserRoles(params: GetUserRolesParams, options: RequestOptions & { includeMeta: true }): Promise<{ data: GuildRole[]; meta: ResponseMetadata }>;
  public async getUserRoles(params: GetUserRolesParams, options?: RequestOptions): Promise<GuildRole[]>;
  public async getUserRoles(params: GetUserRolesParams, options?: RequestOptions): Promise<any> {
    const { walletAddress, guildId, cursor, limit } = params;

    validateAddress(walletAddress);
    validateGuildId(guildId);

    const path = `/guilds/${encodePathSegment(guildId)}/members/${encodePathSegment(normaliseAddress(walletAddress))}/roles`;
    
    const reqOptions: any = { ...options };
    if (cursor !== undefined || limit !== undefined) {
      reqOptions.params = { ...reqOptions.params, ...(cursor !== undefined && { cursor }), ...(limit !== undefined && { limit }) };
    }

    const result = await this.http.get<any>(path, reqOptions);
    const hasPagination = cursor !== undefined || limit !== undefined;

    return this.handlePaginatedResponse(result, options, hasPagination, isGuildRoleArray, 'GuildRole[]', `GET ${path}`);
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
      throw new GuildPassConfigError(
        'GuildPass SDK: hasRole() requires an AccessService instance. ' +
          'Use GuildPassClient to obtain a properly configured RolesService.',
      );
    }
    return this.access.checkRoleAccess(params, options as any) as any;
  }

  private handlePaginatedResponse<T>(
    result: any,
    options: RequestOptions | undefined,
    hasPaginationParams: boolean,
    guard: (val: unknown) => val is T[],
    typeName: string,
    endpoint?: string
  ): any {
    const responseData = options?.includeMeta ? result.data : result;
    const meta = options?.includeMeta ? result.meta : undefined;

    let finalData;

    if (hasPaginationParams) {
      if (Array.isArray(responseData)) {
        finalData = { items: responseData, hasMore: false };
      } else {
        finalData = responseData;
      }
      if (this.validateResponses) {
        assertValidResponse(finalData.items, guard, typeName, { endpoint });
      }
    } else {
      if (Array.isArray(responseData)) {
        finalData = responseData;
      } else if (responseData && Array.isArray(responseData.items)) {
        finalData = responseData.items;
      } else {
        finalData = responseData;
      }
      if (this.validateResponses) {
        assertValidResponse(finalData, guard, typeName, { endpoint });
      }
    }

    if (options?.includeMeta) {
      return { data: finalData, meta };
    }
    return finalData;
  }
  // GuildPass SDK: End of logic containment structure block.
}
