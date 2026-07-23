import { ethers } from 'ethers';
import { GuildPassConfigError, GuildPassNetworkError, GuildPassApiError } from '../errors/errorTypes';
import { GuildPassErrorCode } from '../errors/errorCodes';

export interface WhitelistRoot {
  root: string;
  version: number;
  publishedAt: number;
  isActive: boolean;
}

export async function resolveRootOnChain(
  contractAddress: string,
  provider: ethers.providers.Provider
): Promise<WhitelistRoot> {
  const contract = new ethers.Contract(
    contractAddress,
    [
      'function getWhitelistRoot() external view returns (bytes32 root, uint256 version, uint256 publishedAt, bool isActive)',
    ],
    provider
  );

  try {
    const [root, version, publishedAt, isActive] = await contract.getWhitelistRoot();
    return {
      root: root as string,
      version: version.toNumber(),
      publishedAt: publishedAt.toNumber(),
      isActive: isActive as boolean,
    };
  } catch (error) {
    throw new GuildPassNetworkError(`Failed to resolve root from contract: ${error.message}`, GuildPassErrorCode.HTTP_ERROR, error);
  }
}

export async function resolveRootFromAPI(
  guildId: string,
  apiBaseUrl: string = 'https://api.guildpass.com'
): Promise<WhitelistRoot> {
  const response = await fetch(`${apiBaseUrl}/guilds/${guildId}/whitelist-root`);

  if (!response.ok) {
    throw GuildPassApiError.fromHttpError(response.status, response.statusText);
  }

  const data = await response.json();
  return {
    root: data.root,
    version: data.version,
    publishedAt: data.publishedAt,
    isActive: data.isActive,
  };
}

export async function resolveCurrentRoot(
  guildId: string,
  options?: {
    rootSource?: 'onchain' | 'api';
    contractAddress?: string;
    provider?: ethers.providers.Provider;
    apiBaseUrl?: string;
  }
): Promise<WhitelistRoot> {
  const source = options?.rootSource || 'api';

  if (source === 'onchain') {
    if (!options?.contractAddress || !options?.provider) {
      throw new GuildPassConfigError('Contract address and provider required for on-chain resolution', GuildPassErrorCode.INVALID_CONFIG);
    }
    return resolveRootOnChain(options.contractAddress, options.provider);
  }

  return resolveRootFromAPI(guildId, options?.apiBaseUrl);
}
