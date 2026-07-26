/**
 * Tests for cross-provider consensus verification of on-chain balance reads
 * (GuildPass SDK issue #307).
 *
 * Covers:
 *   - validateConfig rejections of malformed `contractReadConsensus`.
 *   - Opt-in behaviour: when the config is unset, calls behave exactly as
 *     before (single-URL failover, no quorum check).
 *   - Acceptance criteria from the issue: agreeing providers return the
 *     agreed value; disagreeing providers either succeed (when the quorum
 *     among agreeing providers is met) or throw `CONSENSUS_MISMATCH` with
 *     structured details identifying the outlier.
 *   - Custom `contractProvider` precedence (bypasses consensus mode).
 *   - Cancellation / abort propagation in the consensus path.
 *   - Quorum math with various splits (2-of-3, 3-of-4, all-disagree).
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { GuildPassClient } from '../src/client/GuildPassClient';
import { GuildPassErrorCode } from '../src/errors/errorCodes';
import { GuildPassError } from '../src/errors/GuildPassError';
import {
  BALANCE_OF_SELECTOR,
  encodeAddressArgument,
} from '../src/contracts/contractClient';
import { validateConfig } from '../src/config/sdkConfig';
import type { ContractProvider } from '../src/contracts/providers/provider.types';

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const WALLET = '0x1234567890123456789012345678901234567890';
const CONTRACT = '0x0000000000000000000000000000000000000000';
const BASE_URL = 'https://api.test.com';
const RPC_A = 'https://rpc-a.test.com';
const RPC_B = 'https://rpc-b.test.com';
const RPC_C = 'https://rpc-c.test.com';
const RPC_D = 'https://rpc-d.test.com';

const BAL_42 = '0x000000000000000000000000000000000000000000000000000000000000002a'; // 42
const BAL_7  = '0x0000000000000000000000000000000000000000000000000000000000000007'; // 7
const BAL_0  = '0x0000000000000000000000000000000000000000000000000000000000000000'; // 0
const BAL_42_SHORT = '0x2a'; // same value as BAL_42 but non-padded — used to verify hex normalisation

const BALANCE_CALL_DATA = `${BALANCE_OF_SELECTOR}${encodeAddressArgument(WALLET)}`;

// ---------------------------------------------------------------------------
// Test helpers
// ---------------------------------------------------------------------------

const mockFetch = (): ReturnType<typeof vi.fn> => fetch as unknown as ReturnType<typeof vi.fn>;

/** Minimal mocked `Response` shape shared by every route builder below. */
type MockFetchResponse = {
  ok: boolean;
  status: number;
  headers: Headers;
  json: () => Promise<any>;
  text: () => Promise<string>;
};

const jsonRpcOk = (result: string) => ({
  ok: true,
  status: 200,
  headers: new Headers({ 'Content-Type': 'application/json' }),
  json: () => Promise.resolve({ jsonrpc: '2.0', id: 1, result }),
  text: () => Promise.resolve(JSON.stringify({ jsonrpc: '2.0', id: 1, result })),
});

const jsonRpcOkForUrl = (url: string, result: string) => ({
  ok: true,
  status: 200,
  headers: new Headers({ 'Content-Type': 'application/json' }),
  json: () => Promise.resolve({ jsonrpc: '2.0', id: 1, result }),
  text: () => Promise.resolve(JSON.stringify({ jsonrpc: '2.0', id: 1, result })),
});

const transientHttp = (status: number) => ({
  ok: false,
  status,
  headers: new Headers(),
  json: () => Promise.resolve({ message: `HTTP ${status}` }),
  text: () => Promise.resolve(JSON.stringify({ message: `HTTP ${status}` })),
});

const contractRevert = () => ({
  ok: true,
  status: 200,
  headers: new Headers({ 'Content-Type': 'application/json' }),
  json: () => Promise.resolve({ jsonrpc: '2.0', id: 1, error: { code: -32000, message: 'execution reverted' } }),
  text: () => Promise.resolve(JSON.stringify({ jsonrpc: '2.0', id: 1, error: { code: -32000, message: 'execution reverted' } })),
});

/**
 * Builds a fetch mock that responds differently per URL.
 * The keys are exact-match substrings the request URL must include.
 */
const urlMock = (
  routes: Record<string, () => MockFetchResponse>,
  defaultRoute: () => MockFetchResponse = () => ({
    ok: false,
    status: 500,
    headers: new Headers(),
    json: () => Promise.resolve({ message: 'no route' }),
    text: () => Promise.resolve(JSON.stringify({ message: 'no route' })),
  }),
) => {
  const fn = vi.fn(async (url: string) => {
    for (const [key, builder] of Object.entries(routes)) {
      if (url.includes(key)) return builder();
    }
    return defaultRoute();
  });
  return fn;
};

// ---------------------------------------------------------------------------
// validateConfig — invalid consensus shape
// ---------------------------------------------------------------------------

describe('validateConfig — contractReadConsensus', () => {
  const base = { apiUrl: BASE_URL };

  it('accepts an undefined contractReadConsensus (opt-out)', () => {
    expect(() => validateConfig({ ...base })).not.toThrow();
  });

  it('accepts a well-formed contractReadConsensus', () => {
    expect(() =>
      validateConfig({
        ...base,
        contractReadConsensus: { providers: [RPC_A, RPC_B], minProviders: 2 },
      }),
    ).not.toThrow();
  });

  it('accepts minProviders equal to providers.length', () => {
    expect(() =>
      validateConfig({
        ...base,
        contractReadConsensus: { providers: [RPC_A, RPC_B, RPC_C], minProviders: 3 },
      }),
    ).not.toThrow();
  });

  it('rejects an empty providers array', () => {
    expect(() =>
      validateConfig({
        ...base,
        contractReadConsensus: { providers: [], minProviders: 2 },
      }),
    ).toThrowError(/contractReadConsensus\.providers must be a non-empty array/);
  });

  it('rejects a non-array providers field', () => {
    expect(() =>
      validateConfig({
        ...base,
        contractReadConsensus: { providers: 'not-an-array' as any, minProviders: 2 },
      }),
    ).toThrowError(/contractReadConsensus\.providers/);
  });

  it('rejects an invalid URL inside providers', () => {
    expect(() =>
      validateConfig({
        ...base,
        contractReadConsensus: { providers: [RPC_A, 'not-a-url'], minProviders: 2 },
      }),
    ).toThrowError(/contractReadConsensus\.providers\[1\]/);
  });

  it('rejects a non-http(s) URL inside providers', () => {
    expect(() =>
      validateConfig({
        ...base,
        contractReadConsensus: { providers: ['ftp://bad.url'], minProviders: 2 },
      }),
    ).toThrowError(/contractReadConsensus\.providers\[0\]/);
  });

  it('rejects minProviders smaller than 2 (no majority-over-lying-RPC value)', () => {
    expect(() =>
      validateConfig({
        ...base,
        contractReadConsensus: { providers: [RPC_A, RPC_B], minProviders: 1 },
      }),
    ).toThrowError(/minProviders.*integer >= 2/);
  });

  it('rejects a non-integer minProviders', () => {
    expect(() =>
      validateConfig({
        ...base,
        contractReadConsensus: { providers: [RPC_A, RPC_B], minProviders: 2.5 },
      }),
    ).toThrowError(/minProviders/);
  });

  it('rejects minProviders greater than providers.length', () => {
    expect(() =>
      validateConfig({
        ...base,
        contractReadConsensus: { providers: [RPC_A, RPC_B], minProviders: 3 },
      }),
    ).toThrowError(/minProviders \(3\) cannot exceed the number of providers \(2\)/);
  });

  it('rejects duplicate provider URLs (would inflate apparent agreeing count)', () => {
    expect(() =>
      validateConfig({
        ...base,
        contractReadConsensus: { providers: [RPC_A, RPC_A], minProviders: 2 },
      }),
    ).toThrowError(/duplicate URL/);
  });
});

// ---------------------------------------------------------------------------
// Opt-in behaviour: when consensus is unset, behavior is UNCHANGED.
// ---------------------------------------------------------------------------

describe('contractReadConsensus is opt-in', () => {
  beforeEach(() => {
    vi.stubGlobal('fetch', vi.fn());
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('without consensus config, getMembershipTokenBalance uses the original rpcUrl', async () => {
    mockFetch().mockResolvedValue(jsonRpcOk(BAL_42));

    const client = new GuildPassClient({
      apiUrl: BASE_URL,
      rpcUrl: RPC_A,
      contractAddress: CONTRACT,
    });

    const balance = await client.contracts.getMembershipTokenBalance({ walletAddress: WALLET });

    expect(balance).toBe('42');
    // Single RPC URL: only one fetch call.
    expect(fetch).toHaveBeenCalledTimes(1);
    expect(fetch).toHaveBeenCalledWith(
      expect.stringContaining('rpc-a.test.com'),
      expect.any(Object),
    );
  });
});

// ---------------------------------------------------------------------------
// Acceptance criterion 1: all providers agree → returns the agreed value
// ---------------------------------------------------------------------------

describe('consensus: all providers agree', () => {
  beforeEach(() => {
    vi.stubGlobal('fetch', vi.fn());
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('returns the agreed value when all consensus providers return the same result', async () => {
    mockFetch().mockImplementation(urlMock({
      'rpc-a.test.com': () => jsonRpcOkForUrl(RPC_A, BAL_42),
      'rpc-b.test.com': () => jsonRpcOkForUrl(RPC_B, BAL_42),
      'rpc-c.test.com': () => jsonRpcOkForUrl(RPC_C, BAL_42),
    }));

    const client = new GuildPassClient({
      apiUrl: BASE_URL,
      contractAddress: CONTRACT,
      contractReadConsensus: {
        providers: [RPC_A, RPC_B, RPC_C],
        minProviders: 2,
      },
    });

    const balance = await client.contracts.getMembershipTokenBalance({ walletAddress: WALLET });

    expect(balance).toBe('42');
    // Three parallel calls — one per provider.
    expect(fetch).toHaveBeenCalledTimes(3);
    for (const url of [RPC_A, RPC_B, RPC_C]) {
      expect(fetch).toHaveBeenCalledWith(
        expect.stringContaining(url),
        expect.any(Object),
      );
    }
  });

  it('treats differently-padded hex responses as equal (normalisation)', async () => {
    // BAL_42 uses 32-byte padding; BAL_42_SHORT omits leading zeros.
    // Same numeric value; consensus normalises by stripping leading zeros.
    mockFetch().mockImplementation(urlMock({
      'rpc-a.test.com': () => jsonRpcOkForUrl(RPC_A, BAL_42),
      'rpc-b.test.com': () => jsonRpcOkForUrl(RPC_B, BAL_42_SHORT),
    }));

    const client = new GuildPassClient({
      apiUrl: BASE_URL,
      contractAddress: CONTRACT,
      contractReadConsensus: {
        providers: [RPC_A, RPC_B],
        minProviders: 2,
      },
    });

    const balance = await client.contracts.getMembershipTokenBalance({ walletAddress: WALLET });
    expect(balance).toBe('42');
  });
});

// ---------------------------------------------------------------------------
// Acceptance criterion 2: outlier provider → success iff quorum met
// ---------------------------------------------------------------------------

describe('consensus: outlier provider', () => {
  beforeEach(() => {
    vi.stubGlobal('fetch', vi.fn());
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('3 providers, 2 agree + 1 outlier, minProviders=2 → succeeds with the agreeing value', async () => {
    mockFetch().mockImplementation(urlMock({
      'rpc-a.test.com': () => jsonRpcOkForUrl(RPC_A, BAL_42),
      'rpc-b.test.com': () => jsonRpcOkForUrl(RPC_B, BAL_42),
      'rpc-c.test.com': () => jsonRpcOkForUrl(RPC_C, BAL_7), // outlier
    }));

    const client = new GuildPassClient({
      apiUrl: BASE_URL,
      contractAddress: CONTRACT,
      contractReadConsensus: {
        providers: [RPC_A, RPC_B, RPC_C],
        minProviders: 2,
      },
    });

    const balance = await client.contracts.getMembershipTokenBalance({ walletAddress: WALLET });
    expect(balance).toBe('42');
    expect(fetch).toHaveBeenCalledTimes(3);
  });

  it('3 providers, 2 agree + 1 outlier, minProviders=3 → throws CONSENSUS_MISMATCH', async () => {
    mockFetch().mockImplementation(urlMock({
      'rpc-a.test.com': () => jsonRpcOkForUrl(RPC_A, BAL_42),
      'rpc-b.test.com': () => jsonRpcOkForUrl(RPC_B, BAL_42),
      'rpc-c.test.com': () => jsonRpcOkForUrl(RPC_C, BAL_7),
    }));

    const client = new GuildPassClient({
      apiUrl: BASE_URL,
      contractAddress: CONTRACT,
      contractReadConsensus: {
        providers: [RPC_A, RPC_B, RPC_C],
        minProviders: 3,
      },
    });

    // Capture the rejection once and inspect its structured `details`
    // (the field operators rely on to identify the lying provider).
    const error = await client.contracts
      .getMembershipTokenBalance({ walletAddress: WALLET })
      .catch((e) => e);

    expect(error).toBeInstanceOf(GuildPassError);
    const e = error as GuildPassError;
    expect(e.code).toBe(GuildPassErrorCode.CONSENSUS_MISMATCH);

    const details = e.details as any;
    expect(details.totalProviders).toBe(3);
    expect(details.successfulCount).toBe(3);
    expect(details.failedCount).toBe(0);
    expect(details.quorum).toBe(3);

    // Two distinct groups: the largest group has 2 entries (RPC_A, RPC_B on
    // BAL_42) and the outlier has 1 (RPC_C on BAL_7).
    expect(details.groups).toHaveLength(2);
    expect(details.groups[0].count).toBe(2);
    expect(details.groups[0].urls.length).toBe(2);
    expect(details.groups[0].urls).toEqual([RPC_A, RPC_B]);
    expect(details.groups[1].count).toBe(1);
    expect(details.groups[1].urls).toEqual([RPC_C]);

    expect(details.failures).toHaveLength(0);
  });

  it('all-disagree scenario: 4 providers split into 3 groups, no quorum met → throws', async () => {
    // Three groups: 2-on-42, 1-on-7, 1-on-0. minProviders=3 → none meets it.
    mockFetch().mockImplementation(urlMock({
      'rpc-a.test.com': () => jsonRpcOkForUrl(RPC_A, BAL_42),
      'rpc-b.test.com': () => jsonRpcOkForUrl(RPC_B, BAL_42),
      'rpc-c.test.com': () => jsonRpcOkForUrl(RPC_C, BAL_7),
      'rpc-d.test.com': () => jsonRpcOkForUrl(RPC_D, BAL_0),
    }));

    const client = new GuildPassClient({
      apiUrl: BASE_URL,
      contractAddress: CONTRACT,
      contractReadConsensus: {
        providers: [RPC_A, RPC_B, RPC_C, RPC_D],
        minProviders: 3,
      },
    });

    try {
      await client.contracts.getMembershipTokenBalance({ walletAddress: WALLET });
      throw new Error('Expected reject');
    } catch (err) {
      expect(err).toBeInstanceOf(GuildPassError);
      const e = err as GuildPassError;
      expect(e.code).toBe(GuildPassErrorCode.CONSENSUS_MISMATCH);
      const details = e.details as any;
      expect(details.totalProviders).toBe(4);
      expect(details.successfulCount).toBe(4);
      expect(details.quorum).toBe(3);
      expect(details.groups.map((g: any) => g.count)).toEqual([2, 1, 1]); // sorted desc
      expect(details.failures).toHaveLength(0);
    }
  });

  it('reports per-provider failures alongside agreeing groups', async () => {
    // A fails transiently, B and C agree on 42, minProviders=2 → quorum met.
    mockFetch().mockImplementation(urlMock({
      'rpc-a.test.com': () => transientHttp(503),
      'rpc-b.test.com': () => jsonRpcOkForUrl(RPC_B, BAL_42),
      'rpc-c.test.com': () => jsonRpcOkForUrl(RPC_C, BAL_42),
    }));

    const client = new GuildPassClient({
      apiUrl: BASE_URL,
      contractAddress: CONTRACT,
      contractReadConsensus: {
        providers: [RPC_A, RPC_B, RPC_C],
        minProviders: 2,
      },
    });

    const balance = await client.contracts.getMembershipTokenBalance({ walletAddress: WALLET });
    expect(balance).toBe('42');
  });

  it('throws CONSENSUS_MISMATCH when too few providers succeed to form a quorum', async () => {
    // A and C fail transiently; only B succeeds with 42; minProviders=2 → no quorum.
    mockFetch().mockImplementation(urlMock({
      'rpc-a.test.com': () => transientHttp(503),
      'rpc-b.test.com': () => jsonRpcOkForUrl(RPC_B, BAL_42),
      'rpc-c.test.com': () => transientHttp(500),
    }));

    const client = new GuildPassClient({
      apiUrl: BASE_URL,
      contractAddress: CONTRACT,
      contractReadConsensus: {
        providers: [RPC_A, RPC_B, RPC_C],
        minProviders: 2,
      },
    });

    try {
      await client.contracts.getMembershipTokenBalance({ walletAddress: WALLET });
      throw new Error('Expected reject');
    } catch (err) {
      expect(err).toBeInstanceOf(GuildPassError);
      const e = err as GuildPassError;
      expect(e.code).toBe(GuildPassErrorCode.CONSENSUS_MISMATCH);
      const details = e.details as any;
      expect(details.totalProviders).toBe(3);
      expect(details.successfulCount).toBe(1);
      expect(details.failedCount).toBe(2);
      expect(details.groups).toHaveLength(1);
      expect(details.groups[0].urls).toEqual([RPC_B]);
      expect(details.failures).toHaveLength(2);
      // Each failure record carries the URL of the failing provider.
      const failingUrls = details.failures.map((f: any) => f.url).sort();
      expect(failingUrls).toEqual([RPC_A, RPC_C].sort());
    }
  });

  it('counts a contract-level revert (non-transient) as a per-provider failure', async () => {
    mockFetch().mockImplementation(urlMock({
      'rpc-a.test.com': () => contractRevert(),
      'rpc-b.test.com': () => jsonRpcOkForUrl(RPC_B, BAL_42),
      'rpc-c.test.com': () => jsonRpcOkForUrl(RPC_C, BAL_42),
    }));

    const client = new GuildPassClient({
      apiUrl: BASE_URL,
      contractAddress: CONTRACT,
      contractReadConsensus: {
        providers: [RPC_A, RPC_B, RPC_C],
        minProviders: 2,
      },
    });

    const balance = await client.contracts.getMembershipTokenBalance({ walletAddress: WALLET });
    // Reversion at A doesn't poison the B+C agreement.
    expect(balance).toBe('42');
  });
});

// ---------------------------------------------------------------------------
// Custom contractProvider takes precedence over consensus
// ---------------------------------------------------------------------------

describe('contractProvider bypasses consensus', () => {
  it('a configured contractProvider is invoked directly when both it and consensus are configured', async () => {
    const ethCall = vi.fn().mockResolvedValue(BAL_42);
    const provider: ContractProvider = { ethCall, batchEthCall: vi.fn() };

    const client = new GuildPassClient({
      apiUrl: BASE_URL,
      contractAddress: CONTRACT,
      contractProvider: provider,
      contractReadConsensus: { providers: [RPC_A, RPC_B], minProviders: 2 },
    });

    const balance = await client.contracts.getMembershipTokenBalance({ walletAddress: WALLET });
    expect(balance).toBe('42');
    expect(ethCall).toHaveBeenCalledTimes(1);
    // The provider path was used; the consensus providers were NOT hit.
    expect(ethCall).toHaveBeenCalledWith(
      { to: CONTRACT, data: BALANCE_CALL_DATA },
      undefined,
    );
  });
});

// ---------------------------------------------------------------------------
// Cancellation / abort propagation
// ---------------------------------------------------------------------------

describe('consensus: cancellation / abort propagation', () => {
  beforeEach(() => {
    vi.stubGlobal('fetch', vi.fn());
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('honours a caller-provided AbortController.signal even in the consensus path', async () => {
    // Each provider waits forever (would never resolve without abort).
    // NOTE: We pre-abort the controller *before* awaiting the SDK call so the
    // underlying HttpClient sees an already-aborted signal and resolves with
    // REQUEST_CANCELLED immediately. If we instead aborted mid-fetch we would
    // be testing the in-flight abort listener, which is a different code path.
    mockFetch().mockImplementation((_url: string, init?: RequestInit) => {
      return new Promise((_resolve, reject) => {
        if (init?.signal) {
          init.signal.addEventListener('abort', () => {
            const e: any = new Error('Aborted');
            e.name = 'AbortError';
            reject(e);
          });
        }
      });
    });

    const client = new GuildPassClient({
      apiUrl: BASE_URL,
      contractAddress: CONTRACT,
      contractReadConsensus: { providers: [RPC_A, RPC_B], minProviders: 2 },
    });

    const controller = new AbortController();
    controller.abort();

    const promise = client.contracts.getMembershipTokenBalance(
      { walletAddress: WALLET },
      { signal: controller.signal },
    );

    // Cancellation re-throws the REQUEST_CANCELLED / ABORTED error directly
    // rather than wrapping it into CONSENSUS_MISMATCH.
    await expect(promise).rejects.toMatchObject({
      code: GuildPassErrorCode.REQUEST_CANCELLED,
    });
  });
});

// ---------------------------------------------------------------------------
// Coverage across all single-call read methods
// ---------------------------------------------------------------------------

describe('consensus applies to every race-relevant single-call read', () => {
  beforeEach(() => {
    vi.stubGlobal('fetch', vi.fn());
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('getGuildOwner honours consensus mode', async () => {
    const OWNER = '0x9999999999999999999999999999999999999999';
    const ownerHex = `0x${'0'.repeat(24)}${OWNER.slice(2)}`;

    mockFetch().mockImplementation(urlMock({
      'rpc-a.test.com': () => jsonRpcOkForUrl(RPC_A, ownerHex),
      'rpc-b.test.com': () => jsonRpcOkForUrl(RPC_B, ownerHex),
    }));

    const client = new GuildPassClient({
      apiUrl: BASE_URL,
      contractAddress: CONTRACT,
      contractReadConsensus: { providers: [RPC_A, RPC_B], minProviders: 2 },
    });

    const owner = await client.contracts.getGuildOwner({ guildId: 'guild_1' });
    expect(owner).toBe(OWNER);
    expect(fetch).toHaveBeenCalledTimes(2);
  });

  it('getERC20Balance honours consensus mode', async () => {
    const tokenContract = '0xaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa';
    mockFetch().mockImplementation(urlMock({
      'rpc-a.test.com': () => jsonRpcOkForUrl(RPC_A, BAL_42),
      'rpc-b.test.com': () => jsonRpcOkForUrl(RPC_B, BAL_42),
    }));

    const client = new GuildPassClient({
      apiUrl: BASE_URL,
      contractReadConsensus: { providers: [RPC_A, RPC_B], minProviders: 2 },
    });

    const balance = await client.contracts.getERC20Balance({
      walletAddress: WALLET,
      contractAddress: tokenContract,
    });
    expect(balance).toBe('42');
  });

  // Note: `getMembershipTokenBalanceFormatted` is implicitly tested via the
  // `getMembershipTokenBalance` consensus suite above (the inner balance
  // call is what consensus verifies). `getTokenDecimals` is intentionally
  // NOT consensus-routed — token-metadata calls don't gate security
  // decisions and don't need cross-provider agreement — so we do not add
  // a dedicated "formatted" smoke test here; doing so would couple this
  // file to a non-consensus path that's out of scope.
});

// ---------------------------------------------------------------------------
// Smoke coverage: every race-relevant read method routes through consensus
// when configured. These are intentionally lightweight — the consensus
// fanout logic is shared, so a single per-method smoke test per-method is
// enough to lock down that the call site actually invokves it.
// ---------------------------------------------------------------------------

describe('consensus routing: per-method smoke coverage', () => {
  beforeEach(() => {
    vi.stubGlobal('fetch', vi.fn());
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('ownsERC721Token fans out across consensus providers', async () => {
    // ownsERC721Token returns true when the wallet is the owner.
    const ownerHex = `0x${'0'.repeat(24)}${WALLET.slice(2)}`;
    mockFetch().mockImplementation(urlMock({
      'rpc-a.test.com': () => jsonRpcOkForUrl(RPC_A, ownerHex),
      'rpc-b.test.com': () => jsonRpcOkForUrl(RPC_B, ownerHex),
    }));

    const nftContract = '0xaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa';
    const client = new GuildPassClient({
      apiUrl: BASE_URL,
      contractReadConsensus: { providers: [RPC_A, RPC_B], minProviders: 2 },
    });

    await expect(
      client.contracts.ownsERC721Token({
        walletAddress: WALLET,
        tokenId: '7',
        contractAddress: nftContract,
      }),
    ).resolves.toBe(true);
    expect(fetch).toHaveBeenCalledTimes(2);
  });

  it('getERC1155Balance fans out across consensus providers', async () => {
    mockFetch().mockImplementation(urlMock({
      'rpc-a.test.com': () => jsonRpcOkForUrl(RPC_A, BAL_42),
      'rpc-b.test.com': () => jsonRpcOkForUrl(RPC_B, BAL_42),
    }));

    const tokenContract = '0xbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb';
    const client = new GuildPassClient({
      apiUrl: BASE_URL,
      contractReadConsensus: { providers: [RPC_A, RPC_B], minProviders: 2 },
    });

    const balance = await client.contracts.getERC1155Balance({
      walletAddress: WALLET,
      tokenId: '3',
      contractAddress: tokenContract,
    });
    expect(balance).toBe('42');
    expect(fetch).toHaveBeenCalledTimes(2);
  });

  it('readContract fans out across consensus providers', async () => {
    // A trivial read-only function: `totalSupply() -> uint256`. Owner-style
    // ABI is sufficient.
    const abi = {
      type: 'function' as const,
      name: 'totalSupply',
      inputs: [],
      outputs: [{ type: 'uint256' }],
    };

    mockFetch().mockImplementation(urlMock({
      'rpc-a.test.com': () => jsonRpcOkForUrl(RPC_A, BAL_42),
      'rpc-b.test.com': () => jsonRpcOkForUrl(RPC_B, BAL_42),
    }));

    const tokenContract = '0xcccccccccccccccccccccccccccccccccccccccc';
    const client = new GuildPassClient({
      apiUrl: BASE_URL,
      contractReadConsensus: { providers: [RPC_A, RPC_B], minProviders: 2 },
    });

    const result = await client.contracts.readContract({
      contractAddress: tokenContract,
      abi,
      functionName: 'totalSupply',
      args: [],
    });
    expect(result).toBe(BAL_42);
    expect(fetch).toHaveBeenCalledTimes(2);
  });
});

// ---------------------------------------------------------------------------
// Batch consensus (issue #307 follow-up):
// - getMembershipTokenBalancesBatch / getGuildOwnersBatch / batchEthCall now
//   route through resolveBatchEthCall which applies the same precedence chain
//   (contractProvider > contractReadConsensus > default) and runs per-item
//   consensus when configured.
// ---------------------------------------------------------------------------

describe('batch consensus (per-item quorum)', () => {
  beforeEach(() => {
    vi.stubGlobal('fetch', vi.fn());
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  // Helper: build a JSON-RPC batch response with the provided per-item results.
  const batchResponse = (
    items: Array<{ id: number; result?: string; error?: { code: number; message: string } }>,
  ) => ({
    ok: true,
    status: 200,
    headers: new Headers({ 'Content-Type': 'application/json' }),
    json: () => Promise.resolve(items.map((i) => ({ jsonrpc: '2.0', ...i }))),
    text: () => Promise.resolve(JSON.stringify(items.map((i) => ({ jsonrpc: '2.0', ...i })))),
  });

  it('all providers agree on every batch item → all items succeed', async () => {
    mockFetch().mockImplementation(urlMock({
      'rpc-a.test.com': () => batchResponse([{ id: 1, result: BAL_42 }, { id: 2, result: BAL_42 }]),
      'rpc-b.test.com': () => batchResponse([{ id: 1, result: BAL_42 }, { id: 2, result: BAL_42 }]),
      'rpc-c.test.com': () => batchResponse([{ id: 1, result: BAL_42 }, { id: 2, result: BAL_42 }]),
    }));

    const client = new GuildPassClient({
      apiUrl: BASE_URL,
      contractAddress: CONTRACT,
      contractReadConsensus: { providers: [RPC_A, RPC_B, RPC_C], minProviders: 2 },
    });

    const calls = [
      { to: CONTRACT, data: `${BALANCE_OF_SELECTOR}${encodeAddressArgument(WALLET)}` },
      { to: CONTRACT, data: `${BALANCE_OF_SELECTOR}${encodeAddressArgument('0xaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa')}` },
    ];

    const results = await client.contracts.batchEthCall(calls);

    expect(results).toHaveLength(2);
    for (const r of results) {
      expect(r.status).toBe('success');
      if (r.status === 'success') expect(r.result).toBe(BAL_42);
    }
    // 3 parallel batch calls (one per provider), each containing 2 items.
    expect(fetch).toHaveBeenCalledTimes(3);
  });

  it('one provider disagrees at a single index → only that index becomes an error', async () => {
    // RPC_A and RPC_C agree on BAL_42 at both indices; RPC_B fabricates
    // BAL_7 at index 1. With `minProviders: 3` every agreeing group must
    // reach all 3 providers, so the 2-on-42 front-runner loses and index 1
    // surfaces the mismatch. Index 0 still succeeds (all 3 agree).
    mockFetch().mockImplementation(urlMock({
      'rpc-a.test.com': () => batchResponse([{ id: 1, result: BAL_42 }, { id: 2, result: BAL_42 }]),
      'rpc-b.test.com': () => batchResponse([{ id: 1, result: BAL_42 }, { id: 2, result: BAL_7 }]),
      'rpc-c.test.com': () => batchResponse([{ id: 1, result: BAL_42 }, { id: 2, result: BAL_42 }]),
    }));

    const client = new GuildPassClient({
      apiUrl: BASE_URL,
      contractAddress: CONTRACT,
      contractReadConsensus: { providers: [RPC_A, RPC_B, RPC_C], minProviders: 3 },
    });

    const calls = [
      { to: CONTRACT, data: `${BALANCE_OF_SELECTOR}${encodeAddressArgument(WALLET)}` },
      { to: CONTRACT, data: `${BALANCE_OF_SELECTOR}${encodeAddressArgument('0xaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa')}` },
    ];

    const results = await client.contracts.batchEthCall(calls);

    expect(results).toHaveLength(2);
    expect(results[0].status).toBe('success');
    expect(results[1].status).toBe('error');
    if (results[1].status === 'error') {
      expect(results[1].error).toMatch(/Consensus mismatch at batch index 1/);
      expect(results[1].error).toMatch(/quorum: 3/);
    }
  });

  it('all providers disagree → every item becomes an error, no throw', async () => {
    mockFetch().mockImplementation(urlMock({
      'rpc-a.test.com': () => batchResponse([{ id: 1, result: BAL_42 }]),
      'rpc-b.test.com': () => batchResponse([{ id: 1, result: BAL_7 }]),
      'rpc-c.test.com': () => batchResponse([{ id: 1, result: BAL_0 }]),
    }));

    const client = new GuildPassClient({
      apiUrl: BASE_URL,
      contractAddress: CONTRACT,
      contractReadConsensus: { providers: [RPC_A, RPC_B, RPC_C], minProviders: 2 },
    });

    const calls = [
      { to: CONTRACT, data: `${BALANCE_OF_SELECTOR}${encodeAddressArgument(WALLET)}` },
    ];

    // Item-level disagreement never throws — every item surfaces an error.
    const results = await client.contracts.batchEthCall(calls);

    expect(results).toHaveLength(1);
    expect(results[0].status).toBe('error');
    if (results[0].status === 'error') {
      expect(results[0].error).toMatch(/Consensus mismatch at batch index 0/);
    }
  });

  it('a single provider failing the whole batch still permits quorum on items from the rest', async () => {
    // RPC_A fails the batch outright (5xx); B and C agree on BAL_42 for both items.
    mockFetch().mockImplementation(urlMock({
      'rpc-a.test.com': () => transientHttp(503),
      'rpc-b.test.com': () => batchResponse([{ id: 1, result: BAL_42 }, { id: 2, result: BAL_42 }]),
      'rpc-c.test.com': () => batchResponse([{ id: 1, result: BAL_42 }, { id: 2, result: BAL_42 }]),
    }));

    const client = new GuildPassClient({
      apiUrl: BASE_URL,
      contractAddress: CONTRACT,
      contractReadConsensus: { providers: [RPC_A, RPC_B, RPC_C], minProviders: 2 },
    });

    const calls = [
      { to: CONTRACT, data: `${BALANCE_OF_SELECTOR}${encodeAddressArgument(WALLET)}` },
      { to: CONTRACT, data: `${BALANCE_OF_SELECTOR}${encodeAddressArgument('0xbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb')}` },
    ];

    const results = await client.contracts.batchEthCall(calls);
    expect(results).toHaveLength(2);
    for (const r of results) {
      expect(r.status).toBe('success');
    }
  });

  it('every provider fails the whole batch → throws CONSENSUS_MISMATCH at batch level', async () => {
    mockFetch().mockImplementation(urlMock({
      'rpc-a.test.com': () => transientHttp(503),
      'rpc-b.test.com': () => transientHttp(500),
    }));

    const client = new GuildPassClient({
      apiUrl: BASE_URL,
      contractAddress: CONTRACT,
      contractReadConsensus: { providers: [RPC_A, RPC_B], minProviders: 2 },
    });

    const calls = [
      { to: CONTRACT, data: `${BALANCE_OF_SELECTOR}${encodeAddressArgument(WALLET)}` },
    ];

    await expect(client.contracts.batchEthCall(calls)).rejects.toMatchObject({
      code: GuildPassErrorCode.CONSENSUS_MISMATCH,
    });
  });

  it('getMembershipTokenBalancesBatch fans out and decodes agreed balances', async () => {
    const W2 = '0xbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb';
    mockFetch().mockImplementation(urlMock({
      'rpc-a.test.com': () => batchResponse([{ id: 1, result: BAL_42 }, { id: 2, result: BAL_7 }]),
      'rpc-b.test.com': () => batchResponse([{ id: 1, result: BAL_42 }, { id: 2, result: BAL_7 }]),
    }));

    const client = new GuildPassClient({
      apiUrl: BASE_URL,
      contractAddress: CONTRACT,
      contractReadConsensus: { providers: [RPC_A, RPC_B], minProviders: 2 },
    });

    const results = await client.contracts.getMembershipTokenBalancesBatch({
      walletAddresses: [WALLET, W2],
    });

    expect(results).toHaveLength(2);
    expect(results[0]).toEqual({ status: 'success', result: '42' });
    expect(results[1]).toEqual({ status: 'success', result: '7' });
  });

  it('consensus batches allow opt-out via missing rpcUrl (rpcUrl not required when consensus is set)', async () => {
    mockFetch().mockImplementation(urlMock({
      'rpc-a.test.com': () => batchResponse([{ id: 1, result: BAL_42 }]),
      'rpc-b.test.com': () => batchResponse([{ id: 1, result: BAL_42 }]),
    }));

    // No rpcUrl / rpcUrls anywhere — only contractReadConsensus.
    const client = new GuildPassClient({
      apiUrl: BASE_URL,
      contractAddress: CONTRACT,
      contractReadConsensus: { providers: [RPC_A, RPC_B], minProviders: 2 },
    });

    const results = await client.contracts.getMembershipTokenBalancesBatch({
      walletAddresses: [WALLET],
    });

    expect(results[0].status).toBe('success');
    if (results[0].status === 'success') expect(results[0].result).toBe('42');
  });

  it('batchStrategy=multicall3 + contractReadConsensus → rejects with INVALID_CONFIG', async () => {
    const client = new GuildPassClient({
      apiUrl: BASE_URL,
      contractAddress: CONTRACT,
      batchStrategy: 'multicall3',
      contractReadConsensus: { providers: [RPC_A, RPC_B], minProviders: 2 },
    });

    await expect(
      client.contracts.batchEthCall([
        { to: CONTRACT, data: `${BALANCE_OF_SELECTOR}${encodeAddressArgument(WALLET)}` },
      ]),
    ).rejects.toMatchObject({
      code: GuildPassErrorCode.INVALID_CONFIG,
      message: expect.stringContaining('multicall3'),
    });
  });

  it('chunked batch consensus: large input runs per-item quorum on each chunk independently', async () => {
    const wallets = Array.from({ length: 6 }, (_, i) => {
      const hex = (i + 1).toString(16).padStart(40, '0');
      return `0x${hex}`;
    });

    // Smart per-URL mock that mirrors the requested batch size — the SDK
    // sends 2 items per chunk, so each response has 2 results.
    mockFetch().mockImplementation(
      async (url: string, init?: RequestInit) => {
        if (url.includes('rpc-a.test.com') || url.includes('rpc-b.test.com')) {
          const body = JSON.parse(String(init?.body ?? '[]'));
          const items = Array.isArray(body) ? body : [body];
          return batchResponse(
            items.map((req, idx) => ({
              id: (req && typeof req.id === 'number') ? req.id : (idx + 1),
              result: BAL_42,
            })),
          );
        }
        return transientHttp(500) as any;
      },
    );

    const client = new GuildPassClient({
      apiUrl: BASE_URL,
      contractAddress: CONTRACT,
      contractReadConsensus: { providers: [RPC_A, RPC_B], minProviders: 2 },
    });

    const results = await client.contracts.getMembershipTokenBalancesBatch({
      walletAddresses: wallets,
      maxBatchSize: 2,
      chunk: true,
      chunkConcurrency: 1,
    });

    expect(results).toHaveLength(6);
    for (const r of results) expect(r.status).toBe('success');
    // Three sequential consensus ballots (one per chunk of 2 wallets). Two
    // providers per ballot = 3 chunks × 2 = 6 batch fetches total.
    expect(fetch).toHaveBeenCalledTimes(6);
  });
});

// ---------------------------------------------------------------------------
// validateRoleRequirement consensus (issue #307 follow-up): all internal
// eth_calls (supportsInterface, balanceOf, ownerOf, hasRole) route through
// resolveSingleEthCall so consensus applies uniformly.
// ---------------------------------------------------------------------------

describe('validateRoleRequirement consensus routing', () => {
  const TOKEN_CONTRACT = '0x4444444444444444444444444444444444444444';
  const NFT_CONTRACT = '0x5555555555555555555555555555555555555555';
  const ROLE_CONTRACT = '0x6666666666666666666666666666666666666666';

  const hexWord = (hex: string): string => `0x${hex.padStart(64, '0')}`;
  const addressWord = (address: string): string => hexWord(address.slice(2).toLowerCase());
  const boolWord = (value: boolean): string => hexWord(value ? '1' : '0');

  beforeEach(() => {
    vi.stubGlobal('fetch', vi.fn());
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('TOKEN requirement fans out balanceOf across consensus providers', async () => {
    const trueBalance = hexWord((42).toString(16));

    mockFetch().mockImplementation(urlMock({
      'rpc-a.test.com': () => jsonRpcOkForUrl(RPC_A, trueBalance),
      'rpc-b.test.com': () => jsonRpcOkForUrl(RPC_B, trueBalance),
    }));

    const client = new GuildPassClient({
      apiUrl: BASE_URL,
      contractAddress: CONTRACT,
      contractReadConsensus: { providers: [RPC_A, RPC_B], minProviders: 2 },
    });

    await expect(
      client.contracts.validateRoleRequirement({
        walletAddress: WALLET,
        requirement: { type: 'TOKEN', address: TOKEN_CONTRACT, minAmount: '10' },
      }),
    ).resolves.toBe(true);
    // Two providers × one required internal eth_call (balanceOf) = 2 fetches.
    expect(fetch).toHaveBeenCalledTimes(2);
  });

  it('NFT requirement then consensus mismatch on ownerOf → throws CONSENSUS_MISMATCH', async () => {
    mockFetch().mockImplementation(urlMock({
      'rpc-a.test.com': () => jsonRpcOkForUrl(RPC_A, addressWord(WALLET)),
      'rpc-b.test.com': () => jsonRpcOkForUrl(RPC_B, addressWord(WALLET)),
      'rpc-c.test.com': () => jsonRpcOkForUrl(RPC_C, addressWord('0xcccccccccccccccccccccccccccccccccccccccc')),
    }));

    const client = new GuildPassClient({
      apiUrl: BASE_URL,
      contractAddress: CONTRACT,
      contractReadConsensus: { providers: [RPC_A, RPC_B, RPC_C], minProviders: 3 },
    });

    await expect(
      client.contracts.validateRoleRequirement({
        walletAddress: WALLET,
        requirement: { type: 'NFT', address: NFT_CONTRACT, id: '7' },
      }),
    ).rejects.toMatchObject({
      code: GuildPassErrorCode.CONSENSUS_MISMATCH,
    });
  });

  it('ROLE requirement uses consensus on hasRole + consensus on ERC-165 supportsInterface checks', async () => {
    // Two providers agree on ERC-165 + ERC-721/IAC results + hasRole(true).
    const trueResult = jsonRpcOkForUrl(RPC_A, boolWord(true));

    mockFetch().mockImplementation(urlMock({
      'rpc-a.test.com': () => trueResult,
      'rpc-b.test.com': () => {
        // Same answer for every selector from B (used twice for ERC-165 + hasRole).
        return trueResult;
      },
    }));

    const client = new GuildPassClient({
      apiUrl: BASE_URL,
      contractAddress: CONTRACT,
      strictInterfaceChecking: true,
      contractReadConsensus: { providers: [RPC_A, RPC_B], minProviders: 2 },
    });

    await expect(
      client.contracts.validateRoleRequirement({
        walletAddress: WALLET,
        requirement: { type: 'ROLE', address: ROLE_CONTRACT, id: 'ADMIN' },
      }),
    ).resolves.toBe(true);
    // Two providers × two internal eth_calls (supportsInterface ERC-165 +
    // supportsInterface("ERC-165") + supportsInterface("IAccessControl") + hasRole
    // per provider × 2 providers = 6 fetches total.
    expect(fetch).toHaveBeenCalledTimes(6);
  });
});
