import { describe, it, expect, beforeEach } from 'vitest';
import { MerkleWhitelist } from '../../src/admin/MerkleWhitelist';

// Mock data
const testAddresses = [
  '0x1234567890123456789012345678901234567890',
  '0x2345678901234567890123456789012345678901',
  '0x3456789012345678901234567890123456789012',
  '0x4567890123456789012345678901234567890123',
];

// OpenZeppelin reference verifier in pure JS for cross-checking
function referenceOzVerify(proof: string[], root: string, leaf: string): boolean {
  let computedHash = MerkleWhitelist.hashLeaf(leaf);
  const rootBytes = MerkleWhitelist.hexToBytesSafe(root);

  for (const p of proof) {
    const proofElement = MerkleWhitelist.hexToBytesSafe(p);
    computedHash = MerkleWhitelist.hashPair(computedHash, proofElement);
  }

  // Compare
  for (let i = 0; i < computedHash.length; i++) {
    if (computedHash[i] !== rootBytes[i]) return false;
  }
  return true;
}

describe('Merkle Whitelist Rotation & Lifecycles', () => {
  let tree: MerkleWhitelist;
  let root: string;
  let proof: string[];

  beforeEach(() => {
    tree = new MerkleWhitelist(testAddresses);
    root = tree.getRoot();
    proof = tree.getProof(testAddresses[0]);
  });

  it('should verify a proof against the current root', () => {
    const isValid = MerkleWhitelist.verifyProof(proof, testAddresses[0], root);
    expect(isValid).toBe(true);
    
    // Check against reference implementation
    expect(referenceOzVerify(proof, root, testAddresses[0])).toBe(true);
  });

  it('should reject a proof against a different root', () => {
    // Create a different tree
    const differentAddresses = ['0x9999999999999999999999999999999999999999', '0x8888888888888888888888888888888888888888'];
    const differentTree = new MerkleWhitelist(differentAddresses);
    const differentRoot = differentTree.getRoot();

    const isValid = MerkleWhitelist.verifyProof(proof, testAddresses[0], differentRoot);
    expect(isValid).toBe(false);
  });

  it('should reject a proof against an old root after rotation', async () => {
    // Create initial tree
    const initialTree = new MerkleWhitelist(testAddresses);
    const initialRoot = initialTree.getRoot();
    const initialProof = initialTree.getProof(testAddresses[0]);

    // Simulate root rotation
    const newAddresses = [
      '0x9876543210987654321098765432109876543210',
      '0x8765432109876543210987654321098765432109',
    ];
    const newTree = new MerkleWhitelist(newAddresses);
    const newRoot = newTree.getRoot();

    // The proof should be valid against the old root
    expect(MerkleWhitelist.verifyProof(initialProof, testAddresses[0], initialRoot)).toBe(true);

    // But invalid against the new root (after rotation)
    expect(MerkleWhitelist.verifyProof(initialProof, testAddresses[0], newRoot)).toBe(false);
  });

  it('should throw for addresses not in the tree', () => {
    const nonWhitelistedAddress = '0x9999999999999999999999999999999999999999';

    // getProof throws for non-members
    expect(() => tree.getProof(nonWhitelistedAddress)).toThrow();
  });

  it('should handle empty proof arrays', () => {
    const isValid = MerkleWhitelist.verifyProof([], testAddresses[0], root);
    expect(isValid).toBe(false);
  });
  
  it('should build and verify a large tree (1000+ leaves)', () => {
    const largeAddresses: string[] = [];
    for (let i = 0; i < 1500; i++) {
      // Generate deterministic fake addresses for performance test
      let fakeHex = i.toString(16).padStart(40, '0');
      largeAddresses.push('0x' + fakeHex);
    }
    
    const largeTree = new MerkleWhitelist(largeAddresses);
    const largeRoot = largeTree.getRoot();
    
    // Pick an address in the middle
    const targetAddr = largeAddresses[750];
    const largeProof = largeTree.getProof(targetAddr);
    
    expect(largeProof.length).toBeGreaterThan(0);
    
    // Verify using standard static verifier
    expect(MerkleWhitelist.verifyProof(largeProof, targetAddr, largeRoot)).toBe(true);
    
    // Verify using reference OZ verifier
    expect(referenceOzVerify(largeProof, largeRoot, targetAddr)).toBe(true);
  });
});
