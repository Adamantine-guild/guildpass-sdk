// GuildPass SDK: Pull in package or module bindings.
import { GuildPassError } from '../../errors/GuildPassError';
import { GuildPassErrorCode } from '../../errors/errorCodes';

/**
 * Shared validation for hex payloads that arrive from a JSON-RPC endpoint.
 *
 * Everything a node returns is attacker-controlled from the SDK's point of
 * view: a hostile or simply buggy endpoint can answer with truncated hex,
 * non-hex characters, unaligned ABI offsets, or a multi-gigabyte string. These
 * guards run *before* any slicing or numeric interpretation so that a
 * malformed response always surfaces as a `GuildPassError` with
 * `INVALID_RESPONSE` instead of a native `RangeError`, a silent `NaN`, or
 * unbounded memory growth.
 */

/**
 * Hard cap on the size of an RPC response payload we are willing to parse.
 *
 * A legitimate `aggregate3` return is small: a 1000-call batch of 32-byte
 * returns is roughly 100 KiB. 10 MiB leaves three orders of magnitude of
 * headroom for unusual-but-honest responses while still bounding what a
 * misbehaving endpoint can force us to allocate.
 *
 * Deliberately not exported from the package entry point — this is an internal
 * safety limit, not configurable public API.
 */
export const MAX_RPC_RESPONSE_BYTES = 10 * 1024 * 1024;

/** Two hex characters per byte, plus the leading `0x`. */
const MAX_RPC_RESPONSE_HEX_CHARS = MAX_RPC_RESPONSE_BYTES * 2 + 2;

/** Hex characters in one 32-byte ABI word. */
export const HEX_CHARS_PER_WORD = 64;

const HEX_BODY_REGEX = /^[0-9a-f]*$/;

/** Builds the canonical malformed-response error used by every guard here. */
export function invalidResponse(message: string): GuildPassError {
  return new GuildPassError(
    `Malformed RPC response: ${message}`,
    GuildPassErrorCode.INVALID_RESPONSE,
  );
}

/**
 * Reports whether a payload is over the cap, without throwing.
 *
 * Callers that must degrade per item rather than reject a whole response (the
 * JSON-RPC batch path) use this instead of the asserting variants.
 */
export function exceedsResponseCap(raw: string): boolean {
  return raw.length > MAX_RPC_RESPONSE_HEX_CHARS;
}

/**
 * Rejects an oversized payload using only its length.
 *
 * This runs before any `slice`, `toLowerCase` or regex work precisely because
 * those would each allocate or scan a copy of the very string we are trying to
 * refuse. Checking `length` first is what makes the cap meaningful rather than
 * decorative.
 */
export function assertWithinResponseCap(raw: string, what: string): void {
  if (exceedsResponseCap(raw)) {
    throw invalidResponse(
      `${what} exceeds the ${MAX_RPC_RESPONSE_BYTES}-byte response cap`,
    );
  }
}

/**
 * Applies the size cap to an arbitrary `eth_call` result before it is handed
 * to a decoder. Non-string results are left alone — the callers already have
 * their own type handling for those.
 */
export function assertResultWithinCap(raw: unknown, what: string): void {
  if (typeof raw === 'string') assertWithinResponseCap(raw, what);
}

/**
 * Validates that `raw` is a well-formed, bounded hex payload and returns the
 * normalised, `0x`-stripped, lowercase body.
 */
export function assertDecodableHex(raw: unknown, what: string): string {
  if (typeof raw !== 'string') throw invalidResponse(`${what} is not a string`);
  assertWithinResponseCap(raw, what);
  if (!raw.startsWith('0x')) throw invalidResponse(`${what} is not 0x-prefixed`);

  const hex = raw.slice(2).toLowerCase();
  if (hex.length % 2 !== 0) throw invalidResponse(`${what} has an odd-length hex body`);
  if (!HEX_BODY_REGEX.test(hex)) throw invalidResponse(`${what} contains non-hex characters`);

  return hex;
}

/**
 * Reads word `index` as a non-negative integer usable as an array/string
 * index.
 *
 * An ABI word is 256 bits, so `parseInt` is the wrong tool twice over: it
 * silently loses precision, and it returns `NaN` for unparseable input instead
 * of failing. Parsing with `BigInt` and rejecting anything above
 * `Number.MAX_SAFE_INTEGER` means every value that leaves this function is a
 * safe integer.
 */
export function wordAsIndex(hex: string, index: number, what: string): number {
  const start = index * HEX_CHARS_PER_WORD;
  const wordHex = hex.slice(start, start + HEX_CHARS_PER_WORD);
  if (wordHex.length !== HEX_CHARS_PER_WORD) {
    throw invalidResponse(`truncated word while reading ${what}`);
  }

  const value = BigInt(`0x${wordHex}`);
  if (value > BigInt(Number.MAX_SAFE_INTEGER)) {
    throw invalidResponse(`${what} exceeds the safe integer range`);
  }

  return Number(value);
}

/**
 * Reads word `index` as a byte offset and converts it to a word index,
 * requiring it to land exactly on a 32-byte boundary. An unaligned offset
 * would otherwise produce a fractional index and a nonsensical `slice`.
 */
export function wordAsWordOffset(hex: string, index: number, what: string): number {
  const bytes = wordAsIndex(hex, index, what);
  if (bytes % 32 !== 0) throw invalidResponse(`${what} is not 32-byte aligned`);
  return bytes / 32;
}
