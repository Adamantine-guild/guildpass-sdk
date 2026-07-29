import { GuildPassResponseValidationError } from '../errors/errorTypes';
import { GuildPassErrorCode } from '../errors/errorCodes';
import type { ExplainingValidator } from './schema';

/**
 * Optional context attached to a validation failure so the thrown error
 * identifies which endpoint produced the malformed payload.
 */
export interface ResponseValidationContext {
  /** e.g. `'GET /access/check'` */
  endpoint?: string;
}

/**
 * Validates an API response against a shape guard, throwing a
 * GuildPassResponseValidationError with code INVALID_RESPONSE if it
 * doesn't match. When the guard is an explaining validator (all guards
 * built from the `schema.ts` combinators are), the error message names the
 * specific field path that failed; when `context.endpoint` is given, the
 * endpoint is named too. Both are also exposed on `error.details` alongside
 * the raw received value.
 */
export function assertValidResponse<T>(
  value: unknown,
  guard: ((value: unknown) => value is T) & Partial<ExplainingValidator<T>>,
  typeName: string,
  context?: ResponseValidationContext,
): T {
  if (!guard(value)) {
    const mismatch = guard.explain ? guard.explain(value, typeName) : null;
    let message = `Received a malformed ${typeName} response from the API`;
    if (context?.endpoint) message += ` (${context.endpoint})`;
    if (mismatch) message += `: ${mismatch}`;
    throw new GuildPassResponseValidationError(
      message,
      GuildPassErrorCode.INVALID_RESPONSE,
      undefined,
      {
        endpoint: context?.endpoint,
        mismatch: mismatch ?? undefined,
        received: value,
      },
    );
  }
  return value;
}
