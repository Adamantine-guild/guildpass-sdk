export type StellarAccountId = string & { readonly __brand: "StellarAccountId" };

const ALPHABET = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ234567';
const ALPHABET_MAP: Record<string, number> = {};
for (let i = 0; i < ALPHABET.length; i++) {
    ALPHABET_MAP[ALPHABET[i]] = i;
}

function decodeBase32(str: string): Uint8Array {
    let bits = 0;
    let value = 0;
    let index = 0;
    
    // Calculate expected byte length. 56 chars * 5 = 280 bits = 35 bytes.
    const expectedBytes = Math.floor((str.length * 5) / 8);
    const bytes = new Uint8Array(expectedBytes);

    for (let i = 0; i < str.length; i++) {
        const char = str[i];
        const val = ALPHABET_MAP[char];
        if (val === undefined) {
            throw new Error(`Invalid Base32 character: ${char}`);
        }
        value = (value << 5) | val;
        bits += 5;
        if (bits >= 8) {
            bits -= 8;
            bytes[index++] = (value >>> bits) & 0xFF;
        }
    }
    return bytes;
}

function crc16XModem(data: Uint8Array): number {
    let crc = 0x0000;
    for (let i = 0; i < data.length; i++) {
        crc ^= data[i] << 8;
        for (let j = 0; j < 8; j++) {
            if ((crc & 0x8000) !== 0) {
                crc = (crc << 1) ^ 0x1021;
            } else {
                crc = crc << 1;
            }
        }
    }
    return crc & 0xFFFF;
}

export function isStellarAccountId(input: unknown): input is StellarAccountId {
    try {
        parseStellarAccountId(input);
        return true;
    } catch {
        return false;
    }
}

export function parseStellarAccountId(input: unknown): StellarAccountId {
    if (typeof input !== 'string') {
        throw new Error('Stellar account ID must be a string');
    }

    const trimmed = input.trim();
    
    if (trimmed.length !== 56) {
        throw new Error('Stellar account ID must be exactly 56 characters long');
    }
    
    // G is expected for public keys (ed25519 public key)
    if (trimmed[0] !== 'G') {
        throw new Error('Stellar account ID must start with G');
    }

    // Decode base32
    let decoded: Uint8Array;
    try {
        decoded = decodeBase32(trimmed);
    } catch (e: any) {
        throw new Error(`Invalid encoding: ${e.message}`);
    }

    // StrKey encoding consists of:
    // 1 byte version (0x30 for account ID 'G')
    // 32 bytes data
    // 2 bytes CRC16-XModem checksum
    if (decoded.length !== 35) {
        throw new Error('Invalid decoded byte length');
    }

    const versionByte = decoded[0];
    if (versionByte !== (6 << 3)) { // 0x30
        throw new Error('Invalid version byte for Stellar account ID');
    }

    // Verify checksum
    const dataAndVersion = decoded.slice(0, 33);
    const expectedChecksum = crc16XModem(dataAndVersion);
    
    // The checksum in StrKey is little-endian!
    // Wait, let's verify if CRC is little-endian or big-endian in StrKey.
    // It is little-endian.
    const actualChecksum = decoded[33] | (decoded[34] << 8);

    if (expectedChecksum !== actualChecksum) {
        throw new Error('Invalid checksum');
    }

    return trimmed as StellarAccountId;
}

export function safeParseStellarAccountId(input: unknown): { success: true; data: StellarAccountId } | { success: false; error: Error } {
    try {
        const data = parseStellarAccountId(input);
        return { success: true, data };
    } catch (e: any) {
        return { success: false, error: e };
    }
}
