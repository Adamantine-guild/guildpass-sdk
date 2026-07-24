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
import { Membership, MembershipParams } from './membership.types';

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
  public async getMembership<T extends RequestOptions | undefined = undefined>(
    params: MembershipParams,
  ): Promise<Membership>;
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
      const withMeta = result as { data: Membership; meta: ResponseMetadata };
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
  // GuildPass SDK: End of logic containment structure block.
}
