import { HttpClient } from '../http/httpClient';
import {
  validateAddress,
  validateGuildId,
  validateResourceId,
  validateRoleId,
} from '../utils/validation';
import { normaliseAddress } from '../utils/address';
import { assertValidResponse } from '../validation/assertResponse';
import { isAccessCheckResult } from '../validation/responseGuards';
import type { RequestOptions } from '../types/common';
import type { ResponseMetadata, DiscrepancyHookPayload } from '../http/http.types';
import type { ContractClient } from '../contracts/contractClient';
import { GuildPassError } from '../errors/GuildPassError';
import { GuildPassErrorCode } from '../errors/errorCodes';
import { 
  AccessCheckParams, 
  AccessCheckResult, 
  RoleAccessCheckParams, 
  AccessCheckBatchOptions, 
  AccessCheckBatchResult,
  VerifiedAccessCheckOptions,
  VerifiedAccessCheckResult
} from './access.types';

export class AccessService {
  constructor(
    private readonly http: HttpClient,
    private readonly validateResponses = false,
    private readonly contracts?: ContractClient,
    private readonly onDiscrepancy?: (payload: DiscrepancyHookPayload) => void | Promise<void>,
  ) {}

  public async checkAccess(params: AccessCheckParams): Promise<AccessCheckResult>;
  public async checkAccess(params: AccessCheckParams, options: RequestOptions & { includeMeta: true }): Promise<{ data: AccessCheckResult; meta: ResponseMetadata }>;
  public async checkAccess(params: AccessCheckParams, options?: RequestOptions): Promise<AccessCheckResult | { data: AccessCheckResult; meta: ResponseMetadata}> {
    const { walletAddress, guildId, resourceId } = params;

    validateAddress(walletAddress);
    validateGuildId(guildId);
    validateResourceId(resourceId);

    const result = await this.http.get<AccessCheckResult>(`/access/check`, {
      ...options,
      params: {
        address: normaliseAddress(walletAddress),
        guildId,
        resourceId,
      },
    });

    if (options?.includeMeta) {
      return result as { data: AccessCheckResult; meta: ResponseMetadata };
    }

    return this.validateResponses
      ? assertValidResponse(result as AccessCheckResult, isAccessCheckResult, 'AccessCheckResult')
      : (result as AccessCheckResult);
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
      throw new GuildPassError('ContractClient is not configured', GuildPassErrorCode.INVALID_CONFIG);
    }

    const { requirement, chainId, throwOnDiscrepancy, ...requestOptions } = options;

    const [apiPromise, onChainPromise] = await Promise.allSettled([
      this.checkAccess(params, requestOptions as RequestOptions),
      this.contracts.validateRoleRequirement({
        walletAddress: params.walletAddress,
        requirement,
        chainId
      }, requestOptions as RequestOptions)
    ]);

    const apiResultRaw = apiPromise.status === 'fulfilled' ? apiPromise.value : null;
    const apiResult = apiResultRaw && 'hasAccess' in apiResultRaw 
      ? (apiResultRaw as AccessCheckResult)
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
        throw new GuildPassError(`Access verification failed: ${discrepancyReason}`, GuildPassErrorCode.INVALID_RESPONSE);
      }
    }

    return { apiResult, onChainResult, consistent, discrepancyReason };
  }


  /**
   * Checks access for multiple resources or wallets concurrently.
   */
  public async checkAccessBatch(
    items: AccessCheckParams[],
    options?: AccessCheckBatchOptions & RequestOptions
  ): Promise<AccessCheckBatchResult[]> {
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
        const result = await this.checkAccess(item, requestOptions);
        results[index] = { input: item, status: 'fulfilled', value: result };
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
      throw new Error("concurrency must be a positive finite integer");
    }
    if (concurrency > 50) {
      throw new Error("concurrency must not exceed 50");
    }
    if (!items || items.length === 0) {
      throw new Error("items array must not be empty");
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
      return { data: r.data.hasRole, meta: r.meta };
    }

    // GuildPass SDK: Terminate function block execution and return.
    return (result as { hasRole: boolean }).hasRole;
    // GuildPass SDK: End of logic containment structure block.
  }
  // GuildPass SDK: End of logic containment structure block.
}

