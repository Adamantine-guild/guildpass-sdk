import { describe, it, expect } from "vitest";
import { RequestContext } from "../../src/context/RequestContext";

describe("RequestContext", () => {
  describe("Empty context creation", () => {
    it("should create an empty context", () => {
      const ctx = RequestContext.empty();
      expect(ctx).toBeDefined();
      expect(ctx.get("anyKey")).toBeUndefined();
      expect(ctx.has("anyKey")).toBe(false);
    });

    it("should return undefined for any key in empty context", () => {
      const ctx = RequestContext.empty();
      expect(ctx.get("userId")).toBeUndefined();
      expect(ctx.get("requestId")).toBeUndefined();
      expect(ctx.get("")).toBeUndefined();
    });

    it("should return false for has() on empty context", () => {
      const ctx = RequestContext.empty();
      expect(ctx.has("userId")).toBe(false);
      expect(ctx.has("requestId")).toBe(false);
      expect(ctx.has("")).toBe(false);
    });
  });

  describe("Derivation/Inheritance", () => {
    it("should inherit parent values", () => {
      const parent = RequestContext.empty().with("userId", "123");
      const child = parent.with("requestId", "abc");

      expect(child.get("userId")).toBe("123");
      expect(child.get("requestId")).toBe("abc");
    });

    it("should inherit from multiple levels of parents", () => {
      const root = RequestContext.empty().with("userId", "123");
      const level1 = root.with("requestId", "abc");
      const level2 = level1.with("sessionId", "xyz");

      expect(level2.get("userId")).toBe("123");
      expect(level2.get("requestId")).toBe("abc");
      expect(level2.get("sessionId")).toBe("xyz");
    });

    it("should allow child to access all parent keys", () => {
      const parent = RequestContext.empty()
        .with("userId", "123")
        .with("requestId", "abc")
        .with("traceId", "trace-123");
      const child = parent.with("newKey", "newValue");

      expect(child.get("userId")).toBe("123");
      expect(child.get("requestId")).toBe("abc");
      expect(child.get("traceId")).toBe("trace-123");
      expect(child.get("newKey")).toBe("newValue");
    });
  });

  describe("Immutability", () => {
    it("should not mutate parent when child is derived", () => {
      const parent = RequestContext.empty().with("userId", "123");
      const child = parent.with("requestId", "abc");

      // Parent should not have the child's key
      expect(parent.has("requestId")).toBe(false);
      expect(parent.get("requestId")).toBeUndefined();

      // Parent should still have its original key
      expect(parent.get("userId")).toBe("123");
    });

    it("should not affect parent when child adds multiple keys", () => {
      const parent = RequestContext.empty().with("userId", "123");
      const child = parent
        .with("requestId", "abc")
        .with("sessionId", "xyz")
        .with("traceId", "trace-123");

      expect(parent.has("requestId")).toBe(false);
      expect(parent.has("sessionId")).toBe(false);
      expect(parent.has("traceId")).toBe(false);
      expect(parent.get("userId")).toBe("123");
    });

    it("should not affect grandparent when parent is modified", () => {
      const grandparent = RequestContext.empty().with("userId", "123");
      const parent = grandparent.with("requestId", "abc");
      const child = parent.with("sessionId", "xyz");

      expect(grandparent.has("requestId")).toBe(false);
      expect(grandparent.has("sessionId")).toBe(false);
      expect(grandparent.get("userId")).toBe("123");
    });

    it("should preserve parent's values exactly", () => {
      const parent = RequestContext.empty()
        .with("userId", "123")
        .with("count", 42)
        .with("flag", true);
      const child = parent.with("newKey", "newValue");

      expect(parent.get("userId")).toBe("123");
      expect(parent.get("count")).toBe(42);
      expect(parent.get("flag")).toBe(true);
    });
  });

  describe("Shadowing", () => {
    it("should allow child to override parent's key", () => {
      const parent = RequestContext.empty().with("userId", "123");
      const child = parent.with("userId", "456");

      expect(child.get("userId")).toBe("456");
      expect(parent.get("userId")).toBe("123");
    });

    it("should shadow parent value without affecting parent", () => {
      const parent = RequestContext.empty().with("userId", "123");
      const child = parent.with("userId", "456");

      // Child sees the shadowed value
      expect(child.get("userId")).toBe("456");
      expect(child.has("userId")).toBe(true);

      // Parent is unchanged
      expect(parent.get("userId")).toBe("123");
      expect(parent.has("userId")).toBe(true);
    });

    it("should allow shadowing at multiple levels", () => {
      const root = RequestContext.empty().with("userId", "123");
      const level1 = root.with("userId", "456");
      const level2 = level1.with("userId", "789");

      expect(root.get("userId")).toBe("123");
      expect(level1.get("userId")).toBe("456");
      expect(level2.get("userId")).toBe("789");
    });

    it("should shadow with undefined value", () => {
      const parent = RequestContext.empty().with("userId", "123");
      const child = parent.with("userId", undefined);

      expect(child.get("userId")).toBeUndefined();
      expect(child.has("userId")).toBe(true);
      expect(parent.get("userId")).toBe("123");
    });
  });

  describe("Sibling isolation", () => {
    it("should not leak between sibling branches", () => {
      const parent = RequestContext.empty().with("userId", "123");
      const branchA = parent.with("requestId", "abc");
      const branchB = parent.with("sessionId", "xyz");

      // Branch A should not have branch B's key
      expect(branchA.has("sessionId")).toBe(false);
      expect(branchA.get("sessionId")).toBeUndefined();

      // Branch B should not have branch A's key
      expect(branchB.has("requestId")).toBe(false);
      expect(branchB.get("requestId")).toBeUndefined();

      // Both should have parent's key
      expect(branchA.get("userId")).toBe("123");
      expect(branchB.get("userId")).toBe("123");
    });

    it("should isolate multiple sibling branches", () => {
      const parent = RequestContext.empty().with("userId", "123");
      const branchA = parent.with("keyA", "valueA");
      const branchB = parent.with("keyB", "valueB");
      const branchC = parent.with("keyC", "valueC");

      expect(branchA.has("keyB")).toBe(false);
      expect(branchA.has("keyC")).toBe(false);
      expect(branchB.has("keyA")).toBe(false);
      expect(branchB.has("keyC")).toBe(false);
      expect(branchC.has("keyA")).toBe(false);
      expect(branchC.has("keyB")).toBe(false);

      expect(branchA.get("keyA")).toBe("valueA");
      expect(branchB.get("keyB")).toBe("valueB");
      expect(branchC.get("keyC")).toBe("valueC");
    });

    it("should isolate shadowing in siblings", () => {
      const parent = RequestContext.empty().with("userId", "123");
      const branchA = parent.with("userId", "456");
      const branchB = parent.with("userId", "789");

      expect(branchA.get("userId")).toBe("456");
      expect(branchB.get("userId")).toBe("789");
      expect(parent.get("userId")).toBe("123");
    });
  });

  describe("Missing key behavior", () => {
    it("should return undefined for missing keys", () => {
      const ctx = RequestContext.empty().with("userId", "123");
      expect(ctx.get("nonexistent")).toBeUndefined();
    });

    it("should return false for has() on missing keys", () => {
      const ctx = RequestContext.empty().with("userId", "123");
      expect(ctx.has("nonexistent")).toBe(false);
    });

    it("should distinguish missing key from key set to undefined", () => {
      const ctx1 = RequestContext.empty().with("userId", "123");
      const ctx2 = RequestContext.empty().with("userId", undefined);

      // ctx1 has userId set to "123"
      expect(ctx1.has("userId")).toBe(true);
      expect(ctx1.get("userId")).toBe("123");

      // ctx2 has userId explicitly set to undefined
      expect(ctx2.has("userId")).toBe(true);
      expect(ctx2.get("userId")).toBeUndefined();

      // Empty context does not have userId
      const ctx3 = RequestContext.empty();
      expect(ctx3.has("userId")).toBe(false);
      expect(ctx3.get("userId")).toBeUndefined();
    });

    it("should distinguish missing key in parent chain", () => {
      const parent = RequestContext.empty().with("userId", "123");
      const child = parent.with("requestId", "abc");

      expect(child.has("nonexistent")).toBe(false);
      expect(child.get("nonexistent")).toBeUndefined();
    });

    it("should handle null values correctly", () => {
      const ctx = RequestContext.empty().with("userId", null);
      expect(ctx.has("userId")).toBe(true);
      expect(ctx.get("userId")).toBeNull();
    });

    it("should handle false values correctly", () => {
      const ctx = RequestContext.empty().with("enabled", false);
      expect(ctx.has("enabled")).toBe(true);
      expect(ctx.get("enabled")).toBe(false);
    });

    it("should handle empty string correctly", () => {
      const ctx = RequestContext.empty().with("userId", "");
      expect(ctx.has("userId")).toBe(true);
      expect(ctx.get("userId")).toBe("");
    });

    it("should handle zero correctly", () => {
      const ctx = RequestContext.empty().with("count", 0);
      expect(ctx.has("count")).toBe(true);
      expect(ctx.get("count")).toBe(0);
    });
  });

  describe("Deep derivation chains", () => {
    it("should handle deep nesting of .with() calls", () => {
      const ctx = RequestContext.empty()
        .with("level1", "value1")
        .with("level2", "value2")
        .with("level3", "value3")
        .with("level4", "value4")
        .with("level5", "value5");

      expect(ctx.get("level1")).toBe("value1");
      expect(ctx.get("level2")).toBe("value2");
      expect(ctx.get("level3")).toBe("value3");
      expect(ctx.get("level4")).toBe("value4");
      expect(ctx.get("level5")).toBe("value5");
    });

    it("should maintain inheritance through deep chains", () => {
      const ctx = RequestContext.empty()
        .with("userId", "123")
        .with("requestId", "abc")
        .with("sessionId", "xyz")
        .with("traceId", "trace-123")
        .with("spanId", "span-456");

      expect(ctx.get("userId")).toBe("123");
      expect(ctx.get("requestId")).toBe("abc");
      expect(ctx.get("sessionId")).toBe("xyz");
      expect(ctx.get("traceId")).toBe("trace-123");
      expect(ctx.get("spanId")).toBe("span-456");
    });

    it("should handle shadowing in deep chains", () => {
      const ctx = RequestContext.empty()
        .with("userId", "123")
        .with("userId", "456")
        .with("userId", "789");

      expect(ctx.get("userId")).toBe("789");
    });

    it("should preserve immutability in deep chains", () => {
      const level1 = RequestContext.empty().with("key1", "value1");
      const level2 = level1.with("key2", "value2");
      const level3 = level2.with("key3", "value3");
      const level4 = level3.with("key4", "value4");
      const level5 = level4.with("key5", "value5");

      expect(level1.has("key2")).toBe(false);
      expect(level1.has("key3")).toBe(false);
      expect(level1.has("key4")).toBe(false);
      expect(level1.has("key5")).toBe(false);

      expect(level2.has("key3")).toBe(false);
      expect(level2.has("key4")).toBe(false);
      expect(level2.has("key5")).toBe(false);

      expect(level3.has("key4")).toBe(false);
      expect(level3.has("key5")).toBe(false);

      expect(level4.has("key5")).toBe(false);
    });

    it("should handle complex value types in deep chains", () => {
      const ctx = RequestContext.empty()
        .with("user", { id: "123", name: "John" })
        .with("metadata", { tags: ["tag1", "tag2"], flags: { active: true } })
        .with("config", { retries: 3, timeout: 5000 });

      expect(ctx.get("user")).toEqual({ id: "123", name: "John" });
      expect(ctx.get("metadata")).toEqual({
        tags: ["tag1", "tag2"],
        flags: { active: true },
      });
      expect(ctx.get("config")).toEqual({ retries: 3, timeout: 5000 });
    });
  });

  describe("Type safety", () => {
    it("should maintain type information through derivation", () => {
      const ctx = RequestContext.empty()
        .with("userId", "123" as string)
        .with("count", 42 as number)
        .with("active", true as boolean);

      const userId: string = ctx.get("userId");
      const count: number = ctx.get("count");
      const active: boolean = ctx.get("active");

      expect(userId).toBe("123");
      expect(count).toBe(42);
      expect(active).toBe(true);
    });

    it("should allow type narrowing with generics", () => {
      type UserContext = {
        userId: string;
        requestId: string;
      };

      const ctx = RequestContext.empty()
        .with("userId", "123")
        .with("requestId", "abc");

      const userId: string = ctx.get("userId");
      const requestId: string = ctx.get("requestId");

      expect(userId).toBe("123");
      expect(requestId).toBe("abc");
    });
  });
});
