/**
 * EIP-712 (`eth_signTypedData_v4`) typed-data encoding, hashing, and
 * signature verification.
 *
 * Implements `encodeType` / `hashStruct` / `hashTypedData` per the EIP-712
 * spec from scratch (no extra runtime dependency), reusing this SDK's
 * existing (post-audit, see docs/cryptographic-audit-secp256k1.md) secp256k1
 * `ecRecover` for signature verification — the same primitive
 * `verifySiweSignature` uses. This module does not implement signing; all
 * scalars handled here (`r`, `s`, the recovered point) are public, so the
 * non-constant-time `ecRecover`/`scalarMul` path is safe to reuse (see the
 * warning in `crypto/secp256k1.ts`).
 *
 * @module eip712
 */
import { GuildPassError } from '../errors/GuildPassError';
import { GuildPassErrorCode } from '../errors/errorCodes';
import { constantTimeEqual } from '../utils/constantTime';
import {
  ecRecover,
  publicKeyToAddress,
  hexToBytes,
  keccak256Bytes,
  bigintToBytes32,
} from '../crypto/secp256k1';
import type {
  EIP712Domain,
  EIP712Message,
  EIP712TypedData,
  EIP712TypeProperty,
  EIP712Types,
  EIP712Value,
  EIP712VerifyResult,
} from './eip712.types';

// ---------------------------------------------------------------------------
// Byte helpers
// ---------------------------------------------------------------------------

function utf8Encode(value: string): Uint8Array {
  return new TextEncoder().encode(value);
}

function concatBytes(chunks: Uint8Array[]): Uint8Array {
  const total = chunks.reduce((sum, c) => sum + c.length, 0);
  const out = new Uint8Array(total);
  let offset = 0;
  for (const chunk of chunks) {
    out.set(chunk, offset);
    offset += chunk.length;
  }
  return out;
}

/** Parses a `0x`-prefixed hex string into bytes. Throws on malformed input. */
function hexToBytesStrict(hex: string, fieldDescription: string): Uint8Array {
  if (typeof hex !== 'string' || !/^0x[0-9a-fA-F]*$/.test(hex) || hex.length % 2 !== 0) {
    throw new GuildPassError(
      `Invalid hex string for ${fieldDescription}: ${JSON.stringify(hex)}`,
      GuildPassErrorCode.EIP712_INVALID_TYPED_DATA,
    );
  }
  return hexToBytes(hex.slice(2));
}

function leftPad32(bytes: Uint8Array): Uint8Array {
  if (bytes.length > 32) {
    throw new GuildPassError('Value exceeds 32 bytes', GuildPassErrorCode.EIP712_INVALID_TYPED_DATA);
  }
  const out = new Uint8Array(32);
  out.set(bytes, 32 - bytes.length);
  return out;
}

function rightPad32(bytes: Uint8Array): Uint8Array {
  if (bytes.length > 32) {
    throw new GuildPassError('Value exceeds 32 bytes', GuildPassErrorCode.EIP712_INVALID_TYPED_DATA);
  }
  const out = new Uint8Array(32);
  out.set(bytes, 0);
  return out;
}

function toBigInt(value: EIP712Value, fieldDescription: string): bigint {
  if (typeof value === 'bigint') return value;
  if (typeof value === 'number') {
    if (!Number.isInteger(value)) {
      throw new GuildPassError(
        `Numeric value for ${fieldDescription} must be an integer`,
        GuildPassErrorCode.EIP712_INVALID_TYPED_DATA,
      );
    }
    return BigInt(value);
  }
  if (typeof value === 'string' && value.length > 0) {
    try {
      return BigInt(value);
    } catch {
      // fall through to the shared error below
    }
  }
  throw new GuildPassError(
    `Expected a numeric value for ${fieldDescription}, got ${JSON.stringify(value)}`,
    GuildPassErrorCode.EIP712_INVALID_TYPED_DATA,
  );
}

// ---------------------------------------------------------------------------
// Type-string parsing (array / bytesN / uintN / intN)
// ---------------------------------------------------------------------------

function isArrayType(type: string): boolean {
  return /\[\d*\]$/.test(type);
}

function arrayBaseType(type: string): string {
  return type.slice(0, type.lastIndexOf('['));
}

function parseFixedBytesType(type: string): number | null {
  const m = /^bytes(\d+)$/.exec(type);
  if (!m) return null;
  const n = Number(m[1]);
  return n >= 1 && n <= 32 ? n : null;
}

function parseUintType(type: string): number | null {
  const m = /^uint(\d*)$/.exec(type);
  if (!m) return null;
  const n = m[1] ? Number(m[1]) : 256;
  return n >= 8 && n <= 256 && n % 8 === 0 ? n : null;
}

function parseIntType(type: string): number | null {
  const m = /^int(\d*)$/.exec(type);
  if (!m) return null;
  const n = m[1] ? Number(m[1]) : 256;
  return n >= 8 && n <= 256 && n % 8 === 0 ? n : null;
}

// ---------------------------------------------------------------------------
// encodeType / typeHash
// ---------------------------------------------------------------------------

/**
 * Collects `type` (its array base, if an array type) and, recursively, every
 * struct type it references, per EIP-712's `encodeType` dependency-collection
 * step.
 */
function findTypeDependencies(
  type: string,
  types: EIP712Types,
  found: Set<string> = new Set(),
): Set<string> {
  const base = isArrayType(type) ? arrayBaseType(type) : type;
  if (found.has(base) || !types[base]) return found;
  found.add(base);
  for (const field of types[base]) {
    findTypeDependencies(field.type, types, found);
  }
  return found;
}

function formatTypeDefinition(name: string, fields: EIP712TypeProperty[]): string {
  return `${name}(${fields.map((f) => `${f.type} ${f.name}`).join(',')})`;
}

/**
 * `encodeType(primaryType)`: the primary type's definition followed by the
 * definitions of every referenced struct type, sorted alphabetically by name
 * (excluding the primary type itself, which always comes first) — per the
 * EIP-712 spec.
 */
export function encodeType(primaryType: string, types: EIP712Types): string {
  if (!types[primaryType]) {
    throw new GuildPassError(
      `Unknown EIP-712 type "${primaryType}"`,
      GuildPassErrorCode.EIP712_INVALID_TYPED_DATA,
    );
  }
  const deps = findTypeDependencies(primaryType, types);
  deps.delete(primaryType);
  const orderedNames = [primaryType, ...Array.from(deps).sort()];
  return orderedNames.map((name) => formatTypeDefinition(name, types[name])).join('');
}

/** `typeHash = keccak256(encodeType(primaryType))`. */
export function typeHash(primaryType: string, types: EIP712Types): Uint8Array {
  return keccak256Bytes(utf8Encode(encodeType(primaryType, types)));
}

// ---------------------------------------------------------------------------
// encodeData / hashStruct
// ---------------------------------------------------------------------------

/**
 * Encodes a single field value to its 32-byte (atomic) or hashed
 * (string/bytes/array/struct) EIP-712 representation.
 */
function encodeValue(type: string, value: EIP712Value, types: EIP712Types): Uint8Array {
  if (isArrayType(type)) {
    if (!Array.isArray(value)) {
      throw new GuildPassError(
        `Expected an array value for type "${type}"`,
        GuildPassErrorCode.EIP712_INVALID_TYPED_DATA,
      );
    }
    const base = arrayBaseType(type);
    const encodedElements = value.map((element) => encodeValue(base, element, types));
    // Per spec: array values are hashed as the concatenation of their
    // encoded elements (treated like the fields of a struct).
    return keccak256Bytes(concatBytes(encodedElements));
  }

  if (types[type]) {
    if (value === null || typeof value !== 'object') {
      throw new GuildPassError(
        `Expected an object value for struct type "${type}"`,
        GuildPassErrorCode.EIP712_INVALID_TYPED_DATA,
      );
    }
    return hashStruct(type, value as EIP712Message, types);
  }

  if (type === 'string') {
    if (typeof value !== 'string') {
      throw new GuildPassError(
        `Expected a string value for type "string", got ${typeof value}`,
        GuildPassErrorCode.EIP712_INVALID_TYPED_DATA,
      );
    }
    return keccak256Bytes(utf8Encode(value));
  }

  if (type === 'bytes') {
    const bytes =
      value instanceof Uint8Array ? value : hexToBytesStrict(value as string, 'a "bytes" field');
    return keccak256Bytes(bytes);
  }

  if (type === 'address') {
    if (typeof value !== 'string') {
      throw new GuildPassError(
        'Expected a hex string for type "address"',
        GuildPassErrorCode.EIP712_INVALID_TYPED_DATA,
      );
    }
    const bytes = hexToBytesStrict(value, 'an "address" field');
    if (bytes.length !== 20) {
      throw new GuildPassError(
        `"address" value must be exactly 20 bytes, got ${bytes.length}: ${value}`,
        GuildPassErrorCode.EIP712_INVALID_TYPED_DATA,
      );
    }
    return leftPad32(bytes);
  }

  if (type === 'bool') {
    return bigintToBytes32(value ? BigInt(1) : BigInt(0));
  }

  const fixedBytesLen = parseFixedBytesType(type);
  if (fixedBytesLen !== null) {
    const bytes =
      value instanceof Uint8Array ? value : hexToBytesStrict(value as string, `a "${type}" field`);
    if (bytes.length !== fixedBytesLen) {
      throw new GuildPassError(
        `"${type}" value must be exactly ${fixedBytesLen} bytes, got ${bytes.length}`,
        GuildPassErrorCode.EIP712_INVALID_TYPED_DATA,
      );
    }
    return rightPad32(bytes);
  }

  const uintBits = parseUintType(type);
  if (uintBits !== null) {
    const n = toBigInt(value, `a "${type}" field`);
    if (n < BigInt(0) || n >= BigInt(1) << BigInt(uintBits)) {
      throw new GuildPassError(
        `Value out of range for "${type}": ${n}`,
        GuildPassErrorCode.EIP712_INVALID_TYPED_DATA,
      );
    }
    return bigintToBytes32(n);
  }

  const intBits = parseIntType(type);
  if (intBits !== null) {
    const n = toBigInt(value, `a "${type}" field`);
    const min = -(BigInt(1) << BigInt(intBits - 1));
    const max = (BigInt(1) << BigInt(intBits - 1)) - BigInt(1);
    if (n < min || n > max) {
      throw new GuildPassError(
        `Value out of range for "${type}": ${n}`,
        GuildPassErrorCode.EIP712_INVALID_TYPED_DATA,
      );
    }
    // Two's-complement over 256 bits so negative values encode correctly.
    const asUint256 = n < BigInt(0) ? (BigInt(1) << BigInt(256)) + n : n;
    return bigintToBytes32(asUint256);
  }

  throw new GuildPassError(
    `Unsupported EIP-712 type: "${type}"`,
    GuildPassErrorCode.EIP712_INVALID_TYPED_DATA,
  );
}

/** `hashStruct(s) = keccak256(typeHash ‖ encodeData(s))`. */
export function hashStruct(
  primaryType: string,
  data: EIP712Message,
  types: EIP712Types,
): Uint8Array {
  const fields = types[primaryType];
  if (!fields) {
    throw new GuildPassError(
      `Unknown EIP-712 type "${primaryType}"`,
      GuildPassErrorCode.EIP712_INVALID_TYPED_DATA,
    );
  }
  const encodedFields = fields.map((field) => encodeValue(field.type, data[field.name], types));
  return keccak256Bytes(concatBytes([typeHash(primaryType, types), ...encodedFields]));
}

// ---------------------------------------------------------------------------
// Domain separator
// ---------------------------------------------------------------------------

const DOMAIN_FIELD_ORDER: Array<{ name: keyof EIP712Domain; type: string }> = [
  { name: 'name', type: 'string' },
  { name: 'version', type: 'string' },
  { name: 'chainId', type: 'uint256' },
  { name: 'verifyingContract', type: 'address' },
  { name: 'salt', type: 'bytes32' },
];

/**
 * Derives the implicit `EIP712Domain` type from whichever domain fields are
 * actually present, per the spec ("The specific instance of EIP712Domain
 * ... only the fields that are used need to be specified").
 */
function domainType(domain: EIP712Domain): EIP712TypeProperty[] {
  return DOMAIN_FIELD_ORDER.filter((f) => domain[f.name] !== undefined).map((f) => ({
    name: f.name,
    type: f.type,
  }));
}

/** `domainSeparator = hashStruct(domain)` using the derived `EIP712Domain` type. */
export function hashDomain(domain: EIP712Domain): Uint8Array {
  const fields = domainType(domain);
  if (fields.length === 0) {
    throw new GuildPassError(
      'EIP-712 domain must define at least one of: name, version, chainId, verifyingContract, salt',
      GuildPassErrorCode.EIP712_INVALID_TYPED_DATA,
    );
  }
  return hashStruct('EIP712Domain', domain as unknown as EIP712Message, {
    EIP712Domain: fields,
  });
}

/**
 * `hashTypedData = keccak256(0x1901 ‖ domainSeparator ‖ hashStruct(message))`
 * — the digest a wallet actually signs for `eth_signTypedData_v4`.
 */
export function hashTypedData(typedData: EIP712TypedData): Uint8Array {
  const { domain, types, primaryType, message } = typedData;
  const domainSeparator = hashDomain(domain);
  const structHash = hashStruct(primaryType, message, types);
  return keccak256Bytes(concatBytes([new Uint8Array([0x19, 0x01]), domainSeparator, structHash]));
}

// ---------------------------------------------------------------------------
// Signature verification
// ---------------------------------------------------------------------------

/**
 * Verifies an EIP-712 typed-data signature: recomputes `hashTypedData` and
 * recovers the signer via secp256k1 `ecRecover`, then compares against
 * `expectedSigner`. Never throws — failures are reported via the returned
 * {@link EIP712VerifyResult}.
 *
 * Malleable signatures (`s` in the upper half of the curve order) are
 * rejected by `ecRecover` itself (see `crypto/secp256k1.ts`), matching
 * `verifySiweSignature`'s behavior.
 */
export function verifyTypedDataSignature(
  domain: EIP712Domain,
  types: EIP712Types,
  primaryType: string,
  message: EIP712Message,
  signature: string,
  expectedSigner: string,
): EIP712VerifyResult {
  if (signature == null || typeof signature !== 'string') {
    return {
      success: false,
      error: 'signature must be a non-null string',
      code: GuildPassErrorCode.EIP712_INVALID_SIGNATURE,
    };
  }
  if (
    expectedSigner == null ||
    typeof expectedSigner !== 'string' ||
    !/^0x[a-fA-F0-9]{40}$/.test(expectedSigner)
  ) {
    return {
      success: false,
      error: 'expectedSigner must be a 20-byte (0x-prefixed) hex address',
      code: GuildPassErrorCode.EIP712_INVALID_SIGNATURE,
    };
  }

  let digest: Uint8Array;
  try {
    digest = hashTypedData({ domain, types, primaryType, message });
  } catch (err: unknown) {
    const errMsg = err instanceof Error ? err.message : 'Failed to hash EIP-712 typed data';
    return { success: false, error: errMsg, code: GuildPassErrorCode.EIP712_INVALID_TYPED_DATA };
  }

  try {
    const sigHex = signature.startsWith('0x') ? signature.slice(2) : signature;
    if (sigHex.length !== 130) {
      return {
        success: false,
        error: 'Signature must be 65 bytes (130 hex characters)',
        code: GuildPassErrorCode.EIP712_INVALID_SIGNATURE,
      };
    }

    const r = BigInt('0x' + sigHex.slice(0, 64));
    const s = BigInt('0x' + sigHex.slice(64, 128));
    let v = parseInt(sigHex.slice(128, 130), 16);

    // Ethereum adds 27 or 28 to the raw recovery id (0 or 1).
    if (v === 27 || v === 28) {
      v -= 27;
    }
    if (v !== 0 && v !== 1) {
      return {
        success: false,
        error: `Invalid signature v value: ${v + 27}`,
        code: GuildPassErrorCode.EIP712_INVALID_SIGNATURE,
      };
    }

    const pubKey = ecRecover(digest, v, r, s);
    if (!pubKey) {
      return {
        success: false,
        error: 'Could not recover public key from signature',
        code: GuildPassErrorCode.EIP712_INVALID_SIGNATURE,
      };
    }

    const recovered = publicKeyToAddress(pubKey);
    if (!recovered) {
      return {
        success: false,
        error: 'Recovered public key is not a valid secp256k1 point',
        code: GuildPassErrorCode.EIP712_INVALID_SIGNATURE,
      };
    }

    if (!constantTimeEqual(recovered.toLowerCase(), expectedSigner.toLowerCase())) {
      return {
        success: false,
        error: `Signer mismatch: recovered "${recovered}", expected "${expectedSigner}"`,
        code: GuildPassErrorCode.EIP712_SIGNER_MISMATCH,
      };
    }

    return { success: true, signer: recovered };
  } catch (err: unknown) {
    const errMsg =
      err instanceof Error ? err.message : 'Unknown error during signature verification';
    return { success: false, error: errMsg, code: GuildPassErrorCode.EIP712_INVALID_SIGNATURE };
  }
}
