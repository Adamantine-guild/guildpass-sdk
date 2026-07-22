import { GuildPassClient } from '../client/GuildPassClient';
import { AccessService } from '../access/access.service';
import { GuildsService } from '../guilds/guilds.service';
import { MembershipService } from '../membership/membership.service';
import { RolesService } from '../roles/roles.service';
import { ContractClient } from '../contracts/contractClient';
import { DEFAULT_ACCESS_RESULT, DEFAULT_GUILD, DEFAULT_GUILD_CONFIG, DEFAULT_ROLE, DEFAULT_MEMBERSHIP } from './fixtures';
import type { GuildPassClientConfig } from '../config/sdkConfig';

/** 
 * Utility type to extract only the public properties and methods of a class.
 * This is crucial to allow structurally mocking a class with private fields.
 */
export type Public<T> = { [K in keyof T]: T[K] };

/** 
 * Allows users to provide overrides for any service method.
 */
export type MockServiceOverrides<T> = {
  [K in keyof Public<T>]?: T[K] extends (...args: any[]) => any
    ? (...args: Parameters<T[K]>) => ReturnType<T[K]> | Awaited<ReturnType<T[K]>>
    : never;
};

export type MockClientOverrides = {
  access?: MockServiceOverrides<AccessService>;
  guilds?: MockServiceOverrides<GuildsService>;
  membership?: MockServiceOverrides<MembershipService>;
  roles?: MockServiceOverrides<RolesService>;
  contracts?: MockServiceOverrides<ContractClient>;
  getConfig?: () => Omit<GuildPassClientConfig, 'apiKey'>;
};

/**
 * Creates a mocked instance of GuildPassClient for testing purposes.
 * It strictly adheres to the public interface of the real GuildPassClient.
 * 
 * @param overrides Optional custom implementations for specific service methods.
 * @returns A fully typed Mock GuildPassClient.
 */
export function createMockGuildPassClient(overrides?: MockClientOverrides): GuildPassClient {
  const mockAccess = {
    checkAccess: overrides?.access?.checkAccess ?? (async () => DEFAULT_ACCESS_RESULT as any),
    checkAccessVerified: overrides?.access?.checkAccessVerified ?? (async () => ({ apiResult: DEFAULT_ACCESS_RESULT, onChainResult: true, consistent: true } as any)),
    checkAccessBatch: overrides?.access?.checkAccessBatch ?? (async () => [] as any),
  } as Public<AccessService>;

  const mockGuilds = {
    getGuild: overrides?.guilds?.getGuild ?? (async () => DEFAULT_GUILD as any),
    getGuildConfig: overrides?.guilds?.getGuildConfig ?? (async () => DEFAULT_GUILD_CONFIG as any),
  } as Public<GuildsService>;

  const mockMembership = {
    getMembership: overrides?.membership?.getMembership ?? (async () => DEFAULT_MEMBERSHIP as any),
  } as Public<MembershipService>;

  const mockRoles = {
    getRoles: overrides?.roles?.getRoles ?? (async () => ({ items: [DEFAULT_ROLE], cursor: undefined } as any)),
    getUserRoles: overrides?.roles?.getUserRoles ?? (async () => ({ items: [DEFAULT_ROLE], cursor: undefined } as any)),
    hasRole: overrides?.roles?.hasRole ?? (async () => true as any),
  } as Public<RolesService>;

  const mockContracts = {
    getTokenBalance: overrides?.contracts?.getTokenBalance ?? (async () => ({ balance: '1000000000000000000', decimals: 18, formatted: '1.0' } as any)),
    getERC20Balance: overrides?.contracts?.getERC20Balance ?? (async () => ({ balance: '1000000000000000000', decimals: 18, formatted: '1.0' } as any)),
    getERC721TokenBalance: overrides?.contracts?.getERC721TokenBalance ?? (async () => '1' as any),
    getERC721OwnerOf: overrides?.contracts?.getERC721OwnerOf ?? (async () => '0x1234567890123456789012345678901234567890' as any),
    getERC1155Balance: overrides?.contracts?.getERC1155Balance ?? (async () => '1' as any),
    validateRoleRequirement: overrides?.contracts?.validateRoleRequirement ?? (async () => true as any),
    getGuildOwner: overrides?.contracts?.getGuildOwner ?? (async () => '0x1234567890123456789012345678901234567890' as any),
    getTokenBalancesBatch: overrides?.contracts?.getTokenBalancesBatch ?? (async () => [] as any),
    getGuildOwnersBatch: overrides?.contracts?.getGuildOwnersBatch ?? (async () => [] as any),
    readContract: overrides?.contracts?.readContract ?? (async () => '0x' as any),
  } as Public<ContractClient>;

  // Construct the object implementing the public interface of GuildPassClient
  const mockClientPublic: Public<GuildPassClient> = {
    access: mockAccess as AccessService,
    guilds: mockGuilds as GuildsService,
    membership: mockMembership as MembershipService,
    roles: mockRoles as RolesService,
    contracts: mockContracts as ContractClient,
    invalidateGuildCache: async () => {},
    invalidateWalletCache: async () => {},
    clearCache: async () => {},
    getConfig: overrides?.getConfig ?? (() => ({ apiUrl: 'https://mock.guildpass.xyz' })),
  };

  // Cast safely. TypeScript guarantees that `mockClientPublic` shapes up to the public interface.
  return mockClientPublic as unknown as GuildPassClient;
}
