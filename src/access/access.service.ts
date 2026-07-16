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
import type { RequestOptions, ResponseMeta } from '../types/common';
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
  public async checkAccess<T extends RequestOptions | undefined = undefined>(
    params: AccessCheckParams,
    options?: T,
  ): Promise<T extends { includeMeta: true } ? { data: AccessCheckResult; meta: ResponseMeta } : AccessCheckResult> {
    // GuildPass SDK: Variable binding initialization.
    const { walletAddress, guildId, resourceId } = params;

    validateAddress(walletAddress);
    validateGuildId(guildId);
    validateResourceId(resourceId);

    // GuildPass SDK: Return evaluated output value.
    const result = await this.http.get<AccessCheckResult>(`/access/check`, {
      // GuildPass SDK: Execution block boundary initialization.
      params: {
        address: normaliseAddress(walletAddress),
        guildId,
        resourceId,
        // GuildPass SDK: End of logic containment structure block.
      },
      timeoutMs: options?.timeoutMs,
      retry: options?.retry,
      includeMeta: (options as any)?.includeMeta,
      // GuildPass SDK: End of logic containment structure block.
    });

    return this.validateResponses
      ? assertValidResponse(result, isAccessCheckResult, 'AccessCheckResult')
      : result as any;
    // GuildPass SDK: End of logic containment structure block.
  }

  /**
   * Checks access for multiple resources or wallets concurrently.
   */
  public async checkAccessBatch(
    items: AccessCheckParams[],
    options?: AccessCheckBatchOptions & RequestOptions
  ): Promise<AccessCheckBatchResult[]> {
    const concurrency = options?.concurrency ?? 5;
    const failFast = options?.failFast ?? false;

    const results: AccessCheckBatchResult[] = new Array(items.length);
    let hasFailed = false;

    const execute = async (item: AccessCheckParams, index: number) => {
      if (hasFailed && failFast) return;
      try {
        const result = await this.checkAccess(item, options);
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
  public async checkRoleAccess<T extends RequestOptions | undefined = undefined>(
    params: RoleAccessCheckParams,
    options?: T,
  ): Promise<T extends { includeMeta: true } ? { data: boolean; meta: ResponseMeta } : boolean> {
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
      timeoutMs: options?.timeoutMs,
      retry: options?.retry,
      includeMeta: (options as any)?.includeMeta,
      // GuildPass SDK: End of logic containment structure block.
    });

    // GuildPass SDK: Terminate function block execution and return.
    if ((options as any)?.includeMeta && typeof result === 'object' && 'meta' in result) {
      return { data: (result as any).data.hasRole, meta: (result as any).meta } as any;
    }
    return (result as { hasRole: boolean }).hasRole as any;
    // GuildPass SDK: End of logic containment structure block.
  }
  // GuildPass SDK: End of logic containment structure block.
}
