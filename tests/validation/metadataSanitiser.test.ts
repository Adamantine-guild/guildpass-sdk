import { describe, it, expect } from "vitest";
import {
  sanitiseMetadata,
  sanitiseMetadataOrThrow,
  SanitisationError,
} from "../../src/validation/metadataSanitiser";
import type { JsonSafeValue } from "../../src/validation/metadataSanitiser";

// ─── Valid primitives ─────────────────────────────────────────────────────

describe("Valid primitives", () => {
  it("should accept null", () => {
    const result = sanitiseMetadata(null);
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data).toBeNull();
    }
  });

  it("should accept true", () => {
    const result = sanitiseMetadata(true);
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data).toBe(true);
    }
  });

  it("should accept false", () => {
    const result = sanitiseMetadata(false);
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data).toBe(false);
    }
  });

  it("should accept empty string", () => {
    const result = sanitiseMetadata("");
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data).toBe("");
    }
  });

  it("should accept a normal string", () => {
    const result = sanitiseMetadata("hello world");
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data).toBe("hello world");
    }
  });

  it("should accept finite positive numbers", () => {
    const result = sanitiseMetadata(42);
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data).toBe(42);
    }
  });

  it("should accept finite negative numbers", () => {
    const result = sanitiseMetadata(-100);
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data).toBe(-100);
    }
  });

  it("should accept zero", () => {
    const result = sanitiseMetadata(0);
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data).toBe(0);
    }
  });

  it("should accept negative zero", () => {
    const result = sanitiseMetadata(-0);
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data).toBe(-0);
    }
  });

  it("should accept decimal numbers", () => {
    const result = sanitiseMetadata(3.14);
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data).toBe(3.14);
    }
  });

  it("should accept very small numbers", () => {
    const result = sanitiseMetadata(Number.MIN_VALUE);
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data).toBe(Number.MIN_VALUE);
    }
  });

  it("should accept Number.MAX_SAFE_INTEGER", () => {
    const result = sanitiseMetadata(Number.MAX_SAFE_INTEGER);
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data).toBe(Number.MAX_SAFE_INTEGER);
    }
  });
});

// ─── Invalid numbers ─────────────────────────────────────────────────────

describe("Invalid numbers", () => {
  it("should reject NaN", () => {
    const result = sanitiseMetadata(NaN);
    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error.message).toContain("Invalid number value");
      expect(result.error.path).toEqual([]);
    }
  });

  it("should reject Infinity", () => {
    const result = sanitiseMetadata(Infinity);
    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error.message).toContain("Invalid number value");
    }
  });

  it("should reject -Infinity", () => {
    const result = sanitiseMetadata(-Infinity);
    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error.message).toContain("Invalid number value");
    }
  });
});

// ─── Unsupported values ──────────────────────────────────────────────────

describe("Unsupported values", () => {
  it("should reject undefined", () => {
    const result = sanitiseMetadata(undefined);
    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error.message).toBe("undefined is not JSON-safe");
      expect(result.error.path).toEqual([]);
    }
  });

  it("should reject functions", () => {
    const fn = () => {};
    const result = sanitiseMetadata(fn);
    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error.message).toBe("Function values are not JSON-safe");
    }
  });

  it("should reject arrow functions", () => {
    const result = sanitiseMetadata(() => 42);
    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error.message).toBe("Function values are not JSON-safe");
    }
  });

  it("should reject symbols", () => {
    const result = sanitiseMetadata(Symbol("test"));
    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error.message).toBe("Symbol values are not JSON-safe");
    }
  });

  it("should reject BigInt", () => {
    const result = sanitiseMetadata(BigInt(42));
    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error.message).toContain("BigInt");
    }
  });

  it("should reject RegExp", () => {
    const result = sanitiseMetadata(/test/);
    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error.message).toContain("Class instances");
    }
  });

  it("should reject Date objects", () => {
    const result = sanitiseMetadata(new Date());
    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error.message).toContain("Class instances");
    }
  });

  it("should reject Map", () => {
    const result = sanitiseMetadata(new Map([["a", 1]]));
    expect(result.success).toBe(false);
  });

  it("should reject Set", () => {
    const result = sanitiseMetadata(new Set([1, 2, 3]));
    expect(result.success).toBe(false);
  });

  it("should reject Error instances", () => {
    const result = sanitiseMetadata(new Error("test"));
    expect(result.success).toBe(false);
  });

  it("should reject boxed primitives", () => {
    // eslint-disable-next-line no-new-wrappers
    const result = sanitiseMetadata(new String("hello"));
    expect(result.success).toBe(false);
  });
});

// ─── Arrays ──────────────────────────────────────────────────────────────

describe("Arrays", () => {
  it("should accept empty arrays", () => {
    const result = sanitiseMetadata([]);
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data).toEqual([]);
    }
  });

  it("should accept arrays of primitives", () => {
    const result = sanitiseMetadata([1, "two", true, null]);
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data).toEqual([1, "two", true, null]);
    }
  });

  it("should accept nested arrays", () => {
    const result = sanitiseMetadata([[1, 2], [3, [4, 5]]]);
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data).toEqual([[1, 2], [3, [4, 5]]]);
    }
  });

  it("should accept arrays of objects", () => {
    const input = [{ name: "Alice" }, { name: "Bob" }];
    const result = sanitiseMetadata(input);
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data).toEqual([{ name: "Alice" }, { name: "Bob" }]);
    }
  });

  it("should report failing index in path", () => {
    const result = sanitiseMetadata([1, undefined, 3]);
    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error.path).toEqual(["[1]"]);
      expect(result.error.message).toContain("undefined");
    }
  });

  it("should report nested index for invalid values in arrays of arrays", () => {
    const result = sanitiseMetadata([[1], [Symbol("bad")]]);
    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error.path).toEqual(["[1]", "[0]"]);
    }
  });

  it("should reject arrays exceeding max length", () => {
    const bigArray = new Array(1001).fill(1);
    const result = sanitiseMetadata(bigArray, { maxArrayLength: 1000 });
    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error.message).toContain("exceeds maximum");
      expect(result.error.path).toEqual([]);
    }
  });

  it("should accept arrays within max length", () => {
    const array = new Array(1000).fill(1);
    const result = sanitiseMetadata(array, { maxArrayLength: 1000 });
    expect(result.success).toBe(true);
  });
});

// ─── Objects ─────────────────────────────────────────────────────────────

describe("Objects", () => {
  it("should accept empty objects", () => {
    const result = sanitiseMetadata({});
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data).toEqual({});
    }
  });

  it("should accept plain objects with primitive values", () => {
    const input = { name: "Alice", age: 30, active: true };
    const result = sanitiseMetadata(input);
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data).toEqual({ name: "Alice", age: 30, active: true });
    }
  });

  it("should accept nested objects", () => {
    const input = { user: { profile: { name: "Alice" } } };
    const result = sanitiseMetadata(input);
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data).toEqual({ user: { profile: { name: "Alice" } } });
    }
  });

  it("should accept objects with array values", () => {
    const input = { tags: ["admin", "user"], scores: [100, 200] };
    const result = sanitiseMetadata(input);
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data).toEqual({
        tags: ["admin", "user"],
        scores: [100, 200],
      });
    }
  });

  it("should reject objects with non-plain prototypes", () => {
    const proto = { inherited: true };
    const obj = Object.create(proto);
    obj.own = "yes";
    const result = sanitiseMetadata(obj);
    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error.message).toContain("Class instances");
    }
  });

  it("should accept Object.create(null) objects (no prototype)", () => {
    const obj = Object.create(null);
    obj.own = "yes";
    const result = sanitiseMetadata(obj);
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data).toEqual({ own: "yes" });
    }
  });

  it("should reject objects exceeding max key count", () => {
    const keys: Record<string, number> = {};
    for (let i = 0; i < 101; i++) {
      keys[`key${i}`] = i;
    }
    const result = sanitiseMetadata(keys, { maxObjectKeyCount: 100 });
    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error.message).toContain("exceeds maximum");
    }
  });

  it("should accept objects within max key count", () => {
    const keys: Record<string, number> = {};
    for (let i = 0; i < 100; i++) {
      keys[`key${i}`] = i;
    }
    const result = sanitiseMetadata(keys, { maxObjectKeyCount: 100 });
    expect(result.success).toBe(true);
  });
});

// ─── Prototype pollution safety ──────────────────────────────────────────

describe("Prototype pollution safety", () => {
  it("should reject __proto__ key", () => {
    const input = JSON.parse('{"__proto__": {"polluted": true}}');
    const result = sanitiseMetadata(input);
    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error.path).toContain("__proto__");
      expect(result.error.message).toContain("Unsafe object key");
    }
    // Verify no pollution occurred
    expect(({} as Record<string, unknown>).polluted).toBeUndefined();
  });

  it("should reject constructor key", () => {
    const input = { constructor: { prototype: { polluted: true } } };
    const result = sanitiseMetadata(input);
    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error.path).toContain("constructor");
      expect(result.error.message).toContain("Unsafe object key");
    }
  });

  it("should reject prototype key", () => {
    const input = JSON.parse('{"prototype": {"polluted": true}}');
    const result = sanitiseMetadata(input);
    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error.path).toContain("prototype");
      expect(result.error.message).toContain("Unsafe object key");
    }
  });

  it("should reject nested dangerous keys", () => {
    const input = JSON.parse(
      '{"nested": {"__proto__": {"polluted": true}}}',
    );
    const result = sanitiseMetadata(input);
    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error.path).toEqual(["nested", "__proto__"]);
    }
  });

  it("should not pollute Object prototype", () => {
    const originalKeys = Object.getOwnPropertyNames(Object.prototype);
    const input = JSON.parse('{"__proto__": {"polluted": true}}');
    sanitiseMetadata(input);
    const afterKeys = Object.getOwnPropertyNames(Object.prototype);
    expect(afterKeys).toEqual(originalKeys);
    expect(({} as Record<string, unknown>).polluted).toBeUndefined();
  });
});

// ─── Circular references ─────────────────────────────────────────────────

describe("Circular references", () => {
  it("should detect direct self-reference", () => {
    const value: Record<string, unknown> = {};
    value.self = value;
    const result = sanitiseMetadata(value);
    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error.message).toContain("Circular reference");
      expect(result.error.path).toEqual(["self"]);
    }
  });

  it("should detect nested cycle", () => {
    const value: Record<string, unknown> = { a: { b: {} } };
    (value.a as Record<string, unknown>).c = value;
    const result = sanitiseMetadata(value);
    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error.message).toContain("Circular reference");
    }
  });

  it("should detect array self-reference", () => {
    const value: unknown[] = [1, 2, 3];
    value.push(value);
    const result = sanitiseMetadata(value);
    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error.message).toContain("Circular reference");
      expect(result.error.path).toEqual(["[3]"]);
    }
  });

  it("should detect cycle from object to parent array", () => {
    const child: Record<string, unknown> = {};
    const parent: unknown[] = [child];
    child.parent = parent;
    const result = sanitiseMetadata(parent);
    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error.message).toContain("Circular reference");
    }
  });

  it("should allow the same non-cyclic object in multiple places", () => {
    const shared = { value: "shared" };
    const input = { a: shared, b: shared };
    const result = sanitiseMetadata(input);
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data).toEqual({
        a: { value: "shared" },
        b: { value: "shared" },
      });
      // Verify independent copies
      const data = result.data as Record<string, unknown>;
      expect(data.a).not.toBe(data.b);
    }
  });
});

// ─── Maximum depth ───────────────────────────────────────────────────────

describe("Maximum depth", () => {
  it("should accept values within default depth", () => {
    // Create a structure exactly at depth 20
    let value: unknown = "deep";
    for (let i = 0; i < 20; i++) {
      value = { value };
    }
    const result = sanitiseMetadata(value);
    expect(result.success).toBe(true);
  });

  it("should reject values exceeding default depth", () => {
    let value: unknown = "deep";
    for (let i = 0; i < 22; i++) {
      value = { value };
    }
    const result = sanitiseMetadata(value);
    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error.message).toContain("Maximum depth");
    }
  });

  it("should respect custom depth option", () => {
    let value: unknown = "deep";
    for (let i = 0; i < 3; i++) {
      value = { value };
    }
    // Depth 2 should reject this
    const result = sanitiseMetadata(value, { maxDepth: 2 });
    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error.message).toContain("Maximum depth of 2");
    }
  });

  it("should accept deep arrays within custom depth", () => {
    let value: unknown = "deep";
    for (let i = 0; i < 5; i++) {
      value = [value];
    }
    const result = sanitiseMetadata(value, { maxDepth: 6 });
    expect(result.success).toBe(true);
  });

  it("should reject deep arrays exceeding custom depth", () => {
    let value: unknown = "deep";
    for (let i = 0; i < 6; i++) {
      value = [value];
    }
    const result = sanitiseMetadata(value, { maxDepth: 5 });
    expect(result.success).toBe(false);
  });
});

// ─── Collection limits ───────────────────────────────────────────────────

describe("Collection limits", () => {
  it("should reject arrays exceeding maxArrayLength", () => {
    const arr = new Array(501).fill("x");
    const result = sanitiseMetadata(arr, { maxArrayLength: 500 });
    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error.message).toContain("Array length 501");
      expect(result.error.message).toContain("maximum of 500");
    }
  });

  it("should reject objects exceeding maxObjectKeyCount", () => {
    const obj: Record<string, number> = {};
    for (let i = 0; i < 51; i++) {
      obj[`k${i}`] = i;
    }
    const result = sanitiseMetadata(obj, { maxObjectKeyCount: 50 });
    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error.message).toContain("Object key count 51");
      expect(result.error.message).toContain("maximum of 50");
    }
  });

  it("should report path for nested collection limit violations", () => {
    const input = {
      items: new Array(101).fill(1),
    };
    const result = sanitiseMetadata(input, { maxArrayLength: 100 });
    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error.path).toEqual(["items"]);
    }
  });

  it("should accept exactly at limit", () => {
    const arr = new Array(10).fill(1);
    const result = sanitiseMetadata(arr, { maxArrayLength: 10 });
    expect(result.success).toBe(true);
  });
});

// ─── Structured error paths ──────────────────────────────────────────────

describe("Structured error paths", () => {
  it("should report path for top-level undefined", () => {
    const result = sanitiseMetadata(undefined);
    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error.path).toEqual([]);
    }
  });

  it("should report path for nested invalid values in objects", () => {
    const input = { user: { profile: { name: undefined } } };
    const result = sanitiseMetadata(input);
    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error.path).toEqual(["user", "profile", "name"]);
    }
  });

  it("should report path for invalid values in arrays", () => {
    const input = ["ok", 42, Symbol("bad"), "ok"];
    const result = sanitiseMetadata(input);
    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error.path).toEqual(["[2]"]);
    }
  });

  it("should report path for invalid values in nested arrays", () => {
    const input = [[1, 2], [3, undefined]];
    const result = sanitiseMetadata(input);
    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error.path).toEqual(["[1]", "[1]"]);
    }
  });

  it("should report path for invalid values in mixed structures", () => {
    const input = {
      users: [
        { name: "Alice", tags: [1, Symbol("bad")] },
      ],
    };
    const result = sanitiseMetadata(input);
    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error.path).toEqual(["users", "[0]", "tags", "[1]"]);
    }
  });

  it("should report path for NaN deep inside structure", () => {
    const input = { level1: { level2: [1, NaN, 3] } };
    const result = sanitiseMetadata(input);
    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error.path).toEqual(["level1", "level2", "[1]"]);
    }
  });
});

// ─── Determinism ─────────────────────────────────────────────────────────

describe("Determinism", () => {
  it("should produce identical results for the same input", () => {
    const input = { a: 1, b: [2, 3], c: { d: "hello" } };
    const result1 = sanitiseMetadata(input);
    const result2 = sanitiseMetadata(input);
    expect(result1).toEqual(result2);
  });

  it("should produce identical error results for the same invalid input", () => {
    const input = { a: undefined };
    const result1 = sanitiseMetadata(input);
    const result2 = sanitiseMetadata(input);
    expect(result1).toEqual(result2);
  });

  it("should produce identical results for the same options", () => {
    const input = new Array(501).fill(1);
    const result1 = sanitiseMetadata(input, { maxArrayLength: 500 });
    const result2 = sanitiseMetadata(input, { maxArrayLength: 500 });
    expect(result1).toEqual(result2);
  });
});

// ─── No mutation ─────────────────────────────────────────────────────────

describe("No mutation", () => {
  it("should not mutate the input object", () => {
    const input = { a: 1, b: [2, 3], c: { d: "hello" } };
    const frozen = JSON.parse(JSON.stringify(input));
    sanitiseMetadata(input);
    expect(input).toEqual(frozen);
  });

  it("should not mutate nested objects", () => {
    const nested = { inner: { value: "test" } };
    const input = { data: nested };
    const originalInner = JSON.parse(JSON.stringify(nested));
    sanitiseMetadata(input);
    expect(nested).toEqual(originalInner);
  });

  it("should return fresh output objects (not references to input)", () => {
    const input = { a: { b: 1 } };
    const result = sanitiseMetadata(input);
    expect(result.success).toBe(true);
    if (result.success) {
      const data = result.data as Record<string, unknown>;
      expect(data.a).not.toBe(input.a);
    }
  });

  it("should return fresh arrays (not references to input)", () => {
    const input = [1, [2, 3]];
    const result = sanitiseMetadata(input);
    expect(result.success).toBe(true);
    if (result.success) {
      const data = result.data as unknown[];
      expect(data).not.toBe(input);
      expect(data[1]).not.toBe(input[1]);
    }
  });

  it("should not be affected by post-sanitisation mutations to input", () => {
    const input: Record<string, unknown> = { a: 1 };
    const result = sanitiseMetadata(input);
    input.a = 999;
    input.b = "new";
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data).toEqual({ a: 1 });
    }
  });
});

// ─── sanitiseMetadataOrThrow ─────────────────────────────────────────────

describe("sanitiseMetadataOrThrow", () => {
  it("should return value on success", () => {
    const result = sanitiseMetadataOrThrow({ a: 1, b: "hello" });
    expect(result).toEqual({ a: 1, b: "hello" });
  });

  it("should throw SanitisationError on failure", () => {
    expect(() => sanitiseMetadataOrThrow({ a: undefined })).toThrow(
      SanitisationError,
    );
  });

  it("should throw with correct message", () => {
    try {
      sanitiseMetadataOrThrow({ user: { name: NaN } });
      expect.fail("Should have thrown");
    } catch (e) {
      expect(e).toBeInstanceOf(SanitisationError);
      expect((e as SanitisationError).message).toContain("user.name");
      expect((e as SanitisationError).message).toContain("Invalid number");
    }
  });

  it("should include validation error on the thrown error", () => {
    try {
      sanitiseMetadataOrThrow(Symbol("bad"));
      expect.fail("Should have thrown");
    } catch (e) {
      expect(e).toBeInstanceOf(SanitisationError);
      const err = e as SanitisationError;
      expect(err.validationError.message).toBe("Symbol values are not JSON-safe");
      expect(err.validationError.path).toEqual([]);
    }
  });
});

// ─── Edge cases ──────────────────────────────────────────────────────────

describe("Edge cases", () => {
  it("should accept Object.create(null)", () => {
    const input = Object.create(null);
    input.key = "value";
    const result = sanitiseMetadata(input);
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data).toEqual({ key: "value" });
    }
  });

  it("should accept empty string keys", () => {
    const input = { "": "empty key" };
    const result = sanitiseMetadata(input);
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data).toEqual({ "": "empty key" });
    }
  });

  it("should accept unicode string keys", () => {
    const input = { "日本語": "value", "🔑": "emoji key" };
    const result = sanitiseMetadata(input);
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data).toEqual({ "日本語": "value", "🔑": "emoji key" });
    }
  });

  it("should accept deeply nested valid structures", () => {
    let value: unknown = "leaf";
    for (let i = 0; i < 15; i++) {
      value = { [`level${i}`]: value };
    }
    const result = sanitiseMetadata(value);
    expect(result.success).toBe(true);
  });

  it("should handle mixed array with various invalid types", () => {
    const input = [1, "ok", null, true, undefined, Symbol("x")];
    const result = sanitiseMetadata(input);
    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error.path).toEqual(["[4]"]);
    }
  });

  it("should handle objects with only dangerous keys", () => {
    const input = JSON.parse('{"__proto__": 1}');
    const result = sanitiseMetadata(input);
    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error.path).toContain("__proto__");
    }
  });

  it("should accept objects with numeric string keys", () => {
    const input = { "0": "a", "1": "b", "2": "c" };
    const result = sanitiseMetadata(input);
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data).toEqual({ "0": "a", "1": "b", "2": "c" });
    }
  });

  it("should handle default options correctly", () => {
    const result = sanitiseMetadata({ a: 1 });
    expect(result.success).toBe(true);
  });

  it("should handle all empty options", () => {
    const result = sanitiseMetadata({ a: 1 }, {});
    expect(result.success).toBe(true);
  });

  it("should handle class with custom toString", () => {
    class Custom {
      toString() {
        return "custom";
      }
    }
    const result = sanitiseMetadata(new Custom());
    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error.message).toContain("Class instances");
    }
  });
});
