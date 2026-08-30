import type {
  Schema,
  ValidationError,
  ValidationResult,
} from "./types.js";
import { MAX_DEPTH } from "./types.js";

/**
 * Helper function to create a validation error.
 */
function createError(message: string, path: string[]): ValidationError {
  return { message, path };
}

/**
 * Helper function to check depth limit.
 */
function checkDepth(depth?: number): void {
  if (depth !== undefined && depth > MAX_DEPTH) {
    throw new Error(
      `Validation depth limit exceeded (max: ${MAX_DEPTH}). This may indicate circular data.`
    );
  }
}

/**
 * String schema - validates that input is a string.
 */
export function string(): Schema<string> {
  return {
    parse(input: unknown, path: string[] = [], depth: number = 0): ValidationResult<string> {
      checkDepth(depth);
      if (typeof input === "string") {
        return { success: true, data: input };
      }
      return {
        success: false,
        error: createError("Expected string", path),
      };
    },
  };
}

/**
 * Number schema - validates that input is a finite number.
 */
export function number(): Schema<number> {
  return {
    parse(input: unknown, path: string[] = [], depth: number = 0): ValidationResult<number> {
      checkDepth(depth);
      if (typeof input === "number" && Number.isFinite(input)) {
        return { success: true, data: input };
      }
      return {
        success: false,
        error: createError("Expected finite number", path),
      };
    },
  };
}

/**
 * Boolean schema - validates that input is a boolean.
 */
export function boolean(): Schema<boolean> {
  return {
    parse(input: unknown, path: string[] = [], depth: number = 0): ValidationResult<boolean> {
      checkDepth(depth);
      if (typeof input === "boolean") {
        return { success: true, data: input };
      }
      return {
        success: false,
        error: createError("Expected boolean", path),
      };
    },
  };
}

/**
 * Null schema - validates that input is null.
 */
export function nullType(): Schema<null> {
  return {
    parse(input: unknown, path: string[] = [], depth: number = 0): ValidationResult<null> {
      checkDepth(depth);
      if (input === null) {
        return { success: true, data: input };
      }
      return {
        success: false,
        error: createError("Expected null", path),
      };
    },
  };
}

/**
 * Literal schema - validates that input exactly matches the given value.
 */
export function literal<T extends string | number | boolean>(value: T): Schema<T> {
  return {
    parse(input: unknown, path: string[] = [], depth: number = 0): ValidationResult<T> {
      checkDepth(depth);
      if (input === value) {
        return { success: true, data: input as T };
      }
      return {
        success: false,
        error: createError(`Expected literal value: ${JSON.stringify(value)}`, path),
      };
    },
  };
}

/**
 * Optional schema - allows undefined or null, or validates against the underlying schema.
 */
export function optional<T>(schema: Schema<T>): Schema<T | undefined> {
  return {
    parse(input: unknown, path: string[] = [], depth: number = 0): ValidationResult<T | undefined> {
      checkDepth(depth);
      if (input === undefined || input === null) {
        return { success: true, data: undefined };
      }
      return schema.parse(input, path, depth);
    },
  };
}

/**
 * Array schema - validates that input is an array and each item matches the schema.
 */
export function array<T>(itemSchema: Schema<T>): Schema<T[]> {
  return {
    parse(input: unknown, path: string[] = [], depth: number = 0): ValidationResult<T[]> {
      checkDepth(depth);
      if (!Array.isArray(input)) {
        return {
          success: false,
          error: createError("Expected array", path),
        };
      }

      const result: T[] = [];
      for (let i = 0; i < input.length; i++) {
        const itemPath = [...path, `[${i}]`];
        const itemResult = itemSchema.parse(input[i], itemPath, depth + 1);
        if (!itemResult.success) {
          return itemResult;
        }
        result.push(itemResult.data);
      }

      return { success: true, data: result };
    },
  };
}

/**
 * Object schema - validates object shapes with explicitly declared keys.
 * Unknown keys are stripped from the result.
 */
export function object<T extends Record<string, Schema<any>>>(
  shape: T
): Schema<{ [K in keyof T]: T[K] extends Schema<infer V> ? V : never }> {
  return {
    parse(input: unknown, path: string[] = [], depth: number = 0): ValidationResult<any> {
      checkDepth(depth);
      if (typeof input !== "object" || input === null || Array.isArray(input)) {
        return {
          success: false,
          error: createError("Expected object", path),
        };
      }

      const result: Record<string, unknown> = {};
      const obj = input as Record<string, unknown>;

      for (const key in shape) {
        if (Object.prototype.hasOwnProperty.call(shape, key)) {
          const fieldPath = [...path, key];
          const fieldSchema = shape[key];
          const fieldResult = fieldSchema.parse(obj[key], fieldPath, depth + 1);
          if (!fieldResult.success) {
            return fieldResult;
          }
          result[key] = fieldResult.data;
        }
      }

      return { success: true, data: result };
    },
  };
}

/**
 * Union schema - tries each schema sequentially until one succeeds.
 * If all fail, returns a structured union error.
 */
export function union<T>(...schemas: Schema<T>[]): Schema<T> {
  return {
    parse(input: unknown, path: string[] = [], depth: number = 0): ValidationResult<T> {
      checkDepth(depth);
      const errors: string[] = [];

      for (const schema of schemas) {
        const result = schema.parse(input, path, depth);
        if (result.success) {
          return result;
        }
        errors.push(result.error.message);
      }

      return {
        success: false,
        error: createError(
          `No union member matched. Errors: ${errors.join("; ")}`,
          path
        ),
      };
    },
  };
}
