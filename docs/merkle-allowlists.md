# Merkle-Proof Allowlist Verification

The `@guildpass/sdk/merkle` subpath provides dependency-free, client-side Merkle
tree construction and proof verification for Ethereum address allowlists. It is
designed for guilds that gate access based on a fixed, pre-computed allowlist
(e.g. a snapshot of eligible wallets for an event, airdrop-style access, or a
curated member list).

## Why Merkle allowlists?

The conventional Web3 approach for allowlist-based access control uses a Merkle
tree of eligible addresses:

1. **Build** the tree off-chain from the allowlist.
2. **Publish** only the root on-chain (one `bytes32` storage slot — cheap).
3. **Distribute** individual Merkle proofs to eligible wallets.
4. **Verify** proofs off-chain or on-chain without an `eth_call` per check.

This is **gasless, RPC-call-free, and materially cheaper/faster** than an
`eth_call` per check, especially at scale or in latency-sensitive contexts.

## Hashing scheme

The module uses a documented, standard scheme that matches OpenZeppelin's
`MerkleProof.sol`:

| Component | Formula | Solidity equivalent |
| :--- | :--- | :--- |
| Leaf | `keccak256(address)` of the 20 raw address bytes | `keccak256(abi.encodePacked(account))` |
| Internal node | `keccak256(a \|\| b)` where `a ≤ b` (sorted pair) | `keccak256(abi.encodePacked(a, b))` with `_hashPair` |

Odd-leaf-count trees use **level promotion** (the unpaired node is carried to
the next level unchanged) rather than leaf duplication. This avoids the
well-known vulnerability of duplication-based schemes.

A tree built by this module is provable against any standard on-chain verifier
that follows the OpenZeppelin convention.

## API

### `buildAllowlistTree(addresses: string[]): AllowlistTree`

Constructs a Merkle tree from a list of Ethereum addresses.

- Validates every address (must be `0x`-prefixed, 40 hex digits).
- Normalises to EIP-55 checksum format.
- Deduplicates (case-insensitive).
- Returns an `AllowlistTree` with the root, canonical leaf list, and a bound
  `getProof` method.

```typescript
import { buildAllowlistTree } from '@guildpass/sdk/merkle';

const tree = buildAllowlistTree([
  '0xd8dA6BF26964aF9D7eEd9e03E53415D37aA96045',
  '0xAb5801a7D398351b8bE11C439e05C5B3259aeC9B',
  // ... thousands more
]);

console.log(tree.root); // 0x...
console.log(tree.leaves); // ['0xAb58...', '0xd8dA...']
```

### `tree.getProof(address: string): string[]`

Generates a Merkle proof for an address. O(log n) per lookup.

```typescript
const proof = tree.getProof('0xd8dA6BF26964aF9D7eEd9e03E53415D37aA96045');
// ['0xsibling1...', '0xsibling2...']
```

### `verifyProof(root: string, address: string, proof: string[]): boolean`

Verifies a Merkle proof against a root. Fully deterministic and side-effect-free
— suitable for running entirely client-side (e.g. in a browser) as a pre-check
before any network request.

```typescript
import { verifyProof } from '@guildpass/sdk/merkle';

const isValid = verifyProof(root, userAddress, userProof);
```

### `verifyProofFromLeaf(root: string, leaf: string, proof: string[]): boolean`

Like `verifyProof`, but accepts a pre-computed leaf hash instead of computing
it from an address.

### `getProof(tree: AllowlistTree | AllowlistTreeData, address: string): string[]`

Standalone variant of proof generation. Prefer calling `tree.getProof(address)`
on the object returned by `buildAllowlistTree`.

## Full workflow

### 1. Build the tree off-chain

```typescript
import { buildAllowlistTree } from '@guildpass/sdk/merkle';

const allowlist = [
  '0xAb5801a7D398351b8bE11C439e05C5B3259aeC9B',
  '0xd8dA6BF26964aF9D7eEd9e03E53415D37aA96045',
  // ...
];

const tree = buildAllowlistTree(allowlist);
const root = tree.root;
```

### 2. Publish the root

Publish the root on-chain (via a `setMerkleRoot(bytes32)` transaction on your
guild contract) or via the GuildPass API/dashboard. Only the root is stored —
one `bytes32` value.

### 3. Generate and distribute proofs

```typescript
// Generate proofs for every address on the allowlist
const proofs: Record<string, string[]> = {};
for (const addr of allowlist) {
  proofs[addr] = tree.getProof(addr);
}

// Distribute each proof to the address holder (e.g. via a dedicated page,
// API endpoint, or bundled in an airdrop claim link).
```

### 4. Verify client-side (fast pre-check)

```typescript
import { verifyProof } from '@guildpass/sdk/merkle';

// In the browser, before any network request:
const isValid = verifyProof(publishedRoot, walletAddress, userProof);

if (!isValid) {
  // Fast rejection — no RPC call, no API request
  showError('Address not on the allowlist');
  return;
}

// Pre-check passed — now call the authoritative backend
```

### 5. Verify server-side (authoritative)

```typescript
import { GuildPassClient } from '@guildpass/sdk';
import { verifyProof } from '@guildpass/sdk/merkle';

// Pre-check (client-side convenience)
const fastCheck = verifyProof(root, walletAddress, proof);

// Authoritative check via the GuildPass API
const result = await client.access.checkAccess({
  walletAddress,
  guildId: 'my-guild',
  resourceId: 'gated-resource',
});

if (result.hasAccess) {
  // Allow access
}
```

## Integration with `client.access.checkAccess`

`verifyProof` is a **client-side convenience / UX optimization**, not a
substitute for authoritative verification. A client could lie about a proof
passing locally — the actual access decision must remain the API's or
contract's responsibility.

**Recommended pattern:**

```typescript
import { verifyProof } from '@guildpass/sdk/merkle';

async function checkAllowlistAccess(
  client: GuildPassClient,
  root: string,
  walletAddress: string,
  proof: string[],
  guildId: string,
  resourceId: string,
): Promise<boolean> {
  // 1. Fast local pre-check (optional — purely for UX)
  if (!verifyProof(root, walletAddress, proof)) {
    return false; // Not on the allowlist; don't bother the API
  }

  // 2. Authoritative check via the GuildPass API
  const result = await client.access.checkAccess({
    walletAddress,
    guildId,
    resourceId,
  });

  return result.hasAccess;
}
```

> [!IMPORTANT]
> **Security note:** `verifyProof` runs entirely client-side and is a UX
> optimisation only. A malicious client can bypass it or submit a fabricated
> proof. The authoritative access decision MUST be made server-side (via the
> GuildPass API or an on-chain Merkle verifier). Never rely on client-side proof
> verification alone for access control.

## Import path

```typescript
import {
  buildAllowlistTree,
  getProof,
  verifyProof,
  verifyProofFromLeaf,
} from '@guildpass/sdk/merkle';
```

Types are also exported:

```typescript
import type { AllowlistTree, AllowlistTreeData } from '@guildpass/sdk/merkle';
```

The `@guildpass/sdk/merkle` subpath is tree-shakeable — importing from it adds
only the Merkle module (and `js-sha3`, already a shared dependency) to your
bundle.
