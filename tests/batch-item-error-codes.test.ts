/**
 * Tests for structured per-item failure codes on `BatchItemResult` (#390).
 *
 * Acceptance criteria coverage:
 *  1. Every error entry returned by `batchEthCall`,
 *     `getMembershipTokenBalancesBatch` and `getGuildOwnersBatch` carries a
 *     `code: GuildPassErrorCode` alongside the existing `error` string.
 *  2. The `error` strings are unchanged in format — asserted with exact
 *     equality throughout, so a future reword fails loudly.
 *  3. Codes are correct for HTTP failure, malformed RPC response and invalid
 *     address scenarios *within* a batch.
 *
 * The invalid-address criterion needs care: all three batch methods validate
 * addresses **pre-flight and throw**, so a caller-supplied bad address never
 * reaches a `BatchItemResult`. Both halves of that contract are pinned below —
 * the throw is locked as a regression test, and a genuine per-item
 * `INVALID_ADDRESS` (a node returning an owner word that fails EIP-55) proves
 * the code survives the decode step that previously swallowed it.
 */
// GuildPass SDK: Pull in package or module bindings.
import { beforeEach, describe, expect, it, vi } from 'vitest';
// GuildPass SDK: Import external module dependencies.
import { GuildPassClient } from '../src/client/GuildPassClient';
import { GuildPassErrorCode } from '../src/errors/errorCodes';
import { GuildPassError } from '../src/errors/GuildPassError';
import { toErrorCode } from '../src/errors/toErrorCode';
import { batchItemError } from '../src/contracts/batchErrors';
import { viemContractProvider } from '../src/adapters/viem';
import { ethersContractProvider } from '../src/adapters/ethers';

const BASE_URL = 'https://api.test.com';
const RPC_URL = 'https://rpc.test.com';
const CONTRACT = '0x0000000000000000000000000000000000000000';
const WALLET_A = '0x1111111111111111111111111111111111111111';
const WALLET_B = '0x2222222222222222222222222222222222222222';

/** A valid 32-byte uint256 word decoding to 5. */
const FIVE = `0x${'0'.repeat(63)}5`;
/** A valid 32-byte word whose low 20 bytes are a legitimate address. */
const OWNER_WORD = `0x${'0'.repeat(24)}${'9'.repeat(40)}`;

const mockFetch = (): ReturnType<typeof vi.fn> => fetch as unknown as ReturnType<typeof vi.fn>;

/** Wraps a JSON-RPC batch payload in the response shape `HttpClient` expects. */
const rpcBatch = (items: unknown[]) => ({
  ok: true,
  status: 200,
  headers: new Headers({ 'Content-Type': 'application/json' }),
  json: () => Promise.resolve(items),
});

const client = new GuildPassClient({
  apiUrl: BASE_URL,
  rpcUrl: RPC_URL,
  contractAddress: CONTRACT,
});

/** Two arbitrary well-formed calls, enough to prove sibling isolation. */
const twoCalls = [
  { to: CONTRACT, data: '0xdeadbeef' },
  { to: CONTRACT, data: '0xcafebabe' },
];

beforeEach(() => {
  vi.stubGlobal('fetch', vi.fn());
});

// ---------------------------------------------------------------------------
// HTTP failure within a batch
// ---------------------------------------------------------------------------

describe('BatchItemResult.code — HTTP failure within a batch', () => {
  it('classifies a JSON-RPC error envelope as HTTP_ERROR without affecting siblings', async () => {
    mockFetch().mockResolvedValue(
      rpcBatch([
        { jsonrpc: '2.0', id: 1, error: { code: -32000, message: 'execution reverted' } },
        { jsonrpc: '2.0', id: 2, result: FIVE },
      ]),
    );

    const results = await client.contracts.batchEthCall(twoCalls, RPC_URL);

    expect(results[0]).toEqual({
      status: 'error',
      error: 'execution reverted',
      code: GuildPassErrorCode.HTTP_ERROR,
    });
    // A failed item must not disturb its sibling, nor gain a spurious code.
    expect(results[1]).toEqual({ status: 'success', result: FIVE });
  });

  it('falls back to the numeric RPC code in the message when no message is present', async () => {
    mockFetch().mockResolvedValue(rpcBatch([{ jsonrpc: '2.0', id: 1, error: { code: -32000 } }]));

    const results = await client.contracts.batchEthCall([twoCalls[0]], RPC_URL);

    expect(results[0]).toEqual({
      status: 'error',
      error: 'RPC error (code: -32000)',
      code: GuildPassErrorCode.HTTP_ERROR,
    });
  });

  it.each([
    [
      'viem',
      () =>
        viemContractProvider({
          call: async () => {
            throw new Error('boom');
          },
        }),
    ],
    [
      'ethers',
      () =>
        ethersContractProvider({
          call: async () => {
            throw new Error('boom');
          },
        }),
    ],
  ])('%s adapter classifies a provider throw as HTTP_ERROR', async (_name, make) => {
    const results = await make().batchEthCall([twoCalls[0]]);

    expect(results[0]).toEqual({
      status: 'error',
      error: 'boom',
      code: GuildPassErrorCode.HTTP_ERROR,
    });
  });
});

// ---------------------------------------------------------------------------
// Malformed RPC response within a batch
// ---------------------------------------------------------------------------

describe('BatchItemResult.code — malformed RPC response', () => {
  it('classifies a missing per-item response as INVALID_RESPONSE', async () => {
    // Only id 2 comes back; id 1 was silently dropped by the node.
    mockFetch().mockResolvedValue(rpcBatch([{ jsonrpc: '2.0', id: 2, result: FIVE }]));

    const results = await client.contracts.batchEthCall(twoCalls, RPC_URL);

    expect(results[0]).toEqual({
      status: 'error',
      error: 'No response for batch item 0 (id: 1)',
      code: GuildPassErrorCode.INVALID_RESPONSE,
    });
    expect(results[1]).toEqual({ status: 'success', result: FIVE });
  });

  it('classifies a null result as INVALID_RESPONSE', async () => {
    mockFetch().mockResolvedValue(rpcBatch([{ jsonrpc: '2.0', id: 1, result: null }]));

    const results = await client.contracts.batchEthCall([twoCalls[0]], RPC_URL);

    expect(results[0]).toEqual({
      status: 'error',
      error: 'Empty result for batch item 0',
      code: GuildPassErrorCode.INVALID_RESPONSE,
    });
  });

  it('classifies a non-string result as INVALID_RESPONSE', async () => {
    mockFetch().mockResolvedValue(rpcBatch([{ jsonrpc: '2.0', id: 1, result: 42 }]));

    const results = await client.contracts.batchEthCall([twoCalls[0]], RPC_URL);

    expect(results[0]).toEqual({
      status: 'error',
      error: 'Unexpected result type for batch item 0',
      code: GuildPassErrorCode.INVALID_RESPONSE,
    });
  });

  it('classifies an undecodable balance word as INVALID_RESPONSE', async () => {
    // Structurally fine at the JSON-RPC layer, but not a 32-byte word: the
    // failure surfaces in ContractClient's decode pass, which used to swallow
    // the underlying GuildPassError entirely.
    mockFetch().mockResolvedValue(
      rpcBatch([
        { jsonrpc: '2.0', id: 1, result: '0x1234' },
        { jsonrpc: '2.0', id: 2, result: FIVE },
      ]),
    );

    const results = await client.contracts.getMembershipTokenBalancesBatch({
      walletAddresses: [WALLET_A, WALLET_B],
    });

    expect(results[0]).toEqual({
      status: 'error',
      error: 'Failed to decode balance result',
      code: GuildPassErrorCode.INVALID_RESPONSE,
    });
    expect(results[1]).toEqual({ status: 'success', result: '5' });
  });

  it('classifies an undecodable guild owner word as INVALID_RESPONSE', async () => {
    mockFetch().mockResolvedValue(
      rpcBatch([
        { jsonrpc: '2.0', id: 1, result: '0x1234' },
        { jsonrpc: '2.0', id: 2, result: OWNER_WORD },
      ]),
    );

    const results = await client.contracts.getGuildOwnersBatch({
      guildIds: ['guild_1', 'guild_2'],
    });

    expect(results[0]).toEqual({
      status: 'error',
      error: 'Failed to decode guild owner result',
      code: GuildPassErrorCode.INVALID_RESPONSE,
    });
    expect(results[1].status).toBe('success');
  });
});

// ---------------------------------------------------------------------------
// Invalid address
// ---------------------------------------------------------------------------

describe('BatchItemResult.code — invalid address', () => {
  it('still throws INVALID_ADDRESS pre-flight rather than reporting it per item', async () => {
    // Regression lock. Pre-flight validation is deliberately fail-fast: a
    // caller-supplied bad address never becomes a per-item entry, so this
    // contract cannot drift silently now that items carry codes.
    await expect(
      client.contracts.getMembershipTokenBalancesBatch({
        walletAddresses: [WALLET_A, '0xnot-an-address'],
      }),
    ).rejects.toMatchObject({ code: GuildPassErrorCode.INVALID_ADDRESS });

    expect(mockFetch()).not.toHaveBeenCalled();
  });

  it('surfaces a per-item INVALID_ADDRESS when a node returns a bad owner address', async () => {
    // A 32-byte word that decodes to a mixed-case address failing EIP-55.
    // `decodeAddressResult` -> `validateAddress` throws INVALID_ADDRESS, which
    // the decode step previously discarded via a bare `catch {}`. Proves an
    // *arbitrary* code survives, not just the INVALID_RESPONSE fallback.
    const badChecksumWord = `0x${'0'.repeat(24)}AbCdEf0123456789AbCdEf0123456789AbCdEf01`;

    mockFetch().mockResolvedValue(
      rpcBatch([
        { jsonrpc: '2.0', id: 1, result: badChecksumWord },
        { jsonrpc: '2.0', id: 2, result: OWNER_WORD },
      ]),
    );

    const results = await client.contracts.getGuildOwnersBatch({
      guildIds: ['guild_1', 'guild_2'],
    });

    expect(results[0]).toEqual({
      status: 'error',
      error: 'Failed to decode guild owner result',
      code: GuildPassErrorCode.INVALID_ADDRESS,
    });
    expect(results[1].status).toBe('success');
  });
});

// ---------------------------------------------------------------------------
// Backward compatibility
// ---------------------------------------------------------------------------

describe('BatchItemResult.code — backward compatibility', () => {
  it('never attaches a code to a success entry', async () => {
    mockFetch().mockResolvedValue(
      rpcBatch([
        { jsonrpc: '2.0', id: 1, result: FIVE },
        { jsonrpc: '2.0', id: 2, error: { code: -32000, message: 'execution reverted' } },
      ]),
    );

    const results = await client.contracts.batchEthCall(twoCalls, RPC_URL);

    expect(results[0].code).toBeUndefined();
    expect(results[1].code).toBe(GuildPassErrorCode.HTTP_ERROR);
    // `error` remains the sole human-readable channel and is untouched.
    expect(results[0].error).toBeUndefined();
    expect(results[1].error).toBe('execution reverted');
  });

  it('preserves codes across chunk boundaries', async () => {
    // maxBatchSize 1 + chunk splits into two single-call batches; the code must
    // survive the concatenation of per-chunk result arrays.
    mockFetch()
      .mockResolvedValueOnce(rpcBatch([{ jsonrpc: '2.0', id: 1, result: FIVE }]))
      .mockResolvedValueOnce(
        rpcBatch([
          { jsonrpc: '2.0', id: 1, error: { code: -32000, message: 'execution reverted' } },
        ]),
      );

    const results = await client.contracts.batchEthCall(twoCalls, RPC_URL, {
      maxBatchSize: 1,
      chunk: true,
    });

    expect(results).toEqual([
      { status: 'success', result: FIVE },
      { status: 'error', error: 'execution reverted', code: GuildPassErrorCode.HTTP_ERROR },
    ]);
  });
});

// ---------------------------------------------------------------------------
// Helper units
// ---------------------------------------------------------------------------

describe('toErrorCode', () => {
  it('extracts the code from a GuildPassError', () => {
    const err = new GuildPassError('nope', GuildPassErrorCode.RATE_LIMITED);
    expect(toErrorCode(err)).toBe(GuildPassErrorCode.RATE_LIMITED);
  });

  it('recognises a cross-realm GuildPassError by shape', () => {
    // A structurally identical error from a duplicated copy of the SDK fails
    // `instanceof`; `isGuildPassError` is why the code still survives.
    const foreign = { name: 'GuildPassNetworkError', code: 'TIMEOUT', message: 'slow' };
    expect(toErrorCode(foreign)).toBe(GuildPassErrorCode.TIMEOUT);
  });

  it.each([
    ['a plain Error', new Error('boom')],
    ['a string', 'boom'],
    ['null', null],
    ['an error with an unknown code', { name: 'GuildPassError', code: 'NOT_A_REAL_CODE' }],
  ])('falls back for %s', (_label, value) => {
    expect(toErrorCode(value)).toBe(GuildPassErrorCode.UNKNOWN_ERROR);
    expect(toErrorCode(value, GuildPassErrorCode.INVALID_RESPONSE)).toBe(
      GuildPassErrorCode.INVALID_RESPONSE,
    );
  });

  it('falls back for a real GuildPassError carrying a code that does not exist', () => {
    // `isGuildPassError` short-circuits on `instanceof`, so an error built with
    // a phantom enum member (`GuildPassErrorCode.TYPO`, or a member removed
    // since a custom contractProvider was compiled) reaches us carrying
    // `undefined`. Returning that would break this function's own return type
    // and hand callers an error entry with no usable classification.
    const phantom = new GuildPassError('boom', undefined as unknown as GuildPassErrorCode);

    expect(phantom.code).toBeUndefined();
    expect(toErrorCode(phantom)).toBe(GuildPassErrorCode.UNKNOWN_ERROR);
    expect(toErrorCode(phantom, GuildPassErrorCode.INVALID_RESPONSE)).toBe(
      GuildPassErrorCode.INVALID_RESPONSE,
    );
  });

  it('only ever returns a real enum member', () => {
    const valid = new Set<string>(Object.values(GuildPassErrorCode));
    const inputs: unknown[] = [
      new GuildPassError('a', GuildPassErrorCode.TIMEOUT),
      new GuildPassError('b', undefined as unknown as GuildPassErrorCode),
      new GuildPassError('c', 'MADE_UP' as GuildPassErrorCode),
      { name: 'GuildPassNetworkError', code: 'TIMEOUT' },
      { name: 'GuildPassError', code: 42 },
      new Error('plain'),
      undefined,
    ];

    for (const input of inputs) {
      expect(valid.has(toErrorCode(input))).toBe(true);
    }
  });
});

describe('batchItemError', () => {
  it('always populates status, error and code together', () => {
    expect(batchItemError('boom', GuildPassErrorCode.HTTP_ERROR)).toEqual({
      status: 'error',
      error: 'boom',
      code: GuildPassErrorCode.HTTP_ERROR,
    });
  });
});

// ---------------------------------------------------------------------------
// Third-party contractProvider normalisation
// ---------------------------------------------------------------------------

describe('BatchItemResult.code — third-party contractProvider entries', () => {
  /** Builds a client whose provider returns exactly the given entries. */
  const clientReturning = (entries: unknown[]) =>
    new GuildPassClient({
      apiUrl: BASE_URL,
      contractAddress: CONTRACT,
      contractProvider: {
        ethCall: async () => '0x',
        batchEthCall: async () => entries,
      } as never,
    });

  it('fills in UNKNOWN_ERROR when a provider omits code entirely', async () => {
    const c = clientReturning([{ status: 'error', error: 'provider said no' }]);

    const results = await c.contracts.batchEthCall([twoCalls[0]]);

    expect(results[0]).toEqual({
      status: 'error',
      error: 'provider said no',
      code: GuildPassErrorCode.UNKNOWN_ERROR,
    });
  });

  it('replaces a code that is not a real enum member', async () => {
    // A provider compiled against a different SDK version, carrying a code
    // this build no longer knows about.
    const c = clientReturning([{ status: 'error', error: 'stale', code: 'RETIRED_CODE' }]);

    const results = await c.contracts.batchEthCall([twoCalls[0]]);

    expect(results[0].code).toBe(GuildPassErrorCode.UNKNOWN_ERROR);
  });

  it('leaves a valid provider-supplied code untouched', async () => {
    const c = clientReturning([
      { status: 'error', error: 'rate limited', code: GuildPassErrorCode.RATE_LIMITED },
    ]);

    const results = await c.contracts.batchEthCall([twoCalls[0]]);

    expect(results[0].code).toBe(GuildPassErrorCode.RATE_LIMITED);
  });

  it('normalises through the typed batch helpers too', async () => {
    const c = clientReturning([{ status: 'error', error: 'provider said no' }]);

    const balances = await c.contracts.getMembershipTokenBalancesBatch({
      walletAddresses: [WALLET_A],
    });
    expect(balances[0].code).toBe(GuildPassErrorCode.UNKNOWN_ERROR);

    const owners = await c.contracts.getGuildOwnersBatch({ guildIds: ['guild_1'] });
    expect(owners[0].code).toBe(GuildPassErrorCode.UNKNOWN_ERROR);
  });

  it('returns the provider array unchanged when nothing needs patching', async () => {
    // Guards the allocation-free fast path: success-only results are passed
    // through by reference rather than rebuilt.
    const entries = [{ status: 'success' as const, result: FIVE }];
    const c = clientReturning(entries);

    const results = await c.contracts.batchEthCall([twoCalls[0]]);

    expect(results).toBe(entries);
  });
});
