import { describe, it, expect } from 'vitest';
import { parseStellarAccountId, isStellarAccountId, safeParseStellarAccountId } from '../../src/stellar/accountId';

describe('Stellar Account ID Parser', () => {
    // Valid cases
    const VALID_ACCOUNT_ID = 'GAAQCAIBAEAQCAIBAEAQCAIBAEAQCAIBAEAQCAIBAEAQCAIBAEAQDZ7H';
    
    it('should parse a valid Stellar account ID', () => {
        expect(parseStellarAccountId(VALID_ACCOUNT_ID)).toBe(VALID_ACCOUNT_ID);
        expect(isStellarAccountId(VALID_ACCOUNT_ID)).toBe(true);
        expect(safeParseStellarAccountId(VALID_ACCOUNT_ID).success).toBe(true);
    });
    
    it('should trim and parse a valid Stellar account ID with whitespace', () => {
        expect(parseStellarAccountId(`  ${VALID_ACCOUNT_ID}  `)).toBe(VALID_ACCOUNT_ID);
    });

    // Invalid types
    it('should reject non-string inputs', () => {
        expect(() => parseStellarAccountId(null)).toThrow('Stellar account ID must be a string');
        expect(() => parseStellarAccountId(undefined)).toThrow('Stellar account ID must be a string');
        expect(() => parseStellarAccountId(123)).toThrow('Stellar account ID must be a string');
        expect(() => parseStellarAccountId({})).toThrow('Stellar account ID must be a string');
        expect(isStellarAccountId(null)).toBe(false);
    });

    // Invalid length
    it('should reject truncated or oversized values', () => {
        const truncated = VALID_ACCOUNT_ID.slice(0, 55);
        const oversized = VALID_ACCOUNT_ID + 'A';
        expect(() => parseStellarAccountId(truncated)).toThrow('Stellar account ID must be exactly 56 characters long');
        expect(() => parseStellarAccountId(oversized)).toThrow('Stellar account ID must be exactly 56 characters long');
    });

    // Invalid prefix
    it('should reject unsupported StrKey types (e.g., M, C, S, P)', () => {
        // Muxed Account ID
        const MUXED = 'MAQAA5L65LSYH7CQ3VDNN7FCJTGW2F2A63I54P722DF6Z3X7Z2X6OAAABQQQQQQQQQQQQQQQQQQ';
        // Secret Seed
        const SECRET = 'SDJHRQF4GCMIIKAAAQ6IHY42X73FQFLHUULAPSKVD4AMNDIG5Q3RV3R7';
        // Contract ID
        const CONTRACT = 'CBBM6BKZPEHWYO3E3YKREDPQXMS4VK35YLNU7NFBPN26VOLVNC6EBCDB'; // Dummy contract prefix just to test rejection
        
        expect(() => parseStellarAccountId(MUXED)).toThrow();
        expect(() => parseStellarAccountId(SECRET)).toThrow();
        expect(() => parseStellarAccountId(CONTRACT)).toThrow('Stellar account ID must start with G');
    });

    // Invalid Base32 characters
    it('should reject invalid Base32 characters', () => {
        // Replace last character with '1', which is not in Base32 alphabet (uses 2-7, A-Z)
        const invalidBase32 = VALID_ACCOUNT_ID.slice(0, 55) + '1';
        expect(() => parseStellarAccountId(invalidBase32)).toThrow(/Invalid Base32 character: 1/);
    });

    // Invalid Checksum
    it('should reject invalid checksums', () => {
        // Change the last character to a valid base32 char but wrong checksum
        const char = VALID_ACCOUNT_ID[55] === 'A' ? 'B' : 'A';
        const invalidChecksum = VALID_ACCOUNT_ID.slice(0, 55) + char;
        expect(() => parseStellarAccountId(invalidChecksum)).toThrow('Invalid checksum');
    });
});
