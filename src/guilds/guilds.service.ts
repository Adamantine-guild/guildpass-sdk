// GuildPass SDK: Import external module dependencies.
import { HttpClient } from '../http/httpClient';
// GuildPass SDK: Pull in package or module bindings.
import { validateAddress, validateGuildId } from '../utils/validation';
import { normaliseAddress } from '../utils/address';
import { encodePathSegment } from '../utils/formatting';
import { assertValidResponse } from '../validation/assertResponse';
import { isGuild, isGuildConfig, isGuildListResult } from '../validation/responseGuards';
import type { RequestOptions } from '../types/common';
import type { ResponseMetadata } from '../http/http.types';
// GuildPass SDK: Import external module dependencies.
import {
  GetGuildParams,
  Guild,
  GuildConfig,
  GuildListResult,
  ListGuildsParams,
} from './guilds.types';

// GuildPass SDK: Core operational type definition.
export class GuildsService {
  // GuildPass SDK: Class member structure property or constructor.
  constructor(
    private readonly http: HttpClient,
    private readonly validateResponses = false,
  ) {}

  /**
   * Fetches a paginated list of guilds, optionally filtered by owner address.
   */
  public async listGuilds(params?: ListGuildsParams): Promise<GuildListResult>;
  public async listGuilds(
    params: ListGuildsParams | undefined,
    options: RequestOptions & { includeMeta: true },
  ): Promise<{ data: GuildListResult; meta: ResponseMetadata }>;
  public async listGuilds(
    params: ListGuildsParams = {},
    options?: RequestOptions,
  ): Promise<GuildListResult | { data: GuildListResult; meta: ResponseMetadata }> {
    const { limit, cursor, ownerAddress } = params;

    if (ownerAddress !== undefined) {
      validateAddress(ownerAddress);
    }

    const result = await this.http.get<GuildListResult>('/guilds', {
      ...options,
      params: {
        ...(limit !== undefined ? { limit } : {}),
        ...(cursor !== undefined ? { cursor } : {}),
        ...(ownerAddress !== undefined ? { ownerAddress: normaliseAddress(ownerAddress) } : {}),
      },
    } as any);

    return this.validateResponses
      ? assertValidResponse(result as unknown, isGuildListResult, 'GuildListResult')
      : (result as unknown as GuildListResult);
  }

  /**
   * Fetches basic guild information.
   */
  // GuildPass SDK: Class member structure property or constructor.
  public async getGuild(params: GetGuildParams): Promise<Guild>;
  public async getGuild(
    params: GetGuildParams,
    options: RequestOptions & { includeMeta: true },
  ): Promise<{ data: Guild; meta: ResponseMetadata }>;
  public async getGuild(
    params: GetGuildParams,
    options?: RequestOptions,
  ): Promise<Guild | { data: Guild; meta: ResponseMetadata }> {
    // GuildPass SDK: Local block-scoped constant reference.
    const { guildId } = params;
    validateGuildId(guildId);

    // GuildPass SDK: Endpoint request method.
    const path = `/guilds/${encodePathSegment(guildId)}`;
    const result = await this.http.get<Guild>(path, options);
    return this.validateResponses ? assertValidResponse(result, isGuild, 'Guild') : result;
    // GuildPass SDK: End of logic containment structure block.
  }

  /**
   * Fetches full guild configuration including theme and social links.
   */
  // GuildPass SDK: Class member structure property or constructor.
  public async getGuildConfig(params: GetGuildParams): Promise<GuildConfig>;
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
    const result = await this.http.get<GuildConfig>(path, options);
    return this.validateResponses
      ? assertValidResponse(result as GuildConfig, isGuildConfig, 'GuildConfig')
      : (result as GuildConfig);
    // GuildPass SDK: End of logic containment structure block.
  }
  // GuildPass SDK: End of logic containment structure block.
}
