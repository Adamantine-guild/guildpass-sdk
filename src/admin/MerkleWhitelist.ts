import { keccak256Bytes, hexToBytes } from '../crypto/secp256k1';

export class MerkleWhitelist {
  private leaves: Uint8Array[];
  private tree: Uint8Array[][];
  private root: Uint8Array;

  constructor(addresses: string[]) {
    if (!addresses || addresses.length === 0) {
      throw new Error('Cannot build tree from empty addresses array');
    }
    this.leaves = addresses.map((addr) => MerkleWhitelist.hashLeaf(addr));
    this.tree = [this.leaves];
    this.buildTree();
    this.root = this.tree[this.tree.length - 1][0];
  }

  private buildTree(): void {
    let currentLevel = this.leaves;
    while (currentLevel.length > 1) {
      const nextLevel: Uint8Array[] = [];
      for (let i = 0; i < currentLevel.length; i += 2) {
        const left = currentLevel[i];
        // Duplicate the last node if the level has an odd number of elements
        const right = i + 1 < currentLevel.length ? currentLevel[i + 1] : left;
        nextLevel.push(MerkleWhitelist.hashPair(left, right));
      }
      this.tree.push(nextLevel);
      currentLevel = nextLevel;
    }
  }

  getRoot(): string {
    return MerkleWhitelist.bytesToHex(this.root);
  }

  getProof(address: string): string[] {
    const leafHashHex = MerkleWhitelist.bytesToHex(MerkleWhitelist.hashLeaf(address));
    const proof: Uint8Array[] = [];
    
    // Find index of the leaf
    let index = -1;
    for (let i = 0; i < this.leaves.length; i++) {
      if (MerkleWhitelist.bytesToHex(this.leaves[i]) === leafHashHex) {
        index = i;
        break;
      }
    }

    if (index === -1) {
      throw new Error('Address not found in tree');
    }

    for (let level = 0; level < this.tree.length - 1; level++) {
      const currentLevel = this.tree[level];
      const isRightNode = index % 2 === 1;
      const siblingIndex = isRightNode ? index - 1 : index + 1;

      if (siblingIndex < currentLevel.length) {
        proof.push(currentLevel[siblingIndex]);
      } else {
        // If there's no right sibling, the node was duplicated
        proof.push(currentLevel[index]);
      }

      index = Math.floor(index / 2);
    }

    return proof.map(p => MerkleWhitelist.bytesToHex(p));
  }

  static verifyProof(proof: string[], address: string, root: string): boolean {
    if (proof.length === 0 && this.bytesToHex(this.hashLeaf(address)) !== root) {
      return false; // Empty proof logic for single leaf tree edge case
    }
    
    let computedHash = MerkleWhitelist.hashLeaf(address);
    const rootBytes = MerkleWhitelist.hexToBytesSafe(root);

    for (const sibling of proof) {
      const siblingBytes = MerkleWhitelist.hexToBytesSafe(sibling);
      computedHash = MerkleWhitelist.hashPair(computedHash, siblingBytes);
    }

    return MerkleWhitelist.compareBytes(computedHash, rootBytes) === 0;
  }

  /**
   * Hashes a leaf address according to OpenZeppelin standard:
   * keccak256(abi.encodePacked(address))
   */
  static hashLeaf(address: string): Uint8Array {
    let cleanAddress = address.toLowerCase();
    if (cleanAddress.startsWith('0x')) {
      cleanAddress = cleanAddress.slice(2);
    }
    // Pad to 20 bytes (40 hex chars) if short, though usually they are exactly 40
    cleanAddress = cleanAddress.padStart(40, '0');
    if (cleanAddress.length !== 40) {
      throw new Error('Invalid address length');
    }
    const addressBytes = hexToBytes(cleanAddress);
    return keccak256Bytes(addressBytes);
  }

  /**
   * Hashes a pair of hashes according to OpenZeppelin standard:
   * lexicographically sort the two hashes, concatenate them, then keccak256.
   */
  static hashPair(a: Uint8Array, b: Uint8Array): Uint8Array {
    const [left, right] = MerkleWhitelist.compareBytes(a, b) <= 0 ? [a, b] : [b, a];
    const combined = new Uint8Array(left.length + right.length);
    combined.set(left, 0);
    combined.set(right, left.length);
    return keccak256Bytes(combined);
  }

  private static compareBytes(a: Uint8Array, b: Uint8Array): number {
    const len = Math.min(a.length, b.length);
    for (let i = 0; i < len; i++) {
      if (a[i] !== b[i]) {
        return a[i] - b[i];
      }
    }
    return a.length - b.length;
  }

  static bytesToHex(bytes: Uint8Array): string {
    let hex = '0x';
    for (let i = 0; i < bytes.length; i++) {
      hex += bytes[i].toString(16).padStart(2, '0');
    }
    return hex;
  }

  static hexToBytesSafe(hex: string): Uint8Array {
    let clean = hex.startsWith('0x') ? hex.slice(2) : hex;
    if (clean.length % 2 !== 0) {
      clean = '0' + clean;
    }
    return hexToBytes(clean);
  }

  static buildFromAddresses(addresses: string[]): {
    root: string;
    tree: MerkleWhitelist;
    getProof: (address: string) => string[];
  } {
    const tree = new MerkleWhitelist(addresses);
    return {
      root: tree.getRoot(),
      tree,
      getProof: (address: string) => tree.getProof(address),
    };
  }
}
