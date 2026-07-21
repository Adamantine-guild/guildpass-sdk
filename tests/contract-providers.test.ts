// GuildPass SDK: Pull in package or module bindings.
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
// GuildPass SDK: Import external module dependencies.
import { GuildPassClient } from '../src/client/GuildPassClient';
import { GuildPassErrorCode } from '../src/errors/errorCodes';
import { BlockTag } from '../src/types/common';
import {
  BALANCE_OF_SELECTOR,
  GET_GUILD_OWNER_SELECTOR,
  encodeAddressArgument,
  encodeGuildId,
} from '../src/contracts/contractClient';
import { BatchEthCallItem, BatchItemResult } from '../src/contracts/contract.types';
import { ContractProvider, EthCallRequest } from '../src/contracts/providers/provider.types';
import { viemContractProvider } from '../src/adapters/viem';
import { ethersContractProvider } from '../src/adapters/ethers';

const WALLET = '0x1234567890123456789012345678901234567890';
const CONTRACT = '0x0000000000000000000000000000000000000000';
const BASE_URL = 'https://api.test.com';
const RPC_URL = 'https://rpc.test.com';
const OWNER = '0x9999999999999999999999999999999999999999';

const OWNER_RESULT = `0x${'0'.repeat(24)}${OWNER.slice(2)}`;
const BALANCE_RESULT = `0x${'0'.repeat(63)}5`; // uint256 5

const mockFetch = (): ReturnType<typeof vi.fn> => fetch as unknown as ReturnType<typeof vi.fn>;

const rpcResponse = (result: unknown) => ({
  ok: true,
  status: 200,
  headers: new Headers({ 'content-type': 'application/json' }),
  json: async () => ({ jsonrpc: '2.0', id: 1, result }),
  text: async () => JSON.stringify({ jsonrpc: '2.0', id: 1, result }),
});

beforeEach(() => {
  vi.stubGlobal('fetch', vi.fn());
});

describe('ContractProvider abstraction', () => {
  it('uses a configured contractProvider instead of rpcUrl for single calls', async () => {
    const ethCall = vi.fn().mockResolvedValue(BALANCE_RESULT);
    const provider: ContractProvider = { ethCall, batchEthCall: vi.fn() };

    // No rpcUrl configured at all: the provider takes over completely.
    const client = new GuildPassClient({
      apiUrl: BASE_URL,
      contractAddress: CONTRACT,
      contractProvider: provider,
    });

    const balance = await client.contracts.getMembershipTokenBalance({ walletAddress: WALLET });

    expect(balance).toBe('5');
    expect(ethCall).toHaveBeenCalledWith(
      { to: CONTRACT, data: `${BALANCE_OF_SELECTOR}${encodeAddressArgument(WALLET)}` },
      undefined,
    );
    expect(mockFetch()).not.toHaveBeenCalled();
  });

  it('takes precedence over rpcUrl when both are configured', async () => {
    const ethCall = vi.fn().mockResolvedValue(OWNER_RESULT);
    const client = new GuildPassClient({
      apiUrl: BASE_URL,
      rpcUrl: RPC_URL,
      contractAddress: CONTRACT,
      contractProvider: { ethCall, batchEthCall: vi.fn() },
    });

    const owner = await client.contracts.getGuildOwner({ guildId: 'guild_1' });

    expect(owner).toBe(OWNER);
    expect(ethCall).toHaveBeenCalledOnce();
    expect(mockFetch()).not.toHaveBeenCalled();
  });

  it('uses the configured contractProvider for batch calls', async () => {
    const batchEthCall = vi
      .fn()
      .mockResolvedValue([{ status: 'success', result: BALANCE_RESULT }]);
    const client = new GuildPassClient({
      apiUrl: BASE_URL,
      contractAddress: CONTRACT,
      contractProvider: { ethCall: vi.fn(), batchEthCall },
    });

    const results = await client.contracts.getMembershipTokenBalancesBatch({
      walletAddresses: [WALLET],
    });

    expect(results).toEqual([{ status: 'success', result: '5' }]);
    expect(batchEthCall).toHaveBeenCalledWith(
      [{ to: CONTRACT, data: `${BALANCE_OF_SELECTOR}${encodeAddressArgument(WALLET)}` }],
      expect.anything(),
    );
  });

  it('still requires rpcUrl when no contractProvider is configured', async () => {
    const client = new GuildPassClient({ apiUrl: BASE_URL, contractAddress: CONTRACT });

    await expect(
      client.contracts.getMembershipTokenBalance({ walletAddress: WALLET }),
    ).rejects.toMatchObject({
      code: GuildPassErrorCode.INVALID_CONFIG,
      message: 'rpcUrl is required for contract calls',
    });
  });

  it('rejects a malformed contractProvider at construction', () => {
    expect(
      () =>
        new GuildPassClient({
          apiUrl: BASE_URL,
          contractProvider: { ethCall: () => Promise.resolve('0x') } as any,
        }),
    ).toThrowError(/contractProvider must implement batchEthCall/);
  });

  it('surfaces INVALID_RESPONSE for undecodable provider results, matching the raw path', async () => {
    const client = new GuildPassClient({
      apiUrl: BASE_URL,
      contractAddress: CONTRACT,
      contractProvider: { ethCall: vi.fn().mockResolvedValue('0xzz'), batchEthCall: vi.fn() },
    });

    await expect(
      client.contracts.getMembershipTokenBalance({ walletAddress: WALLET }),
    ).rejects.toMatchObject({ code: GuildPassErrorCode.INVALID_RESPONSE });
  });
});

// Shared parity suite: every provider path must behave identically for the
// same logical failure/success modes.
type ProviderCase = {
  name: string;
  /** Build a client whose provider resolves calls via `impl`. */
  makeClient: (impl: (req: EthCallRequest) => Promise<string>) => GuildPassClient;
};

const makeRawClient = (impl: (req: EthCallRequest) => Promise<string>): GuildPassClient => {
  mockFetch().mockImplementation(async (_url: string, init: RequestInit) => {
    const body = JSON.parse(String(init.body));
    const { to, data } = body.params[0];
    try {
      return rpcResponse(await impl({ to, data }));
    } catch (err: any) {
      return {
        ok: true,
        status: 200,
        headers: new Headers({ 'content-type': 'application/json' }),
        json: async () => ({ jsonrpc: '2.0', id: 1, error: { code: -32000, message: err.message } }),
        text: async () => '',
      };
    }
  });
  return new GuildPassClient({ apiUrl: BASE_URL, rpcUrl: RPC_URL, contractAddress: CONTRACT });
};

const PROVIDER_CASES: ProviderCase[] = [
  { name: 'default raw JSON-RPC provider', makeClient: makeRawClient },
  {
    name: 'viem adapter',
    makeClient: (impl) =>
      new GuildPassClient({
        apiUrl: BASE_URL,
        contractAddress: CONTRACT,
        contractProvider: viemContractProvider({
          call: async (args) => ({ data: await impl(args) }),
        }),
      }),
  },
  {
    name: 'ethers adapter',
    makeClient: (impl) =>
      new GuildPassClient({
        apiUrl: BASE_URL,
        contractAddress: CONTRACT,
        contractProvider: ethersContractProvider({
          call: (tx) => impl(tx),
        }),
      }),
  },
];

describe.each(PROVIDER_CASES)('behavioral parity: $name', ({ makeClient }) => {
  it('resolves token balances identically', async () => {
    const client = makeClient(async ({ data }) => {
      expect(data).toBe(`${BALANCE_OF_SELECTOR}${encodeAddressArgument(WALLET)}`);
      return BALANCE_RESULT;
    });

    await expect(
      client.contracts.getMembershipTokenBalance({ walletAddress: WALLET }),
    ).resolves.toBe('5');
  });

  it('resolves guild owners identically', async () => {
    const client = makeClient(async ({ data }) => {
      expect(data).toBe(`${GET_GUILD_OWNER_SELECTOR}${encodeGuildId('guild_1')}`);
      return OWNER_RESULT;
    });

    await expect(client.contracts.getGuildOwner({ guildId: 'guild_1' })).resolves.toBe(OWNER);
  });

  it('maps provider-level failures to HTTP_ERROR with the provider message', async () => {
    const client = makeClient(async () => {
      throw new Error('execution reverted');
    });

    await expect(
      client.contracts.getMembershipTokenBalance({ walletAddress: WALLET }),
    ).rejects.toMatchObject({
      code: GuildPassErrorCode.HTTP_ERROR,
      message: 'execution reverted',
    });
  });

  it('rejects invalid wallet addresses before any provider call', async () => {
    const impl = vi.fn();
    const client = makeClient(impl);

    await expect(
      client.contracts.getMembershipTokenBalance({ walletAddress: 'not-an-address' }),
    ).rejects.toMatchObject({ code: GuildPassErrorCode.INVALID_ADDRESS });
    expect(impl).not.toHaveBeenCalled();
  });
});

describe('adapter batch semantics', () => {
  it.each([
    ['viem', (impl: (req: EthCallRequest) => Promise<string>) =>
      viemContractProvider({ call: async (args) => ({ data: await impl(args) }) })],
    ['ethers', (impl: (req: EthCallRequest) => Promise<string>) =>
      ethersContractProvider({ call: (tx) => impl(tx) })],
  ])('%s adapter isolates per-item failures like the raw batch path', async (_name, make) => {
    const provider = make(async ({ data }) => {
      if (data.startsWith(GET_GUILD_OWNER_SELECTOR)) throw new Error('boom');
      return BALANCE_RESULT;
    });

    const results = await provider.batchEthCall([
      { to: CONTRACT, data: `${BALANCE_OF_SELECTOR}${encodeAddressArgument(WALLET)}` },
      { to: CONTRACT, data: `${GET_GUILD_OWNER_SELECTOR}${encodeGuildId('guild_1')}` },
    ]);

    expect(results).toEqual([
      { status: 'success', result: BALANCE_RESULT },
      { status: 'error', error: 'boom' },
    ]);
  });

  it('viem adapter maps empty call data to 0x like raw JSON-RPC', async () => {
    const provider = viemContractProvider({ call: async () => ({}) });
    await expect(provider.ethCall({ to: CONTRACT, data: '0x' })).resolves.toBe('0x');
  });

  it('adapters reject inputs without a call() method', () => {
    expect(() => viemContractProvider({} as any)).toThrowError(/call\(\)/);
    expect(() => ethersContractProvider(null as any)).toThrowError(/call\(\)/);
  });
});

// ---------------------------------------------------------------------------
// Chunk concurrency tests
// ---------------------------------------------------------------------------

describe('chunk concurrency', () => {
  // Helper: create a batchEthCall mock that resolves each chunk after a
  // configurable delay so we can observe interleaving.
  const makeDelayedBatch = (delaysMs: number[]) => {
    let callIdx = 0;
    return vi.fn().mockImplementation((calls: BatchEthCallItem[]) => {
      const delay = delaysMs[callIdx] ?? delaysMs[delaysMs.length - 1] ?? 0;
      callIdx++;
      return new Promise<BatchItemResult[]>((resolve) =>
        setTimeout(
          () =>
            resolve(
              calls.map(() => ({ status: 'success' as const, result: BALANCE_RESULT })),
            ),
          delay,
        ),
      );
    });
  };

  // Helper: build a client with a contractProvider whose batchEthCall is
  // controlled by the test.
  const makeClient = (batchEthCall: ReturnType<typeof vi.fn>) =>
    new GuildPassClient({
      apiUrl: BASE_URL,
      contractAddress: CONTRACT,
      contractProvider: { ethCall: vi.fn(), batchEthCall },
    });

  // Helper: produce N distinct wallet addresses for batch input.
  const wallets = (n: number) =>
    Array.from({ length: n }, (_, i) => {
      const hex = (i + 1).toString(16).padStart(40, '0');
      return `0x${hex}`;
    });

  it('preserves result ordering with concurrent chunks (randomized latency)', async () => {
    // 10 wallets, maxBatchSize=2 → 5 chunks.
    // Assign each chunk a different delay so chunks finish out of order.
    const delays = [50, 10, 30, 5, 20]; // ms
    const batchMock = makeDelayedBatch(delays);
    const client = makeClient(batchMock);

    const results = await client.contracts.getMembershipTokenBalancesBatch({
      walletAddresses: wallets(10),
      maxBatchSize: 2,
      chunk: true,
      chunkConcurrency: 5, // all chunks run concurrently
    });

    // All 10 items must succeed
    expect(results).toHaveLength(10);
    for (const r of results) {
      expect(r.status).toBe('success');
    }

    // The mock was called 5 times (once per chunk)
    expect(batchMock).toHaveBeenCalledTimes(5);

    // Verify per-chunk call arguments: each chunk must have exactly 2 items
    // with correct contract address and encoded wallet data.
    for (let i = 0; i < 5; i++) {
      const callArgs = batchMock.mock.calls[i][0] as BatchEthCallItem[];
      expect(callArgs).toHaveLength(2);
      for (const item of callArgs) {
        expect(item.to).toBe(CONTRACT);
        expect(item.data).toMatch(/^0x/);
      }
    }
  });

  it('default (no chunkConcurrency) is sequential', async () => {
    // Track execution order via a shared array.
    const order: number[] = [];
    const batchMock = vi.fn().mockImplementation(async (_calls: BatchEthCallItem[]) => {
      const chunkNum = batchMock.mock.calls.length; // 1-based
      // Simulate some async work
      await new Promise((r) => setTimeout(r, 5));
      order.push(chunkNum);
      return _calls.map(() => ({ status: 'success' as const, result: BALANCE_RESULT }));
    });

    const client = makeClient(batchMock);

    await client.contracts.getMembershipTokenBalancesBatch({
      walletAddresses: wallets(6),
      maxBatchSize: 2,
      chunk: true,
      // chunkConcurrency omitted → default 1 (sequential)
    });

    // With sequential execution, chunks finish in order 1,2,3
    expect(order).toEqual([1, 2, 3]);
    expect(batchMock).toHaveBeenCalledTimes(3);
  });

  it('explicit chunkConcurrency:1 is sequential', async () => {
    const order: number[] = [];
    const batchMock = vi.fn().mockImplementation(async (calls: BatchEthCallItem[]) => {
      const chunkNum = batchMock.mock.calls.length;
      await new Promise((r) => setTimeout(r, 5));
      order.push(chunkNum);
      return calls.map(() => ({ status: 'success' as const, result: BALANCE_RESULT }));
    });

    const client = makeClient(batchMock);

    await client.contracts.getMembershipTokenBalancesBatch({
      walletAddresses: wallets(6),
      maxBatchSize: 2,
      chunk: true,
      chunkConcurrency: 1,
    });

    expect(order).toEqual([1, 2, 3]);
    expect(batchMock).toHaveBeenCalledTimes(3);
  });

  it('wall-clock improvement with concurrent chunks (fake timers)', async () => {
    vi.useFakeTimers();

    // 12 wallets, maxBatchSize=4 → 3 chunks, each takes 100ms
    const batchMock = vi.fn().mockImplementation(
      (calls: BatchEthCallItem[]) =>
        new Promise<BatchItemResult[]>((resolve) =>
          setTimeout(
            () => resolve(calls.map(() => ({ status: 'success' as const, result: BALANCE_RESULT }))),
            100,
          ),
        ),
    );

    const client = makeClient(batchMock);

    // Start the request but don't await — we'll advance timers manually.
    const promise = client.contracts.getMembershipTokenBalancesBatch({
      walletAddresses: wallets(12),
      maxBatchSize: 4,
      chunk: true,
      chunkConcurrency: 3,
    });

    // Advance time: all 3 chunks should start concurrently and finish after 100ms total.
    await vi.advanceTimersByTimeAsync(100);

    const results = await promise;
    expect(results).toHaveLength(12);
    for (const r of results) {
      expect(r.status).toBe('success');
    }
    expect(batchMock).toHaveBeenCalledTimes(3);

    vi.useRealTimers();
  });

  it('sequential execution takes longer wall-clock with same per-chunk latency (fake timers)', async () => {
    vi.useFakeTimers();

    const batchMock = vi.fn().mockImplementation(
      (calls: BatchEthCallItem[]) =>
        new Promise<BatchItemResult[]>((resolve) =>
          setTimeout(
            () => resolve(calls.map(() => ({ status: 'success' as const, result: BALANCE_RESULT }))),
            100,
          ),
        ),
    );

    const client = makeClient(batchMock);

    const promise = client.contracts.getMembershipTokenBalancesBatch({
      walletAddresses: wallets(12),
      maxBatchSize: 4,
      chunk: true,
      // chunkConcurrency omitted → sequential
    });

    // After 100ms, only the first chunk is done
    await vi.advanceTimersByTimeAsync(100);
    // Promise should NOT be resolved yet (2 more chunks to go)
    // We can check by advancing another 200ms
    await vi.advanceTimersByTimeAsync(200);

    const results = await promise;
    expect(results).toHaveLength(12);
    for (const r of results) {
      expect(r.status).toBe('success');
    }
    expect(batchMock).toHaveBeenCalledTimes(3);

    vi.useRealTimers();
  });

  it('caps chunkConcurrency at 20', async () => {
    // 42 wallets, maxBatchSize=2 → 21 chunks
    const batchMock = vi.fn().mockImplementation((calls: BatchEthCallItem[]) =>
      Promise.resolve(calls.map(() => ({ status: 'success' as const, result: BALANCE_RESULT }))),
    );
    const client = makeClient(batchMock);

    await client.contracts.getMembershipTokenBalancesBatch({
      walletAddresses: wallets(42),
      maxBatchSize: 2,
      chunk: true,
      chunkConcurrency: 999, // should be capped to 20
    });

    expect(batchMock).toHaveBeenCalledTimes(21);
  });

  it('treats non-positive chunkConcurrency as sequential (1)', async () => {
    const order: number[] = [];
    const batchMock = vi.fn().mockImplementation(async (calls: BatchEthCallItem[]) => {
      const chunkNum = batchMock.mock.calls.length;
      await new Promise((r) => setTimeout(r, 5));
      order.push(chunkNum);
      return calls.map(() => ({ status: 'success' as const, result: BALANCE_RESULT }));
    });

    const client = makeClient(batchMock);

    await client.contracts.getMembershipTokenBalancesBatch({
      walletAddresses: wallets(6),
      maxBatchSize: 2,
      chunk: true,
      chunkConcurrency: 0, // invalid → treated as 1
    });

    expect(order).toEqual([1, 2, 3]);
  });

  it('treats negative chunkConcurrency as sequential (1)', async () => {
    const order: number[] = [];
    const batchMock = vi.fn().mockImplementation(async (calls: BatchEthCallItem[]) => {
      const chunkNum = batchMock.mock.calls.length;
      await new Promise((r) => setTimeout(r, 5));
      order.push(chunkNum);
      return calls.map(() => ({ status: 'success' as const, result: BALANCE_RESULT }));
    });

    const client = makeClient(batchMock);

    await client.contracts.getMembershipTokenBalancesBatch({
      walletAddresses: wallets(6),
      maxBatchSize: 2,
      chunk: true,
      chunkConcurrency: -5,
    });

    expect(order).toEqual([1, 2, 3]);
  });

  it('per-item error isolation preserved with concurrent chunks', async () => {
    // Simulate a provider that fails every other chunk
    const batchMock = vi
      .fn()
      .mockImplementationOnce((calls: BatchEthCallItem[]) =>
        Promise.resolve(calls.map(() => ({ status: 'success' as const, result: BALANCE_RESULT }))),
      )
      .mockImplementationOnce(() => Promise.reject(new Error('chunk 2 failed')))
      .mockImplementationOnce((calls: BatchEthCallItem[]) =>
        Promise.resolve(calls.map(() => ({ status: 'success' as const, result: BALANCE_RESULT }))),
      );

    const client = makeClient(batchMock);

    // 6 wallets, maxBatchSize=2 → 3 chunks, all concurrent
    const promise = client.contracts.getMembershipTokenBalancesBatch({
      walletAddresses: wallets(6),
      maxBatchSize: 2,
      chunk: true,
      chunkConcurrency: 3,
    });

    // The failing chunk (index 1) should cause the whole operation to reject
    await expect(promise).rejects.toThrow('chunk 2 failed');
  });

  it('chunkConcurrency works with getGuildOwnersBatch', async () => {
    const batchMock = vi.fn().mockImplementation((calls: BatchEthCallItem[]) =>
      Promise.resolve(calls.map(() => ({ status: 'success' as const, result: OWNER_RESULT }))),
    );
    const client = makeClient(batchMock);

    const guildIds = Array.from({ length: 10 }, (_, i) => `guild_${i + 1}`);
    const results = await client.contracts.getGuildOwnersBatch({
      guildIds,
      maxBatchSize: 2,
      chunk: true,
      chunkConcurrency: 3,
    });

    expect(results).toHaveLength(10);
    for (const r of results) {
      expect(r.status).toBe('success');
    }
    expect(batchMock).toHaveBeenCalledTimes(5);
  });

  it('result ordering is deterministic across multiple runs with concurrency', async () => {
    // Run 5 times with randomized delays to prove output ordering is stable
    for (let run = 0; run < 5; run++) {
      // Random delays between 1-30ms for 5 chunks
      const delays = Array.from({ length: 5 }, () => Math.floor(Math.random() * 30) + 1);
      const batchMock = makeDelayedBatch(delays);
      const client = makeClient(batchMock);

      const results = await client.contracts.getMembershipTokenBalancesBatch({
        walletAddresses: wallets(10),
        maxBatchSize: 2,
        chunk: true,
        chunkConcurrency: 5,
      });

      expect(results).toHaveLength(10);

      // Verify that each result corresponds to the correct wallet in order:
      // wallet[i] → BALANCE_OF_SELECTOR + encodeAddressArgument(wallet[i])
      for (let i = 0; i < 10; i++) {
        expect(results[i].status).toBe('success');
      }

      // Verify call arguments preserve index ordering
      let callItemIdx = 0;
      for (const call of batchMock.mock.calls) {
        const items = call[0] as BatchEthCallItem[];
        for (const item of items) {
          expect(item.to).toBe(CONTRACT);
          // Verify the encoded wallet address matches the expected position
          const expectedWallet = wallets(10)[callItemIdx];
          expect(item.data).toBe(`${BALANCE_OF_SELECTOR}${encodeAddressArgument(expectedWallet)}`);
          callItemIdx++;
        }
      }
    }
  });
});

// ---------------------------------------------------------------------------
// Confirmations / block tag tests
// ---------------------------------------------------------------------------

describe('confirmations block tag support', () => {
  beforeEach(() => {
    vi.stubGlobal('fetch', vi.fn());
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  const verifyBlockTag = async (
    confirmations: BlockTag | undefined,
    expectedTag: string,
  ) => {
    let requestBody: any;
    mockFetch().mockImplementation(async (_url: string, init: RequestInit) => {
      requestBody = JSON.parse(String(init.body));
      if (requestBody.method === 'eth_blockNumber') {
        return rpcResponse('0x100');
      }
      return rpcResponse(BALANCE_RESULT);
    });

    const client = new GuildPassClient({
      apiUrl: BASE_URL,
      rpcUrl: RPC_URL,
      contractAddress: CONTRACT,
    });

    const opts = confirmations === undefined ? undefined : { confirmations };
    await client.contracts.getMembershipTokenBalance({ walletAddress: WALLET }, opts);
    expect(requestBody.params).toEqual([{ to: CONTRACT, data: expect.any(String) }, expectedTag]);
  };

  it('default (confirmations omitted) sends latest block tag', async () => {
    let requestBody: any;
    mockFetch().mockImplementation(async (_url: string, init: RequestInit) => {
      requestBody = JSON.parse(String(init.body));
      return rpcResponse(BALANCE_RESULT);
    });

    const client = new GuildPassClient({
      apiUrl: BASE_URL,
      rpcUrl: RPC_URL,
      contractAddress: CONTRACT,
    });

    await client.contracts.getMembershipTokenBalance({ walletAddress: WALLET });
    expect(requestBody.params[1]).toBe('latest');
  });

  it('numeric confirmations computes historical block tag via eth_blockNumber', async () => {
    let callCount = 0;
    mockFetch().mockImplementation(async (_url: string, init: RequestInit) => {
      const body = JSON.parse(String(init.body));
      callCount++;
      if (body.method === 'eth_blockNumber') {
        expect(body.params).toEqual([]);
        return rpcResponse('0x100');
      }
      expect(body.params[1]).toBe('0xfa');
      return rpcResponse(BALANCE_RESULT);
    });

    const client = new GuildPassClient({
      apiUrl: BASE_URL,
      rpcUrl: RPC_URL,
      contractAddress: CONTRACT,
    });

    const balance = await client.contracts.getMembershipTokenBalance(
      { walletAddress: WALLET },
      { confirmations: 6 },
    );

    expect(balance).toBe('5');
    expect(callCount).toBe(2);
  });

  it('safe named tag passed directly to eth_call', () =>
    verifyBlockTag('safe', 'safe'));

  it('finalized named tag passed directly to eth_call', () =>
    verifyBlockTag('finalized', 'finalized'));

  it('guild owner call respects numeric confirmations', async () => {
    let callCount = 0;
    mockFetch().mockImplementation(async (_url: string, init: RequestInit) => {
      const body = JSON.parse(String(init.body));
      callCount++;
      if (body.method === 'eth_blockNumber') {
        return rpcResponse('0x64');
      }
      expect(body.params[1]).toBe('0x5e');
      return rpcResponse(OWNER_RESULT);
    });

    const client = new GuildPassClient({
      apiUrl: BASE_URL,
      rpcUrl: RPC_URL,
      contractAddress: CONTRACT,
    });

    const owner = await client.contracts.getGuildOwner(
      { guildId: 'guild_1' },
      { confirmations: 6 },
    );

    expect(owner).toBe(OWNER);
    expect(callCount).toBe(2);
  });

  it('batch eth_call respects numeric confirmations', async () => {
    let callCount = 0;
    mockFetch().mockImplementation(async (_url: string, init: RequestInit) => {
      const body = JSON.parse(String(init.body));
      callCount++;
      if (body.method === 'eth_blockNumber') {
        return rpcResponse('0x100');
      }
      // Batch — body is an array
      if (Array.isArray(body)) {
        for (const req of body) {
          expect(req.params[1]).toBe('0xfa');
        }
        return {
          ok: true,
          status: 200,
          headers: new Headers({ 'content-type': 'application/json' }),
          json: async () => [{ jsonrpc: '2.0', id: 1, result: BALANCE_RESULT }],
          text: async () => JSON.stringify([{ jsonrpc: '2.0', id: 1, result: BALANCE_RESULT }]),
        };
      }
      return rpcResponse(BALANCE_RESULT);
    });

    const client = new GuildPassClient({
      apiUrl: BASE_URL,
      rpcUrl: RPC_URL,
      contractAddress: CONTRACT,
    });

    const results = await client.contracts.getMembershipTokenBalancesBatch(
      { walletAddresses: [WALLET] },
      { confirmations: 6 },
    );

    expect(results).toEqual([{ status: 'success', result: '5' }]);
    expect(callCount).toBe(2);
  });

  it('batch guild owners call respects numeric confirmations', async () => {
    let callCount = 0;
    mockFetch().mockImplementation(async (_url: string, init: RequestInit) => {
      const body = JSON.parse(String(init.body));
      callCount++;
      if (body.method === 'eth_blockNumber') {
        return rpcResponse('0x100');
      }
      if (Array.isArray(body)) {
        for (const req of body) {
          expect(req.params[1]).toBe('0xfa');
        }
        return {
          ok: true,
          status: 200,
          headers: new Headers({ 'content-type': 'application/json' }),
          json: async () => [{ jsonrpc: '2.0', id: 1, result: OWNER_RESULT }],
          text: async () => JSON.stringify([{ jsonrpc: '2.0', id: 1, result: OWNER_RESULT }]),
        };
      }
      return rpcResponse(OWNER_RESULT);
    });

    const client = new GuildPassClient({
      apiUrl: BASE_URL,
      rpcUrl: RPC_URL,
      contractAddress: CONTRACT,
    });

    const results = await client.contracts.getGuildOwnersBatch(
      { guildIds: ['guild_1'] },
      { confirmations: 6 },
    );

    expect(results).toEqual([{ status: 'success', result: OWNER }]);
    expect(callCount).toBe(2);
  });

  it('throws INVALID_INPUT when confirmations exceeds block height', async () => {
    mockFetch().mockImplementation(async (_url: string, init: RequestInit) => {
      const body = JSON.parse(String(init.body));
      if (body.method === 'eth_blockNumber') {
        return rpcResponse('0x5');
      }
      return rpcResponse(BALANCE_RESULT);
    });

    const client = new GuildPassClient({
      apiUrl: BASE_URL,
      rpcUrl: RPC_URL,
      contractAddress: CONTRACT,
    });

    await expect(
      client.contracts.getMembershipTokenBalance(
        { walletAddress: WALLET },
        { confirmations: 10 },
      ),
    ).rejects.toMatchObject({
      code: GuildPassErrorCode.INVALID_INPUT,
      message: expect.stringContaining('confirmations=10 exceeds current block height'),
    });
  });

  it('confirmations with getMembershipTokenBalanceFormatted', async () => {
    let callCount = 0;
    mockFetch().mockImplementation(async (_url: string, init: RequestInit) => {
      const body = JSON.parse(String(init.body));
      callCount++;
      if (body.method === 'eth_blockNumber') {
        return rpcResponse('0x100');
      }
      return rpcResponse(BALANCE_RESULT);
    });

    const client = new GuildPassClient({
      apiUrl: BASE_URL,
      rpcUrl: RPC_URL,
      contractAddress: CONTRACT,
    });

    const result = await client.contracts.getMembershipTokenBalanceFormatted(
      { walletAddress: WALLET },
      { confirmations: 6 },
    );

    expect(result.raw).toBe('5');
    expect(callCount).toBeGreaterThanOrEqual(2);
  });
});
