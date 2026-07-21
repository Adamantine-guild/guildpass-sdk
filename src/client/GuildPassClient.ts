// GuildPass SDK: Pull in package or module bindings.
import { AccessService } from '../access/access.service';
// GuildPass SDK: Import external module dependencies.
import { DEFAULT_CONFIG } from '../config/defaultConfig';
// GuildPass SDK: Pull in package or module bindings.
import { GuildPassClientConfig, validateConfig } from '../config/sdkConfig';
// GuildPass SDK: Import external module dependencies.
import { ContractClient } from '../contracts/contractClient';
// GuildPass SDK: Pull in package or module bindings.
import { GuildsService } from '../guilds/guilds.service';
// GuildPass SDK: Import external module dependencies.
import { HttpClient } from '../http/httpClient';
// GuildPass SDK: Pull in package or module bindings.
import { MembershipService } from '../membership/membership.service';
import { SDK_VERSION } from '../config/version';
// GuildPass SDK: Import external module dependencies.
import { RolesService } from '../roles/roles.service';
import { CacheAdapter } from '../cache/cache.types';
import { normaliseAddress } from '../utils/address';
import { validateAddress } from '../utils/validation';
import { encodePathSegment } from '../utils/formatting';
import type { AccessCheckParams, AccessCheckResult, RoleAccessCheckParams, AccessCheckBatchOptions, AccessCheckBatchResult } from '../access/access.types';
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

    this.cache = this.config.cache;
    this.cacheTtl = this.config.cacheTtl;

    this.http = new HttpClient(
      this.config.apiUrl,
      this.config.apiKey,
      this.config.timeoutMs,
      {
        retry: this.config.retry,
        hooks: this.config.hooks,
        fetch: this.config.fetch,
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
    
    // IMPORTANT: Instantiate Contracts first so we can pass it to Access
    const rawContracts = new ContractClient(this.config, this.http);

    const rawAccess = new AccessService(
      this.http, 
      validateResponses, 
      rawContracts, 
      this.config.hooks?.onDiscrepancy
    );
    const rawMembership = new MembershipService(this.http, validateResponses);
    const rawRoles = new RolesService(this.http, validateResponses, rawAccess);
    const rawGuilds = new GuildsService(this.http, validateResponses);

    this.access = this.cache ? this.buildCachedAccessService(rawAccess) : rawAccess;
    this.membership = this.cache ? this.buildCachedMembershipService(rawMembership) : rawMembership;
    this.roles = this.cache ? this.buildCachedRolesService(rawRoles) : rawRoles;
    this.guilds = this.cache ? this.buildCachedGuildsService(rawGuilds) : rawGuilds;
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
    validateAddress(walletAddress);
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
   * The SDK continues to use the real API key internally for authenticated requests.
   */
  public getConfig(): Omit<GuildPassClientConfig, 'apiKey'> {
    const safeConfig: Partial<GuildPassClientConfig> = { ...this.config };
    delete safeConfig.apiKey;
    return safeConfig as Omit<GuildPassClientConfig, 'apiKey'>;
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

  private async withCache<T>(key: string, fn: () => Promise<T>): Promise<T> {
    if (this.cache) {
      try {
        const cached = await this.cache.get<T>(key);
        if (cached !== null) return cached;
      } catch (error: any) {
        this.handleCacheError('get', error, key);
      }
    }

    return this.coalesce(key, async () => {
      const result = await fn();
      if (this.cache) {
        try {
          await this.cache.set(key, result, this.cacheTtl);
        } catch (error: any) {
          this.handleCacheError('set', error, key);
        }
      }
      return result;
    });
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
    return Object.create(raw, {
      checkAccess: {
        value: async (params: AccessCheckParams): Promise<AccessCheckResult> => {
          const wallet = normaliseAddress(params.walletAddress);
          const key = buildCacheKey('access', 'checkAccess', params.guildId, params.resourceId, wallet);
          return this.withCache(key, () => raw.checkAccess(params));
        },
      },
      checkAccessBatch: {
        value: async (
          items: AccessCheckParams[],
          options?: AccessCheckBatchOptions,
        ): Promise<AccessCheckBatchResult[]> => raw.checkAccessBatch(items, options),
      },
      checkRoleAccess: {
        value: async (params: RoleAccessCheckParams): Promise<boolean> => {
          const wallet = normaliseAddress(params.walletAddress);
          const key = buildCacheKey('access', 'checkRoleAccess', params.guildId, params.roleId, wallet);
          return this.withCache(key, () => raw.checkRoleAccess(params));
        },
      },
    });
  }

  private buildCachedMembershipService(raw: MembershipService): MembershipService {
    return Object.create(raw, {
      getMembership: {
        value: async (params: MembershipParams): Promise<Membership> => {
          const wallet = normaliseAddress(params.walletAddress);
          const key = buildCacheKey('membership', 'getMembership', params.guildId, wallet);
          return this.withCache(key, () => raw.getMembership(params));
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

  private buildCachedRolesService(raw: RolesService): RolesService {
    return Object.create(raw, {
      getRoles: {
        value: async (params: GetRolesParams): Promise<GuildRole[]> => {
          const key = buildCacheKey('roles', 'getRoles', params.guildId);
          return this.withCache(key, () => raw.getRoles(params));
        },
      },
      getUserRoles: {
        value: async (params: GetUserRolesParams): Promise<GuildRole[]> => {
          const wallet = normaliseAddress(params.walletAddress);
          const key = buildCacheKey('roles', 'getUserRoles', params.guildId, wallet);
          return this.withCache(key, () => raw.getUserRoles(params));
        },
      },
      hasRole: {
        value: async (params: HasRoleParams): Promise<boolean> => {
          const wallet = normaliseAddress(params.walletAddress);
          const key = buildCacheKey('access', 'checkRoleAccess', params.guildId, params.roleId, wallet);
          return this.withCache(key, () => raw.hasRole(params));
        },
      },
    });
  }

  private buildCachedGuildsService(raw: GuildsService): GuildsService {
    return Object.create(raw, {
      getGuild: {
        value: async (params: GetGuildParams): Promise<Guild> => {
          const key = buildCacheKey('guilds', 'getGuild', params.guildId);
          return this.withCache(key, () => raw.getGuild(params));
        },
      },
      getGuildConfig: {
        value: async (params: GetGuildParams): Promise<GuildConfig> => {
          const key = buildCacheKey('guilds', 'getGuildConfig', params.guildId);
          return this.withCache(key, () => raw.getGuildConfig(params));
        },
      },
    });
  }
  // GuildPass SDK: End of logic containment structure block.
}
