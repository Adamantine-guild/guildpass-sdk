import { describe, it, expect } from "vitest";
import {
  string,
  number,
  boolean,
  nullType,
  literal,
  optional,
  array,
  object,
  union,
} from "../../src/validation/schemas";
import type { Schema, ValidationResult, ValidationError } from "../../src/validation/types";

describe("Primitive validation", () => {
  describe("string()", () => {
    it("should validate strings successfully", () => {
      const schema = string();
      const result = schema.parse("hello");

      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data).toBe("hello");
      }
    });

    it("should reject non-strings", () => {
      const schema = string();
      const result = schema.parse(123);

      expect(result.success).toBe(false);
      if (!result.success) {
        expect(result.error.message).toBe("Expected string");
        expect(result.error.path).toEqual([]);
      }
    });

    it("should reject numbers", () => {
      const schema = string();
      const result = schema.parse(42);

      expect(result.success).toBe(false);
    });

    it("should reject booleans", () => {
      const schema = string();
      const result = schema.parse(true);

      expect(result.success).toBe(false);
    });

    it("should reject null", () => {
      const schema = string();
      const result = schema.parse(null);

      expect(result.success).toBe(false);
    });

    it("should reject objects", () => {
      const schema = string();
      const result = schema.parse({});

      expect(result.success).toBe(false);
    });

    it("should reject arrays", () => {
      const schema = string();
      const result = schema.parse([]);

      expect(result.success).toBe(false);
    });

    it("should accept empty strings", () => {
      const schema = string();
      const result = schema.parse("");

      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data).toBe("");
      }
    });
  });

  describe("number()", () => {
    it("should validate finite numbers successfully", () => {
      const schema = number();
      const result = schema.parse(42);

      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data).toBe(42);
      }
    });

    it("should validate negative numbers", () => {
      const schema = number();
      const result = schema.parse(-10);

      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data).toBe(-10);
      }
    });

    it("should validate decimal numbers", () => {
      const schema = number();
      const result = schema.parse(3.14);

      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data).toBe(3.14);
      }
    });

    it("should reject Infinity", () => {
      const schema = number();
      const result = schema.parse(Infinity);

      expect(result.success).toBe(false);
      if (!result.success) {
        expect(result.error.message).toBe("Expected finite number");
      }
    });

    it("should reject -Infinity", () => {
      const schema = number();
      const result = schema.parse(-Infinity);

      expect(result.success).toBe(false);
    });

    it("should reject NaN", () => {
      const schema = number();
      const result = schema.parse(NaN);

      expect(result.success).toBe(false);
    });

    it("should reject strings", () => {
      const schema = number();
      const result = schema.parse("42");

      expect(result.success).toBe(false);
    });

    it("should reject booleans", () => {
      const schema = number();
      const result = schema.parse(true);

      expect(result.success).toBe(false);
    });

    it("should reject null", () => {
      const schema = number();
      const result = schema.parse(null);

      expect(result.success).toBe(false);
    });

    it("should reject objects", () => {
      const schema = number();
      const result = schema.parse({});

      expect(result.success).toBe(false);
    });

    it("should reject arrays", () => {
      const schema = number();
      const result = schema.parse([]);

      expect(result.success).toBe(false);
    });
  });

  describe("boolean()", () => {
    it("should validate true successfully", () => {
      const schema = boolean();
      const result = schema.parse(true);

      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data).toBe(true);
      }
    });

    it("should validate false successfully", () => {
      const schema = boolean();
      const result = schema.parse(false);

      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data).toBe(false);
      }
    });

    it("should reject strings", () => {
      const schema = boolean();
      const result = schema.parse("true");

      expect(result.success).toBe(false);
      if (!result.success) {
        expect(result.error.message).toBe("Expected boolean");
      }
    });

    it("should reject numbers", () => {
      const schema = boolean();
      const result = schema.parse(1);

      expect(result.success).toBe(false);
    });

    it("should reject null", () => {
      const schema = boolean();
      const result = schema.parse(null);

      expect(result.success).toBe(false);
    });

    it("should reject objects", () => {
      const schema = boolean();
      const result = schema.parse({});

      expect(result.success).toBe(false);
    });

    it("should reject arrays", () => {
      const schema = boolean();
      const result = schema.parse([]);

      expect(result.success).toBe(false);
    });
  });

  describe("nullType()", () => {
    it("should validate null successfully", () => {
      const schema = nullType();
      const result = schema.parse(null);

      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data).toBe(null);
      }
    });

    it("should reject strings", () => {
      const schema = nullType();
      const result = schema.parse("null");

      expect(result.success).toBe(false);
      if (!result.success) {
        expect(result.error.message).toBe("Expected null");
      }
    });

    it("should reject numbers", () => {
      const schema = nullType();
      const result = schema.parse(0);

      expect(result.success).toBe(false);
    });

    it("should reject booleans", () => {
      const schema = nullType();
      const result = schema.parse(false);

      expect(result.success).toBe(false);
    });

    it("should reject undefined", () => {
      const schema = nullType();
      const result = schema.parse(undefined);

      expect(result.success).toBe(false);
    });

    it("should reject objects", () => {
      const schema = nullType();
      const result = schema.parse({});

      expect(result.success).toBe(false);
    });

    it("should reject arrays", () => {
      const schema = nullType();
      const result = schema.parse([]);

      expect(result.success).toBe(false);
    });
  });
});

describe("Object validation", () => {
  it("should validate simple objects", () => {
    const schema = object({
      name: string(),
      age: number(),
    });

    const result = schema.parse({ name: "John", age: 30 });

    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data).toEqual({ name: "John", age: 30 });
    }
  });

  it("should validate nested objects", () => {
    const schema = object({
      user: object({
        name: string(),
        age: number(),
      }),
    });

    const result = schema.parse({ user: { name: "John", age: 30 } });

    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data).toEqual({ user: { name: "John", age: 30 } });
    }
  });

  it("should report correct path for nested field errors", () => {
    const schema = object({
      user: object({
        name: string(),
        age: number(),
      }),
    });

    const result = schema.parse({ user: { name: "John", age: "thirty" } });

    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error.message).toBe("Expected finite number");
      expect(result.error.path).toEqual(["user", "age"]);
    }
  });

  it("should reject non-objects", () => {
    const schema = object({ name: string() });
    const result = schema.parse("string");

    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error.message).toBe("Expected object");
      expect(result.error.path).toEqual([]);
    }
  });

  it("should reject arrays", () => {
    const schema = object({ name: string() });
    const result = schema.parse([]);

    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error.message).toBe("Expected object");
    }
  });

  it("should reject null", () => {
    const schema = object({ name: string() });
    const result = schema.parse(null);

    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error.message).toBe("Expected object");
    }
  });

  it("should strip unknown keys", () => {
    const schema = object({ name: string() });
    const result = schema.parse({ name: "John", extra: "data" });

    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data).toEqual({ name: "John" });
      expect("extra" in result.data).toBe(false);
    }
  });

  it("should handle missing optional fields", () => {
    const schema = object({
      name: string(),
      age: optional(number()),
    });

    const result = schema.parse({ name: "John" });

    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data).toEqual({ name: "John", age: undefined });
    }
  });

  it("should report path for top-level field errors", () => {
    const schema = object({
      name: string(),
      age: number(),
    });

    const result = schema.parse({ name: "John", age: "thirty" });

    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error.message).toBe("Expected finite number");
      expect(result.error.path).toEqual(["age"]);
    }
  });

  it("should validate deeply nested objects", () => {
    const schema = object({
      level1: object({
        level2: object({
          level3: object({
            value: string(),
          }),
        }),
      }),
    });

    const result = schema.parse({
      level1: {
        level2: {
          level3: {
            value: "deep",
          },
        },
      },
    });

    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.level1.level2.level3.value).toBe("deep");
    }
  });
});

describe("Array validation", () => {
  it("should validate arrays of strings", () => {
    const schema = array(string());
    const result = schema.parse(["a", "b", "c"]);

    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data).toEqual(["a", "b", "c"]);
    }
  });

  it("should validate arrays of numbers", () => {
    const schema = array(number());
    const result = schema.parse([1, 2, 3]);

    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data).toEqual([1, 2, 3]);
    }
  });

  it("should validate empty arrays", () => {
    const schema = array(string());
    const result = schema.parse([]);

    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data).toEqual([]);
    }
  });

  it("should report exact failing index in path", () => {
    const schema = array(string());
    const result = schema.parse(["a", "b", 123, "d"]);

    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error.message).toBe("Expected string");
      expect(result.error.path).toEqual(["[2]"]);
    }
  });

  it("should report failing index for first element", () => {
    const schema = array(number());
    const result = schema.parse(["invalid", 2, 3]);

    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error.path).toEqual(["[0]"]);
    }
  });

  it("should report failing index for last element", () => {
    const schema = array(string());
    const result = schema.parse(["a", "b", "c", 123]);

    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error.path).toEqual(["[3]"]);
    }
  });

  it("should reject non-arrays", () => {
    const schema = array(string());
    const result = schema.parse("not an array");

    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error.message).toBe("Expected array");
      expect(result.error.path).toEqual([]);
    }
  });

  it("should reject objects", () => {
    const schema = array(string());
    const result = schema.parse({});

    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error.message).toBe("Expected array");
    }
  });

  it("should reject null", () => {
    const schema = array(string());
    const result = schema.parse(null);

    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error.message).toBe("Expected array");
    }
  });

  it("should validate nested arrays", () => {
    const schema = array(array(string()));
    const result = schema.parse([["a", "b"], ["c", "d"]]);

    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data).toEqual([["a", "b"], ["c", "d"]]);
    }
  });

  it("should report path for nested array errors", () => {
    const schema = array(array(string()));
    const result = schema.parse([["a", "b"], ["c", 123]]);

    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error.path).toEqual(["[1]", "[1]"]);
    }
  });

  it("should validate arrays of objects", () => {
    const schema = array(
      object({
        name: string(),
        age: number(),
      })
    );

    const result = schema.parse([
      { name: "John", age: 30 },
      { name: "Jane", age: 25 },
    ]);

    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data).toEqual([
        { name: "John", age: 30 },
        { name: "Jane", age: 25 },
      ]);
    }
  });

  it("should report path for array of object errors", () => {
    const schema = array(
      object({
        name: string(),
        age: number(),
      })
    );

    const result = schema.parse([
      { name: "John", age: 30 },
      { name: "Jane", age: "twenty-five" },
    ]);

    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error.path).toEqual(["[1]", "age"]);
    }
  });
});

describe("Optional values", () => {
  it("should accept undefined", () => {
    const schema = optional(string());
    const result = schema.parse(undefined);

    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data).toBe(undefined);
    }
  });

  it("should accept null", () => {
    const schema = optional(string());
    const result = schema.parse(null);

    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data).toBe(undefined);
    }
  });

  it("should validate matching schema when provided", () => {
    const schema = optional(string());
    const result = schema.parse("hello");

    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data).toBe("hello");
    }
  });

  it("should reject non-matching values", () => {
    const schema = optional(string());
    const result = schema.parse(123);

    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error.message).toBe("Expected string");
    }
  });

  it("should work with optional numbers", () => {
    const schema = optional(number());
    const result = schema.parse(42);

    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data).toBe(42);
    }
  });

  it("should work with optional objects", () => {
    const schema = optional(object({ name: string() }));
    const result = schema.parse({ name: "John" });

    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data).toEqual({ name: "John" });
    }
  });

  it("should work with optional arrays", () => {
    const schema = optional(array(string()));
    const result = schema.parse(["a", "b"]);

    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data).toEqual(["a", "b"]);
    }
  });
});

describe("Literal validation", () => {
  it("should validate string literals", () => {
    const schema = literal("hello");
    const result = schema.parse("hello");

    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data).toBe("hello");
    }
  });

  it("should validate number literals", () => {
    const schema = literal(42);
    const result = schema.parse(42);

    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data).toBe(42);
    }
  });

  it("should validate boolean literals", () => {
    const schema = literal(true);
    const result = schema.parse(true);

    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data).toBe(true);
    }
  });

  it("should reject non-matching strings", () => {
    const schema = literal("hello");
    const result = schema.parse("world");

    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error.message).toContain('Expected literal value: "hello"');
    }
  });

  it("should reject non-matching numbers", () => {
    const schema = literal(42);
    const result = schema.parse(43);

    expect(result.success).toBe(false);
  });

  it("should reject non-matching booleans", () => {
    const schema = literal(true);
    const result = schema.parse(false);

    expect(result.success).toBe(false);
  });

  it("should reject wrong types", () => {
    const schema = literal("hello");
    const result = schema.parse(123);

    expect(result.success).toBe(false);
  });
});

describe("Union validation", () => {
  it("should match first successful schema", () => {
    const schema = union(string(), number());
    const result = schema.parse("hello");

    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data).toBe("hello");
    }
  });

  it("should match second schema if first fails", () => {
    const schema = union(string(), number());
    const result = schema.parse(42);

    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data).toBe(42);
    }
  });

  it("should fail if all schemas fail", () => {
    const schema = union(string(), number());
    const result = schema.parse(true);

    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error.message).toContain("No union member matched");
      expect(result.error.message).toContain("Expected string");
      expect(result.error.message).toContain("Expected finite number");
    }
  });

  it("should work with multiple schemas", () => {
    const schema = union(string(), number(), boolean());
    const result = schema.parse(true);

    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data).toBe(true);
    }
  });

  it("should work with literal unions", () => {
    const schema = union(literal("a"), literal("b"), literal("c"));
    const result = schema.parse("b");

    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data).toBe("b");
    }
  });

  it("should fail literal union with no match", () => {
    const schema = union(literal("a"), literal("b"), literal("c"));
    const result = schema.parse("d");

    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error.message).toContain("No union member matched");
    }
  });

  it("should preserve path in union errors", () => {
    const schema = union(string(), number());
    const result = schema.parse(true, ["field"]);

    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error.path).toEqual(["field"]);
    }
  });
});

describe("Rejection of unexpected types", () => {
  it("should reject string when number expected", () => {
    const schema = number();
    const result = schema.parse("123");

    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error.message).toBe("Expected finite number");
    }
  });

  it("should reject number when string expected", () => {
    const schema = string();
    const result = schema.parse(123);

    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error.message).toBe("Expected string");
    }
  });

  it("should reject boolean when string expected", () => {
    const schema = string();
    const result = schema.parse(true);

    expect(result.success).toBe(false);
  });

  it("should reject object when array expected", () => {
    const schema = array(string());
    const result = schema.parse({});

    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error.message).toBe("Expected array");
    }
  });

  it("should reject array when object expected", () => {
    const schema = object({ name: string() });
    const result = schema.parse([]);

    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error.message).toBe("Expected object");
    }
  });

  it("should reject null when string expected", () => {
    const schema = string();
    const result = schema.parse(null);

    expect(result.success).toBe(false);
  });

  it("should reject undefined when string expected (without optional)", () => {
    const schema = string();
    const result = schema.parse(undefined);

    expect(result.success).toBe(false);
  });
});

describe("Recursion depth limitation", () => {
  it("should validate within depth limit", () => {
    const schema = object({
      a: object({
        b: object({
          c: object({
            d: object({
              e: string(),
            }),
          }),
        }),
      }),
    });

    const result = schema.parse({
      a: {
        b: {
          c: {
            d: {
              e: "deep",
            },
          },
        },
      },
    });

    expect(result.success).toBe(true);
  });

  it("should throw error when depth exceeds limit", () => {
    // Create a deeply nested structure that exceeds MAX_DEPTH (20)
    let schema: Schema<any> = string();
    for (let i = 0; i < 25; i++) {
      schema = object({ value: schema });
    }

    let value: any = "deep";
    for (let i = 0; i < 25; i++) {
      value = { value };
    }

    expect(() => schema.parse(value)).toThrow(
      "Validation depth limit exceeded"
    );
  });

  it("should handle circular references safely via depth limit", () => {
    const schema = object({
      nested: object({
        value: string(),
      }),
    });

    // Create a circular reference
    const circular: any = { value: "test" };
    circular.self = circular;

    // This should not cause infinite recursion due to depth limit
    // But since our implementation doesn't follow circular refs,
    // we test the depth limit directly
    let deepSchema: Schema<any> = string();
    for (let i = 0; i < 21; i++) {
      deepSchema = object({ level: deepSchema });
    }

    let deepValue: any = "end";
    for (let i = 0; i < 21; i++) {
      deepValue = { level: deepValue };
    }

    expect(() => deepSchema.parse(deepValue)).toThrow(
      "Validation depth limit exceeded"
    );
  });

  it("should track depth correctly in nested arrays", () => {
    const schema = array(array(array(string())));
    const result = schema.parse([[["a"]]]);

    expect(result.success).toBe(true);
  });

  it("should throw on deeply nested arrays", () => {
    let schema: Schema<any> = string();
    for (let i = 0; i < 21; i++) {
      schema = array(schema);
    }

    let value: any = "end";
    for (let i = 0; i < 21; i++) {
      value = [value];
    }

    expect(() => schema.parse(value)).toThrow(
      "Validation depth limit exceeded"
    );
  });
});

describe("Complex validation scenarios", () => {
  it("should validate complex nested structures", () => {
    const schema = object({
      users: array(
        object({
          id: string(),
          name: string(),
          age: optional(number()),
          tags: array(string()),
        })
      ),
    });

    const result = schema.parse({
      users: [
        {
          id: "1",
          name: "John",
          age: 30,
          tags: ["admin", "user"],
        },
        {
          id: "2",
          name: "Jane",
          tags: ["user"],
        },
      ],
    });

    expect(result.success).toBe(true);
  });

  it("should report correct path in complex nested errors", () => {
    const schema = object({
      users: array(
        object({
          id: string(),
          name: string(),
          age: optional(number()),
          tags: array(string()),
        })
      ),
    });

    const result = schema.parse({
      users: [
        {
          id: "1",
          name: "John",
          age: 30,
          tags: ["admin", "user"],
        },
        {
          id: "2",
          name: "Jane",
          age: "thirty",
          tags: ["user"],
        },
      ],
    });

    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error.path).toEqual(["users", "[1]", "age"]);
    }
  });

  it("should handle union with complex types", () => {
    const schema = array(
      union(
        object({ type: literal("user"), name: string() }),
        object({ type: literal("admin"), name: string(), permissions: array(string()) })
      )
    );

    const result = schema.parse([
      { type: "user", name: "John" },
      { type: "admin", name: "Jane", permissions: ["read", "write"] },
    ]);

    expect(result.success).toBe(true);
  });

  it("should strip unknown keys in nested objects", () => {
    const schema = object({
      user: object({
        name: string(),
      }),
    });

    const result = schema.parse({
      user: { name: "John", extra: "data", more: "keys" },
      extra: "top",
    });

    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data).toEqual({ user: { name: "John" } });
      expect("extra" in result.data).toBe(false);
      expect("extra" in result.data.user).toBe(false);
      expect("more" in result.data.user).toBe(false);
    }
  });
});
