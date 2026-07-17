// GuildPass SDK: Import external module dependencies.
import { HttpClient } from '../http/httpClient';
// GuildPass SDK: Pull in package or module bindings.
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
import type { ResponseMetadata } from '../http/http.types';
// GuildPass SDK: Import external module dependencies.
import { AccessCheckParams, AccessCheckResult, RoleAccessCheckParams, AccessCheckBatchOptions, AccessCheckBatchResult } from './access.types';

// GuildPass SDK: Exported component definition.
export class AccessService {
  // GuildPass SDK: Class member structure property or constructor.
  constructor(
    private readonly http: HttpClient,
    private readonly validateResponses = false,
  ) {}

  /**
   * Checks whether a wallet has access to a gated resource.
   */
  // GuildPass SDK: Class member structure property or constructor.
  public async checkAccess(params: AccessCheckParams): Promise<AccessCheckResult>;
  public async checkAccess(params: AccessCheckParams, options: RequestOptions & { includeMeta: true }): Promise<{ data: AccessCheckResult; meta: ResponseMetadata }>;
  public async checkAccess(params: AccessCheckParams, options?: RequestOptions): Promise<AccessCheckResult | { data: AccessCheckResult; meta: ResponseMetadata }> {
    // GuildPass SDK: Variable binding initialization.
    const { walletAddress, guildId, resourceId } = params;

    validateAddress(walletAddress);
    validateGuildId(guildId);
    validateResourceId(resourceId);

    // GuildPass SDK: Return evaluated output value.
    const result = await this.http.get<AccessCheckResult>(`/access/check`, {
      ...options,
      // GuildPass SDK: Execution block boundary initialization.
      params: {
        address: normaliseAddress(walletAddress),
        guildId,
        resourceId,
        // GuildPass SDK: End of logic containment structure block.
      },
      // GuildPass SDK: End of logic containment structure block.
    });

    if (options?.includeMeta) {
      return result as { data: AccessCheckResult; meta: ResponseMetadata };
    }

    return this.validateResponses
      ? assertValidResponse(result as AccessCheckResult, isAccessCheckResult, 'AccessCheckResult')
      : (result as AccessCheckResult);
    // GuildPass SDK: End of logic containment structure block.
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

