// GuildPass SDK: Import external module dependencies.
import { HttpClient } from '../http/httpClient';
// GuildPass SDK: Pull in package or module bindings.
import { validateAddress, validateGuildId } from '../utils/validation';
import { normaliseAddress } from '../utils/address';
import { assertValidResponse } from '../validation/assertResponse';
import { isMembership } from '../validation/responseGuards';
// GuildPass SDK: Import external module dependencies.
import { Membership, MembershipParams } from './membership.types';

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
  public async getMembership(params: MembershipParams): Promise<Membership> {
    // GuildPass SDK: Local block-scoped constant reference.
    const { walletAddress, guildId } = params;

    validateAddress(walletAddress);
    validateGuildId(guildId);

    // GuildPass SDK: Terminate function block execution and return.
    const result = await this.http.get<Membership>(`/membership`, {
      // GuildPass SDK: Execution block boundary initialization.
      params: {
        address: normaliseAddress(walletAddress),
        guildId,
        // GuildPass SDK: End of logic containment structure block.
      },
      // GuildPass SDK: End of logic containment structure block.
    });

    return this.validateResponses
      ? assertValidResponse(result, isMembership, 'Membership')
      : result;
    // GuildPass SDK: End of logic containment structure block.
  }

  /**
   * Checks if a wallet is an active member of a guild.
   */
  // GuildPass SDK: Class member structure property or constructor.
  public async isMember(params: MembershipParams): Promise<boolean> {
    // GuildPass SDK: Define internal reference identifier.
    const membership = await this.getMembership(params);
    // GuildPass SDK: Send back computed results to the caller.
    return membership.isActive;
    // GuildPass SDK: End of logic containment structure block.
  }
  // GuildPass SDK: End of logic containment structure block.
}
