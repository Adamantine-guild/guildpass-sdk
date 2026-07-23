import { MerkleTree } from '../utils/merkleTree';
import { resolveCurrentRoot, WhitelistRoot } from '../contracts/contractHelpers';

export interface WhitelistValidationOptions {
  guildId: string;
  rootSource?: 'onchain' | 'api';
  contractAddress?: string;
  provider?: any;
  apiBaseUrl?: string;
}

export async function validateWhitelistRequirement(
  address: string,
  proof: string[],
  options: WhitelistValidationOptions
): Promise<boolean> {
  const currentRoot = await resolveCurrentRoot(options.guildId, {
    rootSource: options.rootSource,
    contractAddress: options.contractAddress,
    provider: options.provider,
    apiBaseUrl: options.apiBaseUrl,
  });

  if (!currentRoot.isActive) {
    return false;
  }

  return MerkleTree.verifyProof(proof, address, currentRoot.root);
}

export async function validateWhitelistRequirementWithVersion(
  address: string,
  proof: string[],
  version: number,
  options: WhitelistValidationOptions
): Promise<boolean> {
  const root = await resolveSpecificRootVersion(options.guildId, version, options);
  
  if (!root.isActive) {
    return false;
  }

  return MerkleTree.verifyProof(proof, address, root.root);
}

async function resolveSpecificRootVersion(
  guildId: string,
  version: number,
  options: WhitelistValidationOptions
): Promise<WhitelistRoot> {
  // Placeholder - would need API/contract support
  return resolveCurrentRoot(guildId, options);
}
