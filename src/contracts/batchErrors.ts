// GuildPass SDK: Pull in package or module bindings.
import { GuildPassErrorCode } from '../errors/errorCodes';
import { isValidErrorCode } from '../errors/toErrorCode';
import type { BatchItemResult } from './contract.types';

/**
 * Builds an error entry for a batch result array.
 *
 * Every per-item failure the SDK produces goes through here so that `status`,
 * `error` and `code` are always populated together — an error entry without a
 * code is a bug, not a supported shape.
 *
 * @param message - Human-readable description of the failure.
 * @param code    - Classification for {@link BatchItemResult.code}.
 * @returns         An error entry suitable for a `BatchItemResult[]`.
 */
export function batchItemError(message: string, code: GuildPassErrorCode): BatchItemResult {
  return { status: 'error', error: message, code };
}

/**
 * Guarantees every error entry in a batch result carries a usable
 * {@link GuildPassErrorCode}, defaulting to `UNKNOWN_ERROR`.
 *
 * Applied to results coming back from a user-supplied `contractProvider` — the
 * one place a batch entry can enter `ContractClient` without passing through
 * {@link batchItemError}. `ContractProvider` is a public interface, so a
 * third-party implementation may legitimately omit `code` or, if compiled
 * against a different SDK version, supply one that is no longer a member. Both
 * would otherwise surface as `code: undefined` from a public batch method and
 * silently drop every caller into their `default` branch.
 *
 * Returns the input array unchanged when nothing needs patching, so the common
 * case allocates nothing.
 *
 * @param results - Per-item results as returned by a provider.
 * @returns         The same array, or a patched copy.
 */
export function ensureItemCodes(results: BatchItemResult[]): BatchItemResult[] {
  const needsPatch = results.some(
    (item) => item.status === 'error' && !isValidErrorCode(item.code),
  );
  if (!needsPatch) return results;

  return results.map((item) =>
    item.status === 'error' && !isValidErrorCode(item.code)
      ? { ...item, code: GuildPassErrorCode.UNKNOWN_ERROR }
      : item,
  );
}
