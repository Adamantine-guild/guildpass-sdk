import { ethers } from 'ethers';

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
    throw new Error(`Failed to resolve root from contract: ${error.message}`);
  }
}

export async function resolveRootFromAPI(
  guildId: string,
  apiBaseUrl: string = 'https://api.guildpass.com'
): Promise<WhitelistRoot> {
  const response = await fetch(`${apiBaseUrl}/guilds/${guildId}/whitelist-root`);

  if (!response.ok) {
    throw new Error(`Failed to resolve root from API: ${response.statusText}`);
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
      throw new Error('Contract address and provider required for on-chain resolution');
    }
    return resolveRootOnChain(options.contractAddress, options.provider);
  }

  return resolveRootFromAPI(guildId, options?.apiBaseUrl);
}
