import { GuildPassError } from './GuildPassError';
import { GuildPassErrorCode } from './errorCodes';

const VALID_ERROR_CODES = new Set<string>(Object.values(GuildPassErrorCode));

/**
 * Type guard for GuildPassError that works across module duplicates and
 * cross-realm boundaries where `instanceof` fails (e.g. monorepos with
 * multiple copies of the SDK, or errors crossing a Node vm context).
 */
export function isGuildPassError(error: unknown): error is GuildPassError {
  if (error instanceof GuildPassError) {
    return true;
  }

  if (typeof error !== 'object' || error === null) {
    return false;
  }

  const candidate = error as { name?: unknown; code?: unknown };

  return (
    candidate.name === 'GuildPassError' &&
    typeof candidate.code === 'string' &&
    VALID_ERROR_CODES.has(candidate.code)
  );
}
