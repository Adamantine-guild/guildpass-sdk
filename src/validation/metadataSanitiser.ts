import type { ValidationError, ValidationResult } from "./types.js";

/**
 * A JSON-safe value type produced by the sanitiser.
 * Only contains primitives, arrays, and plain objects with string keys.
 */
export type JsonSafeValue =
  | null
  | boolean
  | number
  | string
  | JsonSafeValue[]
  | { [key: string]: JsonSafeValue };

/**
 * Configuration options for the metadata sanitiser.
 */
export interface MetadataSanitiserOptions {
  /** Maximum recursion depth. @default 20 */
  maxDepth?: number;
  /** Maximum allowed array length. @default 1000 */
  maxArrayLength?: number;
  /** Maximum allowed object key count. @default 100 */
  maxObjectKeyCount?: number;
}

/** Default maximum recursion depth. */
const DEFAULT_MAX_DEPTH = 20;

/** Default maximum array length. */
const DEFAULT_MAX_ARRAY_LENGTH = 1000;

/** Default maximum object key count. */
const DEFAULT_MAX_OBJECT_KEY_COUNT = 100;

/** Keys that must never be copied to prevent prototype pollution. */
const DANGEROUS_KEYS = new Set(["__proto__", "constructor", "prototype"]);

/**
 * Recursively sanitises an arbitrary runtime value into a deterministic,
 * JSON-safe representation. Returns a structured validation failure when the
 * input contains values that cannot be safely serialised.
 *
 * - Accepts: `null`, `boolean`, `string`, finite `number`, arrays, plain
 *   objects with own enumerable string keys.
 * - Rejects: `undefined`, `NaN`, `Infinity`, `-Infinity`, `BigInt`, `Symbol`,
 *   `Function`, class instances with non-plain prototypes, circular structures,
 *   and values exceeding configured depth/collection limits.
 *
 * The returned output is always freshly allocated — the input is never mutated.
 *
 * @param input   - Arbitrary runtime value to sanitise.
 * @param options - Optional configuration for depth, array, and key limits.
 * @returns A `ValidationResult` containing the sanitised value or an error
 *          with the exact failing path.
 */
export function sanitiseMetadata(
  input: unknown,
  options?: MetadataSanitiserOptions,
): ValidationResult<JsonSafeValue> {
  const maxDepth = options?.maxDepth ?? DEFAULT_MAX_DEPTH;
  const maxArrayLength = options?.maxArrayLength ?? DEFAULT_MAX_ARRAY_LENGTH;
  const maxObjectKeyCount =
    options?.maxObjectKeyCount ?? DEFAULT_MAX_OBJECT_KEY_COUNT;

  const seen = new Set<object>();

  function sanitise(
    value: unknown,
    path: string[],
    depth: number,
  ): ValidationResult<JsonSafeValue> {
    // ── depth guard ──────────────────────────────────────────────────────
    if (depth > maxDepth) {
      return {
        success: false,
        error: createError(
          `Maximum depth of ${maxDepth} exceeded`,
          path,
        ),
      };
    }

    // ── null ─────────────────────────────────────────────────────────────
    if (value === null) {
      return { success: true, data: null };
    }

    // ── primitives ───────────────────────────────────────────────────────
    if (typeof value === "boolean") {
      return { success: true, data: value };
    }

    if (typeof value === "string") {
      return { success: true, data: value };
    }

    if (typeof value === "number") {
      if (!Number.isFinite(value)) {
        return {
          success: false,
          error: createError(
            `Invalid number value: ${String(value)}`,
            path,
          ),
        };
      }
      return { success: true, data: value };
    }

    // ── unsupported primitives ───────────────────────────────────────────
    if (typeof value === "bigint") {
      return {
        success: false,
        error: createError(
          "BigInt values are not JSON-safe and must be converted before sanitisation",
          path,
        ),
      };
    }

    if (typeof value === "symbol") {
      return {
        success: false,
        error: createError("Symbol values are not JSON-safe", path),
      };
    }

    if (typeof value === "function") {
      return {
        success: false,
        error: createError("Function values are not JSON-safe", path),
      };
    }

    if (typeof value === "undefined") {
      return {
        success: false,
        error: createError("undefined is not JSON-safe", path),
      };
    }

    // ── arrays ───────────────────────────────────────────────────────────
    if (Array.isArray(value)) {
      if (value.length > maxArrayLength) {
        return {
          success: false,
          error: createError(
            `Array length ${value.length} exceeds maximum of ${maxArrayLength}`,
            path,
          ),
        };
      }

      // Cycle detection for arrays.
      if (seen.has(value as object)) {
        return {
          success: false,
          error: createError("Circular reference detected", path),
        };
      }
      seen.add(value as object);

      try {
        const result: JsonSafeValue[] = [];
        for (let i = 0; i < value.length; i++) {
          const itemPath = [...path, `[${i}]`];
          const itemResult = sanitise(value[i], itemPath, depth + 1);
          if (!itemResult.success) {
            return itemResult;
          }
          result.push(itemResult.data);
        }

        return { success: true, data: result };
      } finally {
        seen.delete(value as object);
      }
    }

    // ── objects (plain objects only) ─────────────────────────────────────
    if (typeof value === "object") {
      // Reject class instances — only plain objects (created via {} / Object.create(null))
      // or plain prototypes are accepted.
      const proto = Object.getPrototypeOf(value);
      if (proto !== null && proto !== Object.prototype) {
        return {
          success: false,
          error: createError(
            "Class instances and non-plain objects are not JSON-safe",
            path,
          ),
        };
      }

      // Cycle detection — must track before recursing into children.
      if (seen.has(value as object)) {
        return {
          success: false,
          error: createError("Circular reference detected", path),
        };
      }
      seen.add(value as object);

      try {
        const obj = value as Record<string, unknown>;
        const keys = Object.keys(obj);

        if (keys.length > maxObjectKeyCount) {
          return {
            success: false,
            error: createError(
              `Object key count ${keys.length} exceeds maximum of ${maxObjectKeyCount}`,
              path,
            ),
          };
        }

        const result: Record<string, JsonSafeValue> = {};
        for (const key of keys) {
          if (DANGEROUS_KEYS.has(key)) {
            return {
              success: false,
              error: createError(
                `Unsafe object key "${key}" is not allowed`,
                [...path, key],
              ),
            };
          }

          const fieldPath = [...path, key];
          const fieldResult = sanitise(obj[key], fieldPath, depth + 1);
          if (!fieldResult.success) {
            return fieldResult;
          }
          result[key] = fieldResult.data;
        }

        return { success: true, data: result };
      } finally {
        // Remove from tracking set so the same non-cyclic object can appear
        // in multiple places without being falsely flagged.
        seen.delete(value as object);
      }
    }

    // ── fallthrough — anything else (e.g. boxed primitives, RegExp, Map…) ─
    return {
      success: false,
      error: createError(
        `Unsupported value of type ${typeof value}`,
        path,
      ),
    };
  }

  function createError(message: string, errorPath: string[]): ValidationError {
    return { message, path: errorPath };
  }

  return sanitise(input, [], 0);
}

/**
 * Convenience wrapper that returns only the sanitised value, throwing a
 * {@link SanitisationError} when the input is unsafe.
 *
 * @throws {SanitisationError} If the input cannot be safely sanitised.
 */
export function sanitiseMetadataOrThrow(
  input: unknown,
  options?: MetadataSanitiserOptions,
): JsonSafeValue {
  const result = sanitiseMetadata(input, options);
  if (!result.success) {
    throw new SanitisationError(result.error);
  }
  return result.data;
}

/**
 * Error thrown by {@link sanitiseMetadataOrThrow} when sanitisation fails.
 */
export class SanitisationError extends Error {
  /** The structured validation error describing the failure. */
  public readonly validationError: ValidationError;

  constructor(validationError: ValidationError) {
    const pathStr =
      validationError.path.length > 0
        ? validationError.path.join(".")
        : "(root)";
    super(`Sanitisation failed at ${pathStr}: ${validationError.message}`);
    this.name = "SanitisationError";
    this.validationError = validationError;
  }
}
