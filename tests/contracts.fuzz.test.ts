import * as fc from 'fast-check';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { GuildPassClient } from '../src/client/GuildPassClient';
import { decodeAggregate3 } from '../src/contracts/providers/multicall3Provider';
import { MAX_RPC_RESPONSE_BYTES } from '../src/contracts/providers/hexGuards';
import {
  decodeAddressResult,
  decodeBoolResult,
  decodeUint256Result,
} from '../src/contracts/contractHelpers';
import { GuildPassError } from '../src/errors/GuildPassError';
import { GuildPassErrorCode } from '../src/errors/errorCodes';

/**
 * Property-based hardening suite for JSON-RPC response decoding (#401).
 *
 * The invariant under test is deliberately narrow and mechanical: for *any*
 * input a node can produce, a decoder either returns a well-formed value or
 * throws `GuildPassError(INVALID_RESPONSE)`. It must never surface a native
 * `RangeError`/`TypeError`, never loop unbounded, and never report success
 * while carrying data it failed to parse.
 */

// Bounded run count keeps the whole file well under a couple of seconds.
const RUNS = { numRuns: 200 };

const BASE_URL = 'https://api.test.com';
const RPC_URL = 'https://rpc.test.com';
const CONTRACT = '0x1111111111111111111111111111111111111111';
const WALLET_1 = '0x2222222222222222222222222222222222222222';
const WALLET_2 = '0x3333333333333333333333333333333333333333';

/** Encodes a number as a 32-byte ABI word of hex characters. */
const word = (value: number | bigint): string => value.toString(16).padStart(64, '0');

/**
 * Builds a structurally valid two-item `aggregate3` return: one success
 * carrying a uint256, one failure carrying an `Error(string)` revert.
 */
function validTwoItemPayload(): string {
  const revertBody =
    '08c379a0' +
    word(0x20) +
    word(20) +
    '496e73756666696369656e742062616c616e6365'.padEnd(64, '0'); // "Insufficient balance"

  return (
    '0x' +
    word(0x20) + // array offset
    word(2) + // array length
    word(0x40) + // element 0 offset (2 words past the element base)
    word(0xc0) + // element 1 offset (6 words past the element base)
    // element 0 @ word 4
    word(1) + // success
    word(0x40) + // returnData offset
    word(0x20) + // returnData length (32 bytes)
    word(5) + // returnData: uint256 5
    // element 1 @ word 8
    word(0) + // success = false
    word(0x40) + // returnData offset
    word(revertBody.length / 2) + // returnData length
    revertBody
  );
}

/** Arbitrary strings, weighted toward shapes a hostile node would actually send. */
const anyString = fc.oneof(
  fc.string(),
  fc.hexaString().map((h) => `0x${h}`),
  fc.string().map((s) => `0x${s}`),
  fc.constantFrom(
    '',
    '0x',
    '0X',
    '0xzz',
    '0x0',
    `0x${'f'.repeat(64)}`,
    `0x${'f'.repeat(1000)}`,
    validTwoItemPayload(),
  ),
);

/** Asserts a thrown value is the SDK's malformed-response error, never a native one. */
function expectInvalidResponse(fn: () => unknown): void {
  try {
    fn();
  } catch (error) {
    expect(error).toBeInstanceOf(GuildPassError);
    expect((error as GuildPassError).code).toBe(GuildPassErrorCode.INVALID_RESPONSE);
    return;
  }
  throw new Error('expected the decoder to reject the payload, but it returned');
}

const rpcBatchResponse = (items: unknown) => ({
  ok: true,
  status: 200,
  headers: new Headers({ 'content-type': 'application/json' }),
  json: async () => items,
  text: async () => JSON.stringify(items),
});

beforeEach(() => {
  vi.stubGlobal('fetch', vi.fn());
});

describe('decodeAggregate3 — structural hardening (#401)', () => {
  it('never throws a native error and never fabricates success from arbitrary input', () => {
    fc.assert(
      fc.property(anyString, fc.integer({ min: 1, max: 8 }), (raw, expected) => {
        let results;
        try {
          results = decodeAggregate3(raw, expected);
        } catch (error) {
          // The only acceptable failure mode.
          expect(error).toBeInstanceOf(GuildPassError);
          expect((error as GuildPassError).code).toBe(GuildPassErrorCode.INVALID_RESPONSE);
          return;
        }

        // If it did decode, the shape contract must hold exactly.
        expect(results).toHaveLength(expected);
        for (const item of results) {
          if (item.status === 'success') {
            // A success must carry real hex, never the empty string that the
            // old `parseInt`/`NaN` path produced from garbage.
            expect(item.result).toMatch(/^0x[0-9a-f]*$/);
          } else {
            expect(typeof item.error).toBe('string');
          }
        }
      }),
      RUNS,
    );
  });

  it('regression: a non-hex body is a malformed response, not "all items missing"', () => {
    // Previously `parseInt('zz…', 16)` returned NaN, `hex.slice(NaN, NaN)` gave
    // '', and the `|| '0'` fallback turned that into a length of 0 — so a
    // totally malformed payload decoded as a full array of
    // 'Missing Multicall3 result' entries. That is indistinguishable from an
    // honest partial response, so neither call site failed over: a broken
    // endpoint kept serving plausible-looking all-error batches.
    expectInvalidResponse(() => decodeAggregate3(`0x${'zz'.repeat(64)}`, 2));
  });

  it('regression: an out-of-bounds returnData offset no longer fabricates an empty success', () => {
    // The sharpest of the four defects. A returnData offset past the end of the
    // payload made the length word read as 0, producing
    // { status: 'success', result: '0x' } — the SDK reporting a successful call
    // while carrying no data at all.
    const payload =
      '0x' + word(0x20) + word(1) + word(0x20) + word(1) + word(0xffe0) + word(0);

    expectInvalidResponse(() => decodeAggregate3(payload, 1));
  });

  it('regression: a malformed envelope is no longer reported as a contract revert', () => {
    // An unaligned array offset produced a fractional word index; `slice`
    // truncated it and read a shifted word, which happened to decode as
    // success=false — so the SDK told the caller their call had reverted when
    // the node had actually sent a malformed envelope.
    const payload =
      '0x' + word(0x21) + word(1) + word(0x20) + word(1) + word(0x40) + word(0x20) + word(0xdead);

    expectInvalidResponse(() => decodeAggregate3(payload, 1));
  });

  it('regression: an enormous array length is rejected immediately, not looped over', () => {
    const hostile = '0x' + word(0x20) + word(BigInt('0x' + 'f'.repeat(64)));

    const started = performance.now();
    expectInvalidResponse(() => decodeAggregate3(hostile, 1));
    const elapsed = performance.now() - started;

    // The old `i < length && i < expected + length` guard was vacuous, so this
    // payload drove an effectively unbounded loop. Rejection is now O(1).
    expect(elapsed).toBeLessThan(50);
  });

  it('rejects an array length greater than the number of requested calls', () => {
    const payload = '0x' + word(0x20) + word(5) + word(0x40).repeat(5);
    expectInvalidResponse(() => decodeAggregate3(payload, 2));
  });

  it('rejects an offset that is not 32-byte aligned', () => {
    expectInvalidResponse(() => decodeAggregate3('0x' + word(0x21) + word(1), 1));
  });

  it('rejects an array offset that points past the payload', () => {
    expectInvalidResponse(() => decodeAggregate3('0x' + word(0x2000) + word(1), 1));
  });

  it('rejects a returnData length that overruns the payload', () => {
    // Previously this also decoded as { status: 'success', result: '0x' }: the
    // out-of-range slice silently clamped to the empty string.
    const payload =
      '0x' +
      word(0x20) +
      word(1) +
      word(0x20) + // element 0 offset -> 1 word past base
      word(1) + // success
      word(0x40) + // returnData offset
      word(0xffffff); // returnData length far beyond what is present

    expectInvalidResponse(() => decodeAggregate3(payload, 1));
  });

  it('rejects a success flag that is neither 0 nor 1', () => {
    const payload =
      '0x' +
      word(0x20) +
      word(1) +
      word(0x20) +
      word(7) + // success flag = 7
      word(0x40) +
      word(0);

    expectInvalidResponse(() => decodeAggregate3(payload, 1));
  });

  it('rejects a word whose value exceeds the safe integer range', () => {
    const payload = '0x' + word(0x20) + word(1) + word(BigInt(Number.MAX_SAFE_INTEGER) + 1n);
    expectInvalidResponse(() => decodeAggregate3(payload, 1));
  });

  it('rejects a payload above the documented size cap without parsing it', () => {
    const oversized = '0x' + '0'.repeat(MAX_RPC_RESPONSE_BYTES * 2 + 2);

    const started = performance.now();
    expectInvalidResponse(() => decodeAggregate3(oversized, 1));
    const elapsed = performance.now() - started;

    // The cap is checked on `length` alone, before any slice/lowercase/regex
    // work touches the string — otherwise the check would itself be the cost.
    expect(elapsed).toBeLessThan(100);
  });

  it('still decodes a valid payload unchanged (anti-regression for the happy path)', () => {
    const results = decodeAggregate3(validTwoItemPayload(), 2);

    expect(results).toEqual([
      { status: 'success', result: `0x${word(5)}` },
      { status: 'error', error: 'Reverted: Insufficient balance' },
    ]);
  });

  it('pads a structurally valid but short array with per-item errors, as before', () => {
    const payload =
      '0x' + word(0x20) + word(1) + word(0x20) + word(1) + word(0x40) + word(0x20) + word(9);

    expect(decodeAggregate3(payload, 3)).toEqual([
      { status: 'success', result: `0x${word(9)}` },
      { status: 'error', error: 'Missing Multicall3 result' },
      { status: 'error', error: 'Missing Multicall3 result' },
    ]);
  });

  it('does not throw out of the revert-reason path when the string length is hostile', () => {
    // `decodeRevertReason` must always return a string: it is the "this item
    // reverted" path, not a structural failure. A length word larger than the
    // data present falls back instead of slicing out of range.
    const revertBody = '08c379a0' + word(0x20) + word(0xffff);
    const payload =
      '0x' +
      word(0x20) +
      word(1) +
      word(0x20) +
      word(0) + // success = false
      word(0x40) +
      word(revertBody.length / 2) +
      revertBody;

    expect(decodeAggregate3(payload, 1)).toEqual([
      { status: 'error', error: 'Multicall3 item reverted' },
    ]);
  });
});

describe('single-value decoders — format validation (#401 AC1)', () => {
  it('never throws a native error for arbitrary input', () => {
    fc.assert(
      fc.property(anyString, (raw) => {
        for (const decode of [decodeAddressResult, decodeUint256Result, decodeBoolResult]) {
          try {
            decode(raw);
          } catch (error) {
            expect(error).toBeInstanceOf(GuildPassError);
          }
        }
      }),
      RUNS,
    );
  });

  it('rejects a truncated or over-long word rather than padding it', () => {
    expectInvalidResponse(() => decodeUint256Result(`0x${'0'.repeat(63)}`));
    expectInvalidResponse(() => decodeUint256Result(`0x${'0'.repeat(65)}`));
    expectInvalidResponse(() => decodeBoolResult(`0x${'0'.repeat(63)}`));
    expectInvalidResponse(() => decodeAddressResult(`0x${'0'.repeat(63)}`));
  });
});

describe('JSON-RPC batch correlation by id (#401 AC2)', () => {
  const clientWithBatchResponse = (items: unknown) => {
    const fetchMock = vi.fn().mockImplementation(async () => rpcBatchResponse(items));
    vi.stubGlobal('fetch', fetchMock);

    return new GuildPassClient({
      apiUrl: BASE_URL,
      rpcUrl: RPC_URL,
      contractAddress: CONTRACT,
      batchStrategy: 'jsonrpc',
    });
  };

  it('preserves request order when the node returns ids out of order', async () => {
    const client = clientWithBatchResponse([
      { jsonrpc: '2.0', id: 2, result: `0x${word(10)}` },
      { jsonrpc: '2.0', id: 1, result: `0x${word(5)}` },
    ]);

    const results = await client.contracts.getMembershipTokenBalancesBatch({
      walletAddresses: [WALLET_1, WALLET_2],
    });

    // Correlation is by id, not by position: shuffling must not swap results.
    expect(results).toEqual([
      { status: 'success', result: '5' },
      { status: 'success', result: '10' },
    ]);
  });

  it('reports a per-item error for a missing id without disturbing the others', async () => {
    const client = clientWithBatchResponse([{ jsonrpc: '2.0', id: 2, result: `0x${word(10)}` }]);

    const results = await client.contracts.getMembershipTokenBalancesBatch({
      walletAddresses: [WALLET_1, WALLET_2],
    });

    expect(results[0].status).toBe('error');
    expect(results[1]).toEqual({ status: 'success', result: '10' });
  });

  it('does not desynchronise the batch when an id is duplicated', async () => {
    const client = clientWithBatchResponse([
      { jsonrpc: '2.0', id: 1, result: `0x${word(5)}` },
      { jsonrpc: '2.0', id: 1, result: `0x${word(99)}` },
    ]);

    const results = await client.contracts.getMembershipTokenBalancesBatch({
      walletAddresses: [WALLET_1, WALLET_2],
    });

    // The duplicate collapses onto id 1 (last write wins) and item 2 is
    // reported missing. What matters is that no result is attributed to the
    // wrong request and the array length still matches the request.
    expect(results).toHaveLength(2);
    expect(results[1].status).toBe('error');
  });

  it('rejects a batch response that is not an array', async () => {
    const client = clientWithBatchResponse({ jsonrpc: '2.0', id: 1, result: '0x' });

    await expect(
      client.contracts.getMembershipTokenBalancesBatch({
        walletAddresses: [WALLET_1, WALLET_2],
      }),
    ).rejects.toMatchObject({ code: GuildPassErrorCode.INVALID_RESPONSE });
  });

  it('reports an oversized item as a per-item error, not a whole-batch failure', async () => {
    const client = clientWithBatchResponse([
      { jsonrpc: '2.0', id: 1, result: `0x${word(5)}` },
      { jsonrpc: '2.0', id: 2, result: '0x' + '0'.repeat(MAX_RPC_RESPONSE_BYTES * 2 + 2) },
    ]);

    const results = await client.contracts.getMembershipTokenBalancesBatch({
      walletAddresses: [WALLET_1, WALLET_2],
    });

    expect(results[0]).toEqual({ status: 'success', result: '5' });
    expect(results[1].status).toBe('error');
  });
});
