/**
 * Merkle-proof allowlist verification module.
 *
 * Provides dependency-free (js-sha3 only), client-side Merkle tree construction
 * and proof verification for Ethereum address allowlists. The hashing scheme
 * matches OpenZeppelin's MerkleProof.sol conventions:
 *
 *   Leaf:      keccak256(abi.encodePacked(address))  — 20 raw bytes of address
 *   Internal:  keccak256(abi.encodePacked(a, b))      — sorted pair of 32-byte hashes
 *
 * Odd-leaf-count handling uses **level promotion** (unpaired nodes are carried
 * to the next level unchanged), which avoids the well-known vulnerability of
 * leaf-duplication schemes.
 *
 * @module merkle/allowlistTree
 */

import { keccak256 } from 'js-sha3';
import { hexToBytes } from '../crypto/secp256k1';
import { validateAddress } from '../utils/validation';
import { normaliseAddress } from '../utils/address';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

/**
 * A pre-built Merkle allowlist tree ready for proof generation.
 *
 * Returned by {@link buildAllowlistTree}.  Pass it to {@link getProof} for
 * O(log n) proof lookups.
 */
export interface AllowlistTree {
  /** The Merkle root (0x-prefixed 32-byte hex string). */
  readonly root: string;
  /**
   * The checksum-normalised, deduplicated, sorted leaf addresses that were
   * used to construct the tree.  This is the canonical address set — if you
   * need to iterate the allowlist, use this array.
   */
  readonly leaves: readonly string[];
  /**
   * Generate a Merkle proof for the given address.
   *
   * @returns Sibling hashes from leaf to root (0x-prefixed 32-byte hex strings).
   *          An empty array for a single-leaf tree.
   * @throws If the address is not in the allowlist.
   */
  getProof(address: string): string[];
}

/**
 * Internal tree data — exposed for advanced consumers who need direct access
 * to the level structure (e.g. serialization, cross-language interop).
 */
export interface AllowlistTreeData {
  root: string;
  /** Each level of the tree, from leaves (index 0) to root (last index). */
  tree: string[][];
  /** Maps a canonical address to its index in the leaf level. */
  leafIndex: Map<string, number>;
}

// ---------------------------------------------------------------------------
// Internal helpers
// ---------------------------------------------------------------------------

/**
 * Compute the leaf hash for a canonical (lowercased, 0x-prefixed) address.
 *
 * Matches Solidity: `keccak256(abi.encodePacked(address))`
 * = keccak256 of the 20 raw bytes of the address.
 */
function hashLeaf(address: string): string {
  // Strip 0x, get 20 raw bytes, hash
  // After validation, address is always 0x + 40 hex chars → 20 bytes
  return '0x' + keccak256(hexToBytes(address.slice(2)));
}

/**
 * Compute the internal-node hash for a sorted pair of child hashes.
 *
 * Matches Solidity: `keccak256(abi.encodePacked(a, b))` where a ≤ b.
 * Both inputs are 0x-prefixed 32-byte (64 hex char) hex strings.
 */
function hashPair(left: string, right: string): string {
  // Sort: compare the full 0x-prefixed lowercase hex strings
  const [a, b] = left.toLowerCase() <= right.toLowerCase() ? [left, right] : [right, left];
  const aBytes = hexToBytes(a.slice(2));
  const bBytes = hexToBytes(b.slice(2));
  const combined = new Uint8Array(64);
  combined.set(aBytes, 0);
  combined.set(bBytes, 32);
  return '0x' + keccak256(combined);
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

/**
 * Build a Merkle allowlist tree from a list of Ethereum addresses.
 *
 * Each address is validated (must be 0x-prefixed, 40 hex digits), normalised
 * to checksum format, and deduplicated.  The tree is constructed using the
 * sorted-pair hashing scheme matching OpenZeppelin's MerkleProof.sol, with
 * **level promotion** (not duplication) for odd numbers of nodes at any level.
 *
 * @param addresses - Array of Ethereum addresses (any casing; duplicates are ignored).
 * @returns An {@link AllowlistTree} with the canonical address list, root, and
 *          a bound `getProof` method.
 * @throws {GuildPassConfigError} If any address fails validation.
 *
 * @example
 * ```typescript
 * const tree = buildAllowlistTree([
 *   '0xd8dA6BF26964aF9D7eEd9e03E53415D37aA96045',
 *   '0xAb5801a7D398351b8bE11C439e05C5B3259aeC9B',
 * ]);
 * const proof = tree.getProof('0xd8dA6BF26964aF9D7eEd9e03E53415D37aA96045');
 * console.log(tree.root, proof);
 * ```
 */
export function buildAllowlistTree(addresses: string[]): AllowlistTree {
  if (!Array.isArray(addresses)) {
    throw new Error('addresses must be an array');
  }

  // 1. Validate and normalise every address
  for (const addr of addresses) {
    validateAddress(addr);
  }

  // 2. Normalise to checksum form for canonical representation, then deduplicate
  const checksummed = addresses.map((addr) => normaliseAddress(addr, { checksum: true }));
  const unique = [...new Set(checksummed)];

  if (unique.length === 0) {
    throw new Error('At least one valid address is required');
  }

  // 3. Hash each leaf: keccak256 of the 20 raw address bytes
  const leaves = unique.map((addr) => hashLeaf(addr));

  // 4. Build leaf index map for O(log n) proof generation
  const leafIndex = new Map<string, number>();
  leaves.forEach((leaf, i) => leafIndex.set(leaf, i));

  // 5. Build tree levels bottom-up with level promotion
  const tree: string[][] = [leaves];
  let currentLevel = leaves;

  while (currentLevel.length > 1) {
    const nextLevel: string[] = [];
    for (let i = 0; i < currentLevel.length; i += 2) {
      if (i + 1 < currentLevel.length) {
        // Pair: hash the two siblings
        nextLevel.push(hashPair(currentLevel[i], currentLevel[i + 1]));
      } else {
        // Level promotion: odd node carries up unchanged
        nextLevel.push(currentLevel[i]);
      }
    }
    tree.push(nextLevel);
    currentLevel = nextLevel;
  }

  const root = tree[tree.length - 1][0];

  // Build the leaf index keyed by address (not leaf hash) for user-facing lookup
  const addressIndex = new Map<string, number>();
  unique.forEach((addr, i) => addressIndex.set(addr, i));

  const treeData: AllowlistTreeData = {
    root,
    tree,
    leafIndex: addressIndex,
  };

  return {
    root,
    leaves: unique,
    getProof: (address: string): string[] => getProofFromTree(treeData, address),
  };
}

/**
 * Generate a Merkle proof for an address from a pre-built tree.
 *
 * This is the standalone variant; prefer calling `tree.getProof(address)` on
 * the object returned by {@link buildAllowlistTree}.
 *
 * @param tree - An {@link AllowlistTree} (from `buildAllowlistTree`) or raw {@link AllowlistTreeData}.
 * @param address - The address to generate a proof for.
 * @returns Sibling hashes from leaf to root.  Empty array for a single-leaf tree.
 * @throws If the address is not found in the tree.
 */
export function getProof(
  tree: AllowlistTree | AllowlistTreeData,
  address: string,
): string[] {
  // If it's an AllowlistTree from buildAllowlistTree, delegate to its bound method
  if ('getProof' in tree && typeof (tree as AllowlistTree).getProof === 'function') {
    return (tree as AllowlistTree).getProof(address);
  }

  // Otherwise treat it as raw AllowlistTreeData
  return getProofFromTree(tree as AllowlistTreeData, address);
}

/** Internal O(log n) proof generation. */
function getProofFromTree(data: AllowlistTreeData, address: string): string[] {
  // Validate and normalise
  validateAddress(address);
  const canonical = normaliseAddress(address, { checksum: true });

  const { tree, leafIndex } = data;
  if (tree.length === 0) {
    throw new Error('Tree is empty');
  }

  const idx = leafIndex.get(canonical);
  if (idx === undefined) {
    throw new Error('Address not found in allowlist tree');
  }

  const proof: string[] = [];
  let index = idx;

  // Walk up from leaf level to root (exclusive of root)
  for (let level = 0; level < tree.length - 1; level++) {
    const currentLevel = tree[level];
    const isRightChild = index % 2 === 1;
    const siblingIndex = isRightChild ? index - 1 : index + 1;

    if (siblingIndex < currentLevel.length) {
      // Has a sibling — add it to the proof
      proof.push(currentLevel[siblingIndex]);
    }
    // Else: this node was promoted (no sibling at this level) — omit from proof

    index = Math.floor(index / 2);
  }

  return proof;
}

/**
 * Verify a Merkle proof for an address against a root.
 *
 * This is fully deterministic and side-effect-free — suitable for running
 * entirely client-side (e.g. in a browser) as a fast pre-check before any
 * network request.
 *
 * **Security note:** Client-side verification is a UX optimisation, NOT an
 * authoritative access decision. A client could lie about a proof passing
 * locally. The actual access decision must remain the API's or contract's
 * responsibility.
 *
 * @param root - The expected Merkle root (0x-prefixed 32-byte hex string).
 * @param address - The address to verify.
 * @param proof - The Merkle proof (array of 0x-prefixed sibling hashes).
 * @returns `true` if the proof is valid for this address and root.
 *
 * @example
 * ```typescript
 * const isValid = verifyProof(root, '0xAb58...', ['0xabcd...', '0x1234...']);
 * if (isValid) {
 *   // Fast pre-check passed — now call the authoritative API
 *   const result = await client.access.checkAccess({ ... });
 * }
 * ```
 */
export function verifyProof(root: string, address: string, proof: string[]): boolean {
  // Validate and normalise address
  try {
    validateAddress(address);
  } catch {
    return false;
  }
  const canonical = normaliseAddress(address);
  const leaf = hashLeaf(canonical);
  return verifyProofFromLeaf(root, leaf, proof);
}

/**
 * Verify a Merkle proof from a pre-computed leaf hash.
 *
 * Like {@link verifyProof}, but accepts the leaf hash directly instead of
 * computing it from an address.  Useful when the leaf data is not an address,
 * or when the caller has already hashed the leaf.
 *
 * @param root - The expected Merkle root (0x-prefixed 32-byte hex string).
 * @param leaf - The pre-computed leaf hash (0x-prefixed 32-byte hex string).
 * @param proof - The Merkle proof (array of 0x-prefixed sibling hashes).
 * @returns `true` if the proof is valid for this leaf and root.
 */
export function verifyProofFromLeaf(
  root: string,
  leaf: string,
  proof: string[],
): boolean {
  let computedHash = leaf;

  for (const sibling of proof) {
    computedHash = hashPair(computedHash, sibling);
  }

  return computedHash.toLowerCase() === root.toLowerCase();
}
