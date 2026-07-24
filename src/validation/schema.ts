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

/**
 * Produces a human-readable description of why `value` failed validation,
 * or `null` if it passes. `path` locates the value within the larger
 * structure being validated (defaults to the root `$`).
 */
export type ExplainFn = (value: unknown, path?: string) => string | null;

/**
 * A {@link Validator} that can also describe its first mismatch via
 * {@link ExplainingValidator.explain}. All combinators in this module return
 * explaining validators; plain lambdas are still accepted anywhere a
 * `Validator` is expected, with a generic fallback message.
 */
export type ExplainingValidator<T> = Validator<T> & { explain: ExplainFn };

/** Renders a short, log-safe description of an offending value. */
function describeValue(value: unknown): string {
  if (value === null) return 'null';
  if (value === undefined) return 'undefined';
  if (typeof value === 'string') {
    const trimmed = value.length > 40 ? `${value.slice(0, 37)}...` : value;
    return `string ${JSON.stringify(trimmed)}`;
  }
  if (typeof value === 'number') return `number ${String(value)}`;
  if (typeof value === 'boolean') return `boolean ${String(value)}`;
  if (Array.isArray(value)) return `array(length ${value.length})`;
  if (typeof value === 'object') return 'object';
  return typeof value;
}

/**
 * Delegates to `inner.explain` when available, otherwise falls back to a
 * generic message for plain lambda validators.
 */
function explainInner(inner: Validator<unknown>, value: unknown, path: string): string | null {
  if (inner(value)) return null;
  const explainer = (inner as Partial<ExplainingValidator<unknown>>).explain;
  return explainer ? explainer(value, path) : `${path}: failed validation, got ${describeValue(value)}`;
}

/** Attaches an {@link ExplainFn} to a validator. */
function withExplain<T>(validator: Validator<T>, explain: ExplainFn): ExplainingValidator<T> {
  (validator as ExplainingValidator<T>).explain = explain;
  return validator as ExplainingValidator<T>;
}

/** Shared explain logic for the plain-object precondition. */
function explainPlainObject(value: unknown, path: string, what: string): string | null {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) {
    return `${path}: expected ${what}, got ${describeValue(value)}`;
  }
  return null;
}

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
export function string(): ExplainingValidator<string> {
  return withExplain(
    (value: unknown): value is string => typeof value === 'string',
    (value, path = '$') =>
      typeof value === 'string' ? null : `${path}: expected a string, got ${describeValue(value)}`,
  );
}

/** Validates a non-empty `string`. */
export function nonEmptyString(): ExplainingValidator<string> {
  return withExplain(
    (value: unknown): value is string =>
      typeof value === 'string' && value.length > 0,
    (value, path = '$') =>
      typeof value === 'string' && value.length > 0
        ? null
        : `${path}: expected a non-empty string, got ${describeValue(value)}`,
  );
}

/** Validates a finite `number` (excluding NaN, ±Infinity). */
export function number(): ExplainingValidator<number> {
  return withExplain(
    (value: unknown): value is number =>
      typeof value === 'number' && Number.isFinite(value),
    (value, path = '$') =>
      typeof value === 'number' && Number.isFinite(value)
        ? null
        : `${path}: expected a finite number, got ${describeValue(value)}`,
  );
}

/** Validates a `boolean`. */
export function boolean(): ExplainingValidator<boolean> {
  return withExplain(
    (value: unknown): value is boolean => typeof value === 'boolean',
    (value, path = '$') =>
      typeof value === 'boolean' ? null : `${path}: expected a boolean, got ${describeValue(value)}`,
  );
}

/** Validates a hex Ethereum address (0x-prefixed, 40 hex chars). */
export function address(): ExplainingValidator<string> {
  const ADDR_RE = /^0x[a-fA-F0-9]{40}$/;
  return withExplain(
    (value: unknown): value is string =>
      typeof value === 'string' && ADDR_RE.test(value),
    (value, path = '$') =>
      typeof value === 'string' && ADDR_RE.test(value)
        ? null
        : `${path}: expected a 0x-prefixed 20-byte hex address, got ${describeValue(value)}`,
  );
}

// ---------------------------------------------------------------------------
// Combinator validators
// ---------------------------------------------------------------------------

/**
 * Wraps an inner validator to also accept `undefined`.
 * Useful for optional object fields.
 */
export function optional<T>(inner: Validator<T>): ExplainingValidator<T | undefined> {
  return withExplain(
    (value: unknown): value is T | undefined =>
      value === undefined || inner(value),
    (value, path = '$') =>
      value === undefined ? null : explainInner(inner, value, path),
  );
}

/**
 * Validates that a value is an array where every element passes `inner`.
 */
export function array<T>(inner: Validator<T>): ExplainingValidator<T[]> {
  return withExplain(
    (value: unknown): value is T[] =>
      Array.isArray(value) && value.every((v) => inner(v)),
    (value, path = '$') => {
      if (!Array.isArray(value)) return `${path}: expected an array, got ${describeValue(value)}`;
      for (let i = 0; i < value.length; i++) {
        const mismatch = explainInner(inner, value[i], `${path}[${i}]`);
        if (mismatch) return mismatch;
      }
      return null;
    },
  );
}

/**
 * Validates a non-empty array where every element passes `inner`.
 */
export function nonEmptyArray<T>(inner: Validator<T>): ExplainingValidator<T[]> {
  return withExplain(
    (value: unknown): value is T[] =>
      Array.isArray(value) && value.length > 0 && value.every((v) => inner(v)),
    (value, path = '$') => {
      if (!Array.isArray(value)) return `${path}: expected a non-empty array, got ${describeValue(value)}`;
      if (value.length === 0) return `${path}: expected a non-empty array, got array(length 0)`;
      for (let i = 0; i < value.length; i++) {
        const mismatch = explainInner(inner, value[i], `${path}[${i}]`);
        if (mismatch) return mismatch;
      }
      return null;
    },
  );
}

/**
 * Validates a `Record<string, V>` where every value passes `inner`.
 */
export function record<V>(inner: Validator<V>): ExplainingValidator<Record<string, V>> {
  return withExplain(
    (value: unknown): value is Record<string, V> => {
      if (typeof value !== 'object' || value === null || Array.isArray(value)) {
        return false;
      }
      const obj = value as Record<string, unknown>;
      for (const key of Object.keys(obj)) {
        if (typeof key !== 'string') return false;
        if (!inner(obj[key])) return false;
      }
      return true;
    },
    (value, path = '$') => {
      const notObject = explainPlainObject(value, path, 'a record object');
      if (notObject) return notObject;
      const obj = value as Record<string, unknown>;
      for (const key of Object.keys(obj)) {
        const mismatch = explainInner(inner, obj[key], `${path}.${key}`);
        if (mismatch) return mismatch;
      }
      return null;
    },
  );
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
): ExplainingValidator<InferShape<S>> {
  return withExplain(
    (value: unknown): value is InferShape<S> => {
      if (typeof value !== 'object' || value === null || Array.isArray(value)) {
        return false;
      }
      const obj = value as Record<string, unknown>;
      for (const key of Object.keys(shape)) {
        if (!shape[key](obj[key])) return false;
      }
      return true;
    },
    (value, path = '$') => {
      const notObject = explainPlainObject(value, path, 'an object');
      if (notObject) return notObject;
      const obj = value as Record<string, unknown>;
      for (const key of Object.keys(shape)) {
        const mismatch = explainInner(shape[key], obj[key], `${path}.${key}`);
        if (mismatch) return mismatch;
      }
      return null;
    },
  );
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
): ExplainingValidator<InferShape<S>> {
  return withExplain(
    (value: unknown): value is InferShape<S> => {
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
    },
    (value, path = '$') => {
      const notObject = explainPlainObject(value, path, 'an object');
      if (notObject) return notObject;
      const obj = value as Record<string, unknown>;
      const allowed = new Set(Object.keys(shape));
      for (const key of Object.keys(obj)) {
        if (!allowed.has(key)) return `${path}: unexpected field "${key}"`;
      }
      for (const key of Object.keys(shape)) {
        const mismatch = explainInner(shape[key], obj[key], `${path}.${key}`);
        if (mismatch) return mismatch;
      }
      return null;
    },
  );
}
