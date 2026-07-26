import { GuildPassConfigError } from '../errors/errorTypes';
import { GuildPassErrorCode } from '../errors/errorCodes';
import type { ExplainingValidator } from './schema';

/**
 * Optional context attached to a validation failure so the thrown error
 * identifies which endpoint the malformed request was headed for.
 */
export interface RequestValidationContext {
  /** e.g. `'GET /access/check'` */
  endpoint?: string;
}

/** Field-name fragments that mark a request field as sensitive; matched case-insensitively. */
const SENSITIVE_FIELD_NAMES = new Set(['apikey', 'secret', 'privatekey', 'password', 'token', 'signature']);

/** Redacts top-level fields whose name looks sensitive before attaching a value to error details. */
function redactSensitiveFields(value: unknown): unknown {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) return value;
  const redacted: Record<string, unknown> = {};
  for (const [key, val] of Object.entries(value as Record<string, unknown>)) {
    redacted[key] = SENSITIVE_FIELD_NAMES.has(key.toLowerCase()) ? '[REDACTED]' : val;
  }
  return redacted;
}

/**
 * Validates request parameters against a shape guard, throwing a
 * `GuildPassConfigError` (code `INVALID_INPUT`) if they don't match —
 * consistent with every other locally-detected input problem in the SDK
 * (see `src/utils/validation.ts`).
 *
 * Intended to run *before* the request-specific field validators
 * (`validateAddress`, `validateGuildId`, ...), so it only ever rejects
 * shapes those miss (missing params object, wrong top-level type,
 * `null`/`undefined`); it never rejects a value that would otherwise pass
 * today's field-by-field checks. When the guard is an explaining
 * validator (all guards built from the `schema.ts` combinators are), the
 * error message names the specific field path that failed; when
 * `context.endpoint` is given, the endpoint is named too.
 */
export function assertValidRequest<T>(
  value: unknown,
  guard: ((value: unknown) => value is T) & Partial<ExplainingValidator<T>>,
  typeName: string,
  context?: RequestValidationContext,
): T {
  if (!guard(value)) {
    const mismatch = guard.explain ? guard.explain(value, typeName) : null;
    let message = `Invalid ${typeName} request parameters`;
    if (context?.endpoint) message += ` (${context.endpoint})`;
    if (mismatch) message += `: ${mismatch}`;
    throw new GuildPassConfigError(
      message,
      GuildPassErrorCode.INVALID_INPUT,
      undefined,
      {
        endpoint: context?.endpoint,
        mismatch: mismatch ?? undefined,
        received: redactSensitiveFields(value),
      },
    );
  }
  return value;
}
