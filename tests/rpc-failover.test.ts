/**
 * Comprehensive tests for multi-chain RPC failover (#161).
 *
 * Covers:
 *  - mergeRpcUrls helper
 *  - rpcUrls array on GuildPassClientConfig (top-level)
 *  - rpcUrls array on ChainConfig (per-chain)
 *  - JsonRpcContractProvider failover: transient errors trigger next URL
 *  - Non-transient errors (contract reverts) propagate immediately
 *  - All ContractClient call paths respect failover
 *  - validateConfig validates rpcUrls arrays
 *  - resolveChainConfig propagates rpcUrls
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { GuildPassClient } from '../src/client/GuildPassClient';
import { GuildPassErrorCode } from '../src/errors/errorCodes';
import { mergeRpcUrls, validateConfig, resolveChainConfig } from '../src/config/sdkConfig';
import { JsonRpcContractProvider } from '../src/contracts/providers/jsonRpcProvider';
import { HttpClient } from '../src/http/httpClient';

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const WALLET = '0x1234567890123456789012345678901234567890';
const CONTRACT = '0x0000000000000000000000000000000000000000';
const BASE_URL = 'https://api.test.com';
const PRIMARY_RPC = 'https://rpc1.test.com';
const FALLBACK_RPC = 'https://rpc2.test.com';
const TERTIARY_RPC = 'https://rpc3.test.com';
const OWNER = '0x9999999999999999999999999999999999999999';

const mockFetch = (): ReturnType<typeof vi.fn> =>
  fetch as unknown as ReturnType<typeof vi.fn>;

// JSON-RPC success response helpers
const ethCallResult = (result: string) => ({
  ok: true,
  status: 200,
  headers: new Headers({ 'Content-Type': 'application/json' }),
  json: () => Promise.resolve({ jsonrpc: '2.0', id: 1, result }),
});

const batchResult = (items: Array<{ id: number; result?: string; error?: object }>) => ({
  ok: true,
  status: 200,
  headers: new Headers({ 'Content-Type': 'application/json' }),
  json: () => Promise.resolve(items.map((i) => ({ jsonrpc: '2.0', ...i }))),
});

const transientHttpError = (status: number) => ({
  ok: false,
  status,
  headers: new Headers(),
  json: () => Promise.resolve({ message: `HTTP ${status}` }),
});

const networkError = () => Promise.reject(new TypeError('Failed to fetch'));

const BALANCE_RESULT = '0x000000000000000000000000000000000000000000000000000000000000002a'; // 42
const OWNER_RESULT = `0x000000000000000000000000${OWNER.slice(2)}`;

// ---------------------------------------------------------------------------
// mergeRpcUrls unit tests
// ---------------------------------------------------------------------------

describe('mergeRpcUrls', () => {
  it('returns empty array when neither arg is provided', () => {
    expect(mergeRpcUrls()).toEqual([]);
  });

  it('returns single-element array from rpcUrl alone', () => {
    expect(mergeRpcUrls(PRIMARY_RPC)).toEqual([PRIMARY_RPC]);
  });

  it('returns rpcUrls array when rpcUrl is absent', () => {
    expect(mergeRpcUrls(undefined, [PRIMARY_RPC, FALLBACK_RPC])).toEqual([
      PRIMARY_RPC,
      FALLBACK_RPC,
    ]);
  });

  it('prepends rpcUrl before rpcUrls', () => {
    expect(mergeRpcUrls(PRIMARY_RPC, [FALLBACK_RPC, TERTIARY_RPC])).toEqual([
      PRIMARY_RPC,
      FALLBACK_RPC,
      TERTIARY_RPC,
    ]);
  });

  it('deduplicates when rpcUrl also appears in rpcUrls', () => {
    expect(mergeRpcUrls(PRIMARY_RPC, [PRIMARY_RPC, FALLBACK_RPC])).toEqual([
      PRIMARY_RPC,
      FALLBACK_RPC,
    ]);
  });

  it('deduplicates repeated entries within rpcUrls', () => {
    expect(mergeRpcUrls(undefined, [PRIMARY_RPC, PRIMARY_RPC, FALLBACK_RPC])).toEqual([
      PRIMARY_RPC,
      FALLBACK_RPC,
    ]);
  });

  it('filters out empty/undefined entries', () => {
    expect(mergeRpcUrls('', [PRIMARY_RPC])).toEqual([PRIMARY_RPC]);
    expect(mergeRpcUrls(undefined, ['', FALLBACK_RPC])).toEqual([FALLBACK_RPC]);
  });
});

// ---------------------------------------------------------------------------
// validateConfig — rpcUrls array validation
// ---------------------------------------------------------------------------

describe('validateConfig rpcUrls validation', () => {
  const base = { apiUrl: BASE_URL };

  it('accepts a valid rpcUrls array', () => {
    expect(() =>
      validateConfig({ ...base, rpcUrls: [PRIMARY_RPC, FALLBACK_RPC] }),
    ).not.toThrow();
  });

  it('rejects rpcUrls as a non-array', () => {
    expect(() =>
      validateConfig({ ...base, rpcUrls: 'not-an-array' as any }),
    ).toThrowError(/rpcUrls must be a non-empty array/);
  });

  it('rejects an empty rpcUrls array', () => {
    expect(() =>
      validateConfig({ ...base, rpcUrls: [] }),
    ).toThrowError(/rpcUrls must be a non-empty array/);
  });

  it('rejects rpcUrls containing an invalid URL', () => {
    expect(() =>
      validateConfig({ ...base, rpcUrls: [PRIMARY_RPC, 'not-a-url'] }),
    ).toThrowError(/rpcUrls\[1\]/);
  });

  it('rejects rpcUrls containing a non-http URL', () => {
    expect(() =>
      validateConfig({ ...base, rpcUrls: ['ftp://bad.url'] }),
    ).toThrowError(/rpcUrls\[0\]/);
  });

  it('accepts undefined rpcUrls (optional field)', () => {
    expect(() => validateConfig({ ...base })).not.toThrow();
  });
});

// ---------------------------------------------------------------------------
// validateConfig — per-chain rpcUrls validation
// ---------------------------------------------------------------------------

describe('validateConfig chains[n].rpcUrls validation', () => {
  const base = { apiUrl: BASE_URL };

  it('accepts valid per-chain rpcUrls', () => {
    expect(() =>
      validateConfig({
        ...base,
        chains: { 1: { rpcUrls: [PRIMARY_RPC, FALLBACK_RPC] } },
      }),
    ).not.toThrow();
  });

  it('rejects an empty per-chain rpcUrls array', () => {
    expect(() =>
      validateConfig({ ...base, chains: { 1: { rpcUrls: [] } } }),
    ).toThrow();
  });

  it('rejects an invalid URL inside per-chain rpcUrls', () => {
    expect(() =>
      validateConfig({
        ...base,
        chains: { 1: { rpcUrls: [PRIMARY_RPC, 'not-a-url'] } },
      }),
    ).toThrowError(/chains\[1\]\.rpcUrls\[1\]/);
  });
});

// ---------------------------------------------------------------------------
// resolveChainConfig — rpcUrls propagation
// ---------------------------------------------------------------------------

describe('resolveChainConfig rpcUrls propagation', () => {
  it('passes top-level rpcUrls through when no chains map', () => {
    const cfg = resolveChainConfig(
      { apiUrl: BASE_URL, rpcUrl: PRIMARY_RPC, rpcUrls: [FALLBACK_RPC] },
      1,
    );
    expect(cfg.rpcUrl).toBe(PRIMARY_RPC);
    expect(cfg.rpcUrls).toEqual([FALLBACK_RPC]);
  });

  it('returns per-chain rpcUrls from chains map', () => {
    const cfg = resolveChainConfig(
      {
        apiUrl: BASE_URL,
        chains: {
          8453: { rpcUrl: PRIMARY_RPC, rpcUrls: [FALLBACK_RPC, TERTIARY_RPC] },
        },
      },
      8453,
    );
    expect(cfg.rpcUrl).toBe(PRIMARY_RPC);
    expect(cfg.rpcUrls).toEqual([FALLBACK_RPC, TERTIARY_RPC]);
  });
});

// ---------------------------------------------------------------------------
// resolveChainConfig — override precedence and unresolvable chains (#393)
// ---------------------------------------------------------------------------

describe('resolveChainConfig override precedence (#393)', () => {
  it('lets a chains entry override the top-level value', () => {
    const cfg = resolveChainConfig(
      {
        apiUrl: BASE_URL,
        rpcUrl: FALLBACK_RPC,
        contractAddress: CONTRACT,
        chains: { 8453: { rpcUrl: PRIMARY_RPC } },
      },
      8453,
    );

    expect(cfg.rpcUrl).toBe(PRIMARY_RPC);
  });

  it('inherits unset fields from the top level for a partial entry', () => {
    // The core of the bug: a chains entry that only sets `contractAddress` used to
    // be returned verbatim, silently dropping the top-level `rpcUrl`.
    const cfg = resolveChainConfig(
      {
        apiUrl: BASE_URL,
        rpcUrl: FALLBACK_RPC,
        multicallAddress: OWNER,
        chains: { 8453: { contractAddress: CONTRACT } },
      },
      8453,
    );

    expect(cfg.rpcUrl).toBe(FALLBACK_RPC);
    expect(cfg.contractAddress).toBe(CONTRACT);
    expect(cfg.multicallAddress).toBe(OWNER);
  });

  it('does not let an explicitly undefined entry field clobber the top level', () => {
    // This is why the merge is field-by-field rather than `{ ...topLevel, ...entry }`.
    const cfg = resolveChainConfig(
      {
        apiUrl: BASE_URL,
        rpcUrl: PRIMARY_RPC,
        contractAddress: CONTRACT,
        chains: { 8453: { rpcUrl: undefined } },
      },
      8453,
    );

    expect(cfg.rpcUrl).toBe(PRIMARY_RPC);
  });

  it('returns the top-level config untouched when there is no chains map', () => {
    const cfg = resolveChainConfig(
      { apiUrl: BASE_URL, rpcUrl: PRIMARY_RPC, contractAddress: CONTRACT },
      8453,
    );

    expect(cfg).toEqual({
      rpcUrl: PRIMARY_RPC,
      rpcUrls: undefined,
      contractAddress: CONTRACT,
      multicallAddress: undefined,
    });
  });

  it('resolves a chain whose endpoints come only from rpcUrls', () => {
    // The trap: checking `!merged.rpcUrl` instead of merging would report a false
    // "missing rpcUrl" here, since the singular field is never set.
    const cfg = resolveChainConfig(
      {
        apiUrl: BASE_URL,
        contractAddress: CONTRACT,
        chains: { 8453: { rpcUrls: [PRIMARY_RPC, FALLBACK_RPC] } },
      },
      8453,
    );

    expect(cfg.rpcUrls).toEqual([PRIMARY_RPC, FALLBACK_RPC]);
  });

  it('names the chain and the missing fields when the chainId is not configured', async () => {
    await expect(async () =>
      resolveChainConfig(
        { apiUrl: BASE_URL, chains: { 8453: { rpcUrl: PRIMARY_RPC } } },
        8543,
      ),
    ).rejects.toMatchObject({
      code: GuildPassErrorCode.INVALID_CONFIG,
      message: 'No rpcUrl/contractAddress configured for chainId 8543',
      details: {
        field: 'chainId',
        reason: 'NOT_FOUND',
        value: 8543,
        missing: ['rpcUrl', 'contractAddress'],
      },
    });
  });

  it('reports INCOMPLETE when the entry exists but leaves no usable endpoint', async () => {
    await expect(async () =>
      resolveChainConfig(
        { apiUrl: BASE_URL, chains: { 8453: { contractAddress: CONTRACT } } },
        8453,
      ),
    ).rejects.toMatchObject({
      code: GuildPassErrorCode.INVALID_CONFIG,
      message: 'No rpcUrl configured for chainId 8453',
      details: { field: 'chainId', reason: 'INCOMPLETE', missing: ['rpcUrl'] },
    });
  });

  it('does not throw for a missing contractAddress alone', () => {
    // `contractAddress` has a per-call override and its own downstream errors, so
    // omitting it is a legitimate configuration and must resolve, not throw.
    const cfg = resolveChainConfig(
      { apiUrl: BASE_URL, chains: { 8453: { rpcUrl: PRIMARY_RPC } } },
      8453,
    );

    expect(cfg.rpcUrl).toBe(PRIMARY_RPC);
    expect(cfg.contractAddress).toBeUndefined();
  });
});

// ---------------------------------------------------------------------------
// JsonRpcContractProvider — constructor validation
// ---------------------------------------------------------------------------

describe('JsonRpcContractProvider constructor', () => {
  it('throws INVALID_CONFIG when constructed with an empty array', () => {
    const http = new HttpClient(BASE_URL);
    expect(() => new JsonRpcContractProvider(http, [])).toThrow(/at least one RPC URL/i);
  });

  it('exposes the first URL as .rpcUrl for backwards-compat', () => {
    const http = new HttpClient(BASE_URL);
    const provider = new JsonRpcContractProvider(http, [PRIMARY_RPC, FALLBACK_RPC]);
    expect(provider.rpcUrl).toBe(PRIMARY_RPC);
  });

  it('accepts a single string as a shorthand for a one-element array', () => {
    const http = new HttpClient(BASE_URL);
    const provider = new JsonRpcContractProvider(http, PRIMARY_RPC);
    expect(provider.rpcUrl).toBe(PRIMARY_RPC);
  });
});

// ---------------------------------------------------------------------------
// JsonRpcContractProvider — ethCall failover
// ---------------------------------------------------------------------------

describe('JsonRpcContractProvider ethCall failover', () => {
  beforeEach(() => {
    vi.stubGlobal('fetch', vi.fn());
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('succeeds on the first URL when no error occurs', async () => {
    mockFetch().mockResolvedValueOnce(ethCallResult(BALANCE_RESULT));

    const client = new GuildPassClient({
      apiUrl: BASE_URL,
      rpcUrls: [PRIMARY_RPC, FALLBACK_RPC],
      contractAddress: CONTRACT,
    });
    const balance = await client.contracts.getMembershipTokenBalance({ walletAddress: WALLET });

    expect(balance).toBe('42');
    expect(fetch).toHaveBeenCalledTimes(1);
    expect(fetch).toHaveBeenCalledWith(
      expect.stringMatching(/rpc1\.test\.com/),
      expect.any(Object),
    );
  });

  it('falls back to second URL on 5xx from first', async () => {
    mockFetch()
      .mockResolvedValueOnce(transientHttpError(503))
      .mockResolvedValueOnce(ethCallResult(BALANCE_RESULT));

    const client = new GuildPassClient({
      apiUrl: BASE_URL,
      rpcUrls: [PRIMARY_RPC, FALLBACK_RPC],
      contractAddress: CONTRACT,
    });
    const balance = await client.contracts.getMembershipTokenBalance({ walletAddress: WALLET });

    expect(balance).toBe('42');
    expect(fetch).toHaveBeenCalledTimes(2);
    expect(fetch).toHaveBeenNthCalledWith(
      1,
      expect.stringMatching(/rpc1\.test\.com/),
      expect.any(Object),
    );
    expect(fetch).toHaveBeenNthCalledWith(
      2,
      expect.stringMatching(/rpc2\.test\.com/),
      expect.any(Object),
    );
  });

  it('falls back to second URL on 429 (rate-limit) from first', async () => {
    mockFetch()
      .mockResolvedValueOnce(transientHttpError(429))
      .mockResolvedValueOnce(ethCallResult(BALANCE_RESULT));

    const client = new GuildPassClient({
      apiUrl: BASE_URL,
      rpcUrls: [PRIMARY_RPC, FALLBACK_RPC],
      contractAddress: CONTRACT,
    });
    const balance = await client.contracts.getMembershipTokenBalance({ walletAddress: WALLET });

    expect(balance).toBe('42');
    expect(fetch).toHaveBeenCalledTimes(2);
  });

  it('falls back to second URL on network error from first', async () => {
    mockFetch()
      .mockImplementationOnce(() => networkError())
      .mockResolvedValueOnce(ethCallResult(BALANCE_RESULT));

    const client = new GuildPassClient({
      apiUrl: BASE_URL,
      rpcUrls: [PRIMARY_RPC, FALLBACK_RPC],
      contractAddress: CONTRACT,
    });
    const balance = await client.contracts.getMembershipTokenBalance({ walletAddress: WALLET });

    expect(balance).toBe('42');
    expect(fetch).toHaveBeenCalledTimes(2);
  });

  it('tries all URLs before giving up when all fail transiently', async () => {
    mockFetch()
      .mockResolvedValueOnce(transientHttpError(503))
      .mockResolvedValueOnce(transientHttpError(503))
      .mockResolvedValueOnce(transientHttpError(503));

    const client = new GuildPassClient({
      apiUrl: BASE_URL,
      rpcUrls: [PRIMARY_RPC, FALLBACK_RPC, TERTIARY_RPC],
      contractAddress: CONTRACT,
    });

    await expect(
      client.contracts.getMembershipTokenBalance({ walletAddress: WALLET }),
    ).rejects.toMatchObject({ code: GuildPassErrorCode.SERVER_ERROR });

    expect(fetch).toHaveBeenCalledTimes(3);
  });

  it('falls back for eth_blockNumber used by confirmations option', async () => {
    mockFetch()
      .mockResolvedValueOnce(transientHttpError(503))
      .mockResolvedValueOnce(ethCallResult('0x100'))
      .mockResolvedValueOnce(ethCallResult(BALANCE_RESULT));

    const client = new GuildPassClient({
      apiUrl: BASE_URL,
      rpcUrls: [PRIMARY_RPC, FALLBACK_RPC],
      contractAddress: CONTRACT,
    });

    const balance = await client.contracts.getMembershipTokenBalance(
      { walletAddress: WALLET },
      { confirmations: 6 },
    );

    expect(balance).toBe('42');
    expect(fetch).toHaveBeenCalledTimes(3);
    expect(fetch).toHaveBeenNthCalledWith(1, expect.stringMatching(/rpc1\.test\.com/), expect.any(Object));
    expect(fetch).toHaveBeenNthCalledWith(2, expect.stringMatching(/rpc2\.test\.com/), expect.any(Object));
    // eth_call starts from primary URL (independent failover loop)
    expect(fetch).toHaveBeenNthCalledWith(3, expect.stringMatching(/rpc1\.test\.com/), expect.any(Object));
  });

  it('does NOT fall back on a contract-level error (execution reverted)', async () => {
    mockFetch().mockResolvedValueOnce({
      ok: true,
      status: 200,
      headers: new Headers({ 'Content-Type': 'application/json' }),
      json: () =>
        Promise.resolve({ error: { code: -32000, message: 'execution reverted' } }),
    });

    const client = new GuildPassClient({
      apiUrl: BASE_URL,
      rpcUrls: [PRIMARY_RPC, FALLBACK_RPC],
      contractAddress: CONTRACT,
    });

    await expect(
      client.contracts.getMembershipTokenBalance({ walletAddress: WALLET }),
    ).rejects.toMatchObject({
      code: GuildPassErrorCode.HTTP_ERROR,
      message: 'execution reverted',
    });

    // Only called once — no failover for contract reverts
    expect(fetch).toHaveBeenCalledTimes(1);
  });

  it('uses rpcUrl (singular) as primary when rpcUrls also provided', async () => {
    mockFetch()
      .mockResolvedValueOnce(transientHttpError(502))
      .mockResolvedValueOnce(ethCallResult(BALANCE_RESULT));

    const client = new GuildPassClient({
      apiUrl: BASE_URL,
      rpcUrl: PRIMARY_RPC,
      rpcUrls: [FALLBACK_RPC],
      contractAddress: CONTRACT,
    });
    await client.contracts.getMembershipTokenBalance({ walletAddress: WALLET });

    expect(fetch).toHaveBeenNthCalledWith(
      1,
      expect.stringMatching(/rpc1\.test\.com/),
      expect.any(Object),
    );
    expect(fetch).toHaveBeenNthCalledWith(
      2,
      expect.stringMatching(/rpc2\.test\.com/),
      expect.any(Object),
    );
  });

  it('works with per-chain rpcUrls via chains config', async () => {
    mockFetch()
      .mockResolvedValueOnce(transientHttpError(500))
      .mockResolvedValueOnce(ethCallResult(OWNER_RESULT));

    const client = new GuildPassClient({
      apiUrl: BASE_URL,
      chains: {
        8453: {
          rpcUrls: [PRIMARY_RPC, FALLBACK_RPC],
          contractAddress: CONTRACT,
        },
      },
    });

    const owner = await client.contracts.getGuildOwner({
      guildId: 'guild_1',
      chainId: 8453,
    });

    expect(owner).toBe(OWNER);
    expect(fetch).toHaveBeenCalledTimes(2);
    expect(fetch).toHaveBeenNthCalledWith(
      2,
      expect.stringMatching(/rpc2\.test\.com/),
      expect.any(Object),
    );
  });

  it('succeeds on third URL when first two fail transiently', async () => {
    mockFetch()
      .mockResolvedValueOnce(transientHttpError(503))
      .mockResolvedValueOnce(transientHttpError(503))
      .mockResolvedValueOnce(ethCallResult(BALANCE_RESULT));

    const client = new GuildPassClient({
      apiUrl: BASE_URL,
      rpcUrls: [PRIMARY_RPC, FALLBACK_RPC, TERTIARY_RPC],
      contractAddress: CONTRACT,
    });

    const balance = await client.contracts.getMembershipTokenBalance({ walletAddress: WALLET });
    expect(balance).toBe('42');
    expect(fetch).toHaveBeenCalledTimes(3);
    expect(fetch).toHaveBeenNthCalledWith(
      3,
      expect.stringMatching(/rpc3\.test\.com/),
      expect.any(Object),
    );
  });
});

// ---------------------------------------------------------------------------
// JsonRpcContractProvider — batchEthCall failover
// ---------------------------------------------------------------------------

describe('JsonRpcContractProvider batchEthCall failover', () => {
  beforeEach(() => {
    vi.stubGlobal('fetch', vi.fn());
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('falls back to second URL on 5xx batch response', async () => {
    mockFetch()
      .mockResolvedValueOnce(transientHttpError(503))
      .mockResolvedValueOnce(
        batchResult([{ id: 1, result: BALANCE_RESULT }]),
      );

    const client = new GuildPassClient({
      apiUrl: BASE_URL,
      rpcUrls: [PRIMARY_RPC, FALLBACK_RPC],
      contractAddress: CONTRACT,
    });

    const results = await client.contracts.getMembershipTokenBalancesBatch({
      walletAddresses: [WALLET],
    });

    expect(results).toHaveLength(1);
    expect(results[0]).toMatchObject({ status: 'success', result: '42' });
    expect(fetch).toHaveBeenCalledTimes(2);
    expect(fetch).toHaveBeenNthCalledWith(
      2,
      expect.stringMatching(/rpc2\.test\.com/),
      expect.any(Object),
    );
  });

  it('falls back to second URL on network error in batch', async () => {
    mockFetch()
      .mockImplementationOnce(() => networkError())
      .mockResolvedValueOnce(
        batchResult([{ id: 1, result: OWNER_RESULT }]),
      );

    const client = new GuildPassClient({
      apiUrl: BASE_URL,
      rpcUrls: [PRIMARY_RPC, FALLBACK_RPC],
      contractAddress: CONTRACT,
    });

    const results = await client.contracts.getGuildOwnersBatch({
      guildIds: ['guild_1'],
    });

    expect(results[0]).toMatchObject({ status: 'success', result: OWNER });
    expect(fetch).toHaveBeenCalledTimes(2);
  });

  it('does not fall back on INVALID_RESPONSE (non-array batch response)', async () => {
    mockFetch()
      .mockResolvedValueOnce({
        ok: true,
        status: 200,
        headers: new Headers({ 'Content-Type': 'application/json' }),
        json: () => Promise.resolve({ result: 'single' }),
      })
      .mockResolvedValueOnce(batchResult([{ id: 1, result: BALANCE_RESULT }]));

    const client = new GuildPassClient({
      apiUrl: BASE_URL,
      rpcUrls: [PRIMARY_RPC, FALLBACK_RPC],
      contractAddress: CONTRACT,
    });

    await expect(
      client.contracts.getMembershipTokenBalancesBatch({ walletAddresses: [WALLET] }),
    ).rejects.toMatchObject({ code: GuildPassErrorCode.INVALID_RESPONSE });

    // Should not have attempted the second URL
    expect(fetch).toHaveBeenCalledTimes(1);
  });
});

// ---------------------------------------------------------------------------
// ContractClient.getGuildOwner — failover end-to-end
// ---------------------------------------------------------------------------

describe('ContractClient.getGuildOwner rpcUrls failover', () => {
  beforeEach(() => {
    vi.stubGlobal('fetch', vi.fn());
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('resolves guild owner via fallback URL after 5xx on primary', async () => {
    mockFetch()
      .mockResolvedValueOnce(transientHttpError(502))
      .mockResolvedValueOnce(ethCallResult(OWNER_RESULT));

    const client = new GuildPassClient({
      apiUrl: BASE_URL,
      rpcUrls: [PRIMARY_RPC, FALLBACK_RPC],
      contractAddress: CONTRACT,
    });

    const owner = await client.contracts.getGuildOwner({ guildId: 'guild_1' });
    expect(owner).toBe(OWNER);
    expect(fetch).toHaveBeenCalledTimes(2);
  });

  it('surfaces error when all URLs fail transiently for getGuildOwner', async () => {
    mockFetch()
      .mockResolvedValueOnce(transientHttpError(503))
      .mockResolvedValueOnce(transientHttpError(503));

    const client = new GuildPassClient({
      apiUrl: BASE_URL,
      rpcUrls: [PRIMARY_RPC, FALLBACK_RPC],
      contractAddress: CONTRACT,
    });

    await expect(
      client.contracts.getGuildOwner({ guildId: 'guild_1' }),
    ).rejects.toMatchObject({ code: GuildPassErrorCode.SERVER_ERROR });

    expect(fetch).toHaveBeenCalledTimes(2);
  });
});

// ---------------------------------------------------------------------------
// ContractClient.validateRoleRequirement — failover end-to-end
// ---------------------------------------------------------------------------

describe('ContractClient.validateRoleRequirement rpcUrls failover', () => {
  const TOKEN_CONTRACT = '0x4444444444444444444444444444444444444444';

  beforeEach(() => {
    vi.stubGlobal('fetch', vi.fn());
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('falls back to second URL for TOKEN check on transient error', async () => {
    const trueResult = `0x${'0'.repeat(63)}1`; // uint256 1

    mockFetch()
      .mockResolvedValueOnce(transientHttpError(503))
      .mockResolvedValueOnce(ethCallResult(trueResult));

    const client = new GuildPassClient({
      apiUrl: BASE_URL,
      rpcUrls: [PRIMARY_RPC, FALLBACK_RPC],
    });

    const result = await client.contracts.validateRoleRequirement({
      walletAddress: WALLET,
      requirement: { type: 'TOKEN', address: TOKEN_CONTRACT, minAmount: '1' },
    });

    expect(result).toBe(true);
    expect(fetch).toHaveBeenCalledTimes(2);
  });
});

// ---------------------------------------------------------------------------
// onRpcFailover hook — observability
// ---------------------------------------------------------------------------

describe('onRpcFailover hook', () => {
  beforeEach(() => {
    vi.stubGlobal('fetch', vi.fn());
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('fires onRpcFailover when provider fails over from primary to fallback', async () => {
    const onRpcFailover = vi.fn();

    mockFetch()
      .mockResolvedValueOnce(transientHttpError(503))
      .mockResolvedValueOnce(ethCallResult(BALANCE_RESULT));

    const client = new GuildPassClient({
      apiUrl: BASE_URL,
      rpcUrls: [PRIMARY_RPC, FALLBACK_RPC],
      contractAddress: CONTRACT,
      hooks: { onRpcFailover },
    });

    await client.contracts.getMembershipTokenBalance({ walletAddress: WALLET });

    expect(onRpcFailover).toHaveBeenCalledTimes(1);
    expect(onRpcFailover).toHaveBeenCalledWith(
      expect.objectContaining({
        failedUrl: expect.stringContaining('rpc1'),
        nextUrl: expect.stringContaining('rpc2'),
        error: expect.any(Error),
      }),
    );
  });

  it('fires onRpcFailover for each hop when multiple URLs fail', async () => {
    const onRpcFailover = vi.fn();

    mockFetch()
      .mockResolvedValueOnce(transientHttpError(503))
      .mockResolvedValueOnce(transientHttpError(502))
      .mockResolvedValueOnce(ethCallResult(BALANCE_RESULT));

    const client = new GuildPassClient({
      apiUrl: BASE_URL,
      rpcUrls: [PRIMARY_RPC, FALLBACK_RPC, TERTIARY_RPC],
      contractAddress: CONTRACT,
      hooks: { onRpcFailover },
    });

    await client.contracts.getMembershipTokenBalance({ walletAddress: WALLET });

    // Two failovers: rpc1→rpc2 and rpc2→rpc3
    expect(onRpcFailover).toHaveBeenCalledTimes(2);
    expect(onRpcFailover).toHaveBeenNthCalledWith(
      1,
      expect.objectContaining({
        failedUrl: expect.stringContaining('rpc1'),
        nextUrl: expect.stringContaining('rpc2'),
      }),
    );
    expect(onRpcFailover).toHaveBeenNthCalledWith(
      2,
      expect.objectContaining({
        failedUrl: expect.stringContaining('rpc2'),
        nextUrl: expect.stringContaining('rpc3'),
      }),
    );
  });

  it('does NOT fire onRpcFailover when all URLs are exhausted (last one fails)', async () => {
    const onRpcFailover = vi.fn();

    mockFetch()
      .mockResolvedValueOnce(transientHttpError(503))
      .mockResolvedValueOnce(transientHttpError(503));

    const client = new GuildPassClient({
      apiUrl: BASE_URL,
      rpcUrls: [PRIMARY_RPC, FALLBACK_RPC],
      contractAddress: CONTRACT,
      hooks: { onRpcFailover },
    });

    await expect(
      client.contracts.getMembershipTokenBalance({ walletAddress: WALLET }),
    ).rejects.toMatchObject({ code: GuildPassErrorCode.SERVER_ERROR });

    // Only one failover: rpc1→rpc2 (the hook fires before trying rpc2).
    // When rpc2 also fails, there's no next URL, so no second hook call.
    expect(onRpcFailover).toHaveBeenCalledTimes(1);
  });

  it('does NOT fire onRpcFailover for contract-level errors (non-transient)', async () => {
    const onRpcFailover = vi.fn();

    mockFetch().mockResolvedValueOnce({
      ok: true,
      status: 200,
      headers: new Headers({ 'Content-Type': 'application/json' }),
      json: () =>
        Promise.resolve({ error: { code: -32000, message: 'execution reverted' } }),
    });

    const client = new GuildPassClient({
      apiUrl: BASE_URL,
      rpcUrls: [PRIMARY_RPC, FALLBACK_RPC],
      contractAddress: CONTRACT,
      hooks: { onRpcFailover },
    });

    await expect(
      client.contracts.getMembershipTokenBalance({ walletAddress: WALLET }),
    ).rejects.toMatchObject({ code: GuildPassErrorCode.HTTP_ERROR });

    expect(onRpcFailover).not.toHaveBeenCalled();
  });

  it('includes chainId in the hook payload when available', async () => {
    const onRpcFailover = vi.fn();

    mockFetch()
      .mockResolvedValueOnce(transientHttpError(503))
      .mockResolvedValueOnce(ethCallResult(BALANCE_RESULT));

    const client = new GuildPassClient({
      apiUrl: BASE_URL,
      rpcUrls: [PRIMARY_RPC, FALLBACK_RPC],
      contractAddress: CONTRACT,
      hooks: { onRpcFailover },
    });

    await client.contracts.getMembershipTokenBalance({
      walletAddress: WALLET,
      chainId: 8453,
    });

    expect(onRpcFailover).toHaveBeenCalledWith(
      expect.objectContaining({ chainId: 8453 }),
    );
  });

  it('survives a throwing hook without affecting the failover flow', async () => {
    const onRpcFailover = vi.fn(() => {
      throw new Error('hook explosion');
    });

    mockFetch()
      .mockResolvedValueOnce(transientHttpError(503))
      .mockResolvedValueOnce(ethCallResult(BALANCE_RESULT));

    const client = new GuildPassClient({
      apiUrl: BASE_URL,
      rpcUrls: [PRIMARY_RPC, FALLBACK_RPC],
      contractAddress: CONTRACT,
      hooks: { onRpcFailover },
    });

    const balance = await client.contracts.getMembershipTokenBalance({ walletAddress: WALLET });
    expect(balance).toBe('42');
    expect(onRpcFailover).toHaveBeenCalledTimes(1);
  });

  it('survives an async hook that rejects without affecting failover', async () => {
    const onRpcFailover = vi.fn(() => {
      return Promise.reject(new Error('async hook explosion'));
    });

    mockFetch()
      .mockResolvedValueOnce(transientHttpError(503))
      .mockResolvedValueOnce(ethCallResult(BALANCE_RESULT));

    const client = new GuildPassClient({
      apiUrl: BASE_URL,
      rpcUrls: [PRIMARY_RPC, FALLBACK_RPC],
      contractAddress: CONTRACT,
      hooks: { onRpcFailover },
    });

    const balance = await client.contracts.getMembershipTokenBalance({ walletAddress: WALLET });
    expect(balance).toBe('42');
    expect(onRpcFailover).toHaveBeenCalledTimes(1);
  });

  it('fires onRpcFailover for batchEthCall failovers', async () => {
    const onRpcFailover = vi.fn();

    mockFetch()
      .mockResolvedValueOnce(transientHttpError(503))
      .mockResolvedValueOnce(
        batchResult([{ id: 1, result: BALANCE_RESULT }]),
      );

    const client = new GuildPassClient({
      apiUrl: BASE_URL,
      rpcUrls: [PRIMARY_RPC, FALLBACK_RPC],
      contractAddress: CONTRACT,
      hooks: { onRpcFailover },
    });

    await client.contracts.getMembershipTokenBalancesBatch({
      walletAddresses: [WALLET],
    });

    expect(onRpcFailover).toHaveBeenCalledTimes(1);
    expect(onRpcFailover).toHaveBeenCalledWith(
      expect.objectContaining({
        nextUrl: expect.stringContaining('rpc2'),
      }),
    );
  });
});

// ---------------------------------------------------------------------------
// GuildPassClient config — rpcUrls exposed on getChainConfig
// ---------------------------------------------------------------------------

describe('GuildPassClient getChainConfig with rpcUrls', () => {
  it('exposes rpcUrls from top-level config in getChainConfig', () => {
    const client = new GuildPassClient({
      apiUrl: BASE_URL,
      rpcUrl: PRIMARY_RPC,
      rpcUrls: [FALLBACK_RPC],
      contractAddress: CONTRACT,
    });

    const cfg = client.contracts.getChainConfig();
    expect(cfg.rpcUrl).toBe(PRIMARY_RPC);
    expect(cfg.rpcUrls).toEqual([FALLBACK_RPC]);
  });

  it('exposes rpcUrls from per-chain chains config in getChainConfig', () => {
    const client = new GuildPassClient({
      apiUrl: BASE_URL,
      chains: {
        1: {
          rpcUrls: [PRIMARY_RPC, FALLBACK_RPC],
          contractAddress: CONTRACT,
        },
      },
    });

    const cfg = client.contracts.getChainConfig(1);
    expect(cfg.rpcUrls).toEqual([PRIMARY_RPC, FALLBACK_RPC]);
  });
});
