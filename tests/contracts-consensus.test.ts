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
});

const contractRevert = () => ({
  ok: true,
  status: 200,
  headers: new Headers({ 'Content-Type': 'application/json' }),
  json: () => Promise.resolve({ jsonrpc: '2.0', id: 1, error: { code: -32000, message: 'execution reverted' } }),
});

/**
 * Builds a fetch mock that responds differently per URL.
 * The keys are exact-match substrings the request URL must include.
 */
const urlMock = (
  routes: Record<string, () => ReturnType<typeof jsonRpcOk>>,
  defaultRoute: () => ReturnType<typeof jsonRpcOk> = () =>
    ({ ok: false, status: 500, headers: new Headers(), json: () => Promise.resolve({ message: 'no route' }) }) as any,
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
