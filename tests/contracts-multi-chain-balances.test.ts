import { beforeEach, describe, expect, it, vi } from 'vitest';
import { GuildPassClient } from '../src/client/GuildPassClient';
import { ContractClient, encodeAddressArgument } from '../src/contracts/contractClient';
import { GuildPassErrorCode } from '../src/errors/errorCodes';

const WALLET = '0x1234567890123456789012345678901234567890';
const CONTRACT_ETH = '0x1111111111111111111111111111111111111111';
const CONTRACT_BASE = '0x2222222222222222222222222222222222222222';
const BASE_URL = 'https://api.test.com';

const BALANCE_ETH = '1000000000000000000'; // 1e18
const BALANCE_BASE = '500000000000000000'; // 0.5e18

const encodedWallet = encodeAddressArgument(WALLET);
const BALANCE_OF_SELECTOR = '0x70a08231';

function rpcSuccessResponse(balance: string) {
  return {
    ok: true,
    status: 200,
    headers: new Headers({ 'Content-Type': 'application/json' }),
    json: () =>
      Promise.resolve({
        jsonrpc: '2.0',
        id: 1,
        result: `0x${BigInt(balance).toString(16).padStart(64, '0')}`,
      }),
  };
}

function rpcErrorResponse() {
  return {
    ok: false,
    status: 503,
    headers: new Headers(),
    json: () => Promise.resolve({ error: { message: 'Service Unavailable' } }),
  };
}

describe('getMembershipTokenBalances', () => {
  beforeEach(() => {
    vi.stubGlobal('fetch', vi.fn());
  });

  it('returns correct per-chain balances for all configured chains', async () => {
    const client = new GuildPassClient({
      apiUrl: BASE_URL,
      chains: {
        1: { rpcUrl: 'https://eth.rpc', contractAddress: CONTRACT_ETH },
        8453: { rpcUrl: 'https://base.rpc', contractAddress: CONTRACT_BASE },
      },
    });

    const mockFetch = fetch as unknown as ReturnType<typeof vi.fn>;
    mockFetch
      .mockImplementationOnce((url: string) => {
        if (url.includes('eth.rpc')) return Promise.resolve(rpcSuccessResponse(BALANCE_ETH));
        return Promise.resolve(rpcSuccessResponse(BALANCE_BASE));
      })
      .mockImplementationOnce((url: string) => {
        if (url.includes('base.rpc')) return Promise.resolve(rpcSuccessResponse(BALANCE_BASE));
        return Promise.resolve(rpcSuccessResponse(BALANCE_ETH));
      });

    const result = await client.contracts.getMembershipTokenBalances({ walletAddress: WALLET });

    expect(result[1]).toMatchObject({ status: 'success', balance: BALANCE_ETH });
    expect(result[8453]).toMatchObject({ status: 'success', balance: BALANCE_BASE });
  });

  it('does not throw when one chain RPC fails; reports failure per-chain', async () => {
    const client = new GuildPassClient({
      apiUrl: BASE_URL,
      chains: {
        1: { rpcUrl: 'https://eth.rpc', contractAddress: CONTRACT_ETH },
        8453: { rpcUrl: 'https://base.rpc', contractAddress: CONTRACT_BASE },
      },
    });

    const mockFetch = fetch as unknown as ReturnType<typeof vi.fn>;
    // Simulate chain 1 failing, chain 8453 succeeding.
    // Because chain enumeration order from Object.keys may vary, we match by URL.
    mockFetch.mockImplementation((url: string) => {
      if (url.includes('eth.rpc')) return Promise.resolve(rpcErrorResponse());
      return Promise.resolve(rpcSuccessResponse(BALANCE_BASE));
    });

    const result = await client.contracts.getMembershipTokenBalances({ walletAddress: WALLET });

    expect(result[1]).toMatchObject({ status: 'error' });
    expect(result[1]).toHaveProperty('error');
    expect(result[8453]).toMatchObject({ status: 'success', balance: BALANCE_BASE });
  });

  it('reports all chains as errors when all RPCs fail', async () => {
    const client = new GuildPassClient({
      apiUrl: BASE_URL,
      chains: {
        1: { rpcUrl: 'https://eth.rpc', contractAddress: CONTRACT_ETH },
        8453: { rpcUrl: 'https://base.rpc', contractAddress: CONTRACT_BASE },
      },
    });

    const mockFetch = fetch as unknown as ReturnType<typeof vi.fn>;
    mockFetch.mockResolvedValue(rpcErrorResponse());

    const result = await client.contracts.getMembershipTokenBalances({ walletAddress: WALLET });

    expect(result[1]).toMatchObject({ status: 'error' });
    expect(result[8453]).toMatchObject({ status: 'error' });
  });

  it('works with a single default chainId (no chains map)', async () => {
    const client = new GuildPassClient({
      apiUrl: BASE_URL,
      chainId: 1,
      rpcUrl: 'https://eth.rpc',
      contractAddress: CONTRACT_ETH,
    });

    const mockFetch = fetch as unknown as ReturnType<typeof vi.fn>;
    mockFetch.mockResolvedValue(rpcSuccessResponse(BALANCE_ETH));

    const result = await client.contracts.getMembershipTokenBalances({ walletAddress: WALLET });

    expect(result[1]).toMatchObject({ status: 'success', balance: BALANCE_ETH });
  });

  it('applies a per-call contractAddress override on every chain', async () => {
    const OVERRIDE = '0x3333333333333333333333333333333333333333';
    const client = new GuildPassClient({
      apiUrl: BASE_URL,
      chains: {
        1: { rpcUrl: 'https://eth.rpc', contractAddress: CONTRACT_ETH },
        8453: { rpcUrl: 'https://base.rpc', contractAddress: CONTRACT_BASE },
      },
    });

    const mockFetch = fetch as unknown as ReturnType<typeof vi.fn>;
    mockFetch.mockResolvedValue(rpcSuccessResponse(BALANCE_ETH));

    await client.contracts.getMembershipTokenBalances({
      walletAddress: WALLET,
      contractAddress: OVERRIDE,
    });

    // Every eth_call request must use the override address, not the chain-level one.
    for (const [, init] of mockFetch.mock.calls as [string, RequestInit][]) {
      const body = JSON.parse(init.body as string);
      expect(body.params[0].to).toBe(OVERRIDE);
    }
  });

  it('throws INVALID_CONFIG when neither chainId nor chains is configured (ContractClient direct)', async () => {
    // ContractClient without the default config merging that GuildPassClient applies.
    const contractClient = new ContractClient({
      apiUrl: BASE_URL,
      rpcUrl: 'https://eth.rpc',
      contractAddress: CONTRACT_ETH,
      // No chainId, no chains
    } as any);

    await expect(
      contractClient.getMembershipTokenBalances({ walletAddress: WALLET }),
    ).rejects.toMatchObject({
      code: GuildPassErrorCode.INVALID_CONFIG,
      message: expect.stringContaining('chainId or chains'),
    });
  });

  it('throws INVALID_ADDRESS for an invalid wallet address', async () => {
    const client = new GuildPassClient({
      apiUrl: BASE_URL,
      chainId: 1,
      rpcUrl: 'https://eth.rpc',
      contractAddress: CONTRACT_ETH,
    });

    await expect(
      client.contracts.getMembershipTokenBalances({ walletAddress: 'not-an-address' }),
    ).rejects.toMatchObject({ code: GuildPassErrorCode.INVALID_ADDRESS });
  });

  it('returns a result keyed by every chain ID in the chains map', async () => {
    const client = new GuildPassClient({
      apiUrl: BASE_URL,
      chains: {
        1: { rpcUrl: 'https://eth.rpc', contractAddress: CONTRACT_ETH },
        137: { rpcUrl: 'https://polygon.rpc', contractAddress: CONTRACT_BASE },
        8453: { rpcUrl: 'https://base.rpc', contractAddress: CONTRACT_BASE },
      },
    });

    const mockFetch = fetch as unknown as ReturnType<typeof vi.fn>;
    mockFetch.mockResolvedValue(rpcSuccessResponse('0'));

    const result = await client.contracts.getMembershipTokenBalances({ walletAddress: WALLET });

    expect(Object.keys(result).map(Number).sort((a, b) => a - b)).toEqual([1, 137, 8453]);
  });
});
