# Merkle-Proof Whitelist Protocol: Root Publishing, Rotation, and Lifecycle Management

## Status: Draft

## Authors
- peter-j23
- @Lakes41

## Summary

This RFC defines a complete protocol for managing Merkle-tree-based whitelists with secure root rotation and SDK-side lifecycle management.

## Background

Issue #35 implemented client-side verification of a Merkle proof against a given root. However, it deliberately scoped out the full lifecycle:

1. How a guild admin generates the tree
2. How the root is published/updated on-chain
3. How root rotation works when the allowlist changes
4. How the SDK handles in-flight proofs against old roots after rotation

## Problem Statement

Without root-rotation-aware lifecycle management:

- Guild admins have no SDK-supported way to safely update an allowlist
- Security risk: SDK could accept proofs against a root that's been intentionally rotated out
- A banned member's still-valid proof against the old root could be silently accepted

## Protocol Design

### 1. Root Authority

The root MUST be resolved from an authoritative source, NOT from the caller.

**Authoritative Sources:**

| Source | Implementation | Use Case |
|--------|----------------|----------|
| On-Chain Storage | `contracts.ethCall` against dedicated storage slot/getter | For on-chain verification |
| API Endpoint | `GET /guilds/{id}/whitelist-root` | For off-chain verification |

**Decision:** Both methods MUST be supported, with on-chain being the primary source.

### 2. Root Resolution Flow

interface WhitelistAdmin {
  // Generate a new tree from addresses
  buildWhitelistTree(addresses: string[]): {
    root: string;
    tree: MerkleTree;
    getProof(address: string): string[];
  };
  
  // Publish a new root
  publishRoot(root: string, version?: number): Promise<void>;
  
  // Rotate to a new root
  rotateWhitelist(newRoot: string): Promise<void>;
}
/**
 * Validates a whitelist requirement with root resolution
 * 
 * @param address - The address to verify
 * @param proof - The Merkle proof
 * @param guildId - The guild ID
 * @param options - Optional configuration
 * @returns Whether the address is whitelisted
 */
async function validateWhitelistRequirement(
  address: string,
  proof: string[],
  guildId: string,
  options?: {
    rootSource?: 'onchain' | 'api';
    version?: number;
  }
): Promise<boolean> {
  // 1. Resolve the current root (not from caller)
  const currentRoot = await resolveCurrentRoot(guildId, options);
  
  // 2. Verify the proof against the current root
  return verifyProof(proof, address, currentRoot);
}
/**
 * Resolves the current whitelist root from the authoritative source
 */
async function resolveCurrentRoot(
  guildId: string,
  options?: {
    rootSource?: 'onchain' | 'api';
    version?: number;
  }
): Promise<{ root: string; version: number }> {
  if (options?.rootSource === 'onchain') {
    return resolveRootOnChain(guildId);
  }
  // Default: API endpoint
  return resolveRootFromAPI(guildId);
}
cat > src/contracts/contractHelpers.ts << 'EOF'
import { ethers } from 'ethers';
import { MerkleTree } from '../utils/merkleTree';

/**
 * Whitelist root response
 */
export interface WhitelistRoot {
  root: string;
  version: number;
  publishedAt: number;
  isActive: boolean;
}

/**
 * Whitelist contract interface
 */
export interface WhitelistContract {
  getWhitelistRoot(): Promise<WhitelistRoot>;
  setWhitelistRoot(root: string, version?: number): Promise<void>;
  rotateWhitelist(newRoot: string): Promise<void>;
  getRootVersion(version: number): Promise<WhitelistRoot>;
  getCurrentVersion(): Promise<number>;
}

/**
 * Resolve the current whitelist root from on-chain
 */
export async function resolveRootOnChain(
  contractAddress: string,
  provider: ethers.providers.Provider
): Promise<WhitelistRoot> {
  // Create a contract instance
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

/**
 * Resolve the current whitelist root from API
 */
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

/**
 * Resolve the current root from the authoritative source
 */
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

  // Default: API
  return resolveRootFromAPI(guildId, options?.apiBaseUrl);
}
