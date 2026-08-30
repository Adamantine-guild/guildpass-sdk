import { describe, it, expect } from "vitest";
import {
  CapabilityRegistry,
  InvalidCapabilityIdentifierError,
  InvalidCapabilityVersionError,
  DuplicateCapabilityError,
  compareVersions,
  satisfiesMinimumVersion,
  isValidVersion,
  parseVersion,
} from "../src/capabilities/index.js";

describe("CapabilityRegistry", () => {
  describe("Valid capability registration", () => {
    it("should register valid capability identifiers", () => {
      const registry = new CapabilityRegistry();
      
      registry.register({ id: "membership.read", version: "1.0.0" });
      registry.register({ id: "access.check", version: "2.1.3" });
      registry.register({ id: "stellar.transaction", version: "1.0.0-alpha" });
      
      expect(registry.hasCapability("membership.read")).toBe(true);
      expect(registry.hasCapability("access.check")).toBe(true);
      expect(registry.hasCapability("stellar.transaction")).toBe(true);
    });

    it("should register capabilities with valid semantic versions", () => {
      const registry = new CapabilityRegistry();
      
      registry.register({ id: "test.capability", version: "1.0.0" });
      registry.register({ id: "test.capability2", version: "2.3.4" });
      registry.register({ id: "test.capability3", version: "0.1.0" });
      registry.register({ id: "test.capability4", version: "1.0.0-alpha" });
      registry.register({ id: "test.capability5", version: "1.0.0-beta.2" });
      
      expect(registry.size()).toBe(5);
    });
  });

  describe("Invalid identifier rejection", () => {
    it("should reject empty identifier", () => {
      const registry = new CapabilityRegistry();
      
      expect(() => registry.register({ id: "", version: "1.0.0" })).toThrow(
        InvalidCapabilityIdentifierError
      );
    });

    it("should reject identifier with uppercase letters", () => {
      const registry = new CapabilityRegistry();
      
      expect(() => registry.register({ id: "Membership.read", version: "1.0.0" })).toThrow(
        InvalidCapabilityIdentifierError
      );
    });

    it("should reject identifier with special characters", () => {
      const registry = new CapabilityRegistry();
      
      expect(() => registry.register({ id: "membership_read", version: "1.0.0" })).toThrow(
        InvalidCapabilityIdentifierError
      );
    });

    it("should reject identifier starting with number", () => {
      const registry = new CapabilityRegistry();
      
      expect(() => registry.register({ id: "1membership.read", version: "1.0.0" })).toThrow(
        InvalidCapabilityIdentifierError
      );
    });

    it("should reject identifier with consecutive dots", () => {
      const registry = new CapabilityRegistry();
      
      expect(() => registry.register({ id: "membership..read", version: "1.0.0" })).toThrow(
        InvalidCapabilityIdentifierError
      );
    });

    it("should reject identifier with trailing dot", () => {
      const registry = new CapabilityRegistry();
      
      expect(() => registry.register({ id: "membership.read.", version: "1.0.0" })).toThrow(
        InvalidCapabilityIdentifierError
      );
    });

    it("should reject identifier with leading dot", () => {
      const registry = new CapabilityRegistry();
      
      expect(() => registry.register({ id: ".membership.read", version: "1.0.0" })).toThrow(
        InvalidCapabilityIdentifierError
      );
    });
  });

  describe("Invalid version rejection", () => {
    it("should reject empty version", () => {
      const registry = new CapabilityRegistry();
      
      expect(() => registry.register({ id: "test.capability", version: "" })).toThrow(
        InvalidCapabilityVersionError
      );
    });

    it("should reject non-semver version", () => {
      const registry = new CapabilityRegistry();
      
      expect(() => registry.register({ id: "test.capability", version: "v1.0.0" })).toThrow(
        InvalidCapabilityVersionError
      );
    });

    it("should reject version with only major", () => {
      const registry = new CapabilityRegistry();
      
      expect(() => registry.register({ id: "test.capability", version: "1" })).toThrow(
        InvalidCapabilityVersionError
      );
    });

    it("should reject version with major.minor only", () => {
      const registry = new CapabilityRegistry();
      
      expect(() => registry.register({ id: "test.capability", version: "1.0" })).toThrow(
        InvalidCapabilityVersionError
      );
    });
  });

  describe("Duplicate policy - error (default)", () => {
    it("should reject identical duplicate definitions with error policy", () => {
      const registry = new CapabilityRegistry({ duplicatePolicy: "error" });
      
      registry.register({ id: "test.capability", version: "1.0.0" });
      
      expect(() => registry.register({ id: "test.capability", version: "1.0.0" })).toThrow(
        DuplicateCapabilityError
      );
    });

    it("should reject conflicting duplicate definitions", () => {
      const registry = new CapabilityRegistry();
      
      registry.register({ id: "test.capability", version: "1.0.0" });
      
      expect(() => registry.register({ id: "test.capability", version: "2.0.0" })).toThrow(
        DuplicateCapabilityError
      );
    });
  });

  describe("Duplicate policy - ignore", () => {
    it("should silently ignore identical duplicate definitions with ignore policy", () => {
      const registry = new CapabilityRegistry({ duplicatePolicy: "ignore" });
      
      registry.register({ id: "test.capability", version: "1.0.0" });
      registry.register({ id: "test.capability", version: "1.0.0" });
      
      expect(registry.size()).toBe(1);
    });

    it("should still reject conflicting duplicate definitions with ignore policy", () => {
      const registry = new CapabilityRegistry({ duplicatePolicy: "ignore" });
      
      registry.register({ id: "test.capability", version: "1.0.0" });
      
      expect(() => registry.register({ id: "test.capability", version: "2.0.0" })).toThrow(
        DuplicateCapabilityError
      );
    });
  });

  describe("Duplicate policy - replace", () => {
    it("should replace identical duplicate definitions with replace policy", () => {
      const registry = new CapabilityRegistry({ duplicatePolicy: "replace" });
      
      registry.register({ id: "test.capability", version: "1.0.0" });
      registry.register({ id: "test.capability", version: "1.0.0" });
      
      expect(registry.size()).toBe(1);
      expect(registry.getCapabilityVersion("test.capability")).toBe("1.0.0");
    });

    it("should still reject conflicting duplicate definitions with replace policy", () => {
      const registry = new CapabilityRegistry({ duplicatePolicy: "replace" });
      
      registry.register({ id: "test.capability", version: "1.0.0" });
      
      expect(() => registry.register({ id: "test.capability", version: "2.0.0" })).toThrow(
        DuplicateCapabilityError
      );
    });
  });

  describe("Capability lookup", () => {
    it("should return correct version for registered capability", () => {
      const registry = new CapabilityRegistry();
      
      registry.register({ id: "test.capability", version: "1.2.3" });
      
      expect(registry.getCapabilityVersion("test.capability")).toBe("1.2.3");
    });

    it("should return undefined for unregistered capability", () => {
      const registry = new CapabilityRegistry();
      
      expect(registry.getCapabilityVersion("nonexistent")).toBeUndefined();
    });

    it("should deterministically check capability existence", () => {
      const registry = new CapabilityRegistry();
      
      registry.register({ id: "test.capability", version: "1.0.0" });
      
      expect(registry.hasCapability("test.capability")).toBe(true);
      expect(registry.hasCapability("test.capability")).toBe(true);
      expect(registry.hasCapability("nonexistent")).toBe(false);
      expect(registry.hasCapability("nonexistent")).toBe(false);
    });
  });

  describe("Capability listing with stable ordering", () => {
    it("should list capabilities in alphabetical order", () => {
      const registry = new CapabilityRegistry();
      
      registry.register({ id: "zebra.read", version: "1.0.0" });
      registry.register({ id: "alpha.check", version: "1.0.0" });
      registry.register({ id: "middle.write", version: "1.0.0" });
      
      const capabilities = registry.listCapabilities();
      
      expect(capabilities).toEqual(["alpha.check", "middle.write", "zebra.read"]);
    });

    it("should maintain stable ordering across multiple calls", () => {
      const registry = new CapabilityRegistry();
      
      registry.register({ id: "c.capability", version: "1.0.0" });
      registry.register({ id: "a.capability", version: "1.0.0" });
      registry.register({ id: "b.capability", version: "1.0.0" });
      
      const first = registry.listCapabilities();
      const second = registry.listCapabilities();
      const third = registry.listCapabilities();
      
      expect(first).toEqual(second);
      expect(second).toEqual(third);
    });

    it("should list definitions in alphabetical order", () => {
      const registry = new CapabilityRegistry();
      
      registry.register({ id: "zebra.read", version: "1.0.0" });
      registry.register({ id: "alpha.check", version: "1.0.0" });
      registry.register({ id: "middle.write", version: "1.0.0" });
      
      const definitions = registry.listDefinitions();
      
      expect(definitions[0].id).toBe("alpha.check");
      expect(definitions[1].id).toBe("middle.write");
      expect(definitions[2].id).toBe("zebra.read");
    });
  });

  describe("Immutability - caller input mutation protection", () => {
    it("should not be affected by mutation of original definition", () => {
      const registry = new CapabilityRegistry();
      
      const definition = { id: "test.capability", version: "1.0.0" };
      registry.register(definition);
      
      // Mutate original
      definition.id = "mutated.id";
      definition.version = "2.0.0";
      
      expect(registry.hasCapability("test.capability")).toBe(true);
      expect(registry.hasCapability("mutated.id")).toBe(false);
      expect(registry.getCapabilityVersion("test.capability")).toBe("1.0.0");
    });

    it("should not be affected by mutation of returned definitions", () => {
      const registry = new CapabilityRegistry();
      
      registry.register({ id: "test.capability", version: "1.0.0" });
      
      const definitions = registry.listDefinitions();
      definitions[0].id = "mutated.id";
      definitions[0].version = "2.0.0";
      
      expect(registry.hasCapability("test.capability")).toBe(true);
      expect(registry.getCapabilityVersion("test.capability")).toBe("1.0.0");
    });

    it("should not be affected by mutation of returned capability list", () => {
      const registry = new CapabilityRegistry();
      
      registry.register({ id: "test.capability", version: "1.0.0" });
      
      const capabilities = registry.listCapabilities();
      const mutableCapabilities = capabilities as string[];
      mutableCapabilities.push("malicious.capability");
      mutableCapabilities[0] = "mutated.id";
      
      expect(registry.hasCapability("test.capability")).toBe(true);
      expect(registry.hasCapability("malicious.capability")).toBe(false);
      expect(registry.hasCapability("mutated.id")).toBe(false);
    });
  });

  describe("Immutable snapshot creation", () => {
    it("should create immutable snapshot", () => {
      const registry = new CapabilityRegistry();
      
      registry.register({ id: "test.capability", version: "1.0.0" });
      
      const snapshot = registry.createSnapshot();
      
      expect(snapshot.capabilities.size).toBe(1);
      expect(snapshot.orderedIds).toEqual(["test.capability"]);
    });

    it("should not be affected by registry changes after snapshot", () => {
      const registry = new CapabilityRegistry();
      
      registry.register({ id: "test.capability", version: "1.0.0" });
      
      const snapshot = registry.createSnapshot();
      
      registry.register({ id: "new.capability", version: "2.0.0" });
      
      expect(snapshot.capabilities.size).toBe(1);
      expect(snapshot.orderedIds.length).toBe(1);
    });

    it("should restore registry from snapshot", () => {
      const registry1 = new CapabilityRegistry();
      
      registry1.register({ id: "test.capability", version: "1.0.0" });
      registry1.register({ id: "another.capability", version: "2.0.0" });
      
      const snapshot = registry1.createSnapshot();
      
      const registry2 = CapabilityRegistry.fromSnapshot(snapshot);
      
      expect(registry2.hasCapability("test.capability")).toBe(true);
      expect(registry2.hasCapability("another.capability")).toBe(true);
      expect(registry2.getCapabilityVersion("test.capability")).toBe("1.0.0");
      expect(registry2.listCapabilities()).toEqual(["another.capability", "test.capability"]);
    });
  });

  describe("Version checks", () => {
    it("should correctly check minimum version satisfaction", () => {
      const registry = new CapabilityRegistry();
      
      registry.register({ id: "test.capability", version: "2.0.0" });
      
      expect(registry.satisfiesMinimumVersion("test.capability", "1.0.0")).toBe(true);
      expect(registry.satisfiesMinimumVersion("test.capability", "2.0.0")).toBe(true);
      expect(registry.satisfiesMinimumVersion("test.capability", "2.1.0")).toBe(false);
      expect(registry.satisfiesMinimumVersion("test.capability", "3.0.0")).toBe(false);
    });

    it("should return false for non-existent capability", () => {
      const registry = new CapabilityRegistry();
      
      expect(registry.satisfiesMinimumVersion("nonexistent", "1.0.0")).toBe(false);
    });

    it("should handle prerelease versions", () => {
      const registry = new CapabilityRegistry();
      
      registry.register({ id: "test.capability", version: "1.0.0-alpha" });
      
      expect(registry.satisfiesMinimumVersion("test.capability", "1.0.0-alpha")).toBe(true);
      expect(registry.satisfiesMinimumVersion("test.capability", "0.9.0")).toBe(true);
    });
  });

  describe("Batch registration", () => {
    it("should register multiple capabilities in batch", () => {
      const registry = new CapabilityRegistry();
      
      const definitions = [
        { id: "capability.one", version: "1.0.0" },
        { id: "capability.two", version: "1.0.0" },
        { id: "capability.three", version: "1.0.0" },
      ];
      
      registry.registerBatch(definitions);
      
      expect(registry.size()).toBe(3);
      expect(registry.hasCapability("capability.one")).toBe(true);
      expect(registry.hasCapability("capability.two")).toBe(true);
      expect(registry.hasCapability("capability.three")).toBe(true);
    });

    it("should fail on first error in batch registration", () => {
      const registry = new CapabilityRegistry();
      
      const definitions = [
        { id: "valid.capability", version: "1.0.0" },
        { id: "INVALID.capability", version: "1.0.0" },
        { id: "another.valid", version: "1.0.0" },
      ];
      
      expect(() => registry.registerBatch(definitions)).toThrow(InvalidCapabilityIdentifierError);
      
      // First capability should still be registered
      expect(registry.hasCapability("valid.capability")).toBe(true);
      expect(registry.hasCapability("another.valid")).toBe(false);
    });
  });

  describe("Clear functionality", () => {
    it("should clear all registered capabilities", () => {
      const registry = new CapabilityRegistry();
      
      registry.register({ id: "test.capability", version: "1.0.0" });
      registry.register({ id: "another.capability", version: "1.0.0" });
      
      expect(registry.size()).toBe(2);
      
      registry.clear();
      
      expect(registry.size()).toBe(0);
      expect(registry.hasCapability("test.capability")).toBe(false);
    });
  });
});

describe("Version utilities", () => {
  describe("parseVersion", () => {
    it("should parse valid semantic versions", () => {
      const v1 = parseVersion("1.0.0");
      expect(v1.major).toBe(1);
      expect(v1.minor).toBe(0);
      expect(v1.patch).toBe(0);

      const v2 = parseVersion("2.0.0-alpha");
      expect(v2.major).toBe(2);
      expect(v2.minor).toBe(0);
      expect(v2.patch).toBe(0);
      expect(v2.prerelease).toBe("alpha");

      const v3 = parseVersion("1.2.3-beta.2+build.123");
      expect(v3.major).toBe(1);
      expect(v3.minor).toBe(2);
      expect(v3.patch).toBe(3);
      expect(v3.prerelease).toBe("beta.2");
      expect(v3.build).toBe("build.123");
    });

    it("should throw on invalid version format", () => {
      expect(() => parseVersion("invalid")).toThrow();
      expect(() => parseVersion("1")).toThrow();
      expect(() => parseVersion("1.0")).toThrow();
      expect(() => parseVersion("v1.0.0")).toThrow();
    });
  });

  describe("compareVersions", () => {
    it("should compare versions correctly", () => {
      expect(compareVersions("1.0.0", "1.0.0")).toBe(0);
      expect(compareVersions("2.0.0", "1.0.0")).toBe(1);
      expect(compareVersions("1.0.0", "2.0.0")).toBe(-1);
      expect(compareVersions("1.2.0", "1.1.9")).toBe(1);
      expect(compareVersions("1.0.1", "1.0.0")).toBe(1);
    });

    it("should handle prerelease versions", () => {
      expect(compareVersions("1.0.0-alpha", "1.0.0")).toBe(-1);
      expect(compareVersions("1.0.0", "1.0.0-alpha")).toBe(1);
      expect(compareVersions("1.0.0-alpha", "1.0.0-beta")).toBe(-1);
    });

    it("should compare prerelease lexicographically", () => {
      expect(compareVersions("1.0.0-alpha.1", "1.0.0-alpha.2")).toBe(-1);
      expect(compareVersions("1.0.0-alpha.2", "1.0.0-alpha.1")).toBe(1);
    });
  });

  describe("satisfiesMinimumVersion", () => {
    it("should return true for versions meeting minimum", () => {
      expect(satisfiesMinimumVersion("2.0.0", "1.0.0")).toBe(true);
      expect(satisfiesMinimumVersion("1.0.0", "1.0.0")).toBe(true);
      expect(satisfiesMinimumVersion("1.2.3", "1.2.0")).toBe(true);
    });

    it("should return false for versions below minimum", () => {
      expect(satisfiesMinimumVersion("1.0.0", "2.0.0")).toBe(false);
      expect(satisfiesMinimumVersion("1.1.9", "1.2.0")).toBe(false);
    });
  });

  describe("isValidVersion", () => {
    it("should validate correct semantic versions", () => {
      expect(isValidVersion("1.0.0")).toBe(true);
      expect(isValidVersion("2.3.4")).toBe(true);
      expect(isValidVersion("1.0.0-alpha")).toBe(true);
      expect(isValidVersion("1.0.0-beta.2")).toBe(true);
      expect(isValidVersion("1.0.0+build")).toBe(true);
    });

    it("should reject invalid versions", () => {
      expect(isValidVersion("invalid")).toBe(false);
      expect(isValidVersion("1")).toBe(false);
      expect(isValidVersion("1.0")).toBe(false);
      expect(isValidVersion("v1.0.0")).toBe(false);
      expect(isValidVersion("")).toBe(false);
    });
  });
});
