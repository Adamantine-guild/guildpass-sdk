// GuildPass SDK: Import external module dependencies.
import { HttpClient } from '../http/httpClient';
// GuildPass SDK: Pull in package or module bindings.
import { validateGuildId } from '../utils/validation';
import { encodePathSegment } from '../utils/formatting';
import { assertValidResponse } from '../validation/assertResponse';
import { isGuild, isGuildConfig } from '../validation/responseGuards';
import type { RequestOptions } from '../types/common';
import type { ResponseMetadata } from '../http/http.types';
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
  public async getGuild(params: GetGuildParams): Promise<Guild>;
  public async getGuild(params: GetGuildParams, options: RequestOptions & { includeMeta: true }): Promise<{ data: Guild; meta: ResponseMetadata }>;
  public async getGuild(params: GetGuildParams, options?: RequestOptions): Promise<Guild | { data: Guild; meta: ResponseMetadata }> {
    // GuildPass SDK: Local block-scoped constant reference.
    const { guildId } = params;
    validateGuildId(guildId);

    // GuildPass SDK: Send back computed results to the caller.
    const path = `/guilds/${encodePathSegment(guildId)}`;
    const result = options
      ? await this.http.get<Guild>(path, options as any)
      : await this.http.get<Guild>(path);

    if (options?.includeMeta) {
      return result as { data: Guild; meta: ResponseMetadata };
    }

    return this.validateResponses ? assertValidResponse(result as Guild, isGuild, 'Guild') : (result as Guild);
    // GuildPass SDK: End of logic containment structure block.
  }

  /**
   * Fetches full guild configuration including theme and social links.
   */
  // GuildPass SDK: Class member structure property or constructor.
  public async getGuildConfig(
    params: GetGuildParams,
  ): Promise<GuildConfig>;
  public async getGuildConfig(
    params: GetGuildParams,
    options: RequestOptions & { includeMeta: true },
  ): Promise<{ data: GuildConfig; meta: ResponseMetadata }>;
  public async getGuildConfig(
    params: GetGuildParams,
    options?: RequestOptions,
  ): Promise<GuildConfig | { data: GuildConfig; meta: ResponseMetadata }> {
    // GuildPass SDK: Define internal reference identifier.
    const { guildId } = params;
    validateGuildId(guildId);

    // GuildPass SDK: Return evaluated output value.
    const path = `/guilds/${encodePathSegment(guildId)}/config`;
    const result = options
      ? await this.http.get<GuildConfig>(path, options as any)
      : await this.http.get<GuildConfig>(path);

    if (options?.includeMeta) {
      return result as { data: GuildConfig; meta: ResponseMetadata };
    }

    return this.validateResponses
      ? assertValidResponse(result as GuildConfig, isGuildConfig, 'GuildConfig')
      : (result as GuildConfig);
    // GuildPass SDK: End of logic containment structure block.
  }
  // GuildPass SDK: End of logic containment structure block.
}
