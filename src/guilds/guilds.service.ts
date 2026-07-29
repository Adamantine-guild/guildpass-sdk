// GuildPass SDK: Import external module dependencies.
import { HttpClient } from '../http/httpClient';
// GuildPass SDK: Pull in package or module bindings.
import { validateGuildId } from '../utils/validation';
import { encodePathSegment } from '../utils/formatting';
import { assertValidResponse } from '../validation/assertResponse';
import { assertValidRequest } from '../validation/assertRequest';
import { isGuild, isGuildConfig } from '../validation/responseGuards';
import { isGetGuildParams } from '../validation/requestGuards';
import type { RequestOptions } from '../types/common';
import type { ResponseMetadata } from '../http/http.types';
import { verifySignedPayload, SignedEnvelope } from '../security';
import { GuildPassConfigError } from '../errors/errorTypes';
import { GuildPassErrorCode } from '../errors/errorCodes';
// GuildPass SDK: Import external module dependencies.
import {
  GetGuildParams,
  Guild,
  GuildConfig,
  GuildConfigBatchOptions,
  GuildConfigBatchParams,
} from './guilds.types';
import type { BatchItemResult } from '../contracts/contract.types';

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
  public async getGuild(params: GetGuildParams, options: RequestOptions & { includeMeta: true }): Promise<{ data: Guild; meta: ResponseMetadata }>;
  public async getGuild(params: GetGuildParams, options?: RequestOptions): Promise<Guild>;
  public async getGuild(params: GetGuildParams, options?: RequestOptions): Promise<Guild | { data: Guild; meta: ResponseMetadata }> {
    assertValidRequest(params, isGetGuildParams, 'GetGuildParams', { endpoint: 'GET /guilds/:id' });
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
  public async getGuildConfig(
    params: GetGuildParams,
    options: RequestOptions & { includeMeta: true },
  ): Promise<{ data: GuildConfig; meta: ResponseMetadata }>;
  public async getGuildConfig(
    params: GetGuildParams,
    options?: RequestOptions,
  ): Promise<GuildConfig>;
  public async getGuildConfig(
    params: GetGuildParams,
    options?: RequestOptions,
  ): Promise<GuildConfig | { data: GuildConfig; meta: ResponseMetadata }> {
    assertValidRequest(params, isGetGuildParams, 'GetGuildParams', { endpoint: 'GET /guilds/:id/config' });
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

  /**
   * Fetches full configuration for several guilds in one call.
   *
   * This is a **client-side fan-out** over the existing single-guild
   * `GET /guilds/:id/config` endpoint — there is no batch endpoint on the API —
   * so it saves the caller the orchestration, not the round trips. Requests are
   * issued through a bounded worker pool rather than all at once.
   *
   * Results are returned in the same order as `guildIds`, one entry per input,
   * with per-guild failure isolation: a guild that 404s or whose response fails
   * validation becomes an `'error'` entry and leaves its siblings untouched.
   * This matches the contract of `getGuildOwnersBatch` and the rest of the
   * batch surface.
   *
   * Duplicate IDs are preserved as-is: each input position gets its own result.
   *
   * @throws `INVALID_INPUT` when `guildIds` is missing, not an array, or empty,
   *         or when `concurrency` is outside `1..50`.
   */
  public async getGuildConfigBatch(
    params: GuildConfigBatchParams,
    options?: RequestOptions & GuildConfigBatchOptions,
  ): Promise<BatchItemResult<GuildConfig>[]> {
    const guildIds = params?.guildIds;

    if (!Array.isArray(guildIds) || guildIds.length === 0) {
      throw new GuildPassConfigError(
        'guildIds array is required and must not be empty',
        GuildPassErrorCode.INVALID_INPUT,
      );
    }

    const concurrency = options?.concurrency ?? 5;
    if (!Number.isInteger(concurrency) || concurrency < 1 || !Number.isFinite(concurrency)) {
      throw new GuildPassConfigError(
        'concurrency must be a positive finite integer',
        GuildPassErrorCode.INVALID_INPUT,
      );
    }
    if (concurrency > 50) {
      throw new GuildPassConfigError(
        'concurrency must not exceed 50',
        GuildPassErrorCode.INVALID_INPUT,
      );
    }

    const results: BatchItemResult<GuildConfig>[] = new Array(guildIds.length);
    let next = 0;

    const worker = async (): Promise<void> => {
      // Index is claimed before awaiting, so each result lands at its own input
      // position no matter what order the responses come back in.
      while (next < guildIds.length) {
        const index = next++;
        try {
          const config = await this.getGuildConfig(
            { guildId: guildIds[index] },
            // `includeMeta` would change the resolved shape, so it is dropped:
            // per-item metadata has nowhere to live in BatchItemResult.
            options ? { ...options, includeMeta: false } : undefined,
          );
          results[index] = { status: 'success', result: config };
        } catch (err) {
          results[index] = {
            status: 'error',
            error: err instanceof Error ? err.message : 'Unknown error fetching guild config',
          };
        }
      }
    };

    await Promise.all(
      Array(Math.min(concurrency, guildIds.length))
        .fill(null)
        .map(() => worker()),
    );

    return results;
    // GuildPass SDK: End of logic containment structure block.
  }
  // GuildPass SDK: End of logic containment structure block.
}
