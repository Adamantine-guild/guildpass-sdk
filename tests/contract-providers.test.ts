// GuildPass SDK: Pull in package or module bindings.
import { beforeEach, describe, expect, it, vi } from 'vitest';
// GuildPass SDK: Import external module dependencies.
import { GuildPassClient } from '../src/client/GuildPassClient';
import { GuildPassErrorCode } from '../src/errors/errorCodes';
import {
  BALANCE_OF_SELECTOR,
  GET_GUILD_OWNER_SELECTOR,
  encodeAddressArgument,
  encodeGuildId,
} from '../src/contracts/contractClient';
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
