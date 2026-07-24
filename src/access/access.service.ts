import { HttpClient } from '../http/httpClient';
import {
  validateAddress,
  validateGuildId,
  validateResourceId,
  validateRoleId,
} from '../utils/validation';
import { normaliseAddress } from '../utils/address';
import { assertValidResponse } from '../validation/assertResponse';
import { isAccessCheckResult, isRoleCheckResult } from '../validation/responseGuards';
import type { RequestOptions } from '../types/common';
import { verifySignedPayload, SignedEnvelope } from '../security';
import type { ResponseMetadata, DiscrepancyHookPayload } from '../http/http.types';
import type { ContractClient } from '../contracts/contractClient';
import { GuildPassConfigError, GuildPassResponseValidationError } from '../errors/errorTypes';
import { GuildPassErrorCode } from '../errors/errorCodes';
import { 
  AccessCheckParams, 
  AccessCheckResult, 
  RoleAccessCheckParams, 
  AccessCheckBatchOptions, 
  AccessCheckBatchResult,
  AccessCheckBatchByResourceParams,
  AccessCheckBatchByResourceResult,
  VerifiedAccessCheckOptions,
  VerifiedAccessCheckResult
} from './access.types';

export class AccessService {
  constructor(
    private readonly http: HttpClient,
    private readonly validateResponses = false,
    private readonly contracts?: ContractClient,
    private readonly onDiscrepancy?: (payload: DiscrepancyHookPayload) => void | Promise<void>,
    private readonly verifySignedResponses = false,
    private readonly trustedSignerAddress?: string
  ) {}

  public async checkAccess(params: AccessCheckParams): Promise<AccessCheckResult>;
  public async checkAccess(params: AccessCheckParams, options: RequestOptions & { includeMeta: true }): Promise<{ data: AccessCheckResult; meta: ResponseMetadata }>;
  public async checkAccess(params: AccessCheckParams, options?: RequestOptions): Promise<AccessCheckResult | { data: AccessCheckResult; meta: ResponseMetadata}> {
    const { walletAddress, guildId, resourceId } = params;

    validateAddress(walletAddress);
    validateGuildId(guildId);
    validateResourceId(resourceId);

    const response = await this.http.get<AccessCheckResult | SignedEnvelope<AccessCheckResult>>(`/access/check`, {
      ...options,
      params: {
        address: normaliseAddress(walletAddress),
        guildId,
        resourceId,
      },
    });

    let rawData = response;
    
    if (this.verifySignedResponses) {
      if (!this.trustedSignerAddress) {
        throw new GuildPassConfigError('trustedSignerAddress is required when verifySignedResponses is true', GuildPassErrorCode.INVALID_CONFIG);
      }
      rawData = await verifySignedPayload<AccessCheckResult>(response as SignedEnvelope<AccessCheckResult> | AccessCheckResult, this.trustedSignerAddress);
    } else {
      // In case the API returns an envelope anyway, but we didn't opt-in to verify it, we should probably unwrap it if it's an envelope, or just let assertValidResponse fail.
      // Usually, if verifySignedResponses is false, we expect the raw AccessCheckResult or we can unwrap safely.
      if (response && typeof response === 'object' && 'data' in response && 'signature' in response && typeof (response as any).signature === 'string') {
        rawData = (response as SignedEnvelope<AccessCheckResult>).data;
      }
    }

    const validatedResult = this.validateResponses
      ? assertValidResponse(rawData as AccessCheckResult, isAccessCheckResult, 'AccessCheckResult', { endpoint: 'GET /access/check' })
      : (rawData as AccessCheckResult);

    if (options?.includeMeta) {
      return { data: validatedResult, meta: (response as any).meta } as { data: AccessCheckResult; meta: ResponseMetadata };
    }

    return validatedResult;
  }

  /**
   * Verifies access against BOTH the off-chain API and the on-chain contract source of truth concurrently.
   * 
   * This is a high-assurance, opt-in method designed for gating high-value actions 
   * (e.g., mints, airdrops, high-value transfers) where relying solely on off-chain 
   * cached API state exposes the consumer to staleness, indexer delays, or backend compromise.
   * 
   * **Tradeoffs:**
   * - Requires a configured `rpcUrl` or `contractProvider`.
   * - Triggers an immediate JSON-RPC call, adding latency and RPC provider cost compared to `checkAccess()`.
   */
  public async checkAccessVerified(
    params: AccessCheckParams,
    options: VerifiedAccessCheckOptions
  ): Promise<VerifiedAccessCheckResult> {
    if (!this.contracts) {
      throw new GuildPassConfigError('ContractClient is not configured', GuildPassErrorCode.INVALID_CONFIG);
    }

    const { requirement, chainId, throwOnDiscrepancy, ...requestOptions } = options;

    const [apiPromise, onChainPromise] = await Promise.allSettled([
      this.checkAccess(params, requestOptions as any),
      this.contracts.validateRoleRequirement({
        walletAddress: params.walletAddress,
        requirement,
        chainId
      }, requestOptions as any)
    ]);

    const apiResultRaw = apiPromise.status === 'fulfilled' ? apiPromise.value : null;
    const apiResult = apiResultRaw && 'hasAccess' in (apiResultRaw as any)
      ? (apiResultRaw as any as AccessCheckResult)
      : (apiResultRaw as any)?.data ?? null;

    const onChainResult = onChainPromise.status === 'fulfilled' ? onChainPromise.value : null;

    const apiHasAccess = apiResult ? apiResult.hasAccess : false;
    const chainHasAccess = onChainResult ?? false;

    const apiFailed = apiPromise.status === 'rejected';
    const onChainFailed = onChainPromise.status === 'rejected';

    const consistent = !apiFailed && !onChainFailed && (apiHasAccess === chainHasAccess);

    let discrepancyReason: string | undefined;

    if (!consistent) {
      if (apiFailed && onChainFailed) {
        discrepancyReason = `Both API and on-chain requests failed. API: ${(apiPromise as PromiseRejectedResult).reason.message || (apiPromise as PromiseRejectedResult).reason}`;
      } else if (apiFailed) {
        discrepancyReason = `API request failed: ${(apiPromise as PromiseRejectedResult).reason.message || (apiPromise as PromiseRejectedResult).reason}`;
      } else if (onChainFailed) {
        discrepancyReason = `On-chain request failed: ${(onChainPromise as PromiseRejectedResult).reason.message || (onChainPromise as PromiseRejectedResult).reason}`;
      } else {
        discrepancyReason = `API returned ${apiHasAccess}, but on-chain returned ${chainHasAccess}`;
      }

      if (this.onDiscrepancy) {
        try {
          const hookRes = this.onDiscrepancy({
            params,
            requirement,
            apiResult,
            onChainResult,
            reason: discrepancyReason
          });
          if (hookRes instanceof Promise) {
            hookRes.catch(err => console.error('GuildPass SDK: onDiscrepancy hook failed', err));
          }
        } catch (err) {
          console.error('GuildPass SDK: onDiscrepancy hook failed', err);
        }
      }

      if (throwOnDiscrepancy) {
        throw new GuildPassResponseValidationError(`Access verification failed: ${discrepancyReason}`, GuildPassErrorCode.INVALID_RESPONSE);
      }
    }

    return { apiResult, onChainResult, consistent, discrepancyReason };
  }


  /**
   * Checks access for multiple resources or wallets concurrently.
   *
   * Two call shapes are supported:
   * - `checkAccessBatch(items, options)` — array of full params, returns one
   *   result entry per input item (order preserved).
   * - `checkAccessBatch({ walletAddress, guildId, resourceIds }, options)` —
   *   single wallet + guild across many resources, returns a map keyed by
   *   resourceId. Duplicate resourceIds are collapsed to a single request.
   */
  public async checkAccessBatch(
    items: AccessCheckParams[],
    options?: AccessCheckBatchOptions & RequestOptions
  ): Promise<AccessCheckBatchResult[]>;
  public async checkAccessBatch(
    params: AccessCheckBatchByResourceParams,
    options?: AccessCheckBatchOptions & RequestOptions
  ): Promise<AccessCheckBatchByResourceResult>;
  public async checkAccessBatch(
    input: AccessCheckParams[] | AccessCheckBatchByResourceParams,
    options?: AccessCheckBatchOptions & RequestOptions
  ): Promise<AccessCheckBatchResult[] | AccessCheckBatchByResourceResult> {
    if (!Array.isArray(input)) {
      const { walletAddress, guildId, resourceIds } = input;
      validateAddress(walletAddress);
      validateGuildId(guildId);
      if (!Array.isArray(resourceIds) || resourceIds.length === 0) {
        throw new GuildPassConfigError('resourceIds array must not be empty', GuildPassErrorCode.INVALID_INPUT);
      }
      const uniqueResourceIds = [...new Set(resourceIds)];
      const items = uniqueResourceIds.map((resourceId) => ({ walletAddress, guildId, resourceId }));
      const settled = await this.checkAccessBatch(items, options);
      const byResource: AccessCheckBatchByResourceResult = {};
      settled.forEach((entry, index) => {
        const resourceId = uniqueResourceIds[index];
        byResource[resourceId] = entry.status === 'fulfilled'
          ? { status: 'fulfilled', value: entry.value as AccessCheckResult }
          : { status: 'rejected', error: entry.error as Error };
      });
      return byResource;
    }

    const items = input;
    this.validateBatchOptions(items, options);
    const concurrency = options?.concurrency ?? 5;
    const failFast = options?.failFast ?? false;

    const results: AccessCheckBatchResult[] = new Array(items.length);
    let hasFailed = false;

    const execute = async (item: AccessCheckParams, index: number) => {
      if (hasFailed && failFast) return;
      try {
        const requestOptions: RequestOptions = {
          timeoutMs: options?.timeoutMs,
          retry: options?.retry,
          signal: options?.signal,
        };
        const result = await this.checkAccess(item, requestOptions as any);
        results[index] = { input: item, status: 'fulfilled', value: result as any };
      } catch (error) {
        if (failFast) hasFailed = true;
        results[index] = { 
          input: item, 
          status: 'rejected', 
          error: error instanceof Error ? error : new Error(String(error)) 
        };
        if (failFast) throw error;
      }
    };

    const queue = items.map((item, index) => ({ item, index }));
    const workers = Array(Math.min(concurrency, items.length)).fill(null).map(async () => {
      while (queue.length > 0) {
        if (failFast && hasFailed) break;
        const current = queue.shift();
        if (current) {
          await execute(current.item, current.index);
        }
      }
    });

    await Promise.all(workers);
    return results;
  }

  /**
   * Checks whether a wallet has a specific role in a guild.
   */
  // GuildPass SDK: Class member structure property or constructor.
  private validateBatchOptions(items: AccessCheckParams[], options?: AccessCheckBatchOptions): void {
    const concurrency = options?.concurrency ?? 5;
    if (!Number.isInteger(concurrency) || concurrency < 1 || !Number.isFinite(concurrency)) {
      throw new GuildPassConfigError("concurrency must be a positive finite integer", GuildPassErrorCode.INVALID_INPUT);
    }
    if (concurrency > 50) {
      throw new GuildPassConfigError("concurrency must not exceed 50", GuildPassErrorCode.INVALID_INPUT);
    }
    if (!items || items.length === 0) {
      throw new GuildPassConfigError("items array must not be empty", GuildPassErrorCode.INVALID_INPUT);
    }
  }

  public async checkRoleAccess(
    params: RoleAccessCheckParams,
  ): Promise<boolean>;
  public async checkRoleAccess(
    params: RoleAccessCheckParams,
    options: RequestOptions & { includeMeta: true },
  ): Promise<{ data: boolean; meta: ResponseMetadata }>;
  public async checkRoleAccess(
    params: RoleAccessCheckParams,
    options?: RequestOptions,
  ): Promise<boolean | { data: boolean; meta: ResponseMetadata }> {
    // GuildPass SDK: Local block-scoped constant reference.
    const { walletAddress, guildId, roleId } = params;

    validateAddress(walletAddress);
    validateGuildId(guildId);
    validateRoleId(roleId);

    // GuildPass SDK: Define internal reference identifier.
    const result = await this.http.get<{ hasRole: boolean }>(`/access/role-check`, {
      ...options,
      // GuildPass SDK: Execution block boundary initialization.
      params: {
        address: normaliseAddress(walletAddress),
        guildId,
        roleId,
        // GuildPass SDK: End of logic containment structure block.
      },
      // GuildPass SDK: End of logic containment structure block.
    });

    if (options?.includeMeta) {
      const r = result as { data: { hasRole: boolean }; meta: ResponseMetadata };
      const checkedData = this.validateResponses
        ? assertValidResponse(r.data, isRoleCheckResult, 'RoleCheckResult', { endpoint: 'GET /access/role-check' })
        : r.data;
      return { data: checkedData.hasRole, meta: r.meta };
    }

    // GuildPass SDK: Terminate function block execution and return.
    const checked = this.validateResponses
      ? assertValidResponse(result, isRoleCheckResult, 'RoleCheckResult', { endpoint: 'GET /access/role-check' })
      : (result as { hasRole: boolean });
    return checked.hasRole;
    // GuildPass SDK: End of logic containment structure block.
  }
  // GuildPass SDK: End of logic containment structure block.
}

