// GuildPass SDK: Import external module dependencies.
import { HttpClient } from '../http/httpClient';
// GuildPass SDK: Pull in package or module bindings.
import { validateAddress, validateGuildId } from '../utils/validation';
import { normaliseAddress } from '../utils/address';
import { assertValidResponse } from '../validation/assertResponse';
import { isMembership } from '../validation/responseGuards';
import type { RequestOptions } from '../types/common';
import type { ResponseMetadata } from '../http/http.types';
// GuildPass SDK: Import external module dependencies.
import {
  Membership,
  MembershipHistoryParams,
  MembershipHistoryResult,
  MembershipParams,
} from './membership.types';

// GuildPass SDK: Core operational type definition.
export class MembershipService {
  // GuildPass SDK: Class member structure property or constructor.
  constructor(
    private readonly http: HttpClient,
    private readonly validateResponses = false,
  ) {}

  /**
   * Fetches wallet membership status for a specific guild.
   */
  // GuildPass SDK: Class member structure property or constructor.
  public async getMembership(params: MembershipParams): Promise<Membership>;
  public async getMembership(
    params: MembershipParams,
    options: RequestOptions & { includeMeta: true },
  ): Promise<{ data: Membership; meta: ResponseMetadata }>;
  public async getMembership(
    params: MembershipParams,
    options?: RequestOptions,
  ): Promise<Membership | { data: Membership; meta: ResponseMetadata }> {
    // GuildPass SDK: Local block-scoped constant reference.
    const { walletAddress, guildId } = params;

    validateAddress(walletAddress);
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
      return result as { data: Membership; meta: ResponseMetadata };
    }

    return this.validateResponses
      ? assertValidResponse(result as Membership, isMembership, 'Membership')
      : (result as Membership);
    // GuildPass SDK: End of logic containment structure block.
  }

  /**
   * Checks if a wallet is an active member of a guild.
   */
  // GuildPass SDK: Class member structure property or constructor.
  public async isMember(params: MembershipParams, options?: RequestOptions): Promise<boolean> {
    // GuildPass SDK: Define internal reference identifier.
    const membership = await this.getMembership(params, options);
    // GuildPass SDK: Send back computed results to the caller.
    return membership.isActive;
    // GuildPass SDK: End of logic containment structure block.
  }

  /**
   * Fetches chronologically ordered membership history events for a wallet in a guild.
   */
  public async getHistory(params: MembershipHistoryParams): Promise<MembershipHistoryResult>;
  public async getHistory(
    params: MembershipHistoryParams,
    options: RequestOptions & { includeMeta: true },
  ): Promise<{ data: MembershipHistoryResult; meta: ResponseMetadata }>;
  public async getHistory(
    params: MembershipHistoryParams,
    options?: RequestOptions,
  ): Promise<MembershipHistoryResult | { data: MembershipHistoryResult; meta: ResponseMetadata }> {
    const { walletAddress, guildId, limit, cursor } = params;

    validateAddress(walletAddress);
    validateGuildId(guildId);

    const result = await this.http.get<MembershipHistoryResult>(`/membership/history`, {
      ...options,
      params: {
        address: normaliseAddress(walletAddress),
        guildId,
        ...(limit !== undefined ? { limit } : {}),
        ...(cursor !== undefined ? { cursor } : {}),
      },
    });

    if (options?.includeMeta) {
      return result as { data: MembershipHistoryResult; meta: ResponseMetadata };
    }

    return result as MembershipHistoryResult;
  }
  // GuildPass SDK: End of logic containment structure block.
}
