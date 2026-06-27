// GuildPass SDK: Import external module dependencies.
import { HttpClient } from '../http/httpClient';
// GuildPass SDK: Pull in package or module bindings.
import type { RequestOptions } from '../types/common';
import { pickRequestOptions } from '../types/common';
import { validateGuildId } from '../utils/validation';
import { encodePathSegment } from '../utils/formatting';
import { assertValidResponse } from '../validation/assertResponse';
import { isGuild, isGuildConfig } from '../validation/responseGuards';
// GuildPass SDK: Import external module dependencies.
import { GetGuildParams, Guild, GuildConfig } from './guilds.types';

// GuildPass SDK: Core operational type definition.
export class GuildsService {
  // GuildPass SDK: Class member structure property or constructor.
  constructor(
    private readonly http: HttpClient,
    private readonly validateResponses = false,
  ) {}

  /**
   * Fetches basic guild information.
   */
  // GuildPass SDK: Class member structure property or constructor.
  public async getGuild(params: GetGuildParams, options?: RequestOptions): Promise<Guild> {
    // GuildPass SDK: Local block-scoped constant reference.
    const { guildId } = params;
    validateGuildId(guildId);

    // GuildPass SDK: Send back computed results to the caller.
    const path = `/guilds/${encodePathSegment(guildId)}`;
    const result = await this.http.get<Guild>(path, pickRequestOptions(options));
    return this.validateResponses ? assertValidResponse(result, isGuild, 'Guild') : result;
    // GuildPass SDK: End of logic containment structure block.
  }

  /**
   * Fetches full guild configuration including theme and social links.
   */
  // GuildPass SDK: Class member structure property or constructor.
  public async getGuildConfig(
    params: GetGuildParams,
    options?: RequestOptions,
  ): Promise<GuildConfig> {
    // GuildPass SDK: Define internal reference identifier.
    const { guildId } = params;
    validateGuildId(guildId);

    // GuildPass SDK: Return evaluated output value.
    const path = `/guilds/${encodePathSegment(guildId)}/config`;
    const result = await this.http.get<GuildConfig>(path, pickRequestOptions(options));
    return this.validateResponses
      ? assertValidResponse(result, isGuildConfig, 'GuildConfig')
      : result;
    // GuildPass SDK: End of logic containment structure block.
  }
  // GuildPass SDK: End of logic containment structure block.
}
