// GuildPass SDK: Pull in package or module bindings.
import { AccessService } from '../access/access.service';
// GuildPass SDK: Import external module dependencies.
import { DEFAULT_CONFIG } from '../config/defaultConfig';
// GuildPass SDK: Pull in package or module bindings.
import { GuildPassClientConfig, PublicClientConfig, validateConfig } from '../config/sdkConfig';
import { emitSecurityConfigWarnings, resolveAccessCacheTtl } from '../config/securityLimits';
// GuildPass SDK: Import external module dependencies.
import { ContractClient } from '../contracts/contractClient';
// GuildPass SDK: Pull in package or module bindings.
import { GuildsService } from '../guilds/guilds.service';
// GuildPass SDK: Import external module dependencies.
import { HttpClient, redactUrlCredentials } from '../http/httpClient';
// GuildPass SDK: Pull in package or module bindings.
import { MembershipService } from '../membership/membership.service';
import { SDK_VERSION } from '../config/version';
// GuildPass SDK: Import external module dependencies.
import { RolesService } from '../roles/roles.service';
import { CacheAdapter } from '../cache/cache.types';
import { normaliseAddress } from '../utils/address';
import { validateAddress } from '../utils/validation';
import { encodePathSegment } from '../utils/formatting';
import type { AccessCheckParams, AccessCheckResult, RoleAccessCheckParams, AccessCheckBatchOptions, AccessCheckBatchResult, AccessCheckBatchByResourceParams, AccessCheckBatchByResourceResult } from '../access/access.types';
import type { MembershipParams, Membership } from '../membership/membership.types';
import type { GetRolesParams, GetUserRolesParams, GuildRole, HasRoleParams } from '../roles/roles.types';
import type { GetGuildParams, Guild, GuildConfig } from '../guilds/guilds.types';
import type { RequestOptions } from '../types/common';

/**
 * The main GuildPass SDK this.
 *
 * Provides access to all GuildPass protocol services including
 * access control, membership, roles, and guilds.
 *
 * ### Caching
 *
 * Pass a `cache` adapter to the constructor to transparently memoize all safe
 * read operations. The built-in {@link InMemoryCacheAdapter} requires no
 * additional dependencies, but any adapter that satisfies the
 * {@link CacheAdapter} interface will work — including Redis:
 *
 * ```typescript
 * import { GuildPassClient, InMemoryCacheAdapter } from '@guildpass/sdk';
 *
 * const client = new GuildPassClient({
 *   apiUrl: 'https://api.guildpass.xyz',
 *   cache: new InMemoryCacheAdapter(),
 *   cacheTtl: 30_000, // 30 s default TTL for all cached responses
 * });
 *
 * // Subsequent calls with the same arguments hit the cache, not the network.
 * await this.guilds.getGuild({ guildId: 'prime-guild' }); // network
 * await this.guilds.getGuild({ guildId: 'prime-guild' }); // cache hit
 *
 * // Invalidate per-guild entries after a mutation.
 * await this.invalidateGuildCache('prime-guild');
 * ```
 */
const buildCacheKey = (...parts: string[]): string => {
  return parts.map((part) => encodePathSegment(part)).join(':');
};

// GuildPass SDK: Exported component definition.
export class GuildPassClient {
  // GuildPass SDK: Class member structure property or constructor.
  public readonly access: AccessService;
  // GuildPass SDK: Class member structure property or constructor.
  public readonly membership: MembershipService;
  // GuildPass SDK: Class member structure property or constructor.
  public readonly roles: RolesService;
  // GuildPass SDK: Class member structure property or constructor.
  public readonly guilds: GuildsService;
  // GuildPass SDK: Class member structure property or constructor.
  public readonly contracts: ContractClient;

  // GuildPass SDK: Class member structure property or constructor.
  private readonly http: HttpClient;
  // GuildPass SDK: Class member structure property or constructor.
  private readonly config: GuildPassClientConfig;
  private readonly cache: CacheAdapter | undefined;
  private readonly cacheTtl: number | undefined;
  private readonly deduplication: boolean;
  private readonly inFlightRequests = new Map<string, Promise<any>>();

  // GuildPass SDK: Class member structure property or constructor.
  constructor(config: GuildPassClientConfig) {
    validateConfig(config);
    // GuildPass SDK: Execution block boundary initialization.
    this.config = {
      ...DEFAULT_CONFIG,
      ...config,
      // GuildPass SDK: End of logic containment structure block.
    };

    emitSecurityConfigWarnings(this.config);

    this.cache = this.config.cache;
    this.cacheTtl = this.config.cacheTtl;
    this.deduplication = this.config.deduplication ?? true;

    this.http = new HttpClient(
      this.config.apiUrl,
      this.config.apiKey,
      this.config.defaultTimeoutMs ?? this.config.timeoutMs,
      {
        retry: this.config.retry,
        hooks: this.config.hooks,
        middleware: this.config.middleware,
        fetch: this.config.fetch,
        transport: this.config.transport,
        rateLimit: this.config.rateLimit,
        metadata: {
          sdkVersion: SDK_VERSION,
          clientName: this.config.clientName,
          clientVersion: this.config.clientVersion,
          sendClientMetadata: this.config.sendClientMetadata,
        },
      },
    );

    const validateResponses = this.config.validateResponses ?? false;
    const strictAddressChecksum = this.config.strictAddressChecksum ?? false;
    
    // IMPORTANT: Instantiate Contracts first so we can pass it to Access
    const rawContracts = new ContractClient(this.config, this.http);

    const verifySignedResponses = this.config.verifySignedResponses ?? false;
    const trustedSignerAddress = this.config.trustedSignerAddress;

    const rawAccess = new AccessService(
      this.http, 
      validateResponses, 
      rawContracts, 
      this.config.hooks?.onDiscrepancy,
      verifySignedResponses,
      trustedSignerAddress,
      strictAddressChecksum,
    );
    const rawMembership = new MembershipService(this.http, validateResponses, strictAddressChecksum);
    const rawRoles = new RolesService(this.http, validateResponses, rawAccess, strictAddressChecksum);
    const rawGuilds = new GuildsService(
      this.http, 
      validateResponses,
      verifySignedResponses,
      trustedSignerAddress
    );

    this.access = this.buildCachedAccessService(rawAccess);
    this.membership = this.buildCachedMembershipService(rawMembership);
    this.roles = this.buildCachedRolesService(rawRoles);
    this.guilds = this.buildCachedGuildsService(rawGuilds);
    this.contracts = rawContracts;
    // GuildPass SDK: End of logic containment structure block.
  }

  // ---------------------------------------------------------------------------
  // Cache invalidation helpers
  // ---------------------------------------------------------------------------

  /**
   * Removes all cache entries scoped to a specific guild ID.
   *
   * Call this after any mutation that may affect guild data, membership, roles,
   * or access decisions for that guild.
   */
  public async invalidateGuildCache(guildId: string): Promise<void> {
    if (!this.cache) return;
    const prefixes = [
      `${buildCacheKey('access', 'checkAccess', guildId)}:`,
      `${buildCacheKey('access', 'checkRoleAccess', guildId)}:`,
      `${buildCacheKey('membership', 'getMembership', guildId)}:`,
      buildCacheKey('roles', 'getRoles', guildId),
      `${buildCacheKey('roles', 'getRoles', guildId)}:`,
      `${buildCacheKey('roles', 'getUserRoles', guildId)}:`,
      buildCacheKey('guilds', 'getGuild', guildId),
      buildCacheKey('guilds', 'getGuildConfig', guildId),
    ];
    try {
      // Use deleteByPrefix if the adapter supports it; otherwise fall back to
      // exact-key deletion (legacy behaviour that may miss nested entries).
      if (this.cache.deleteByPrefix) {
        await Promise.all(prefixes.map((p) => this.cache!.deleteByPrefix!(p)));
      } else {
        await Promise.all(prefixes.map((k) => this.cache!.delete(k)));
      }
    } catch (error: any) {
      this.handleCacheError('delete', error);
    }
  }

  /**
   * Removes all cache entries scoped to a specific wallet address.
   *
   * Useful when a wallet's on-chain state has changed (e.g., token transfer).
   */
  public async invalidateWalletCache(walletAddress: string): Promise<void> {
    validateAddress(walletAddress, { strict: this.config.strictAddressChecksum });
    if (!this.cache) return;
    const wallet = normaliseAddress(walletAddress);
    try {
      // Use deleteByPrefix to remove only wallet-scoped entries instead of
      // clearing the entire cache. Falls back to full clear for adapters
      // that don't support prefix deletion.
      if (this.cache.deleteByPrefix) {
        await this.cache.deleteByPrefix(`${buildCacheKey('wallet', wallet)}:`);
      } else {
        await this.cache.clear();
      }
    } catch (error: any) {
      this.handleCacheError(this.cache.deleteByPrefix ? 'delete' : 'clear', error);
    }
  }

  /** Clears the entire cache. */
  public async clearCache(): Promise<void> {
    try {
      await this.cache?.clear();
    } catch (error: any) {
      this.handleCacheError('clear', error);
    }
  }

  // ---------------------------------------------------------------------------
  // Public config accessor
  // ---------------------------------------------------------------------------

  /**
   * Returns the current SDK configuration without sensitive values.
   * Sensitive fields such as `apiKey` are omitted from this public snapshot.
   * Function-valued fields (`fetch`, `hooks`, `contractProvider`, `cache`,
   * `middleware`) are omitted as well, and credentials embedded in RPC URLs
   * (userinfo, query parameters, key-shaped path segments) are redacted, so
   * the result is safe to `JSON.stringify` for logging.
   * The SDK continues to use the real values internally.
   */
  public getConfig(): PublicClientConfig {
    const safeConfig: Record<string, unknown> = { ...this.config };
    delete safeConfig.apiKey;
    delete safeConfig.fetch;
    delete safeConfig.transport;
    delete safeConfig.hooks;
    delete safeConfig.contractProvider;
    delete safeConfig.cache;
    delete safeConfig.middleware;
    if (typeof safeConfig.rpcUrl === 'string') {
      safeConfig.rpcUrl = redactUrlCredentials(safeConfig.rpcUrl);
    }
    if (Array.isArray(safeConfig.rpcUrls)) {
      safeConfig.rpcUrls = safeConfig.rpcUrls.map((u) =>
        typeof u === 'string' ? redactUrlCredentials(u) : u,
      );
    }
    if (safeConfig.chains && typeof safeConfig.chains === 'object') {
      const chains: Record<string, unknown> = {};
      for (const [chainId, chain] of Object.entries(
        safeConfig.chains as Record<string, Record<string, unknown>>,
      )) {
        chains[chainId] = {
          ...chain,
          ...(typeof chain.rpcUrl === 'string'
            ? { rpcUrl: redactUrlCredentials(chain.rpcUrl) }
            : {}),
          ...(Array.isArray(chain.rpcUrls)
            ? {
                rpcUrls: chain.rpcUrls.map((u) =>
                  typeof u === 'string' ? redactUrlCredentials(u) : u,
                ),
              }
            : {}),
        };
      }
      safeConfig.chains = chains;
    }
    return safeConfig as unknown as PublicClientConfig;
  }

  // ---------------------------------------------------------------------------
  // Internal cache-wrapping factories
  // ---------------------------------------------------------------------------

  private async coalesce<T>(key: string, fn: () => Promise<T>): Promise<T> {
    const inFlight = this.inFlightRequests.get(key);
    if (inFlight) return inFlight;

    const promise = (async () => {
      try {
        return await fn();
      } finally {
        this.inFlightRequests.delete(key);
      }
    })();

    this.inFlightRequests.set(key, promise);
    return promise;
  }

  private async withCache<T>(
    key: string,
    fn: () => Promise<T>,
    ttlOverride?: number,
    deduplicate?: boolean,
  ): Promise<T> {
    const effectiveTtl = ttlOverride ?? this.cacheTtl;
    const shouldDeduplicate = deduplicate ?? this.deduplication;

    if (this.cache) {
      try {
        const cached = await this.cache.get<T>(key);
        if (cached !== null) return cached;
      } catch (error: any) {
        this.handleCacheError('get', error, key);
      }
    }

    const execute = async (): Promise<T> => {
      const result = await fn();
      if (this.cache) {
        try {
          await this.cache.set(key, result, effectiveTtl);
        } catch (error: any) {
          this.handleCacheError('set', error, key);
        }
      }
      return result;
    };

    return shouldDeduplicate ? this.coalesce(key, execute) : execute();
  }

  /**
   * Safely handles cache errors by notifying hooks if present.
   * Cache failures are isolated and never prevent the SDK from functioning.
   */
  private handleCacheError(
    operation: 'get' | 'set' | 'delete' | 'clear',
    error: Error,
    key?: string,
  ): void {
    if (this.config.hooks?.onCacheError) {
      try {
        // Asynchronous hook call is intentionally not awaited to avoid blocking
        // the main request flow, but we wrap it in a try-catch for safety.
        const result = this.config.hooks.onCacheError({ operation, error, key });
        if (result instanceof Promise) {
          result.catch((err) => {
            console.error('GuildPass SDK: onCacheError hook failed', err);
          });
        }
      } catch (err) {
        console.error('GuildPass SDK: onCacheError hook failed', err);
      }
    }
  }

  private buildCachedAccessService(raw: AccessService): AccessService {
    const accessCacheTtl = resolveAccessCacheTtl(this.cacheTtl);

    const cached: AccessService = Object.create(raw, {
      checkAccess: {
        value: async (params: AccessCheckParams, options?: any): Promise<any> => {
          const wallet = normaliseAddress(params.walletAddress);
          const key = buildCacheKey('access', 'checkAccess', params.guildId, params.resourceId, wallet);
          return this.withCache(key, () => raw.checkAccess(params, options), accessCacheTtl, options?.deduplicate);
        },
      },
      checkRoleAccess: {
        value: async (params: RoleAccessCheckParams, options?: any): Promise<any> => {
          const wallet = normaliseAddress(params.walletAddress);
          const key = buildCacheKey('access', 'checkRoleAccess', params.guildId, params.roleId, wallet);
          return this.withCache(key, () => raw.checkRoleAccess(params, options), accessCacheTtl, options?.deduplicate);
        },
      },
    });

    Object.defineProperty(cached, 'checkAccessBatch', {
      // Bind to the cached proxy so each per-item check flows through the
      // cached checkAccess above instead of bypassing the cache layer.
      value: async (
        input: AccessCheckParams[] | AccessCheckBatchByResourceParams,
        options?: AccessCheckBatchOptions,
      ): Promise<AccessCheckBatchResult[] | AccessCheckBatchByResourceResult> =>
        raw.checkAccessBatch.call(cached, input as any, options),
    });

    return cached;
  }

  private buildCachedMembershipService(raw: MembershipService): MembershipService {
    return Object.create(raw, {
      getMembership: {
        value: async (params: MembershipParams, options?: any): Promise<any> => {
          const wallet = normaliseAddress(params.walletAddress);
          const key = buildCacheKey('membership', 'getMembership', params.guildId, wallet);
          return this.withCache(key, () => raw.getMembership(params, options), undefined, options?.deduplicate);
        },
      },
      isMember: {
        value: async (params: MembershipParams, options?: any): Promise<any> => {
          if (options?.includeMeta) {
            return raw.isMember(params, options);
          }
          const membership: any = await this.membership.getMembership(params, options);
          return membership.isActive;
        },
      },
    });
  }

  private buildRolesCacheKey(
    action: 'getRoles' | 'getUserRoles',
    idParts: string[],
    cursor?: string,
    limit?: number,
  ): string {
    const base = buildCacheKey('roles', action, ...idParts);
    if (cursor === undefined && limit === undefined) {
      return base;
    }
    return `${base}:${buildCacheKey(cursor ?? '', limit !== undefined ? String(limit) : '')}`;
  }

  private buildCachedRolesService(raw: RolesService): RolesService {
    const accessCacheTtl = resolveAccessCacheTtl(this.cacheTtl);

    return Object.create(raw, {
      getRoles: {
        value: async (params: GetRolesParams, options?: any): Promise<any> => {
          const key = this.buildRolesCacheKey('getRoles', [params.guildId], params.cursor, params.limit);
          return this.withCache(key, () => raw.getRoles(params, options), undefined, options?.deduplicate);
        },
      },
      getUserRoles: {
        value: async (params: GetUserRolesParams, options?: any): Promise<any> => {
          const wallet = normaliseAddress(params.walletAddress);
          const key = this.buildRolesCacheKey(
            'getUserRoles',
            [params.guildId, wallet],
            params.cursor,
            params.limit,
          );
          return this.withCache(key, () => raw.getUserRoles(params, options), undefined, options?.deduplicate);
        },
      },
      hasRole: {
        value: async (params: HasRoleParams, options?: any): Promise<any> => {
          const wallet = normaliseAddress(params.walletAddress);
          const key = buildCacheKey('access', 'checkRoleAccess', params.guildId, params.roleId, wallet);
          return this.withCache(key, () => raw.hasRole(params, options), accessCacheTtl, options?.deduplicate);
        },
      },
    });
  }

  private buildCachedGuildsService(raw: GuildsService): GuildsService {
    return Object.create(raw, {
      getGuild: {
        value: async (params: GetGuildParams, options?: any): Promise<any> => {
          const key = buildCacheKey('guilds', 'getGuild', params.guildId);
          return this.withCache(key, () => raw.getGuild(params, options), undefined, options?.deduplicate);
        },
      },
      getGuildConfig: {
        value: async (params: GetGuildParams, options?: any): Promise<any> => {
          const key = buildCacheKey('guilds', 'getGuildConfig', params.guildId);
          return this.withCache(key, () => raw.getGuildConfig(params, options), undefined, options?.deduplicate);
        },
      },
    });
  }
  // GuildPass SDK: End of logic containment structure block.
}
