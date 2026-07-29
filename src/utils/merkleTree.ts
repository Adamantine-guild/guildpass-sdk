import { keccak256 } from 'ethers';

export interface MerkleProof {
  path: string[];
  index: number;
  leaf: string;
}

export class MerkleTree {
  private leaves: string[];
  private tree: string[][];
  private root: string;

  constructor(leaves: string[]) {
    this.leaves = leaves.map((leaf) => MerkleTree.hashLeaf(leaf));
    this.tree = [this.leaves];
    this.buildTree();
    this.root = this.tree[this.tree.length - 1][0];
  }

  private buildTree(): void {
    let currentLevel = this.leaves;
    while (currentLevel.length > 1) {
      const nextLevel: string[] = [];
      for (let i = 0; i < currentLevel.length; i += 2) {
        const left = currentLevel[i];
        const right = i + 1 < currentLevel.length ? currentLevel[i + 1] : left;
        nextLevel.push(MerkleTree.hashPair(left, right));
      }
      this.tree.push(nextLevel);
      currentLevel = nextLevel;
    }
  }

  getRoot(): string {
    return this.root;
  }

  getTree(): string[][] {
    return this.tree;
  }

  getLeaves(): string[] {
    return this.leaves;
  }

  getProof(leaf: string): string[] {
    const leafHash = MerkleTree.hashLeaf(leaf);
    const proof: string[] = [];
    let index = this.leaves.indexOf(leafHash);

    if (index === -1) {
      throw new Error('Leaf not found in tree');
    }

    for (let level = 0; level < this.tree.length - 1; level++) {
      const currentLevel = this.tree[level];
      const isRight = index % 2 === 1;
      const siblingIndex = isRight ? index - 1 : index + 1;

      if (siblingIndex < currentLevel.length) {
        proof.push(currentLevel[siblingIndex]);
      } else {
        proof.push(currentLevel[index]);
      }

      index = Math.floor(index / 2);
    }

    return proof;
  }

  static verifyProof(
    proof: string[],
    leaf: string,
    root: string
  ): boolean {
    let computedHash = MerkleTree.hashLeaf(leaf);

    for (const sibling of proof) {
      computedHash = MerkleTree.hashPair(computedHash, sibling);
    }

    return computedHash === root;
  }

  static hashLeaf(leaf: string): string {
    return keccak256(Buffer.from(leaf));
  }

  static hashPair(left: string, right: string): string {
    const [a, b] = left <= right ? [left, right] : [right, left];
    return keccak256(Buffer.from(a + b));
  }

  static buildFromAddresses(addresses: string[]): {
    root: string;
    tree: MerkleTree;
    getProof: (address: string) => string[];
  } {
    const tree = new MerkleTree(addresses);
    return {
      root: tree.getRoot(),
      tree,
      getProof: (address: string) => tree.getProof(address),
    };
  }
}

export function buildWhitelistTree(addresses: string[]): {
  root: string;
  tree: MerkleTree;
  getProof: (address: string) => string[];
} {
  return MerkleTree.buildFromAddresses(addresses);
}
