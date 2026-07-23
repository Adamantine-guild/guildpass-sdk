import { describe, it, expect, beforeEach } from 'vitest';
import { MerkleTree } from '../../src/utils/merkleTree';
import { validateWhitelistRequirement } from '../../src/validators/whitelistValidator';

// Mock data
const testAddresses = [
  '0x1234567890123456789012345678901234567890',
  '0x2345678901234567890123456789012345678901',
  '0x3456789012345678901234567890123456789012',
  '0x4567890123456789012345678901234567890123',
];

const mockGuildId = 'guild_test_123';

describe('Merkle Whitelist Rotation', () => {
  let tree: MerkleTree;
  let root: string;
  let proof: string[];

  beforeEach(() => {
    tree = new MerkleTree(testAddresses);
    root = tree.getRoot();
    proof = tree.getProof(testAddresses[0]);
  });

  it('should verify a proof against the current root', () => {
    const isValid = MerkleTree.verifyProof(proof, testAddresses[0], root);
    expect(isValid).toBe(true);
  });

  it('should reject a proof against a different root', () => {
    // Create a different tree
    const differentAddresses = ['0x999...', '0x888...'];
    const differentTree = new MerkleTree(differentAddresses);
    const differentRoot = differentTree.getRoot();

    const isValid = MerkleTree.verifyProof(proof, testAddresses[0], differentRoot);
    expect(isValid).toBe(false);
  });

  it('should reject a proof against an old root after rotation', async () => {
    // Create initial tree
    const initialTree = new MerkleTree(testAddresses);
    const initialRoot = initialTree.getRoot();
    const initialProof = initialTree.getProof(testAddresses[0]);

    // Simulate root rotation
    const newAddresses = [
      '0x9876543210...',
      '0x8765432109...',
    ];
    const newTree = new MerkleTree(newAddresses);
    const newRoot = newTree.getRoot();

    // The proof should be valid against the old root
    expect(MerkleTree.verifyProof(initialProof, testAddresses[0], initialRoot)).toBe(true);

    // But invalid against the new root (after rotation)
    expect(MerkleTree.verifyProof(initialProof, testAddresses[0], newRoot)).toBe(false);

    // This demonstrates the central security property:
    // A proof valid against a previous root is correctly rejected once the root has rotated
  });

  it('should handle addresses not in the tree', () => {
    const nonWhitelistedAddress = '0x9999999999999999999999999999999999999999';
    const proofForNonMember = tree.getProof(nonWhitelistedAddress);
    // Note: In a real implementation, getProof would throw for non-members
    
    // Verify that non-members don't have valid proofs
    expect(() => tree.getProof(nonWhitelistedAddress)).toThrow();
  });

  it('should handle empty proof arrays', () => {
    const isValid = MerkleTree.verifyProof([], testAddresses[0], root);
    expect(isValid).toBe(false);
  });
});
