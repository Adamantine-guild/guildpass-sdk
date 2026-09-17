import { describe, it, expect } from "vitest";
import {
  isStellarNetwork,
  normalizeStellarNetwork,
  getStellarNetworkPassphrase,
  isTestNetwork,
  SUPPORTED_STELLAR_NETWORKS,
  STELLAR_NETWORK_PASSPHRASES,
  truncateStellarAccountId,
} from "../../src/stellar/index.js";

describe("Stellar Network and Account Helpers", () => {
  describe("isStellarNetwork", () => {
    it("returns true for all canonical networks", () => {
      for (const net of SUPPORTED_STELLAR_NETWORKS) {
        expect(isStellarNetwork(net)).toBe(true);
      }
    });

    it("returns false for invalid or unknown networks", () => {
      expect(isStellarNetwork("mainnet")).toBe(false); // alias, not canonical literal
      expect(isStellarNetwork("ethereum")).toBe(false);
      expect(isStellarNetwork("")).toBe(false);
      expect(isStellarNetwork(null)).toBe(false);
      expect(isStellarNetwork(123)).toBe(false);
    });
  });

  describe("normalizeStellarNetwork", () => {
    it("normalizes canonical names", () => {
      expect(normalizeStellarNetwork("testnet")).toBe("testnet");
      expect(normalizeStellarNetwork("public")).toBe("public");
      expect(normalizeStellarNetwork("futurenet")).toBe("futurenet");
      expect(normalizeStellarNetwork("standalone")).toBe("standalone");
    });

    it("handles common aliases and casing", () => {
      expect(normalizeStellarNetwork("MAINNET")).toBe("public");
      expect(normalizeStellarNetwork("mainnet")).toBe("public");
      expect(normalizeStellarNetwork("PUBLIC")).toBe("public");
      expect(normalizeStellarNetwork("TESTNET")).toBe("testnet");
      expect(normalizeStellarNetwork("local")).toBe("standalone");
      expect(normalizeStellarNetwork(" LOCAL ")).toBe("standalone");
    });

    it("throws on unsupported or empty input", () => {
      expect(() => normalizeStellarNetwork("")).toThrow("Network must be a non-empty string");
      expect(() => normalizeStellarNetwork("   ")).toThrow("Network must be a non-empty string");
      expect(() => normalizeStellarNetwork("polygon")).toThrow(/Unsupported Stellar network/);
    });
  });

  describe("getStellarNetworkPassphrase", () => {
    it("returns correct standard passphrases", () => {
      expect(getStellarNetworkPassphrase("public")).toBe(
        STELLAR_NETWORK_PASSPHRASES.public
      );
      expect(getStellarNetworkPassphrase("mainnet")).toBe(
        STELLAR_NETWORK_PASSPHRASES.public
      );
      expect(getStellarNetworkPassphrase("testnet")).toBe(
        STELLAR_NETWORK_PASSPHRASES.testnet
      );
      expect(getStellarNetworkPassphrase("futurenet")).toBe(
        STELLAR_NETWORK_PASSPHRASES.futurenet
      );
      expect(getStellarNetworkPassphrase("standalone")).toBe(
        STELLAR_NETWORK_PASSPHRASES.standalone
      );
    });
  });

  describe("isTestNetwork", () => {
    it("correctly distinguishes testnet/dev from public mainnet", () => {
      expect(isTestNetwork("public")).toBe(false);
      expect(isTestNetwork("mainnet")).toBe(false);
      expect(isTestNetwork("testnet")).toBe(true);
      expect(isTestNetwork("futurenet")).toBe(true);
      expect(isTestNetwork("standalone")).toBe(true);
      expect(isTestNetwork("local")).toBe(true);
    });
  });

  describe("truncateStellarAccountId", () => {
    const account = "GAAZI4TCR3TY5OJHCTJC2A4QSY6CJWJH5IAJTGKIN2ER7LBNVKOCCWN7";

    it("truncates standard 56-character account ID to 4 prefix and 4 suffix chars", () => {
      expect(truncateStellarAccountId(account)).toBe("GAAZ...CWN7");
    });

    it("supports custom prefix and suffix lengths", () => {
      expect(truncateStellarAccountId(account, 6, 6)).toBe("GAAZI4...OCCWN7");
    });

    it("returns unmodified account if shorter than prefix + suffix", () => {
      expect(truncateStellarAccountId("GAAZ", 4, 4)).toBe("GAAZ");
    });

    it("throws on invalid input", () => {
      expect(() => truncateStellarAccountId("")).toThrow("Stellar account must be a non-empty string");
      expect(() => truncateStellarAccountId("   ")).toThrow("Stellar account must be a non-empty string");
      expect(() => truncateStellarAccountId(null as any)).toThrow();
    });
  });
});
