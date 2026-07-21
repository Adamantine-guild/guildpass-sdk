# Cryptographic Security Audit — secp256k1 Primitives

> **Auditor:** Automated static + manual cryptographic review  
> **Date:** 2026-07-21  
> **Scope:** `src/crypto/secp256k1.ts` (elliptic-curve arithmetic) and its consumer `src/siwe/siwe.helpers.ts` (SIWE/EIP-4361 signature verification)  
> **Version:** `@guildpass/sdk` v0.1.x  

## Table of Contents

1. [Scope & Methodology](#1-scope--methodology)
2. [Threat Model](#2-threat-model)
3. [Attack Surface Enumeration](#3-attack-surface-enumeration)
4. [Finding Register](#4-finding-register)
   - [F-01 — Non-constant-time scalar multiplication (timing side channel)](#f-01--non-constant-time-scalar-multiplication-timing-side-channel)
   - [F-02 — No twist-security validation on recovered points](#f-02--no-twist-security-validation-on-recovered-points)
   - [F-03 — Missing EIP-2 s-value malleability check](#f-03--missing-eip-2-s-value-malleability-check)
   - [F-04 — Point-at-infinity not explicitly guarded in `pointAdd` slope computation](#f-04--point-at-infinity-not-explicitly-guarded-in-pointadd-slope-computation)
   - [F-05 — Message-length leakage via `hashPersonalMessage` string concatenation](#f-05--message-length-leakage-via-hashpersonalmessage-string-concatenation)
   - [F-06 — Node.js `Buffer` dependency in `ecRecover`](#f-06--nodejs-buffer-dependency-in-ecrecover)
   - [F-07 — Modulo bias in `generateSiweNonce`](#f-07--modulo-bias-in-generatesiwenonce)
   - [F-08 — No `r` upper-half malleability check](#f-08--no-r-upper-half-malleability-check)
   - [F-09 — Public key not validated to be on curve before address derivation](#f-09--public-key-not-validated-to-be-on-curve-before-address-derivation)
5. [Severity Summary](#5-severity-summary)
6. [Decision Analysis: Harden in Place vs. Adopt Audited Dependency](#6-decision-analysis-harden-in-place-vs-adopt-audited-dependency)
7. [Remediation Actions](#7-remediation-actions)
8. [Residual Risk Acceptance](#8-residual-risk-acceptance)

---

## 1. Scope & Methodology

### In Scope

| Module | Functions | Lines |
|--------|-----------|-------|
| `src/crypto/secp256k1.ts` | `modPow`, `modInv`, `pointDouble`, `pointAdd`, `scalarMul`, `ecRecover`, `bigintToBytes32`, `keccak256Bytes`, `hexToBytes`, `hashPersonalMessage`, `publicKeyToAddress`, `toChecksumAddress` | Full file |
| `src/siwe/siwe.helpers.ts` | `verifySiweSignature`, `generateSiweNonce` (signature-verification paths only) | Signature flow |
| `src/utils/constantTime.ts` | `constantTimeEqual` | Full file |

### Out of Scope

- The P-256 / secp256r1 code paths (not present in this SDK)
- The HTTP/RPC/cache layers (covered in `THREAT_MODEL.md`)
- Third-party dependency `js-sha3` (assumed correct; we verify correct integration)
- The wallet provider abstraction (`wallet/helpers.ts`)
- SIWE message parsing other than the signature verification path

### Methodology

1. **Specification review:** Compare against secp256k1 standard (SEC 2), ECDSA (ANSI X9.62), EIP-155, EIP-2, EIP-4361.
2. **Implementation review:** Line-by-line analysis of every arithmetic operation for correctness, constant-timeness, input validation, and edge cases.
3. **Attack-pattern mapping:** Check against known ECDSA/secp256k1 pitfalls: timing side channels, invalid-curve attacks, twist attacks, signature malleability, point-at-infinity handling, small-subgroup attacks.
4. **Test-vector validation:** Verify all existing test vectors pass and identify coverage gaps.

---

## 2. Threat Model

### Trust Boundary

```
Attacker (provides signature + message) 
    │
    ▼
verifySiweSignature(message, signature)
    │
    ├── parseSiweMessage()       ──►  rejects malformed messages
    ├── expiry/nonce/domain checks ──►  protocol-level guards
    └── ecRecover(msgHash, v, r, s) ──►  cryptographic verification
         │
         ├── modPow (sqrt via exponentiation)
         ├── pointAdd / pointDouble
         ├── scalarMul (double-and-add)
         └── publicKeyToAddress
```

**Attacker capabilities:** The attacker controls the `message` string and the `signature` hex string. They may also control the RPC endpoint returning parsed SIWE data. The attacker's goal is either:
- **Forgery:** Make `verifySiweSignature` accept a signature not produced by the claimed key.
- **Denial of service:** Make `ecRecover` throw or consume excessive resources.
- **Malleability:** Produce a second valid signature from a legitimate one.

### Attacker Model

| Property | Level |
|----------|-------|
| Network position | Can submit arbitrary messages + signatures to `verifySiweSignature` |
| Computational power | Standard (no quantum) |
| Timing measurement | Remote timing possible; JIT/GC noise in JS limits resolution but cannot be ruled out entirely |
| Side channels | Can observe wall-clock time of verification calls |
| Known values | Message, signature (r, s, v), recovered public key, resulting address — all visible to attacker |

### Key Security Properties Required

1. **Correctness:** `ecRecover` must return the public key that was used to produce the signature (or null for invalid signatures).
2. **Non-malleability:** Given a valid signature `(r, s, v)`, it must NOT be possible to produce a second valid signature `(r', s', v')` that verifies for the same message under the same key.
3. **DoS resistance:** All operations must have bounded resource consumption; no O(n²) or unbounded allocation on attacker-controlled input.
4. **Defense in depth:** Even though `ecRecover` only uses public scalars (r, s, hash e), the code should not leak timing about which bits of these public values are set.

---

## 3. Attack Surface Enumeration

### 3.1 Signature Input Validation

The `verifySiweSignature` function validates:
- `sigHex.length !== 130` → rejects incorrect length
- `v` must be in {0, 1, 27, 28} → rejects invalid recovery IDs
- `ecRecover` checks `r <= 0 || r >= N`, `s <= 0 || s >= N` → rejects boundary values

**Missing:** No check that `s <= N/2` (EIP-2). No check that `r <= N/2`.

### 3.2 Curve Arithmetic

Every `modPow` call branches on each bit of the exponent. Since all exponents in the verification path are **public** (curve parameter P for field operations, curve order N for r/s bounds), this is not a direct secret leak, but it establishes a pattern that could be copied into a future signing implementation.

### 3.3 Point Recovery

`ecRecover` reconstructs point R from x = r by computing `y = sqrt(x³ + 7)`. It validates that `y² ≡ x³ + 7 (mod P)` before using the point. This prevents invalid-curve-point injection because the check is on the secp256k1 curve equation directly.

**However:** There is no check that the computed R is NOT the point at infinity. For x = 0, `ySquared = 7`, which is a quadratic residue modulo P (since P ≡ 3 mod 4), so a y exists and R is not infinity. For any x where `ySquared` is a QR, a non-infinity point exists. The point at infinity would require `x³ + 7 ≡ 0 (mod P)`, which has at most 3 solutions. Not a practical concern but an completeness gap.

### 3.4 Public Key Derivation

`publicKeyToAddress` takes a 65-byte uncompressed key and:
1. Skips the `0x04` prefix
2. keccak256 hashes the remaining 64 bytes
3. Takes the last 20 bytes
4. Applies EIP-55 checksum

**No validation** that the 65-byte input starts with `0x04` or that the x/y coordinates satisfy the curve equation. A caller passing a malformed public key could get a valid-looking address from invalid coordinates.

---

## 4. Finding Register

### F-01 — Non-constant-time scalar multiplication (timing side channel)

**Severity:** Low (Medium if signing is ever added)  
**Type:** Timing side channel  
**File:** `src/crypto/secp256k1.ts` — `scalarMul` (line ~169) and transitively `modPow` (line ~47)

**Description:** The `scalarMul` function uses the textbook double-and-add algorithm:

```typescript
while (k > BigInt(0)) {
  if (k & BigInt(1)) result = pointAdd(result, addend);
  k >>= BigInt(1);
  addend = pointDouble(addend);
}
```

The `if (k & BigInt(1))` branch is taken only when the current bit of the scalar is 1. This means:
- Execution time depends on the Hamming weight of the scalar
- The number of `pointAdd` calls is proportional to the number of 1-bits
- In `ecRecover`, all scalars (r, s, e, rInv) are **public** — so this does NOT leak a secret key during verification
- **However**, if this code is ever reused for signing (where the nonce `k` must be secret), it would leak the nonce, enabling full private key recovery via the standard ECDSA nonce-reuse / bias attacks

**Exploitation:** An attacker would need to:
1. Measure wall-clock time of `ecRecover` calls with nanosecond precision
2. Distinguish the 1-bit additions from 0-bit skips through JIT/GC noise
3. Correlate timing with a secret scalar (not currently possible since all scalars are public)

**Mitigation in this audit:** Document as accepted residual risk for verification-only use. Add a `@warning` JSDoc tag on `scalarMul`. If the module is ever extended to support signing, the scalar multiplication MUST be replaced with constant-time alternatives (Montgomery ladder, Joye's double-add, or use of native `crypto` APIs).

**Evidence:** Standard timing-attack literature shows that non-constant-time scalar multiplication on secp256k1 is exploitable via remote timing when the scalar is secret (e.g., Brumley & Boneh 2003, USENIX Security; OpenSSL timing CVE).

---

### F-02 — No twist-security validation on recovered points

**Severity:** Low  
**Type:** Invalid-curve attack (limited)  
**File:** `src/crypto/secp256k1.ts` — `ecRecover` (line ~200)

**Description:** The `ecRecover` function checks that `y² ≡ x³ + 7 (mod P)` for the recovered point R. This is sufficient to ensure R is on the secp256k1 curve. However, there is no validation that the point belongs to the **prime-order subgroup** of the curve (order N rather than a small-order factor).

For secp256k1, the curve order is prime (N is prime and the cofactor h=1), so every non-infinity point on the curve has order N. This means:
- There are NO points of small order on secp256k1's curve
- Twist-security validation is not needed for correctness because the cofactor is 1
- **However**, there IS a quadratic twist of secp256k1 (the "twist curve") that has a small cofactor. If an attacker could supply x-coordinates that are on the twist rather than the curve, the y² check would catch it because the curve equation would not hold.

**Conclusion:** The `y² ≡ x³ + 7` check is fully sufficient for secp256k1. No twist attack is possible given this check.

**Mitigation:** None needed. This finding is documented to confirm the check is adequate.

---

### F-03 — Missing EIP-2 s-value malleability check

**Severity:** High  
**Type:** Signature malleability (EIP-2 violation)  
**File:** `src/siwe/siwe.helpers.ts` — `verifySiweSignature` (line ~215) + `src/crypto/secp256k1.ts` — `ecRecover` (line ~195)

**Description:** Ethereum's EIP-2 (Homestead) mandates that ECDSA signatures MUST have `s ≤ n/2` (where n is secp256k1's curve order) to prevent signature malleability. Given a valid signature `(r, s, v)`:
- `(r, n-s, v XOR 1)` is also a valid signature for the same message
- This is because `s` and `n-s` are symmetric; the verification equation produces the same recovered public key (with the opposite y-coordinate parity)

The current implementation does not check `s ≤ n/2`. A malleated signature will pass `ecRecover` and produce the same recovered address, causing `verifySiweSignature` to return `success: true`.

**Exploitation:**
1. Attacker observes a valid SIWE signature `(r, s, v)` on the public mempool / API
2. Attacker computes `s' = n - s` and `v' = v XOR 1`
3. The new signature `(r, s', v')` also verifies for the same SIWE message
4. If the consumer application uses the raw signature (not just the verification result) as an identifier or commitment, the malleated signature creates ambiguity
5. In cross-chain replay scenarios, the malleated signature could be used on a different chain where the nonce check is not enforced

**Note for SIWE in practice:** SIWE uses nonces to prevent replay, so the malleated signature would only be valid for the same message with the same nonce. The primary risk is:
- Applications that use the signature hash as a session identifier
- Cross-protocol attacks where the same message is meaningful in another context
- General non-compliance with EIP-2 (which is required for Ethereum transaction signatures)

**Mitigation:** Add `s <= SECP256K1_N / 2` check in both `ecRecover` and `verifySiweSignature`.

---

### F-04 — Point-at-infinity not explicitly guarded in `pointAdd` slope computation

**Severity:** Medium  
**Type:** Edge-case crash / logic error  
**File:** `src/crypto/secp256k1.ts` — `pointAdd` (line ~129)

**Description:** The `pointAdd` function handles null (point at infinity) correctly at the entry points:
```typescript
if (!P) return Q;
if (!Q) return P;
```

And handles `P.x === Q.x` with the special cases (P+(-P) = infinity, or point doubling). However, there is an edge case in the slope computation at line ~137:
```typescript
const lam = (((Q.y - P.y) % SECP256K1_P + SECP256K1_P) *
  modInv((Q.x - P.x + SECP256K1_P) % SECP256K1_P, SECP256K1_P)) % SECP256K1_P;
```

If `Q.x - P.x === 0` (which implies `P.x === Q.x`) but `P.y === Q.y`, the code correctly calls `pointDouble(P)`. And if `P.y !== Q.y`, it correctly returns null. This is correct.

**However**, there is a subtle concern: if `P` and `Q` are the SAME object reference (not just equal, but literally `===`) AND `P.y === 0`, then `pointDouble` would also return null. This is correctly handled because `pointDouble` checks `P.y === BigInt(0)`.

**Conclusion:** The point-at-infinity handling IS correct in all branches. However, the code would benefit from an explicit assertion/guard that `modInv`'s input is non-zero, to prevent a hypothetical "division by zero" scenario from producing a wrong result rather than an error. Currently, `modInv(0, P)` would compute `modPow(0, P-2, P) = 0`, and the slope would be 0, producing an incorrect result silently.

**Mitigation:** Add a guard in `pointAdd` that `Q.x !== P.x` before the modInv call (the existing `if (P.x === Q.x)` already handles this, but an explicit assert for defense-in-depth would improve robustness).

---

### F-05 — Message-length leakage via `hashPersonalMessage` string concatenation

**Severity:** Informational  
**Type:** Timing side channel (minor)  
**File:** `src/crypto/secp256k1.ts` — `hashPersonalMessage` (line ~280)

**Description:** The function computes:
```typescript
const prefix = `\x19Ethereum Signed Message:\n${message.length}`;
```

The string concatenation and `TextEncoder().encode()` have length-dependent timing. This leaks the message length through timing. However:
- The message length is already known to the attacker (they provide the message)
- The message length is visible in the raw SIWE string
- No secret depends on message length

**Mitigation:** None needed. Documented as informational.

---

### F-06 — Node.js `Buffer` dependency in `ecRecover`

**Severity:** Low  
**Type:** Cross-platform compatibility  
**File:** `src/crypto/secp256k1.ts` — `ecRecover` (line ~212)

**Description:** The line:
```typescript
const e = BigInt('0x' + Buffer.from(msgHash).toString('hex'));
```

Uses Node.js `Buffer` API, which is not available in all edge/browser runtimes. The file header acknowledges this as a known issue with a follow-up to migrate to a Buffer-free conversion.

**Mitigation:** Replace `Buffer.from(msgHash).toString('hex')` with a pure-JS hex conversion (e.g., `Array.from(msgHash).map(b => b.toString(16).padStart(2, '0')).join('')`). This is a simple change that eliminates the dependency.

---

### F-07 — Modulo bias in `generateSiweNonce`

**Severity:** Medium  
**Type:** Randomness bias  
**File:** `src/siwe/siwe.helpers.ts` — `generateSiweNonce` (line ~274)

**Description:** The nonce generation uses:
```typescript
const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789'; // length 62
const bytes = new Uint8Array(16);
crypto.getRandomValues(bytes);
return Array.from(bytes).map((b) => chars[b % chars.length]).join('');
```

Since 256 is not divisible by 62, the modulo operation introduces bias:
- `256 = 62 × 4 + 8`
- Bytes 0–7 (indices 0–7 of the characters string: 'A'–'H') have probability 5/256 ≈ 1.95%
- Bytes 8–255 (indices 8–61) have probability 4/256 ≈ 1.56%
- This is approximately a 25% bias for the first 8 characters relative to others

For a 16-character nonce, the practical impact on security is minimal (the nonce space is still ~256 bits nominally, reduced slightly). However, for a security-sensitive nonce used in authentication, it should use a rejection-sampling or division-free approach.

**Mitigation:** Use rejection sampling to ensure uniform distribution:
```typescript
const maxValid = 256 - (256 % chars.length); // 248
let result = '';
while (result.length < 16) {
  const byte = new Uint8Array(1);
  crypto.getRandomValues(byte);
  if (byte[0] < maxValid) {
    result += chars[byte[0] % chars.length];
  }
}
```

---

### F-08 — No `r` upper-half malleability check

**Severity:** Low  
**Type:** Edge case  
**File:** `src/crypto/secp256k1.ts` — `ecRecover` (line ~195)

**Description:** `ecRecover` checks `r >= SECP256K1_N` but not `r > SECP256K1_N/2`. For Ethereum, the recovery of point R from x=r is done differently depending on whether r is in the "high" or "low" half relative to N/2 (because r + N is also a valid x-coordinate). The current code only tries the primary candidate `x = r` and not `x = r + N`.

For Ethereum signatures, `r` is typically in the lower half (since the signer produces r < N, and x = r is on the curve with very high probability). The code implicitly handles this correctly by only trying x=r.

However, a signature crafted with `r > N/2` might produce a different R point than expected, potentially causing `ecRecover` to return the wrong public key. Since `r` is checked to be `< N`, and the Ethereum spec requires that signature `r` comes from a point whose x-coordinate is `r` (not `r + N`), this is benign for standard signature verification. But for completeness, this should be documented.

**Mitigation:** Document the assumption that r < N (not r < N/2 specifically) is sufficient for the single-candidate approach.

---

### F-09 — Public key not validated to be on curve before address derivation

**Severity:** Medium  
**Type:** Trusted-input assumption  
**File:** `src/crypto/secp256k1.ts` — `publicKeyToAddress` (line ~295)

**Description:** The `publicKeyToAddress` function accepts a 65-byte Uint8Array and:
1. Does NOT validate that `pubKey[0] === 0x04` (uncompressed key format marker)
2. Does NOT validate that the x/y coordinates satisfy the curve equation `y² = x³ + 7`
3. Simply hashes whatever bytes are provided

Since `publicKeyToAddress` is called from `verifySiweSignature` only with the output of `ecRecover` (which either returns a valid key or null), the current call path is safe. However, if the function is ever called with attacker-controlled bytes (e.g., from a wallet provider), it could produce a valid-looking address from invalid coordinates.

**Mitigation:** Add input validation to `publicKeyToAddress`:
1. Check `pubKey.length === 65`
2. Check `pubKey[0] === 0x04`
3. Verify the curve equation for the x/y coordinates

---

## 5. Severity Summary

| ID | Finding | Severity | Status |
|----|---------|----------|--------|
| F-01 | Non-constant-time scalarMul (timing side channel) | **Low** (Medium if signing added) | Accepted¹ |
| F-02 | No twist-security issue (y² check is sufficient) | None | — |
| F-03 | Missing EIP-2 s-value malleability check | **High** | **Fixed** (R-01) |
| F-04 | Division-by-zero edge in pointAdd modInv | **Medium** | **Fixed** (R-02) |
| F-05 | Message-length leakage via string concat | Informational | Accepted |
| F-06 | Node.js `Buffer` dependency | **Low** | **Fixed** (R-03) |
| F-07 | Modulo bias in `generateSiweNonce` | **Medium** | **Fixed** (R-04) |
| F-08 | No r upper-half check | **Low** | Documented |
| F-09 | Public key not validated before address derivation | **Medium** | **Fixed** (R-05) |

¹ Accepted: The timing side channel in `scalarMul` does not leak secrets because `ecRecover` only processes **public** scalars (r, s, hash e, rInv). The risk is only if this code is repurposed for signing. See §8.

---

## 6. Decision Analysis: Harden in Place vs. Adopt Audited Dependency

### Option A: Harden in Place

**Changes required:**
- Fix EIP-2 s-value check (~3 lines)
- Add pointAdd division guard (~2 lines)
- Replace Buffer with pure-JS (~3 lines)
- Fix nonce modulo bias (~8 lines)
- Add publicKeyToAddress validation (~10 lines)
- Add JSDoc warnings for constant-time

**Bundle size impact:** Negligible (~+0.1 KB minified)

**Security rigor:**
- All known issues fixed with minimal code changes
- Timing side channel remains (documented, accepted for verification-only use)
- No third-party supply-chain risk introduced
- Full control over code — can audit line by line

**Maintenance burden:**
- No new dependency to track or update
- Need to maintain cryptographic code in-house
- If signing is ever needed, must rewrite scalarMul with constant-time variant

### Option B: Adopt an Audited Dependency

| Library | Size (min) | Pros | Cons |
|---------|-----------|------|------|
| `@noble/curves` (noble-curves) | ~18 KB | Audited, constant-time, pure-JS, tree-shakeable, no dependencies | Adds ~18 KB to the entry bundle for just secp256k1 |
| `ethers` (peer dep, already optional) | ~800 KB | Already an optional peer dep | Massive; would make SIWE mandatory-dependency on ethers |
| `viem` (peer dep, already optional) | ~90 KB | Already an optional peer dep | Large; primarily an RPC library, not a crypto library |

**Detailed analysis of `@noble/curves`:**

- **Security:** Actively maintained, audited (includes formal verification of core operations), constant-time scalar multiplication, validated point-on-curve in all operations
- **API surface:** `secp256k1.verify(sig, hash, pubkey)`, `secp256k1.recoverPublicKey(hash, sig, recovery)`, `secp256k1.getPublicKey(privateKey)`
- **Bundle impact:** Tree-shakeable — importing only `secp256k1` brings in ~18 KB (vs. current ~5 KB for the custom implementation)
- **Dependencies:** Zero (pure JS)
- **Runtime:** Node 18+, browsers, edge (all supported)
- **Constant-time:** Yes — uses Montgomery ladder for scalar multiplication

**Bundle size comparison (current entry point `"."` = 18,180 bytes budget):**

| Component | Current (est.) | With noble-curves | Delta |
|-----------|---------------|-------------------|-------|
| Entry bundle | ~18 KB | ~31 KB | +13 KB (well within budget) |
| secp256k1 module | ~5 KB | ~18 KB (noble) + 0 (remove own) | +13 KB |
| siwe.helpers | ~2 KB | ~2 KB (unchanged) | 0 |

**Tradeoff summary:**

| Criterion | Harden in Place | Adopt noble-curves |
|-----------|----------------|-------------------|
| Security (current) | Adequate after fixes | Higher (audited, constant-time) |
| Bundle size | Better (saves ~13 KB) | Adequate (within 18 KB budget) |
| Maintenance burden | Higher (in-house crypto) | Lower (upstream fixes + audits) |
| Supply-chain risk | Minimal (no new dep) | Low (noble is widely used, 0 deps) |
| Constant-time | No (accepted risk) | Yes |
| Signing support | Would need rewrite | Already supported |

### Recommendation

**Moderate preference for keeping the hardened in-place implementation** for the current release, with a clear migration path to `@noble/curves` if any of the following occur:

1. Signing support is added to the module
2. A practical timing attack against JS ECDSA verification is demonstrated
3. The bundle-size budget is relaxed
4. The team lacks bandwidth for in-house crypto maintenance

**Rationale:**
- The current implementation, after the fixes in this audit, correctly implements all ECDSA recovery operations
- The timing side channel does not leak secrets in the verification-only context
- The bundle-size savings (~13 KB) are meaningful for a client-side SDK
- `@noble/curves` can be adopted later as a drop-in replacement for `ecRecover` without changing the SIWE consumer API

**If the maintainers prefer the migration path instead**, the follow-up PR would:
1. Add `@noble/curves` as a dependency to `package.json`
2. Replace `ecRecover`, `scalarMul`, `pointAdd`, `pointDouble`, `modPow`, `modInv` with calls to `@noble/curves`'s secp256k1 utilities
3. Keep `publicKeyToAddress`, `toChecksumAddress`, `hashPersonalMessage`, `keccak256Bytes` (these are not elliptic-curve operations)
4. Remove or deprecate the now-unused arithmetic primitives

---

## 7. Remediation Actions

| Fix ID | Finding(s) | Change | File |
|--------|-----------|--------|------|
| R-01 | F-03 | Add `s <= N/2` check in `ecRecover` and `verifySiweSignature` | `secp256k1.ts`, `siwe.helpers.ts` |
| R-02 | F-04 | Add explicit zero-denominator guard before `modInv` in `pointAdd` | `secp256k1.ts` |
| R-03 | F-06 | Replace `Buffer.from().toString('hex')` with pure-JS hex | `secp256k1.ts` |
| R-04 | F-07 | Fix modulo bias in `generateSiweNonce` via rejection sampling | `siwe.helpers.ts` |
| R-05 | F-09 | Add input validation to `publicKeyToAddress` | `secp256k1.ts` |

---

## 8. Residual Risk Acceptance

### Accepted Risks

| Risk | Rationale | Trigger for Re-evaluation |
|------|-----------|--------------------------|
| Timing side channel in `scalarMul` | All scalars processed by `ecRecover` are public (r, s, hash, rInv). The timing channel does not leak secret information during signature verification. | If the module is extended to support signing; if a practical remote timing attack against JS ECDSA verification is demonstrated |
| No twist check on recovered R | secp256k1 has cofactor h=1, so all curve points have order N. The y² check ensures the point is on the curve. | N/A (mathematically impossible to exploit given the y² check) |
| Message-length timing in `hashPersonalMessage` | Message length is already public (it's in the attacker-controlled input). | N/A |
| No r upper-half check | Ethereum signatures always have r < N; the single-candidate x=r approach is correct for all valid Ethereum signatures. | If the module is extended to support other chains with different signature formats |

### Risks Requiring Attention

| Risk | Action Required | Deadline |
|------|----------------|----------|
| Buffer dependency (F-06) | Already fixed in this audit | Immediate |
| Modulo bias in nonce (F-07) | Already fixed in this audit | Immediate |
| EIP-2 malleability (F-03) | Already fixed in this audit | Immediate |

---

*This document should be reviewed whenever the cryptographic module is modified, extended, or when new attack techniques against JS ECDSA implementations are published.*
