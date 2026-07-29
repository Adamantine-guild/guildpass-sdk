// GuildPass SDK: Pull in package or module bindings.
import { GuildPassErrorCode } from './errorCodes';
import { isGuildPassError } from './guards';

const VALID_ERROR_CODES = new Set<string>(Object.values(GuildPassErrorCode));

/**
 * Narrows an arbitrary value to a real {@link GuildPassErrorCode} member.
 *
 * A `code` that merely looks like one — `undefined` from a member that was
 * referenced but never declared, or a string from a provider compiled against
 * a different SDK version — must not reach a caller who is branching on the
 * enum. Internal; not re-exported from any barrel.
 */
export function isValidErrorCode(code: unknown): code is GuildPassErrorCode {
  return typeof code === 'string' && VALID_ERROR_CODES.has(code);
}

/**
 * Extracts the {@link GuildPassErrorCode} carried by an unknown thrown value.
 *
 * Used where an error must be flattened into a data structure rather than
 * rethrown — per-item batch failures, where one item's error becomes an entry
 * in a result array — so the classification survives even though the `Error`
 * instance itself does not.
 *
 * Uses {@link isGuildPassError} rather than `instanceof` so a code still
 * survives when the error crosses a realm boundary or originates from a
 * duplicated copy of the SDK.
 *
 * No heuristics are applied to non-GuildPass errors: guessing a code from an
 * error's shape would silently reclassify failures that callers branch on.
 * An unrecognised value yields `fallback`.
 *
 * The extracted code is validated against the enum before being returned.
 * {@link isGuildPassError} short-circuits on `instanceof`, so an error built
 * with a code that does not exist at runtime — `GuildPassErrorCode.TYPO`, or a
 * member removed since a custom `contractProvider` was compiled — passes the
 * guard while carrying `undefined`. Returning that would break this function's
 * own contract and hand callers an error entry with no usable classification.
 *
 * @param err      - The caught value, of unknown type.
 * @param fallback - Code to use when `err` carries no valid code. Defaults to `UNKNOWN_ERROR`.
 * @returns          The error's own code when it is a real enum member, else `fallback`.
 */
export function toErrorCode(
  err: unknown,
  fallback: GuildPassErrorCode = GuildPassErrorCode.UNKNOWN_ERROR,
): GuildPassErrorCode {
  if (!isGuildPassError(err)) return fallback;
  return isValidErrorCode(err.code) ? err.code : fallback;
}
