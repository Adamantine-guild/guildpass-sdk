/**
 * Minimal internal schema micro-DSL for response validation.
 *
 * Provides a small set of composable validator combinators — no dependencies,
 * minimal bundle footprint. Designed for validating API response shapes at
 * runtime when `validateResponses` is enabled.
 *
 * Each combinator returns a type predicate `(value: unknown) => value is T`
 * so they compose naturally and integrate with TypeScript's control-flow
 * narrowing.
 *
 * @example
 * const UserSchema = object({
 *   id: string(),
 *   name: nonEmptyString(),
 *   email: optional(string()),
 *   roles: array(string()),
 * });
 *
 * if (UserSchema(someValue)) {
 *   someValue.name; // TypeScript knows this is a non-empty string
 * }
 */

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

/** A validator that narrows `unknown` to `T`. */
export type Validator<T> = (value: unknown) => value is T;

/** Shape descriptor for `object()` — maps field names to validators. */
export type ShapeDescriptor = Record<string, Validator<unknown>>;

/** Infers the static type from a shape descriptor. */
export type InferShape<S extends ShapeDescriptor> = {
  [K in keyof S]: S[K] extends Validator<infer T> ? T : never;
};

// ---------------------------------------------------------------------------
// Primitive validators
// ---------------------------------------------------------------------------

/** Validates a `string` value. */
export function string(): Validator<string> {
  return (value: unknown): value is string => typeof value === 'string';
}

/** Validates a non-empty `string`. */
export function nonEmptyString(): Validator<string> {
  return (value: unknown): value is string =>
    typeof value === 'string' && value.length > 0;
}

/** Validates a finite `number` (excluding NaN, ±Infinity). */
export function number(): Validator<number> {
  return (value: unknown): value is number =>
    typeof value === 'number' && Number.isFinite(value);
}

/** Validates a `boolean`. */
export function boolean(): Validator<boolean> {
  return (value: unknown): value is boolean => typeof value === 'boolean';
}

/** Validates a hex Ethereum address (0x-prefixed, 40 hex chars). */
export function address(): Validator<string> {
  const ADDR_RE = /^0x[a-fA-F0-9]{40}$/;
  return (value: unknown): value is string =>
    typeof value === 'string' && ADDR_RE.test(value);
}

// ---------------------------------------------------------------------------
// Combinator validators
// ---------------------------------------------------------------------------

/**
 * Wraps an inner validator to also accept `undefined`.
 * Useful for optional object fields.
 */
export function optional<T>(inner: Validator<T>): Validator<T | undefined> {
  return (value: unknown): value is T | undefined =>
    value === undefined || inner(value);
}

/**
 * Validates that a value is an array where every element passes `inner`.
 */
export function array<T>(inner: Validator<T>): Validator<T[]> {
  return (value: unknown): value is T[] =>
    Array.isArray(value) && value.every((v) => inner(v));
}

/**
 * Validates a non-empty array where every element passes `inner`.
 */
export function nonEmptyArray<T>(inner: Validator<T>): Validator<T[]> {
  return (value: unknown): value is T[] =>
    Array.isArray(value) && value.length > 0 && value.every((v) => inner(v));
}

/**
 * Validates a `Record<string, V>` where every value passes `inner`.
 */
export function record<V>(inner: Validator<V>): Validator<Record<string, V>> {
  return (value: unknown): value is Record<string, V> => {
    if (typeof value !== 'object' || value === null || Array.isArray(value)) {
      return false;
    }
    const obj = value as Record<string, unknown>;
    for (const key of Object.keys(obj)) {
      if (typeof key !== 'string') return false;
      if (!inner(obj[key])) return false;
    }
    return true;
  };
}

// ---------------------------------------------------------------------------
// Object validator
// ---------------------------------------------------------------------------

/**
 * Validates a plain object conforming to a shape descriptor.
 *
 * Every field listed in `shape` must be present (unless wrapped in `optional()`)
 * and pass its corresponding validator. Extra fields are ignored (permissive).
 */
export function object<S extends ShapeDescriptor>(
  shape: S,
): Validator<InferShape<S>> {
  return (value: unknown): value is InferShape<S> => {
    if (typeof value !== 'object' || value === null || Array.isArray(value)) {
      return false;
    }
    const obj = value as Record<string, unknown>;
    for (const key of Object.keys(shape)) {
      if (!shape[key](obj[key])) return false;
    }
    return true;
  };
}

// ---------------------------------------------------------------------------
// Utility: strict object (rejects extra fields)
// ---------------------------------------------------------------------------

/**
 * Like `object()` but also rejects values that have keys NOT in the shape.
 * Useful when you want to ensure no unexpected fields sneak through.
 */
export function strictObject<S extends ShapeDescriptor>(
  shape: S,
): Validator<InferShape<S>> {
  return (value: unknown): value is InferShape<S> => {
    if (typeof value !== 'object' || value === null || Array.isArray(value)) {
      return false;
    }
    const obj = value as Record<string, unknown>;
    const allowed = new Set(Object.keys(shape));
    for (const key of Object.keys(obj)) {
      if (!allowed.has(key)) return false;
    }
    for (const key of Object.keys(shape)) {
      if (!shape[key](obj[key])) return false;
    }
    return true;
  };
}
