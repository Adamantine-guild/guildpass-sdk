/** Scalar values supported by the query serializer. */
export type QueryScalar = string | number | boolean | Date;

/** A supported query value; nullish values are omitted from the output. */
export type QueryValue = QueryScalar | readonly string[] | readonly number[] | null | undefined;

/** Immutable query parameter input accepted by {@link serializeQuery}. */
export type QueryParameters = Readonly<Record<string, QueryValue>>;

/** Thrown when a query value cannot be represented deterministically. */
export class InvalidQueryValueError extends TypeError {
  constructor(message: string) {
    super(message);
    this.name = "InvalidQueryValueError";
  }
}

function serializeScalar(value: QueryScalar, key: string): string {
  if (typeof value === "string") {
    return value;
  }

  if (typeof value === "boolean") {
    return value ? "true" : "false";
  }

  if (typeof value === "number") {
    if (!Number.isFinite(value)) {
      throw new InvalidQueryValueError(`Query parameter "${key}" must be finite`);
    }
    return Object.is(value, -0) ? "0" : String(value);
  }

  if (value instanceof Date) {
    if (Number.isNaN(value.getTime())) {
      throw new InvalidQueryValueError(`Query parameter "${key}" is an invalid Date`);
    }
    return value.toISOString();
  }

  throw new InvalidQueryValueError(`Query parameter "${key}" has an unsupported value`);
}

/**
 * Serializes supported query values into a deterministic URL query string.
 * Null and undefined values are omitted. Arrays use repeated keys and preserve
 * their item order; parameter names are sorted lexicographically.
 */
export function serializeQuery(parameters: QueryParameters): string {
  const search = new URLSearchParams();
  const keys = Object.keys(parameters).sort();

  for (const key of keys) {
    const value = parameters[key];
    if (value === null || value === undefined) {
      continue;
    }

    if (Array.isArray(value)) {
      for (const item of value) {
        if (typeof item !== "string" && typeof item !== "number") {
          throw new InvalidQueryValueError(
            `Query parameter "${key}" contains an unsupported array item`,
          );
        }
        search.append(key, serializeScalar(item, key));
      }
      continue;
    }

    search.append(key, serializeScalar(value as QueryScalar, key));
  }

  return search.toString();
}
