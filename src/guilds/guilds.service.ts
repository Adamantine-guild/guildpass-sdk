// GuildPass SDK: Import external module dependencies.
import { HttpClient } from '../http/httpClient';
// GuildPass SDK: Pull in package or module bindings.
import { validateGuildId } from '../utils/validation';
import { encodePathSegment } from '../utils/formatting';
import { assertValidResponse } from '../validation/assertResponse';
import { isGuild, isGuildConfig } from '../validation/responseGuards';
import type { RequestOptions } from '../types/common';
import type { ResponseMetadata } from '../http/http.types';
import { verifySignedPayload, SignedEnvelope } from '../security';
import { GuildPassConfigError } from '../errors/errorTypes';
import { GuildPassErrorCode } from '../errors/errorCodes';
// GuildPass SDK: Import external module dependencies.
import { GetGuildParams, Guild, GuildConfig } from './guilds.types';

// GuildPass SDK: Core operational type definition.
export class GuildsService {
  // GuildPass SDK: Class member structure property or constructor.
  constructor(
    private readonly http: HttpClient,
    private readonly validateResponses = false,
    private readonly verifySignedResponses = false,
    private readonly trustedSignerAddress?: string
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

    // GuildPass SDK: Endpoint request method.
    const path = `/guilds/${encodePathSegment(guildId)}`;
    const response = await this.http.get<Guild | SignedEnvelope<Guild>>(path, options);

    let rawData = response;
    
    if (this.verifySignedResponses) {
      if (!this.trustedSignerAddress) {
        throw new GuildPassConfigError('trustedSignerAddress is required when verifySignedResponses is true', GuildPassErrorCode.INVALID_CONFIG);
      }
      rawData = await verifySignedPayload<Guild>(response as SignedEnvelope<Guild> | Guild, this.trustedSignerAddress);
    } else {
      if (response && typeof response === 'object' && 'data' in response && 'signature' in response && typeof (response as any).signature === 'string') {
        rawData = (response as SignedEnvelope<Guild>).data;
      }
    }

    const validatedResult = this.validateResponses ? assertValidResponse(rawData, isGuild, 'Guild', { endpoint: `GET ${path}` }) : rawData;

    if (options?.includeMeta) {
      return { data: validatedResult as Guild, meta: (response as any).meta } as { data: Guild; meta: ResponseMetadata };
    }

    return validatedResult as Guild;
    // GuildPass SDK: End of logic containment structure block.
  }

  /**
   * Fetches full guild configuration including theme and social links.
   */
  // GuildPass SDK: Class member structure property or constructor.
  public async getGuildConfig<T extends RequestOptions | undefined = undefined>(
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
    const response = await this.http.get<GuildConfig | SignedEnvelope<GuildConfig>>(path, options);
    
    let rawData = response;

    if (this.verifySignedResponses) {
      if (!this.trustedSignerAddress) {
        throw new GuildPassConfigError('trustedSignerAddress is required when verifySignedResponses is true', GuildPassErrorCode.INVALID_CONFIG);
      }
      rawData = await verifySignedPayload<GuildConfig>(response as SignedEnvelope<GuildConfig> | GuildConfig, this.trustedSignerAddress);
    } else {
      if (response && typeof response === 'object' && 'data' in response && 'signature' in response && typeof (response as any).signature === 'string') {
        rawData = (response as SignedEnvelope<GuildConfig>).data;
      }
    }

    const validatedResult = this.validateResponses
      ? assertValidResponse(rawData as GuildConfig, isGuildConfig, 'GuildConfig', { endpoint: `GET ${path}` })
      : (rawData as GuildConfig);

    if (options?.includeMeta) {
      return { data: validatedResult, meta: (response as any).meta } as { data: GuildConfig; meta: ResponseMetadata };
    }

    return validatedResult;
    // GuildPass SDK: End of logic containment structure block.
  }
  // GuildPass SDK: End of logic containment structure block.
}
