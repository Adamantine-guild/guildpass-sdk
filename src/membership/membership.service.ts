// GuildPass SDK: Import external module dependencies.
import { HttpClient } from '../http/httpClient';
// GuildPass SDK: Pull in package or module bindings.
import { validateAddress, validateGuildId } from '../utils/validation';
import { normaliseAddress } from '../utils/address';
import { encodePathSegment } from '../utils/formatting';
import { assertValidResponse } from '../validation/assertResponse';
import { assertValidRequest } from '../validation/assertRequest';
import { isMembership, isMembershipEventArray } from '../validation/responseGuards';
import { isMembershipParams, isGetHistoryParams } from '../validation/requestGuards';
import type { RequestOptions } from '../types/common';
import type { ResponseMetadata } from '../http/http.types';
// GuildPass SDK: Import external module dependencies.
import { Membership, MembershipParams, MembershipEvent, GetHistoryParams } from './membership.types';
import { PaginatedResult } from '../utils/pagination';

// GuildPass SDK: Core operational type definition.
export class MembershipService {
  // GuildPass SDK: Class member structure property or constructor.
  constructor(
    private readonly http: HttpClient,
    private readonly validateResponses = false,
    private readonly strictAddressChecksum = false,
  ) {}

  /**
   * Fetches wallet membership status for a specific guild.
   */
  // GuildPass SDK: Class member structure property or constructor.
  public async getMembership(
    params: MembershipParams,
    options: RequestOptions & { includeMeta: true },
  ): Promise<{ data: Membership; meta: ResponseMetadata }>;
  public async getMembership(
    params: MembershipParams,
    options?: RequestOptions,
  ): Promise<Membership>;
  public async getMembership(
    params: MembershipParams,
    options?: RequestOptions,
  ): Promise<Membership | { data: Membership; meta: ResponseMetadata }> {
    assertValidRequest(params, isMembershipParams, 'MembershipParams', { endpoint: 'GET /membership' });
    // GuildPass SDK: Local block-scoped constant reference.
    const { walletAddress, guildId } = params;

    validateAddress(walletAddress, { strict: this.strictAddressChecksum });
    validateGuildId(guildId);

    // GuildPass SDK: Terminate function block execution and return.
    const result = await this.http.get<Membership>(`/membership`, {
      ...options,
      // GuildPass SDK: Execution block boundary initialization.
      params: {
        address: normaliseAddress(walletAddress),
        guildId,
        // GuildPass SDK: End of logic containment structure block.
      },
      // GuildPass SDK: End of logic containment structure block.
    });

    if (options?.includeMeta) {
      const withMeta = result as any;
      const checkedData = this.validateResponses
        ? assertValidResponse(withMeta.data, isMembership, 'Membership', { endpoint: 'GET /membership' })
        : withMeta.data;
      return { data: checkedData, meta: withMeta.meta };
    }

    return this.validateResponses
      ? assertValidResponse(result as Membership, isMembership, 'Membership', { endpoint: 'GET /membership' })
      : (result as Membership);
    // GuildPass SDK: End of logic containment structure block.
  }

  /**
   * Checks if a wallet is an active member of a guild.
   */
  // GuildPass SDK: Class member structure property or constructor.
  public async isMember<T extends RequestOptions | undefined = undefined>(
    params: MembershipParams,
    options?: T,
  ): Promise<T extends { includeMeta: true } ? { data: boolean; meta: ResponseMetadata } : boolean> {
    // GuildPass SDK: Define internal reference identifier.
    const result = await this.getMembership(params, options as any);
    const hasMeta = (options as any)?.includeMeta && typeof result === 'object' && 'meta' in result;
    if (hasMeta) {
      const withMeta = result as { data: Membership; meta: ResponseMetadata };
      return { data: withMeta.data.isActive, meta: withMeta.meta } as any;
    }
    // GuildPass SDK: Send back computed results to the caller.
    return (result as any).isActive as any;
    // GuildPass SDK: End of logic containment structure block.
  }

  /**
   * Fetches historical membership events for a wallet.
   */
  public async getHistory(params: GetHistoryParams & ({ cursor: string } | { limit: number }), options: RequestOptions & { includeMeta: true }): Promise<{ data: PaginatedResult<MembershipEvent>; meta: ResponseMetadata }>;
  public async getHistory(params: GetHistoryParams & ({ cursor: string } | { limit: number }), options?: RequestOptions): Promise<PaginatedResult<MembershipEvent>>;
  public async getHistory(params: GetHistoryParams, options: RequestOptions & { includeMeta: true }): Promise<{ data: MembershipEvent[]; meta: ResponseMetadata }>;
  public async getHistory(params: GetHistoryParams, options?: RequestOptions): Promise<MembershipEvent[]>;
  public async getHistory(params: GetHistoryParams, options?: RequestOptions): Promise<any> {
    assertValidRequest(params, isGetHistoryParams, 'GetHistoryParams', { endpoint: 'GET /guilds/:id/members/:address/history' });
    const { walletAddress, guildId, cursor, limit } = params;

    validateAddress(walletAddress, { strict: this.strictAddressChecksum });
    validateGuildId(guildId);

    const path = `/guilds/${encodePathSegment(guildId)}/members/${encodePathSegment(normaliseAddress(walletAddress))}/history`;
    
    const reqOptions: any = { ...options };
    if (cursor !== undefined || limit !== undefined) {
      reqOptions.params = { ...reqOptions.params, ...(cursor !== undefined && { cursor }), ...(limit !== undefined && { limit }) };
    }

    const result = await this.http.get<any>(path, reqOptions);
    const hasPagination = cursor !== undefined || limit !== undefined;

    return this.handlePaginatedResponse(result, options, hasPagination, isMembershipEventArray, 'MembershipEvent[]', `GET ${path}`);
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
