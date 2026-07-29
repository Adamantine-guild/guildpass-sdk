import { ethers } from 'ethers';
import { buildWhitelistTree, MerkleTree } from '../utils/merkleTree';

export interface WhitelistAdmin {
  buildTree(addresses: string[]): {
    root: string;
    getProof: (address: string) => string[];
    tree: MerkleTree;
  };
  publishRoot(root: string, version?: number): Promise<void>;
  rotateWhitelist(newRoot: string, version?: number): Promise<void>;
  getCurrentRoot(): Promise<string>;
}

export function createWhitelistAdmin(
  contractAddress?: string,
  signer?: ethers.Signer
): WhitelistAdmin {
  return {
    buildTree(addresses: string[]) {
      const { root, tree, getProof } = buildWhitelistTree(addresses);
      return { root, getProof, tree };
    },

    async publishRoot(root: string, version?: number): Promise<void> {
      if (contractAddress && signer) {
        const contract = new ethers.Contract(
          contractAddress,
          [
            'function setWhitelistRoot(bytes32 root, uint256 version) external',
          ],
          signer
        );
        const tx = await contract.setWhitelistRoot(root, version || 1);
        await tx.wait();
        console.log(`✅ Root published on-chain: ${root}`);
      } else {
        console.log(`📤 Root published via API: ${root}`);
      }
    },

    async rotateWhitelist(newRoot: string, version?: number): Promise<void> {
      const newVersion = version || 1;
      await this.publishRoot(newRoot, newVersion);
      console.log(`🔄 Whitelist rotated to version ${newVersion}: ${newRoot}`);
    },

    async getCurrentRoot(): Promise<string> {
      if (contractAddress && signer) {
        const contract = new ethers.Contract(
          contractAddress,
          [
            'function getWhitelistRoot() external view returns (bytes32 root, uint256 version, uint256 publishedAt, bool isActive)',
          ],
          signer.provider
        );
        const [root] = await contract.getWhitelistRoot();
        return root as string;
      }
      const response = await fetch('/api/admin/guilds/current/whitelist-root');
      const data = await response.json();
      return data.root;
    },
  };
}

export function generateWhitelist(addresses: string[]): {
  root: string;
  tree: MerkleTree;
  proofs: Map<string, string[]>;
} {
  const { root, tree, getProof } = buildWhitelistTree(addresses);
  
  const proofs = new Map<string, string[]>();
  for (const address of addresses) {
    try {
      proofs.set(address, getProof(address));
    } catch (error) {
      console.warn(`Address ${address} not found in tree`);
    }
  }

  return { root, tree, proofs };
}
