import { describe, it, expect } from "vitest";
import {
  CachePolicyEvaluator,
  CachePolicy,
  CacheEntryMetadata,
} from "../../src/cache/CachePolicyEvaluator";

describe("CachePolicyEvaluator", () => {
  describe("Fresh entries", () => {
    it("should return fresh state when age is strictly less than ttlMs", () => {
      const policy: CachePolicy = { ttlMs: 60000, staleWhileRevalidateMs: 30000 };
      const metadata: CacheEntryMetadata = { storedAt: 1000 };
      const nowMs = 30000; // age = 30000, which is < 60000

      const decision = CachePolicyEvaluator.evaluate(policy, metadata, nowMs);

      expect(decision.state).toBe("fresh");
      expect(decision.canServe).toBe(true);
      expect(decision.requiresRevalidation).toBe(false);
    });

    it("should return fresh state for very recent entries", () => {
      const policy: CachePolicy = { ttlMs: 60000, staleWhileRevalidateMs: 30000 };
      const metadata: CacheEntryMetadata = { storedAt: 5000 };
      const nowMs = 5100; // age = 100

      const decision = CachePolicyEvaluator.evaluate(policy, metadata, nowMs);

      expect(decision.state).toBe("fresh");
      expect(decision.canServe).toBe(true);
      expect(decision.requiresRevalidation).toBe(false);
    });

    it("should return fresh state when age is zero", () => {
      const policy: CachePolicy = { ttlMs: 60000, staleWhileRevalidateMs: 30000 };
      const metadata: CacheEntryMetadata = { storedAt: 1000 };
      const nowMs = 1000; // age = 0

      const decision = CachePolicyEvaluator.evaluate(policy, metadata, nowMs);

      expect(decision.state).toBe("fresh");
      expect(decision.canServe).toBe(true);
      expect(decision.requiresRevalidation).toBe(false);
    });

    it("should return fresh state with zero ttlMs and zero age", () => {
      const policy: CachePolicy = { ttlMs: 0, staleWhileRevalidateMs: 0 };
      const metadata: CacheEntryMetadata = { storedAt: 1000 };
      const nowMs = 1000; // age = 0

      const decision = CachePolicyEvaluator.evaluate(policy, metadata, nowMs);

      expect(decision.state).toBe("fresh");
      expect(decision.canServe).toBe(true);
      expect(decision.requiresRevalidation).toBe(false);
    });
  });

  describe("Exact boundary for Fresh", () => {
    it("should return fresh state when age exactly equals ttlMs", () => {
      const policy: CachePolicy = { ttlMs: 60000, staleWhileRevalidateMs: 30000 };
      const metadata: CacheEntryMetadata = { storedAt: 1000 };
      const nowMs = 61000; // age = 60000, which === ttlMs

      const decision = CachePolicyEvaluator.evaluate(policy, metadata, nowMs);

      expect(decision.state).toBe("fresh");
      expect(decision.canServe).toBe(true);
      expect(decision.requiresRevalidation).toBe(false);
    });

    it("should return fresh state at exact boundary with zero SWR", () => {
      const policy: CachePolicy = { ttlMs: 60000, staleWhileRevalidateMs: 0 };
      const metadata: CacheEntryMetadata = { storedAt: 1000 };
      const nowMs = 61000; // age = 60000, which === ttlMs

      const decision = CachePolicyEvaluator.evaluate(policy, metadata, nowMs);

      expect(decision.state).toBe("fresh");
      expect(decision.canServe).toBe(true);
      expect(decision.requiresRevalidation).toBe(false);
    });
  });

  describe("Stale entries", () => {
    it("should return stale state when age is within SWR window", () => {
      const policy: CachePolicy = { ttlMs: 60000, staleWhileRevalidateMs: 30000 };
      const metadata: CacheEntryMetadata = { storedAt: 1000 };
      const nowMs = 70000; // age = 69000, which is > 60000 and < 90000

      const decision = CachePolicyEvaluator.evaluate(policy, metadata, nowMs);

      expect(decision.state).toBe("stale");
      expect(decision.canServe).toBe(true);
      expect(decision.requiresRevalidation).toBe(true);
    });

    it("should return stale state just past TTL", () => {
      const policy: CachePolicy = { ttlMs: 60000, staleWhileRevalidateMs: 30000 };
      const metadata: CacheEntryMetadata = { storedAt: 1000 };
      const nowMs = 61001; // age = 60001, which is just past TTL

      const decision = CachePolicyEvaluator.evaluate(policy, metadata, nowMs);

      expect(decision.state).toBe("stale");
      expect(decision.canServe).toBe(true);
      expect(decision.requiresRevalidation).toBe(true);
    });

    it("should return stale state in middle of SWR window", () => {
      const policy: CachePolicy = { ttlMs: 60000, staleWhileRevalidateMs: 30000 };
      const metadata: CacheEntryMetadata = { storedAt: 1000 };
      const nowMs = 75000; // age = 74000, which is in the middle of SWR window

      const decision = CachePolicyEvaluator.evaluate(policy, metadata, nowMs);

      expect(decision.state).toBe("stale");
      expect(decision.canServe).toBe(true);
      expect(decision.requiresRevalidation).toBe(true);
    });

    it("should return stale state with large SWR window", () => {
      const policy: CachePolicy = { ttlMs: 1000, staleWhileRevalidateMs: 100000 };
      const metadata: CacheEntryMetadata = { storedAt: 1000 };
      const nowMs = 50000; // age = 49000, which is within large SWR window

      const decision = CachePolicyEvaluator.evaluate(policy, metadata, nowMs);

      expect(decision.state).toBe("stale");
      expect(decision.canServe).toBe(true);
      expect(decision.requiresRevalidation).toBe(true);
    });
  });

  describe("Exact boundary for Stale", () => {
    it("should return stale state when age exactly equals ttlMs + staleWhileRevalidateMs", () => {
      const policy: CachePolicy = { ttlMs: 60000, staleWhileRevalidateMs: 30000 };
      const metadata: CacheEntryMetadata = { storedAt: 1000 };
      const nowMs = 91000; // age = 90000, which === ttlMs + staleWhileRevalidateMs

      const decision = CachePolicyEvaluator.evaluate(policy, metadata, nowMs);

      expect(decision.state).toBe("stale");
      expect(decision.canServe).toBe(true);
      expect(decision.requiresRevalidation).toBe(true);
    });

    it("should return stale state at exact boundary with zero TTL", () => {
      const policy: CachePolicy = { ttlMs: 0, staleWhileRevalidateMs: 30000 };
      const metadata: CacheEntryMetadata = { storedAt: 1000 };
      const nowMs = 31000; // age = 30000, which === ttlMs + staleWhileRevalidateMs

      const decision = CachePolicyEvaluator.evaluate(policy, metadata, nowMs);

      expect(decision.state).toBe("stale");
      expect(decision.canServe).toBe(true);
      expect(decision.requiresRevalidation).toBe(true);
    });
  });

  describe("Expired entries", () => {
    it("should return expired state when age is beyond SWR window", () => {
      const policy: CachePolicy = { ttlMs: 60000, staleWhileRevalidateMs: 30000 };
      const metadata: CacheEntryMetadata = { storedAt: 1000 };
      const nowMs = 100000; // age = 99000, which is > 90000

      const decision = CachePolicyEvaluator.evaluate(policy, metadata, nowMs);

      expect(decision.state).toBe("expired");
      expect(decision.canServe).toBe(false);
      expect(decision.requiresRevalidation).toBe(true);
    });

    it("should return expired state just past SWR boundary", () => {
      const policy: CachePolicy = { ttlMs: 60000, staleWhileRevalidateMs: 30000 };
      const metadata: CacheEntryMetadata = { storedAt: 1000 };
      const nowMs = 91001; // age = 90001, which is just past SWR boundary

      const decision = CachePolicyEvaluator.evaluate(policy, metadata, nowMs);

      expect(decision.state).toBe("expired");
      expect(decision.canServe).toBe(false);
      expect(decision.requiresRevalidation).toBe(true);
    });

    it("should return expired state for very old entries", () => {
      const policy: CachePolicy = { ttlMs: 60000, staleWhileRevalidateMs: 30000 };
      const metadata: CacheEntryMetadata = { storedAt: 1000 };
      const nowMs = 1000000; // age = 999000, which is way beyond SWR window

      const decision = CachePolicyEvaluator.evaluate(policy, metadata, nowMs);

      expect(decision.state).toBe("expired");
      expect(decision.canServe).toBe(false);
      expect(decision.requiresRevalidation).toBe(true);
    });

    it("should return expired state when SWR is zero and age > TTL", () => {
      const policy: CachePolicy = { ttlMs: 60000, staleWhileRevalidateMs: 0 };
      const metadata: CacheEntryMetadata = { storedAt: 1000 };
      const nowMs = 70000; // age = 69000, which is > TTL with no SWR

      const decision = CachePolicyEvaluator.evaluate(policy, metadata, nowMs);

      expect(decision.state).toBe("expired");
      expect(decision.canServe).toBe(false);
      expect(decision.requiresRevalidation).toBe(true);
    });

    it("should return expired state when both TTL and SWR are zero and age > 0", () => {
      const policy: CachePolicy = { ttlMs: 0, staleWhileRevalidateMs: 0 };
      const metadata: CacheEntryMetadata = { storedAt: 1000 };
      const nowMs = 2000; // age = 1000, which is > 0

      const decision = CachePolicyEvaluator.evaluate(policy, metadata, nowMs);

      expect(decision.state).toBe("expired");
      expect(decision.canServe).toBe(false);
      expect(decision.requiresRevalidation).toBe(true);
    });
  });

  describe("Malformed/negative policy values", () => {
    it("should throw error when ttlMs is negative", () => {
      const policy: CachePolicy = { ttlMs: -1, staleWhileRevalidateMs: 30000 };
      const metadata: CacheEntryMetadata = { storedAt: 1000 };
      const nowMs = 5000;

      expect(() =>
        CachePolicyEvaluator.evaluate(policy, metadata, nowMs)
      ).toThrow("CachePolicy.ttlMs must be non-negative");
    });

    it("should throw error when staleWhileRevalidateMs is negative", () => {
      const policy: CachePolicy = { ttlMs: 60000, staleWhileRevalidateMs: -1 };
      const metadata: CacheEntryMetadata = { storedAt: 1000 };
      const nowMs = 5000;

      expect(() =>
        CachePolicyEvaluator.evaluate(policy, metadata, nowMs)
      ).toThrow("CachePolicy.staleWhileRevalidateMs must be non-negative");
    });

    it("should throw error when both ttlMs and staleWhileRevalidateMs are negative", () => {
      const policy: CachePolicy = { ttlMs: -1, staleWhileRevalidateMs: -1 };
      const metadata: CacheEntryMetadata = { storedAt: 1000 };
      const nowMs = 5000;

      // Should throw for ttlMs first
      expect(() =>
        CachePolicyEvaluator.evaluate(policy, metadata, nowMs)
      ).toThrow("CachePolicy.ttlMs must be non-negative");
    });

    it("should accept zero ttlMs", () => {
      const policy: CachePolicy = { ttlMs: 0, staleWhileRevalidateMs: 30000 };
      const metadata: CacheEntryMetadata = { storedAt: 1000 };
      const nowMs = 5000;

      expect(() =>
        CachePolicyEvaluator.evaluate(policy, metadata, nowMs)
      ).not.toThrow();
    });

    it("should accept zero staleWhileRevalidateMs", () => {
      const policy: CachePolicy = { ttlMs: 60000, staleWhileRevalidateMs: 0 };
      const metadata: CacheEntryMetadata = { storedAt: 1000 };
      const nowMs = 5000;

      expect(() =>
        CachePolicyEvaluator.evaluate(policy, metadata, nowMs)
      ).not.toThrow();
    });

    it("should accept both ttlMs and staleWhileRevalidateMs as zero", () => {
      const policy: CachePolicy = { ttlMs: 0, staleWhileRevalidateMs: 0 };
      const metadata: CacheEntryMetadata = { storedAt: 1000 };
      const nowMs = 1000;

      expect(() =>
        CachePolicyEvaluator.evaluate(policy, metadata, nowMs)
      ).not.toThrow();
    });
  });

  describe("Future storedAt timestamps (clock skew)", () => {
    it("should return expired state when storedAt is in the future", () => {
      const policy: CachePolicy = { ttlMs: 60000, staleWhileRevalidateMs: 30000 };
      const metadata: CacheEntryMetadata = { storedAt: 100000 };
      const nowMs = 50000; // age = -50000 (negative, future timestamp)

      const decision = CachePolicyEvaluator.evaluate(policy, metadata, nowMs);

      expect(decision.state).toBe("expired");
      expect(decision.canServe).toBe(false);
      expect(decision.requiresRevalidation).toBe(true);
    });

    it("should return expired state when storedAt is just in the future", () => {
      const policy: CachePolicy = { ttlMs: 60000, staleWhileRevalidateMs: 30000 };
      const metadata: CacheEntryMetadata = { storedAt: 1001 };
      const nowMs = 1000; // age = -1 (negative, future timestamp)

      const decision = CachePolicyEvaluator.evaluate(policy, metadata, nowMs);

      expect(decision.state).toBe("expired");
      expect(decision.canServe).toBe(false);
      expect(decision.requiresRevalidation).toBe(true);
    });

    it("should return expired state for large future timestamps", () => {
      const policy: CachePolicy = { ttlMs: 60000, staleWhileRevalidateMs: 30000 };
      const metadata: CacheEntryMetadata = { storedAt: 999999999 };
      const nowMs = 1000; // age = -999998999 (large negative)

      const decision = CachePolicyEvaluator.evaluate(policy, metadata, nowMs);

      expect(decision.state).toBe("expired");
      expect(decision.canServe).toBe(false);
      expect(decision.requiresRevalidation).toBe(true);
    });

    it("should handle clock skew regardless of policy values", () => {
      const policy: CachePolicy = { ttlMs: 0, staleWhileRevalidateMs: 0 };
      const metadata: CacheEntryMetadata = { storedAt: 5000 };
      const nowMs = 1000; // age = -4000

      const decision = CachePolicyEvaluator.evaluate(policy, metadata, nowMs);

      expect(decision.state).toBe("expired");
      expect(decision.canServe).toBe(false);
      expect(decision.requiresRevalidation).toBe(true);
    });
  });

  describe("Deterministic output with injected nowMs", () => {
    it("should produce consistent results with same nowMs", () => {
      const policy: CachePolicy = { ttlMs: 60000, staleWhileRevalidateMs: 30000 };
      const metadata: CacheEntryMetadata = { storedAt: 1000 };
      const nowMs = 50000;

      const decision1 = CachePolicyEvaluator.evaluate(policy, metadata, nowMs);
      const decision2 = CachePolicyEvaluator.evaluate(policy, metadata, nowMs);

      expect(decision1).toEqual(decision2);
    });

    it("should allow deterministic testing with static nowMs", () => {
      const policy: CachePolicy = { ttlMs: 60000, staleWhileRevalidateMs: 30000 };
      const metadata: CacheEntryMetadata = { storedAt: 1000 };

      // Test fresh state deterministically
      const freshDecision = CachePolicyEvaluator.evaluate(
        policy,
        metadata,
        30000
      );
      expect(freshDecision.state).toBe("fresh");

      // Test stale state deterministically
      const staleDecision = CachePolicyEvaluator.evaluate(
        policy,
        metadata,
        70000
      );
      expect(staleDecision.state).toBe("stale");

      // Test expired state deterministically
      const expiredDecision = CachePolicyEvaluator.evaluate(
        policy,
        metadata,
        100000
      );
      expect(expiredDecision.state).toBe("expired");
    });

    it("should default to Date.now() when nowMs is not provided", () => {
      const policy: CachePolicy = { ttlMs: 60000, staleWhileRevalidateMs: 30000 };
      const metadata: CacheEntryMetadata = { storedAt: Date.now() - 30000 };

      const decision = CachePolicyEvaluator.evaluate(policy, metadata);

      expect(decision.state).toBe("fresh");
      expect(decision.canServe).toBe(true);
      expect(decision.requiresRevalidation).toBe(false);
    });

    it("should produce different results with different nowMs values", () => {
      const policy: CachePolicy = { ttlMs: 60000, staleWhileRevalidateMs: 30000 };
      const metadata: CacheEntryMetadata = { storedAt: 1000 };

      const decision1 = CachePolicyEvaluator.evaluate(policy, metadata, 30000);
      const decision2 = CachePolicyEvaluator.evaluate(policy, metadata, 70000);

      expect(decision1.state).toBe("fresh");
      expect(decision2.state).toBe("stale");
    });

    it("should handle edge cases with integer millisecond precision", () => {
      const policy: CachePolicy = { ttlMs: 1, staleWhileRevalidateMs: 1 };
      const metadata: CacheEntryMetadata = { storedAt: 0 };

      const decision0 = CachePolicyEvaluator.evaluate(policy, metadata, 0);
      expect(decision0.state).toBe("fresh");

      const decision1 = CachePolicyEvaluator.evaluate(policy, metadata, 1);
      expect(decision1.state).toBe("fresh");

      const decision2 = CachePolicyEvaluator.evaluate(policy, metadata, 2);
      expect(decision2.state).toBe("stale");

      const decision3 = CachePolicyEvaluator.evaluate(policy, metadata, 3);
      expect(decision3.state).toBe("expired");

      const decision4 = CachePolicyEvaluator.evaluate(policy, metadata, 4);
      expect(decision4.state).toBe("expired");
    });
  });

  describe("Type safety", () => {
    it("should maintain type information for CacheDecision", () => {
      const policy: CachePolicy = { ttlMs: 60000, staleWhileRevalidateMs: 30000 };
      const metadata: CacheEntryMetadata = { storedAt: 1000 };
      const nowMs = 30000;

      const decision = CachePolicyEvaluator.evaluate(policy, metadata, nowMs);

      // Type assertions to ensure type safety
      const state: "fresh" | "stale" | "expired" = decision.state;
      const canServe: boolean = decision.canServe;
      const requiresRevalidation: boolean = decision.requiresRevalidation;

      expect(state).toBe("fresh");
      expect(canServe).toBe(true);
      expect(requiresRevalidation).toBe(false);
    });

    it("should accept CachePolicy interface", () => {
      const policy: CachePolicy = {
        ttlMs: 60000,
        staleWhileRevalidateMs: 30000,
      };
      const metadata: CacheEntryMetadata = { storedAt: 1000 };
      const nowMs = 30000;

      const decision = CachePolicyEvaluator.evaluate(policy, metadata, nowMs);

      expect(decision.state).toBe("fresh");
    });

    it("should accept CacheEntryMetadata interface", () => {
      const policy: CachePolicy = { ttlMs: 60000, staleWhileRevalidateMs: 30000 };
      const metadata: CacheEntryMetadata = { storedAt: 1000 };
      const nowMs = 30000;

      const decision = CachePolicyEvaluator.evaluate(policy, metadata, nowMs);

      expect(decision.state).toBe("fresh");
    });
  });
});
