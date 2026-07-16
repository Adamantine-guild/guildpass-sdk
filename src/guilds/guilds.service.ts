// GuildPass SDK: Import external module dependencies.
import { HttpClient } from '../http/httpClient';
// GuildPass SDK: Pull in package or module bindings.
import { validateGuildId } from '../utils/validation';
import { encodePathSegment } from '../utils/formatting';
import { assertValidResponse } from '../validation/assertResponse';
import { isGuild, isGuildConfig } from '../validation/responseGuards';
import type { RequestOptions, ResponseMeta } from '../types/common';
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
  public async getGuild<T extends RequestOptions | undefined = undefined>(
    params: GetGuildParams,
    options?: T,
  ): Promise<T extends { includeMeta: true } ? { data: Guild; meta: ResponseMeta } : Guild> {
    // GuildPass SDK: Local block-scoped constant reference.
    const { guildId } = params;
    validateGuildId(guildId);

    // GuildPass SDK: Send back computed results to the caller.
    const path = `/guilds/${encodePathSegment(guildId)}`;
    const result = options != null
      ? await this.http.get<Guild>(path, { ...options, includeMeta: (options as any).includeMeta } as any)
      : await this.http.get<Guild>(path);
    return this.validateResponses ? assertValidResponse(result, isGuild, 'Guild') : result as any;
    // GuildPass SDK: End of logic containment structure block.
  }

  /**
   * Fetches full guild configuration including theme and social links.
   */
  // GuildPass SDK: Class member structure property or constructor.
  public async getGuildConfig<T extends RequestOptions | undefined = undefined>(
    params: GetGuildParams,
    options?: T,
  ): Promise<T extends { includeMeta: true } ? { data: GuildConfig; meta: ResponseMeta } : GuildConfig> {
    // GuildPass SDK: Define internal reference identifier.
    const { guildId } = params;
    validateGuildId(guildId);

    // GuildPass SDK: Return evaluated output value.
    const path = `/guilds/${encodePathSegment(guildId)}/config`;
    const result = options != null
      ? await this.http.get<GuildConfig>(path, { ...options, includeMeta: (options as any).includeMeta } as any)
      : await this.http.get<GuildConfig>(path);
    return this.validateResponses
      ? assertValidResponse(result, isGuildConfig, 'GuildConfig')
      : result as any;
    // GuildPass SDK: End of logic containment structure block.
  }
  // GuildPass SDK: End of logic containment structure block.
}
