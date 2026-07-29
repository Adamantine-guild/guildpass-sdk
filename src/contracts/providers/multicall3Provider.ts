// GuildPass SDK: Pull in package or module bindings.
import { GuildPassError } from '../../errors/GuildPassError';
import { GuildPassErrorCode } from '../../errors/errorCodes';
import { HttpClient } from '../../http/httpClient';
import { RequestOptions } from '../../types/common';
import { BatchItemResult } from '../contract.types';
import { batchItemError } from '../batchErrors';
import { ContractProvider, EthCallRequest } from './provider.types';
import { JsonRpcContractProvider } from './jsonRpcProvider';
import { HttpHooks } from '../../http/http.types';
import { MULTICALL3_ADDRESS, MULTICALL3_AGGREGATE3_SELECTOR } from './adaptive.types';
import {
  HEX_CHARS_PER_WORD,
  assertDecodableHex,
  invalidResponse,
  wordAsIndex,
  wordAsWordOffset,
} from './hexGuards';

/**
 * A {@link ContractProvider} that aggregates batch requests into a single
 * Multicall3 `aggregate3` contract call on-chain.
 *
 * This is preferable on free/public RPC endpoints that throttle or disable
 * JSON-RPC batching.
 */
export class Multicall3ContractProvider implements ContractProvider {
  private readonly jsonRpcProvider: JsonRpcContractProvider;
  private readonly multicallAddress: string;

  constructor(
    http: HttpClient,
    rpcUrls: string | string[],
    hooks?: HttpHooks,
    chainId?: number,
    multicallAddress: string = MULTICALL3_ADDRESS,
  ) {
    this.jsonRpcProvider = new JsonRpcContractProvider(http, rpcUrls, hooks, chainId);
    this.multicallAddress = multicallAddress;
  }

  public async ethCall(request: EthCallRequest, options?: RequestOptions): Promise<unknown> {
    return this.jsonRpcProvider.ethCall(request, options);
  }

  public async batchEthCall(
    requests: EthCallRequest[],
    options?: RequestOptions,
  ): Promise<BatchItemResult[]> {
    if (requests.length === 0) return [];

    const calldata = encodeAggregate3(requests);
    const raw = await this.jsonRpcProvider.ethCall(
      { to: this.multicallAddress, data: calldata },
      options,
    );

    if (typeof raw !== 'string') {
      throw new GuildPassError(
        'Multicall3 returned a non-string result',
        GuildPassErrorCode.INVALID_RESPONSE,
      );
    }

    return decodeAggregate3(raw, requests.length);
  }
}

// ---------------------------------------------------------------------------
// Minimal ABI helpers for Multicall3 aggregate3 (no external dependency).
// ---------------------------------------------------------------------------

/** Strips a leading 0x and returns lowercase hex. */
function stripHex(value: string): string {
  return value.startsWith('0x') ? value.slice(2) : value;
}

/** Left-pads a hex string to a full 32-byte (64-char) word. */
function padWord(hex: string): string {
  return hex.padStart(64, '0');
}

/** Encodes a byte length / offset as a 32-byte word. */
function word(value: number): string {
  return padWord(value.toString(16));
}

/** Right-pads bytes to a multiple of 32 bytes (dynamic-bytes tail padding). */
function padBytes(hex: string): string {
  const remainder = hex.length % 64;
  return remainder === 0 ? hex : hex + '0'.repeat(64 - remainder);
}

/** Decodes a revert reason from returnData if present. */
function decodeRevertReason(hex: string): string {
  const cleanHex = stripHex(hex);
  if (cleanHex.startsWith('08c379a0')) {
    try {
      // Revert reason is Error(string)
      // cleanHex is: 8 hex chars selector + 64 hex chars offset + 64 hex chars length + string hex chars
      if (cleanHex.length >= 8 + 64 + 64) {
        const lenHex = cleanHex.slice(8 + 64, 8 + 64 + 64);
        const len = parseInt(lenHex, 16);
        // `len` is node-controlled: bound it against what the payload actually
        // carries instead of trusting it to address a real slice.
        const available = (cleanHex.length - (8 + 64 + 64)) / 2;
        if (!Number.isFinite(len) || len < 0 || len > available) {
          return 'Multicall3 item reverted';
        }
        const strHex = cleanHex.slice(8 + 64 + 64, 8 + 64 + 64 + len * 2);
        const bytes = new Uint8Array(
          strHex.match(/.{1,2}/g)?.map((byte) => parseInt(byte, 16)) || [],
        );
        return `Reverted: ${new TextDecoder().decode(bytes)}`;
      }
    } catch {
      // Fallback
    }
  } else if (cleanHex.startsWith('4e487b71')) {
    // Panic(uint256)
    try {
      if (cleanHex.length >= 8 + 64) {
        const codeHex = cleanHex.slice(8, 8 + 64);
        const code = BigInt('0x' + codeHex).toString(10);
        return `Panic error code: ${code}`;
      }
    } catch {
      // Fallback
    }
  }
  return 'Multicall3 item reverted';
}

/**
 * ABI-encodes a Multicall3 `aggregate3((address,bool,bytes)[])` call from the
 * SDK's `EthCallRequest[]`. Each call is encoded as `(target, allowFailure=true,
 * callData)` so a single reverting call does not fail the whole aggregate.
 */
export function encodeAggregate3(requests: EthCallRequest[]): string {
  const count = requests.length;
  // Head: one 32-byte offset per tuple, relative to the start of the tuple array.
  const headWords: string[] = [];
  const tails: string[] = [];

  // Offsets in the tuple array are measured from just after the array length word.
  let runningOffset = count * 32;

  for (const request of requests) {
    const target = padWord(stripHex(request.to).toLowerCase());
    const allowFailure = word(1); // true
    const callBytes = stripHex(request.data).toLowerCase();
    const callLen = word(callBytes.length / 2);
    const callBody = padBytes(callBytes);

    // Tuple layout: target, allowFailure, offset-to-bytes(0x60), len, body.
    const bytesOffsetWithinTuple = word(0x60);
    const tuple = target + allowFailure + bytesOffsetWithinTuple + callLen + callBody;

    headWords.push(word(runningOffset));
    tails.push(tuple);
    runningOffset += tuple.length / 2;
  }

  // Outer: selector, offset to the array(0x20), array length, head, tails.
  const body = word(0x20) + word(count) + headWords.join('') + tails.join('');
  return MULTICALL3_AGGREGATE3_SELECTOR + body;
}

/**
 * Decodes the `(bool success, bytes returnData)[]` returned by `aggregate3`
 * into ordered `BatchItemResult[]`. A `success=false` item becomes an error
 * result; a successful item carries its raw hex `returnData`.
 */
export function decodeAggregate3(raw: string, expected: number): BatchItemResult[] {
  // Every offset and length below is chosen by the node. Validate the envelope
  // up front so that no slice or numeric conversion ever runs on unchecked
  // input; a malformed envelope invalidates the whole response, not one item.
  const hex = assertDecodableHex(raw, 'Multicall3 result');
  // Only whole words are addressable as words. A trailing partial word is not
  // rejected outright — a dynamic `bytes` tail may legitimately end mid-word —
  // but nothing can point *at* it: `wordAsIndex` refuses a truncated word.
  const totalWords = Math.floor(hex.length / HEX_CHARS_PER_WORD);

  // Word 0: offset to the array. Word at that offset: array length.
  const arrayStart = wordAsWordOffset(hex, 0, 'array offset');
  if (arrayStart >= totalWords) throw invalidResponse('array offset is out of bounds');

  const length = wordAsIndex(hex, arrayStart, 'array length');
  // A node must never return more items than were requested. This is the bound
  // the previous `i < expected + length` condition failed to provide: it was
  // vacuously true, so a huge length word drove an unbounded loop.
  if (length > expected) {
    throw invalidResponse(`array length ${length} exceeds the ${expected} requested calls`);
  }

  // Each element is a tuple offset, relative to the first element word.
  const elementsBase = arrayStart + 1;
  if (elementsBase + length > totalWords) {
    throw invalidResponse('element head is out of bounds');
  }

  const results: BatchItemResult[] = [];

  for (let i = 0; i < length; i += 1) {
    const tupleStart =
      elementsBase + wordAsWordOffset(hex, elementsBase + i, `tuple ${i} offset`);
    if (tupleStart + 1 >= totalWords) throw invalidResponse(`tuple ${i} is out of bounds`);

    const successWord = wordAsIndex(hex, tupleStart, `tuple ${i} success flag`);
    if (successWord !== 0 && successWord !== 1) {
      throw invalidResponse(`tuple ${i} success flag is not a boolean`);
    }

    const returnDataStart =
      tupleStart + wordAsWordOffset(hex, tupleStart + 1, `tuple ${i} returnData offset`);
    if (returnDataStart >= totalWords) {
      throw invalidResponse(`tuple ${i} returnData offset is out of bounds`);
    }

    const returnDataLen = wordAsIndex(hex, returnDataStart, `tuple ${i} returnData length`);
    const dataStartChar = (returnDataStart + 1) * HEX_CHARS_PER_WORD;
    const dataEndChar = dataStartChar + returnDataLen * 2;
    if (dataEndChar > hex.length) {
      throw invalidResponse(
        `tuple ${i} returnData length ${returnDataLen} overruns the payload`,
      );
    }

    const dataHex = hex.slice(dataStartChar, dataEndChar);

    results.push(
      successWord === 1
        ? { status: 'success', result: '0x' + dataHex }
        : // `success == false` on a structurally valid response means the call
          // reached the contract and reverted — the same event the JSON-RPC
          // path reports as HTTP_ERROR. Which strategy the adaptive provider
          // picked must not change an item's classification.
          batchItemError(decodeRevertReason(dataHex), GuildPassErrorCode.HTTP_ERROR),
    );
  }

  // Defensive: a structurally valid but short array still pads, as before.
  while (results.length < expected) {
    results.push(batchItemError('Missing Multicall3 result', GuildPassErrorCode.INVALID_RESPONSE));
  }

  // No trailing `slice` needed: `length > expected` now throws above.
  return results;
}
