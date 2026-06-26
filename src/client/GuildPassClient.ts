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
// GuildPass SDK: Import external module dependencies.
import { RolesService } from '../roles/roles.service';
import { CacheAdapter } from '../cache/cache.types';
import type { AccessCheckParams, AccessCheckResult, RoleAccessCheckParams, AccessCheckBatchOptions, AccessCheckBatchResult } from '../access/access.types';
import type { MembershipParams, Membership } from '../membership/membership.types';
import type { GetRolesParams, GetUserRolesParams, GuildRole } from '../roles/roles.types';
import type { GetGuildParams, Guild, GuildConfig } from '../guilds/guilds.types';

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
      },
    );

    const validateResponses = this.config.validateResponses ?? false;

    const rawAccess = new AccessService(this.http, validateResponses);
    const rawMembership = new MembershipService(this.http, validateResponses);
    const rawRoles = new RolesService(this.http, validateResponses);
    const rawGuilds = new GuildsService(this.http, validateResponses);

    this.access = this.cache ? this.buildCachedAccessService(rawAccess) : rawAccess;
    this.membership = this.cache ? this.buildCachedMembershipService(rawMembership) : rawMembership;
    this.roles = this.cache ? this.buildCachedRolesService(rawRoles) : rawRoles;
    this.guilds = this.cache ? this.buildCachedGuildsService(rawGuilds) : rawGuilds;
    this.contracts = new ContractClient(this.config);
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
      `access:checkAccess:${guildId}:`,
      `access:checkRoleAccess:${guildId}:`,
      `membership:getMembership:${guildId}:`,
      `roles:getRoles:${guildId}`,
      `roles:getUserRoles:${guildId}:`,
      `guilds:getGuild:${guildId}`,
      `guilds:getGuildConfig:${guildId}`,
    ];
    // Delete all keys matching any prefix. The InMemoryCacheAdapter and other
    // adapters that support key enumeration should scan their internal store.
    // For adapters without key-scanning, we fall back to clear().
    const adapter = this.cache as CacheAdapter & {
      keys?: () => Promise<string[]> | string[];
    };
    if (typeof adapter.keys === 'function') {
      const allKeys = await adapter.keys();
      const matchingKeys = allKeys.filter((k) => prefixes.some((p) => k.startsWith(p)));
      await Promise.all(matchingKeys.map((k) => this.cache!.delete(k)));
    } else {
      // Fallback: clear entire cache if prefix scanning is unsupported
      await this.cache.clear();
    }
  }

  /**
   * Removes all cache entries scoped to a specific wallet address.
   *
   * Useful when a wallet's on-chain state has changed (e.g., token transfer).
   */
  public async invalidateWalletCache(_walletAddress: string): Promise<void> {
    if (!this.cache) return;
    // We clear the whole cache since per-address key enumeration requires
    // knowing all guilds. Use a custom adapter with key-scanning support if
    // finer granularity is needed.
    await this.cache.clear();
  }

  /** Clears the entire cache. */
  public async clearCache(): Promise<void> {
    await this.cache?.clear();
  }

  // ---------------------------------------------------------------------------
  // Public config accessor
  // ---------------------------------------------------------------------------

  /**
   * Returns the current SDK configuration.
   */
  // GuildPass SDK: Class member structure property or constructor.
  public getConfig(): GuildPassClientConfig {
    // GuildPass SDK: Send back computed results to the caller.
    return { ...this.config };
    // GuildPass SDK: End of logic containment structure block.
  }

  // ---------------------------------------------------------------------------
  // Internal cache-wrapping factories
  // ---------------------------------------------------------------------------

  private async withCache<T>(key: string, fn: () => Promise<T>): Promise<T> {
    try {
      const cached = await this.cache!.get<T>(key);
      if (cached !== null) return cached;
    } catch {
      // Cache read failure — fall through to fetch from network
    }
    const result = await fn();
    try {
      await this.cache!.set(key, result, this.cacheTtl);
    } catch {
      // Cache write failure — result is still valid, swallow error
    }
    return result;
  }

  private buildCachedAccessService(raw: AccessService): AccessService {
    return Object.create(raw, {
      checkAccess: {
        value: async (params: AccessCheckParams): Promise<AccessCheckResult> => {
          const key = `access:checkAccess:${params.guildId}:${params.resourceId}:${params.walletAddress}`;
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
          const key = `access:checkRoleAccess:${params.guildId}:${params.roleId}:${params.walletAddress}`;
          return this.withCache(key, () => raw.checkRoleAccess(params));
        },
      },
    });
  }

  private buildCachedMembershipService(raw: MembershipService): MembershipService {
    return Object.create(raw, {
      getMembership: {
        value: async (params: MembershipParams): Promise<Membership> => {
          const key = `membership:getMembership:${params.guildId}:${params.walletAddress}`;
          return this.withCache(key, () => raw.getMembership(params));
        },
      },
      isMember: {
        value: async (params: MembershipParams): Promise<boolean> => {
          const membership = await this.membership.getMembership(params);
          return membership.isActive;
        },
      },
    });
  }

  private buildCachedRolesService(raw: RolesService): RolesService {
    return Object.create(raw, {
      getRoles: {
        value: async (params: GetRolesParams): Promise<GuildRole[]> => {
          const key = `roles:getRoles:${params.guildId}`;
          return this.withCache(key, () => raw.getRoles(params));
        },
      },
      getUserRoles: {
        value: async (params: GetUserRolesParams): Promise<GuildRole[]> => {
          const key = `roles:getUserRoles:${params.guildId}:${params.walletAddress}`;
          return this.withCache(key, () => raw.getUserRoles(params));
        },
      },
    });
  }

  private buildCachedGuildsService(raw: GuildsService): GuildsService {
    return Object.create(raw, {
      getGuild: {
        value: async (params: GetGuildParams): Promise<Guild> => {
          const key = `guilds:getGuild:${params.guildId}`;
          return this.withCache(key, () => raw.getGuild(params));
        },
      },
      getGuildConfig: {
        value: async (params: GetGuildParams): Promise<GuildConfig> => {
          const key = `guilds:getGuildConfig:${params.guildId}`;
          return this.withCache(key, () => raw.getGuildConfig(params));
        },
      },
    });
  }
  // GuildPass SDK: End of logic containment structure block.
}
