// GuildPass SDK: Pull in package or module bindings.
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
// GuildPass SDK: Import external module dependencies.
import { GuildPassClient } from '../src/client/GuildPassClient';
// GuildPass SDK: Pull in package or module bindings.
import { GuildPassErrorCode } from '../src/errors/errorCodes';
import { GuildPassError } from '../src/errors/GuildPassError';
import {
  BALANCE_OF_SELECTOR,
  GET_GUILD_OWNER_SELECTOR,
  encodeAddressArgument,
  encodeGuildId,
  decodeAddressResult,
  decodeUint256Result,
} from '../src/contracts/contractClient';
import { validateAccessRequirement } from '../src/contracts/contractHelpers';
import contractEncodingFixtures from './fixtures/contract-encoding.json';

const WALLET = '0x1234567890123456789012345678901234567890';
const CONTRACT = '0x0000000000000000000000000000000000000000';
const BASE_URL = 'https://api.test.com';
const RPC_URL = 'https://rpc.test.com';
const OWNER = '0x9999999999999999999999999999999999999999';

const mockFetch = (): ReturnType<typeof vi.fn> => fetch as unknown as ReturnType<typeof vi.fn>;

// GuildPass SDK: Test suite container block.
describe('ContractClient (Stubs)', () => {
  // GuildPass SDK: Local block-scoped constant reference.
  const client = new GuildPassClient({
    apiUrl: BASE_URL,
    rpcUrl: RPC_URL,
    contractAddress: CONTRACT,
    // GuildPass SDK: End of logic containment structure block.
  });
  const walletAddress = WALLET;

  beforeEach(() => {
    vi.stubGlobal('fetch', vi.fn());
  });

  it('should support configurable timeout behaviour', async () => {
    mockFetch().mockImplementation(
      (_, init) =>
        new Promise((resolve, reject) => {
          if (init?.signal) {
            init.signal.addEventListener('abort', () => {
              const error = new Error('Aborted');
              error.name = 'AbortError';
              reject(error);
            });
          }
        }),
    );

    const promise = client.contracts.getGuildOwner({ guildId: 'guild_1' }, { timeoutMs: 100 });

    await expect(promise).rejects.toMatchObject({
      code: GuildPassErrorCode.TIMEOUT,
      message: expect.stringContaining('timed out after 100ms'),
    });
  });

  it('should support external abort signals', async () => {
    const controller = new AbortController();
    controller.abort();

    const promise = client.contracts.getGuildOwner({ guildId: 'guild_1' }, { signal: controller.signal });

    await expect(promise).rejects.toMatchObject({
      code: GuildPassErrorCode.REQUEST_CANCELLED,
      message: 'Request cancelled by caller',
    });
  });

  it('should retry safe transient RPC failures when configured', async () => {
    mockFetch()
      .mockResolvedValueOnce({
        ok: false,
        status: 502,
        headers: new Headers(),
        json: () => Promise.resolve({ error: { message: 'Bad Gateway' } }),
      })
      .mockResolvedValueOnce({
        ok: true,
        status: 200,
        headers: new Headers({ 'Content-Type': 'application/json' }),
        json: () =>
          Promise.resolve({
            jsonrpc: '2.0',
            id: 1,
            result: `0x000000000000000000000000${OWNER.slice(2)}`,
          }),
      });

    const owner = await client.contracts.getGuildOwner(
      { guildId: 'guild_1' },
      { retry: { maxRetries: 1, baseDelayMs: 10 } },
    );

    expect(owner).toBe(OWNER);
    expect(fetch).toHaveBeenCalledTimes(2);
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('should fetch guild owner through eth_call', async () => {
    mockFetch().mockResolvedValue({
      ok: true,
      status: 200,
      headers: new Headers({ 'Content-Type': 'application/json' }),
      json: () =>
        Promise.resolve({
          jsonrpc: '2.0',
          id: 1,
          result: `0x000000000000000000000000${OWNER.slice(2)}`,
        }),
    });

    const owner = await client.contracts.getGuildOwner({ guildId: 'guild_1' });

    expect(owner).toBe(OWNER);
    expect(fetch).toHaveBeenCalledWith(
      expect.stringMatching(/^https:\/\/rpc\.test\.com\/?$/),
      expect.objectContaining({
        method: 'POST',
        headers: expect.objectContaining({ 'Content-Type': 'application/json' }),
      }),
    );

    const request = JSON.parse(mockFetch().mock.calls[0][1].body as string);
    expect(request.method).toBe('eth_call');
    expect(request.params[0].to).toBe(CONTRACT);
    expect(request.params[0].data).toBe(
      '0xab4511dc6775696c645f3100000000000000000000000000000000000000000000000000',
    );
  });

  it('should encode numeric guild IDs as bytes32', async () => {
    mockFetch().mockResolvedValue({
      ok: true,
      status: 200,
      headers: new Headers({ 'Content-Type': 'application/json' }),
      json: () => Promise.resolve({ result: `0x000000000000000000000000${OWNER.slice(2)}` }),
    });

    await client.contracts.getGuildOwner({ guildId: '42' });

    const request = JSON.parse(mockFetch().mock.calls[0][1].body as string);
    expect(request.params[0].data).toBe(
      '0xab4511dc000000000000000000000000000000000000000000000000000000000000002a',
    );
  });

  it('should use per-chain config for guild owner lookup', async () => {
    const chainClient = new GuildPassClient({
      apiUrl: BASE_URL,
      chainId: 8453,
      chains: {
        1: {
          rpcUrl: 'https://eth.rpc',
          contractAddress: '0x1111111111111111111111111111111111111111',
        },
        8453: {
          rpcUrl: 'https://base.rpc',
          contractAddress: '0x2222222222222222222222222222222222222222',
        },
      },
    });
    mockFetch().mockResolvedValue({
      ok: true,
      status: 200,
      headers: new Headers({ 'Content-Type': 'application/json' }),
      json: () => Promise.resolve({ result: `0x000000000000000000000000${OWNER.slice(2)}` }),
    });

    await expect(
      chainClient.contracts.getGuildOwner({ guildId: 'guild_1', chainId: 8453 }),
    ).resolves.toBe(OWNER);

    const request = JSON.parse(mockFetch().mock.calls[0][1].body as string);
    expect(fetch).toHaveBeenCalledWith(expect.stringMatching(/^https:\/\/base\.rpc\/?$/), expect.any(Object));
    expect(request.params[0].to).toBe('0x2222222222222222222222222222222222222222');
  });

  it('should support per-call contract override for guild owner lookup', async () => {
    const contractAddress = '0x1111111111111111111111111111111111111111';
    mockFetch().mockResolvedValue({
      ok: true,
      status: 200,
      headers: new Headers({ 'Content-Type': 'application/json' }),
      json: () => Promise.resolve({ result: `0x000000000000000000000000${OWNER.slice(2)}` }),
    });

    await client.contracts.getGuildOwner({ guildId: 'guild_1', contractAddress });

    const request = JSON.parse(mockFetch().mock.calls[0][1].body as string);
    expect(request.params[0].to).toBe(contractAddress);
  });

  it('should throw a clear config error when rpcUrl is missing for guild owner lookup', async () => {
    const clientWithoutRpc = new GuildPassClient({
      apiUrl: BASE_URL,
      contractAddress: CONTRACT,
    });

    await expect(clientWithoutRpc.contracts.getGuildOwner({ guildId: 'guild_1' }))
      .rejects.toMatchObject({
        code: GuildPassErrorCode.INVALID_CONFIG,
        message: 'rpcUrl is required for contract calls',
      });
  });

  it('should throw a clear config error when contractAddress is missing for guild owner lookup', async () => {
    const clientWithoutContract = new GuildPassClient({
      apiUrl: BASE_URL,
      rpcUrl: RPC_URL,
    });

    await expect(clientWithoutContract.contracts.getGuildOwner({ guildId: 'guild_1' }))
      .rejects.toMatchObject({
        code: GuildPassErrorCode.INVALID_CONFIG,
        message: 'contractAddress is required for guild owner lookup',
      });
  });

  it('should reject guild IDs that cannot fit bytes32 encoding', async () => {
    await expect(
      client.contracts.getGuildOwner({ guildId: 'x'.repeat(33) }),
    ).rejects.toMatchObject({
      code: GuildPassErrorCode.INVALID_INPUT,
    });
    expect(fetch).not.toHaveBeenCalled();
  });

  it('getGuildOwnersBatch maps multiple guild IDs to decoded owners in order', async () => {
    const OWNER_A = '0xaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa';
    const OWNER_B = '0xbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb';

    mockFetch().mockResolvedValue({
      ok: true,
      status: 200,
      headers: new Headers({ 'Content-Type': 'application/json' }),
      json: () =>
        Promise.resolve([
          { jsonrpc: '2.0', id: 1, result: `0x000000000000000000000000${OWNER_A.slice(2)}` },
          { jsonrpc: '2.0', id: 2, result: `0x000000000000000000000000${OWNER_B.slice(2)}` },
        ]),
    });

    const results = await client.contracts.getGuildOwnersBatch({
      guildIds: ['guild_1', 'guild_2'],
    });

    expect(results).toHaveLength(2);
    expect(results[0].status).toBe('success');
    if (results[0].status === 'success') expect(results[0].result).toBe(OWNER_A);
    if (results[1].status === 'success') expect(results[1].result).toBe(OWNER_B);

    const body = JSON.parse(mockFetch().mock.calls[0][1].body as string);
    expect(Array.isArray(body)).toBe(true);
    expect(body).toHaveLength(2);
    expect(body[0].method).toBe('eth_call');
    expect(body[1].method).toBe('eth_call');
  });

  it('getGuildOwnersBatch marks failed batch items as errors without throwing', async () => {
    mockFetch().mockResolvedValue({
      ok: true,
      status: 200,
      headers: new Headers({ 'Content-Type': 'application/json' }),
      json: () =>
        Promise.resolve([
          { jsonrpc: '2.0', id: 1, result: `0x000000000000000000000000${OWNER.slice(2)}` },
          { jsonrpc: '2.0', id: 2, error: { code: -32000, message: 'execution reverted' } },
        ]),
    });

    const results = await client.contracts.getGuildOwnersBatch({
      guildIds: ['guild_1', 'guild_2'],
    });

    expect(results).toHaveLength(2);
    expect(results[0].status).toBe('success');
    expect(results[1].status).toBe('error');
    if (results[1].status === 'error') {
      expect(results[1].error).toContain('execution reverted');
    }
  });

  it('should surface guild owner RPC errors', async () => {
    mockFetch().mockResolvedValue({
      ok: true,
      status: 200,
      headers: new Headers({ 'Content-Type': 'application/json' }),
      json: () => Promise.resolve({ error: { code: -32000, message: 'execution reverted' } }),
    });

    await expect(client.contracts.getGuildOwner({ guildId: 'guild_1' }))
      .rejects.toMatchObject({
        code: GuildPassErrorCode.HTTP_ERROR,
        message: 'execution reverted',
      });
  });

  it('should reject malformed guild owner RPC responses', async () => {
    mockFetch().mockResolvedValue({
      ok: true,
      status: 200,
      headers: new Headers({ 'Content-Type': 'application/json' }),
      json: () => Promise.resolve({ result: '0x1234' }),
    });

    await expect(client.contracts.getGuildOwner({ guildId: 'guild_1' }))
      .rejects.toMatchObject({
        code: GuildPassErrorCode.INVALID_RESPONSE,
      });
  });

  it('should fetch membership token balance through eth_call', async () => {
    mockFetch().mockResolvedValue({
      ok: true,
      status: 200,
      headers: new Headers({ 'Content-Type': 'application/json' }),
      json: () =>
        Promise.resolve({
          jsonrpc: '2.0',
          id: 1,
          result: '0x000000000000000000000000000000000000000000000000000000000000002a',
        }),
    });

    const balance = await client.contracts.getMembershipTokenBalance({ walletAddress });

    expect(balance).toBe('42');
    expect(fetch).toHaveBeenCalledWith(
      expect.stringMatching(/^https:\/\/rpc\.test\.com\/?$/),
      expect.objectContaining({
        method: 'POST',
        headers: expect.objectContaining({ 'Content-Type': 'application/json' }),
        body: JSON.stringify({
          jsonrpc: '2.0',
          id: 1,
          method: 'eth_call',
          params: [
            {
              to: CONTRACT,
              data: '0x70a082310000000000000000000000001234567890123456789012345678901234567890',
            },
            'latest',
          ],
        }),
      }),
    );
  });

  it('should resolve chain-specific config for balance checks', async () => {
    const chainClient = new GuildPassClient({
      apiUrl: BASE_URL,
      chains: {
        1: {
          rpcUrl: 'https://eth.rpc',
          contractAddress: '0x1111111111111111111111111111111111111111',
        },
        8453: {
          rpcUrl: 'https://base.rpc',
          contractAddress: '0x2222222222222222222222222222222222222222',
        },
      },
    });
    mockFetch().mockResolvedValue({
      ok: true,
      status: 200,
      headers: new Headers({ 'Content-Type': 'application/json' }),
      json: () =>
        Promise.resolve({
          result: '0x0000000000000000000000000000000000000000000000000000000000000007',
        }),
    });

    await expect(
      chainClient.contracts.getMembershipTokenBalance({ walletAddress, chainId: 8453 }),
    ).resolves.toBe('7');

    const request = JSON.parse(mockFetch().mock.calls[0][1].body as string);
    expect(fetch).toHaveBeenCalledWith(expect.stringMatching(/^https:\/\/base\.rpc\/?$/), expect.any(Object));
    expect(request.params[0].to).toBe('0x2222222222222222222222222222222222222222');
  });

  it('should support per-call contract addresses for balance checks', async () => {
    const contractAddress = '0x1111111111111111111111111111111111111111';
    mockFetch().mockResolvedValue({
      ok: true,
      status: 200,
      headers: new Headers({ 'Content-Type': 'application/json' }),
      json: () =>
        Promise.resolve({
          result: '0x0000000000000000000000000000000000000000000000000000000000000000',
        }),
    });

    await expect(
      client.contracts.getMembershipTokenBalance({ walletAddress, contractAddress }),
    ).resolves.toBe('0');

    const request = JSON.parse(mockFetch().mock.calls[0][1].body as string);
    expect(request.params[0].to).toBe(contractAddress);
  });

  it('should throw a clear config error when rpcUrl is missing for balance checks', async () => {
    const clientWithoutRpc = new GuildPassClient({
      apiUrl: BASE_URL,
      contractAddress: CONTRACT,
    });

    await expect(
      clientWithoutRpc.contracts.getMembershipTokenBalance({ walletAddress }),
    ).rejects.toMatchObject({
      code: GuildPassErrorCode.INVALID_CONFIG,
      message: 'rpcUrl is required for contract calls',
    });
  });

  it('should throw a clear config error when contractAddress is missing for balance checks', async () => {
    const clientWithoutContract = new GuildPassClient({
      apiUrl: BASE_URL,
      rpcUrl: RPC_URL,
    });

    await expect(
      clientWithoutContract.contracts.getMembershipTokenBalance({ walletAddress }),
    ).rejects.toMatchObject({
      code: GuildPassErrorCode.INVALID_CONFIG,
      message: 'contractAddress is required for token balance lookup',
    });
  });

  it('should validate wallet addresses before balance RPC calls', async () => {
    await expect(
      client.contracts.getMembershipTokenBalance({ walletAddress: 'not-an-address' }),
    ).rejects.toMatchObject({
      code: GuildPassErrorCode.INVALID_ADDRESS,
    });
    expect(fetch).not.toHaveBeenCalled();
  });

  it('should surface balance RPC errors', async () => {
    mockFetch().mockResolvedValue({
      ok: true,
      status: 200,
      headers: new Headers({ 'Content-Type': 'application/json' }),
      json: () => Promise.resolve({ error: { code: -32000, message: 'execution reverted' } }),
    });

    await expect(
      client.contracts.getMembershipTokenBalance({ walletAddress }),
    ).rejects.toMatchObject({
      code: GuildPassErrorCode.HTTP_ERROR,
      message: 'execution reverted',
    });
  });

  it('should reject malformed balance RPC responses', async () => {
    mockFetch().mockResolvedValue({
      ok: true,
      status: 200,
      headers: new Headers({ 'Content-Type': 'application/json' }),
      json: () => Promise.resolve({ result: '0x1234' }),
    });

    await expect(
      client.contracts.getMembershipTokenBalance({ walletAddress }),
    ).rejects.toMatchObject({
      code: GuildPassErrorCode.INVALID_RESPONSE,
    });
  });

});

// ---------------------------------------------------------------------------
// validateRoleRequirement: on-chain TOKEN / NFT / ROLE checks
// ---------------------------------------------------------------------------
describe('ContractClient.validateRoleRequirement', () => {
  const client = new GuildPassClient({
    apiUrl: BASE_URL,
    rpcUrl: RPC_URL,
    contractAddress: CONTRACT,
  });

  const walletAddress = WALLET;
  const TOKEN_CONTRACT = '0x4444444444444444444444444444444444444444';
  const NFT_CONTRACT = '0x5555555555555555555555555555555555555555';
  const ROLE_CONTRACT = '0x6666666666666666666666666666666666666666';

  const hexWord = (hex: string): string => `0x${hex.padStart(64, '0')}`;
  const addressWord = (address: string): string => hexWord(address.slice(2).toLowerCase());
  const boolWord = (value: boolean): string => hexWord(value ? '1' : '0');

  const mockEthCallResult = (result: string) => {
    mockFetch().mockResolvedValue({
      ok: true,
      status: 200,
      headers: new Headers({ 'Content-Type': 'application/json' }),
      json: () => Promise.resolve({ jsonrpc: '2.0', id: 1, result }),
    });
  };

  beforeEach(() => {
    vi.stubGlobal('fetch', vi.fn());
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  describe('TOKEN requirements', () => {
    it('returns true when balance meets minAmount', async () => {
      mockEthCallResult(hexWord((42).toString(16)));

      await expect(
        client.contracts.validateRoleRequirement({
          walletAddress,
          requirement: { type: 'TOKEN', address: TOKEN_CONTRACT, minAmount: '10' },
        }),
      ).resolves.toBe(true);

      expect(fetch).toHaveBeenCalledWith(
        expect.stringMatching(/^https:\/\/rpc\.test\.com\/?$/),
        expect.objectContaining({
          body: JSON.stringify({
            jsonrpc: '2.0',
            id: 1,
            method: 'eth_call',
            params: [
              { to: TOKEN_CONTRACT, data: `${BALANCE_OF_SELECTOR}${encodeAddressArgument(walletAddress)}` },
              'latest',
            ],
          }),
        }),
      );
    });

    it('returns false when balance is below minAmount', async () => {
      mockEthCallResult(hexWord((1).toString(16)));

      await expect(
        client.contracts.validateRoleRequirement({
          walletAddress,
          requirement: { type: 'TOKEN', address: TOKEN_CONTRACT, minAmount: '10' },
        }),
      ).resolves.toBe(false);
    });

    it('defaults minAmount to 1 when omitted', async () => {
      mockEthCallResult(hexWord((0).toString(16)));

      await expect(
        client.contracts.validateRoleRequirement({
          walletAddress,
          requirement: { type: 'TOKEN', address: TOKEN_CONTRACT },
        }),
      ).resolves.toBe(false);
    });

    it('rejects when address is missing', async () => {
      await expect(
        client.contracts.validateRoleRequirement({
          walletAddress,
          requirement: { type: 'TOKEN', minAmount: '1' },
        }),
      ).rejects.toMatchObject({ code: GuildPassErrorCode.INVALID_INPUT });
      expect(fetch).not.toHaveBeenCalled();
    });
  });

  describe('NFT requirements', () => {
    it('returns true when the wallet owns the specific token id', async () => {
      mockEthCallResult(addressWord(walletAddress));

      await expect(
        client.contracts.validateRoleRequirement({
          walletAddress,
          requirement: { type: 'NFT', address: NFT_CONTRACT, id: '7' },
        }),
      ).resolves.toBe(true);

      expect(fetch).toHaveBeenCalledWith(
        expect.stringMatching(/^https:\/\/rpc\.test\.com\/?$/),
        expect.objectContaining({
          body: JSON.stringify({
            jsonrpc: '2.0',
            id: 1,
            method: 'eth_call',
            params: [
              { to: NFT_CONTRACT, data: `0x6352211e${(7).toString(16).padStart(64, '0')}` },
              'latest',
            ],
          }),
        }),
      );
    });

    it('returns false when a different wallet owns the token id', async () => {
      mockEthCallResult(addressWord(OWNER));

      await expect(
        client.contracts.validateRoleRequirement({
          walletAddress,
          requirement: { type: 'NFT', address: NFT_CONTRACT, id: '7' },
        }),
      ).resolves.toBe(false);
    });

    it('falls back to collection-wide balanceOf when no id is given', async () => {
      mockEthCallResult(hexWord((2).toString(16)));

      await expect(
        client.contracts.validateRoleRequirement({
          walletAddress,
          requirement: { type: 'NFT', address: NFT_CONTRACT, minAmount: '1' },
        }),
      ).resolves.toBe(true);
    });

    it('rejects when address is missing', async () => {
      await expect(
        client.contracts.validateRoleRequirement({
          walletAddress,
          requirement: { type: 'NFT', id: '7' },
        }),
      ).rejects.toMatchObject({ code: GuildPassErrorCode.INVALID_INPUT });
    });

    it('rejects a non-numeric token id', async () => {
      await expect(
        client.contracts.validateRoleRequirement({
          walletAddress,
          requirement: { type: 'NFT', address: NFT_CONTRACT, id: 'not-a-number' },
        }),
      ).rejects.toMatchObject({ code: GuildPassErrorCode.INVALID_INPUT });
      expect(fetch).not.toHaveBeenCalled();
    });
  });

  describe('ROLE requirements', () => {
    it('returns true when hasRole resolves truthy', async () => {
      mockEthCallResult(boolWord(true));

      await expect(
        client.contracts.validateRoleRequirement({
          walletAddress,
          requirement: { type: 'ROLE', address: ROLE_CONTRACT, id: 'ADMIN' },
        }),
      ).resolves.toBe(true);

      expect(fetch).toHaveBeenCalledWith(
        expect.stringMatching(/^https:\/\/rpc\.test\.com\/?$/),
        expect.objectContaining({
          body: JSON.stringify({
            jsonrpc: '2.0',
            id: 1,
            method: 'eth_call',
            params: [
              {
                to: ROLE_CONTRACT,
                data: `0x91d14854${encodeGuildId('ADMIN')}${encodeAddressArgument(walletAddress)}`,
              },
              'latest',
            ],
          }),
        }),
      );
    });

    it('returns false when hasRole resolves falsy', async () => {
      mockEthCallResult(boolWord(false));

      await expect(
        client.contracts.validateRoleRequirement({
          walletAddress,
          requirement: { type: 'ROLE', address: ROLE_CONTRACT, id: 'ADMIN' },
        }),
      ).resolves.toBe(false);
    });

    it('rejects when id is missing', async () => {
      await expect(
        client.contracts.validateRoleRequirement({
          walletAddress,
          requirement: { type: 'ROLE', address: ROLE_CONTRACT },
        }),
      ).rejects.toMatchObject({ code: GuildPassErrorCode.INVALID_INPUT });
      expect(fetch).not.toHaveBeenCalled();
    });

    it('rejects when address is missing', async () => {
      await expect(
        client.contracts.validateRoleRequirement({
          walletAddress,
          requirement: { type: 'ROLE', id: 'ADMIN' },
        }),
      ).rejects.toMatchObject({ code: GuildPassErrorCode.INVALID_INPUT });
      expect(fetch).not.toHaveBeenCalled();
    });
  });

  describe('WHITELIST and unsupported requirements', () => {
    it('rejects WHITELIST with a clear NOT_IMPLEMENTED error', async () => {
      await expect(
        client.contracts.validateRoleRequirement({
          walletAddress,
          requirement: { type: 'WHITELIST' },
        }),
      ).rejects.toMatchObject({
        code: GuildPassErrorCode.NOT_IMPLEMENTED,
        message: expect.stringContaining('WHITELIST'),
      });
      expect(fetch).not.toHaveBeenCalled();
    });

    it('validateAccessRequirement explicitly rejects WHITELIST with NOT_IMPLEMENTED', async () => {
      await expect(
        validateAccessRequirement(walletAddress, { type: 'WHITELIST' }, vi.fn()),
      ).rejects.toMatchObject({
        code: GuildPassErrorCode.NOT_IMPLEMENTED,
        message: expect.stringContaining('WHITELIST'),
      });
    });

    it('rejects an unrecognised requirement type with a clear error', async () => {
      await expect(
        client.contracts.validateRoleRequirement({
          walletAddress,
          requirement: { type: 'UNKNOWN' as never },
        }),
      ).rejects.toMatchObject({
        code: GuildPassErrorCode.INVALID_INPUT,
        message: expect.stringContaining('UNKNOWN'),
      });
      expect(fetch).not.toHaveBeenCalled();
    });
  });

  describe('shared input/config validation', () => {
    it('rejects an invalid wallet address before calling out', async () => {
      await expect(
        client.contracts.validateRoleRequirement({
          walletAddress: 'not-an-address',
          requirement: { type: 'TOKEN', address: TOKEN_CONTRACT },
        }),
      ).rejects.toMatchObject({ code: GuildPassErrorCode.INVALID_ADDRESS });
      expect(fetch).not.toHaveBeenCalled();
    });

    it('throws INVALID_CONFIG when rpcUrl is not configured', async () => {
      const clientWithoutRpc = new GuildPassClient({ apiUrl: BASE_URL });

      await expect(
        clientWithoutRpc.contracts.validateRoleRequirement({
          walletAddress,
          requirement: { type: 'TOKEN', address: TOKEN_CONTRACT },
        }),
      ).rejects.toMatchObject({ code: GuildPassErrorCode.INVALID_CONFIG });
    });

    it('resolves the RPC endpoint for the requested chain', async () => {
      const chainClient = new GuildPassClient({
        apiUrl: BASE_URL,
        chains: {
          8453: { rpcUrl: 'https://base.rpc', contractAddress: CONTRACT },
        },
      });
      mockEthCallResult(hexWord((1).toString(16)));

      await expect(
        chainClient.contracts.validateRoleRequirement({
          walletAddress,
          requirement: { type: 'TOKEN', address: TOKEN_CONTRACT },
          chainId: 8453,
        }),
      ).resolves.toBe(true);

      expect(fetch).toHaveBeenCalledWith(
        expect.stringMatching(/^https:\/\/base\.rpc\/?$/),
        expect.anything(),
      );
    });

    it('surfaces RPC-level errors as HTTP_ERROR', async () => {
      mockFetch().mockResolvedValue({
        ok: true,
        status: 200,
        headers: new Headers({ 'Content-Type': 'application/json' }),
        json: () => Promise.resolve({ error: { code: -32000, message: 'execution reverted' } }),
      });

      await expect(
        client.contracts.validateRoleRequirement({
          walletAddress,
          requirement: { type: 'TOKEN', address: TOKEN_CONTRACT },
        }),
      ).rejects.toMatchObject({
        code: GuildPassErrorCode.HTTP_ERROR,
        message: 'execution reverted',
      });
    });
  });
});

// ---------------------------------------------------------------------------
// strictInterfaceChecking: ERC-165 interface validation
// ---------------------------------------------------------------------------
describe('strictInterfaceChecking', () => {
  const strictClient = new GuildPassClient({
    apiUrl: BASE_URL,
    rpcUrl: RPC_URL,
    contractAddress: CONTRACT,
    strictInterfaceChecking: true,
  });
  const nonStrictClient = new GuildPassClient({
    apiUrl: BASE_URL,
    rpcUrl: RPC_URL,
    contractAddress: CONTRACT,
    strictInterfaceChecking: false,
  });
  const NFT_CONTRACT = '0x5555555555555555555555555555555555555555';
  const ROLE_CONTRACT = '0x6666666666666666666666666666666666666666';

  const hexWord = (hex: string): string => `0x${hex.padStart(64, '0')}`;
  const addressWord = (address: string): string => hexWord(address.slice(2).toLowerCase());
  const boolWord = (value: boolean): string => hexWord(value ? '1' : '0');

  const mockRpcResponse = (resultOrError: { result?: string; error?: { code: number; message: string } }) => ({
    ok: true,
    status: 200,
    headers: new Headers({ 'Content-Type': 'application/json' }),
    json: () => Promise.resolve({
      jsonrpc: '2.0',
      id: 1,
      ...(resultOrError.error ? { error: resultOrError.error } : { result: resultOrError.result }),
    }),
  });

  beforeEach(() => {
    vi.stubGlobal('fetch', vi.fn());
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('default (flag off) makes no ERC-165 calls', async () => {
    mockFetch().mockResolvedValue(mockRpcResponse({ result: addressWord(WALLET) }));

    await expect(
      nonStrictClient.contracts.validateRoleRequirement({
        walletAddress: WALLET,
        requirement: { type: 'NFT', address: NFT_CONTRACT, id: '7' },
      }),
    ).resolves.toBe(true);

    // Only 1 RPC call: the ownerOf check
    expect(fetch).toHaveBeenCalledTimes(1);
    const body = JSON.parse(mockFetch().mock.calls[0][1].body as string);
    expect(body.params[0].data).toContain('0x6352211e'); // ownerOf selector
  });

  it('flag ON, ERC-165 contract that supports ERC-721 succeeds', async () => {
    mockFetch()
      // supportsInterface(0x01ffc9a7) → true (ERC-165 itself)
      .mockResolvedValueOnce(mockRpcResponse({ result: boolWord(true) }))
      // supportsInterface(0x80ac58cd) → true (ERC-721)
      .mockResolvedValueOnce(mockRpcResponse({ result: boolWord(true) }))
      // ownerOf(7) → walletAddress
      .mockResolvedValueOnce(mockRpcResponse({ result: addressWord(WALLET) }));

    await expect(
      strictClient.contracts.validateRoleRequirement({
        walletAddress: WALLET,
        requirement: { type: 'NFT', address: NFT_CONTRACT, id: '7' },
      }),
    ).resolves.toBe(true);

    // 3 calls: 2 ERC-165 checks + 1 ownerOf
    expect(fetch).toHaveBeenCalledTimes(3);
  });

  it('flag ON, ERC-165 contract that does NOT support ERC-721 fails closed', async () => {
    mockFetch()
      // supportsInterface(0x01ffc9a7) → true (ERC-165 itself)
      .mockResolvedValueOnce(mockRpcResponse({ result: boolWord(true) }))
      // supportsInterface(0x80ac58cd) → false (NOT ERC-721)
      .mockResolvedValueOnce(mockRpcResponse({ result: boolWord(false) }));

    await expect(
      strictClient.contracts.validateRoleRequirement({
        walletAddress: WALLET,
        requirement: { type: 'NFT', address: NFT_CONTRACT, id: '7' },
      }),
    ).rejects.toMatchObject({
      code: GuildPassErrorCode.INVALID_CONFIG,
      message: expect.stringContaining('does not support the required interface'),
    });

    // Only 2 ERC-165 calls, never reaches ownerOf
    expect(fetch).toHaveBeenCalledTimes(2);
  });

  it('flag ON, non-ERC-165 contract (revert) falls through gracefully', async () => {
    mockFetch()
      // supportsInterface(0x01ffc9a7) → revert (RPC error)
      .mockResolvedValueOnce(mockRpcResponse({ error: { code: -32000, message: 'execution reverted' } }))
      // ownerOf(7) → walletAddress (proceeds normally)
      .mockResolvedValueOnce(mockRpcResponse({ result: addressWord(WALLET) }));

    await expect(
      strictClient.contracts.validateRoleRequirement({
        walletAddress: WALLET,
        requirement: { type: 'NFT', address: NFT_CONTRACT, id: '7' },
      }),
    ).resolves.toBe(true);

    // 2 calls: 1 ERC-165 (revert) + 1 ownerOf
    expect(fetch).toHaveBeenCalledTimes(2);
  });

  it('flag ON, non-ERC-165 contract (returns false for ERC-165) falls through', async () => {
    mockFetch()
      // supportsInterface(0x01ffc9a7) → false (explicitly denies ERC-165)
      .mockResolvedValueOnce(mockRpcResponse({ result: boolWord(false) }))
      // ownerOf(7) → walletAddress (proceeds normally)
      .mockResolvedValueOnce(mockRpcResponse({ result: addressWord(WALLET) }));

    await expect(
      strictClient.contracts.validateRoleRequirement({
        walletAddress: WALLET,
        requirement: { type: 'NFT', address: NFT_CONTRACT, id: '7' },
      }),
    ).resolves.toBe(true);

    expect(fetch).toHaveBeenCalledTimes(2);
  });

  it('flag ON, ROLE requirement fails when contract lacks IAccessControl', async () => {
    mockFetch()
      // supportsInterface(0x01ffc9a7) → true (ERC-165 itself)
      .mockResolvedValueOnce(mockRpcResponse({ result: boolWord(true) }))
      // supportsInterface(0x7965db0b) → false (NOT IAccessControl)
      .mockResolvedValueOnce(mockRpcResponse({ result: boolWord(false) }));

    await expect(
      strictClient.contracts.validateRoleRequirement({
        walletAddress: WALLET,
        requirement: { type: 'ROLE', address: ROLE_CONTRACT, id: 'ADMIN' },
      }),
    ).rejects.toMatchObject({
      code: GuildPassErrorCode.INVALID_CONFIG,
      message: expect.stringContaining('does not support the required interface'),
    });

    expect(fetch).toHaveBeenCalledTimes(2);
  });

  it('flag ON, TOKEN requirement ignores ERC-165 checks (no interface ID)', async () => {
    mockFetch().mockResolvedValue(mockRpcResponse({ result: hexWord((42).toString(16)) }));

    await expect(
      strictClient.contracts.validateRoleRequirement({
        walletAddress: WALLET,
        requirement: { type: 'TOKEN', address: NFT_CONTRACT, minAmount: '1' },
      }),
    ).resolves.toBe(true);

    // Only 1 call: balanceOf — no ERC-165 calls for TOKEN type
    expect(fetch).toHaveBeenCalledTimes(1);
    const body = JSON.parse(mockFetch().mock.calls[0][1].body as string);
    expect(body.params[0].data).toContain('0x70a08231'); // balanceOf selector
  });
});

describe('ContractClient chain resolution', () => {
  it('resolves single-chain config from top-level rpcUrl/contractAddress', () => {
    const client = new GuildPassClient({
      apiUrl: BASE_URL,
      chainId: 1,
      rpcUrl: 'https://rpc.mainnet.example',
      contractAddress: CONTRACT,
    });
    const cfg = client.contracts.getChainConfig();
    expect(cfg.rpcUrl).toBe('https://rpc.mainnet.example');
    expect(cfg.contractAddress).toBe(CONTRACT);
  });

  it('resolves per-chain config from chains map', () => {
    const client = new GuildPassClient({
      apiUrl: BASE_URL,
      chainId: 8453,
      chains: {
        1: { rpcUrl: 'https://rpc.mainnet.example', contractAddress: CONTRACT },
        8453: {
          rpcUrl: 'https://rpc.base.example',
          contractAddress: '0xAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA',
        },
      },
    });
    const cfg = client.contracts.getChainConfig(8453);
    expect(cfg.rpcUrl).toBe('https://rpc.base.example');
    expect(cfg.contractAddress).toBe('0xAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA');
  });

  it('multi-chain: resolves correct config for each chain ID', () => {
    const client = new GuildPassClient({
      apiUrl: BASE_URL,
      chains: {
        1: {
          rpcUrl: 'https://eth.rpc',
          contractAddress: '0x1111111111111111111111111111111111111111',
        },
        137: {
          rpcUrl: 'https://polygon.rpc',
          contractAddress: '0x2222222222222222222222222222222222222222',
        },
      },
    });
    expect(client.contracts.getChainConfig(1).rpcUrl).toBe('https://eth.rpc');
    expect(client.contracts.getChainConfig(137).rpcUrl).toBe('https://polygon.rpc');
  });

  it('throws INVALID_CONFIG for unsupported chain when chains map is set', () => {
    const client = new GuildPassClient({
      apiUrl: BASE_URL,
      chains: {
        1: { rpcUrl: 'https://eth.rpc' },
      },
    });
    expect(() => client.contracts.getChainConfig(999)).toThrow(
      expect.objectContaining({ code: GuildPassErrorCode.INVALID_CONFIG }),
    );
  });

  it('falls back to top-level rpcUrl/contractAddress when no chains map is set', () => {
    const client = new GuildPassClient({ apiUrl: BASE_URL, chainId: 1 });
    const cfg = client.contracts.getChainConfig(1);
    expect(cfg.rpcUrl).toBeUndefined();
    expect(cfg.contractAddress).toBeUndefined();
  });

  it('returns empty config when no chain-related config is set at all', () => {
    const client = new GuildPassClient({ apiUrl: BASE_URL });
    const cfg = client.contracts.getChainConfig();
    expect(cfg.rpcUrl).toBeUndefined();
    expect(cfg.contractAddress).toBeUndefined();
  });
});

// GuildPass SDK: Test suite container block.
describe('ContractClient Batch', () => {
  const client = new GuildPassClient({
    apiUrl: BASE_URL,
    rpcUrl: RPC_URL,
    contractAddress: CONTRACT,
  });

  beforeEach(() => {
    vi.stubGlobal('fetch', vi.fn());
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  // ---------------------------------------------------------------------------
  // batchEthCall
  // ---------------------------------------------------------------------------

  it('should send a JSON-RPC batch request and return ordered results', async () => {
    mockFetch().mockResolvedValue({
      ok: true,
      status: 200,
      json: () =>
        Promise.resolve([
          { jsonrpc: '2.0', id: 1, result: '0x0000000000000000000000000000000000000000000000000000000000000001' },
          { jsonrpc: '2.0', id: 2, result: '0x0000000000000000000000000000000000000000000000000000000000000002' },
        ]),
    });

    const results = await client.contracts.batchEthCall(
      [
        { to: CONTRACT, data: '0x70a08231' + '0'.repeat(64) },
        { to: CONTRACT, data: '0x70a08231' + '0'.repeat(64) },
      ],
      RPC_URL,
    );

    expect(results).toHaveLength(2);
    expect(results[0]).toMatchObject({ status: 'success', result: expect.any(String) });
    expect(results[1]).toMatchObject({ status: 'success', result: expect.any(String) });

    // Verify the batch structure
    const requestBody = JSON.parse(mockFetch().mock.calls[0][1].body as string);
    expect(Array.isArray(requestBody)).toBe(true);
    expect(requestBody).toHaveLength(2);
    expect(requestBody[0].method).toBe('eth_call');
    expect(requestBody[0].id).toBe(1);
    expect(requestBody[1].id).toBe(2);
  });

  it('should preserve input order in batch results', async () => {
    mockFetch().mockResolvedValue({
      ok: true,
      status: 200,
      json: () =>
        Promise.resolve([
          { jsonrpc: '2.0', id: 2, result: '0x00000000000000000000000000000000000000000000000000000000000000bb' },
          { jsonrpc: '2.0', id: 1, result: '0x000000000000000000000000000000000000000000000000000000000000002a' },
        ]),
    });

    const results = await client.contracts.batchEthCall(
      [
        { to: CONTRACT, data: '0x70a08231' + '0'.repeat(64) },
        { to: CONTRACT, data: '0x70a08231' + '0'.repeat(64) },
      ],
      RPC_URL,
    );

    // Input order must be preserved regardless of response order
    expect(results[0].result).toBe('0x000000000000000000000000000000000000000000000000000000000000002a');
    expect(results[1].result).toBe('0x00000000000000000000000000000000000000000000000000000000000000bb');
  });

  it('should report partial failures per item', async () => {
    mockFetch().mockResolvedValue({
      ok: true,
      status: 200,
      json: () =>
        Promise.resolve([
          { jsonrpc: '2.0', id: 1, result: '0x0000000000000000000000000000000000000000000000000000000000000001' },
          { jsonrpc: '2.0', id: 2, error: { code: -32000, message: 'execution reverted' } },
          { jsonrpc: '2.0', id: 3, result: '0x0000000000000000000000000000000000000000000000000000000000000003' },
        ]),
    });

    const results = await client.contracts.batchEthCall(
      [
        { to: CONTRACT, data: '0x70a08231' + '0'.repeat(64) },
        { to: CONTRACT, data: '0x70a08231' + '0'.repeat(64) },
        { to: CONTRACT, data: '0x70a08231' + '0'.repeat(64) },
      ],
      RPC_URL,
    );

    expect(results).toHaveLength(3);
    expect(results[0].status).toBe('success');
    expect(results[1].status).toBe('error');
    expect(results[1].error).toBe('execution reverted');
    expect(results[2].status).toBe('success');
  });

  it('should report missing responses as errors', async () => {
    mockFetch().mockResolvedValue({
      ok: true,
      status: 200,
      json: () =>
        Promise.resolve([
          { jsonrpc: '2.0', id: 1, result: '0x0000000000000000000000000000000000000000000000000000000000000001' },
          // id: 2 is missing from the response
        ]),
    });

    const results = await client.contracts.batchEthCall(
      [
        { to: CONTRACT, data: '0x70a08231' + '0'.repeat(64) },
        { to: CONTRACT, data: '0x70a08231' + '0'.repeat(64) },
      ],
      RPC_URL,
    );

    expect(results[0].status).toBe('success');
    expect(results[1].status).toBe('error');
    expect(results[1].error).toContain('No response');
  });

  it('should reject empty calls array', async () => {
    await expect(
      client.contracts.batchEthCall([], RPC_URL),
    ).rejects.toMatchObject({
      code: GuildPassErrorCode.INVALID_INPUT,
    });
    expect(fetch).not.toHaveBeenCalled();
  });

  it('should reject missing rpcUrl for batchEthCall', async () => {
    await expect(
      client.contracts.batchEthCall([{ to: CONTRACT, data: '0x' }], ''),
    ).rejects.toMatchObject({
      code: GuildPassErrorCode.INVALID_CONFIG,
    });
    expect(fetch).not.toHaveBeenCalled();
  });

  it('should reject invalid call.to address', async () => {
    await expect(
      client.contracts.batchEthCall([{ to: 'not-an-address', data: '0x' }], RPC_URL),
    ).rejects.toMatchObject({
      code: GuildPassErrorCode.INVALID_ADDRESS,
    });
    expect(fetch).not.toHaveBeenCalled();
  });

  it('should throw HTTP_ERROR on non-ok batch response', async () => {
    mockFetch().mockResolvedValue({
      ok: false,
      status: 500,
      json: () => Promise.resolve({ message: 'Internal Server Error' }),
    });

    await expect(
      client.contracts.batchEthCall([{ to: CONTRACT, data: '0x70a08231' + '0'.repeat(64) }], RPC_URL),
    ).rejects.toMatchObject({
      code: GuildPassErrorCode.SERVER_ERROR,
    });
  });

  it('should reject non-array batch response', async () => {
    mockFetch().mockResolvedValue({
      ok: true,
      status: 200,
      json: () => Promise.resolve({ result: 'single' }),
    });

    await expect(
      client.contracts.batchEthCall([{ to: CONTRACT, data: '0x70a08231' + '0'.repeat(64) }], RPC_URL),
    ).rejects.toMatchObject({
      code: GuildPassErrorCode.INVALID_RESPONSE,
    });
  });

  it('should reject requests exceeding maxBatchSize when chunking is disabled', async () => {
    const calls = Array(101).fill({ to: CONTRACT, data: '0x70a08231' + '0'.repeat(64) });
    await expect(
      client.contracts.batchEthCall(calls, RPC_URL),
    ).rejects.toMatchObject({
      code: GuildPassErrorCode.INVALID_INPUT,
      message: expect.stringContaining('exceeds maxBatchSize 100'),
    });
    expect(fetch).not.toHaveBeenCalled();
  });

  it('should split requests into chunks when chunk: true is provided', async () => {
    mockFetch()
      .mockResolvedValueOnce({
        ok: true,
        status: 200,
        json: () =>
          Promise.resolve([
            { jsonrpc: '2.0', id: 1, result: '0x0000000000000000000000000000000000000000000000000000000000000001' },
            { jsonrpc: '2.0', id: 2, result: '0x0000000000000000000000000000000000000000000000000000000000000002' },
          ]),
      })
      .mockResolvedValueOnce({
        ok: true,
        status: 200,
        json: () =>
          Promise.resolve([
            { jsonrpc: '2.0', id: 1, result: '0x0000000000000000000000000000000000000000000000000000000000000003' },
          ]),
      });

    const calls = Array(3).fill({ to: CONTRACT, data: '0x70a08231' + '0'.repeat(64) });
    const results = await client.contracts.batchEthCall(calls, RPC_URL, { maxBatchSize: 2, chunk: true });

    expect(results).toHaveLength(3);
    expect(results[0].result).toContain('1');
    expect(results[1].result).toContain('2');
    expect(results[2].result).toContain('3');

    expect(fetch).toHaveBeenCalledTimes(2);

    const request1 = JSON.parse(mockFetch().mock.calls[0][1].body as string);
    const request2 = JSON.parse(mockFetch().mock.calls[1][1].body as string);

    expect(request1).toHaveLength(2);
    expect(request1[0].id).toBe(1);
    expect(request1[1].id).toBe(2);

    expect(request2).toHaveLength(1);
    expect(request2[0].id).toBe(1);
  });

  // ---------------------------------------------------------------------------
  // getMembershipTokenBalancesBatch
  // ---------------------------------------------------------------------------

  const WALLET_A = '0x1111111111111111111111111111111111111111';
  const WALLET_B = '0x2222222222222222222222222222222222222222';
  const WALLET_C = '0x3333333333333333333333333333333333333333';

  it('should batch membership token balances preserving order', async () => {
    mockFetch().mockResolvedValue({
      ok: true,
      status: 200,
      json: () =>
        Promise.resolve([
          { jsonrpc: '2.0', id: 1, result: '0x000000000000000000000000000000000000000000000000000000000000000a' },
          { jsonrpc: '2.0', id: 2, result: '0x0000000000000000000000000000000000000000000000000000000000000000' },
          { jsonrpc: '2.0', id: 3, result: '0x000000000000000000000000000000000000000000000000000000000000002a' },
        ]),
    });

    const results = await client.contracts.getMembershipTokenBalancesBatch({
      walletAddresses: [WALLET_A, WALLET_B, WALLET_C],
    });

    expect(results).toHaveLength(3);
    expect(results[0]).toMatchObject({ status: 'success', result: '10' });
    expect(results[1]).toMatchObject({ status: 'success', result: '0' });
    expect(results[2]).toMatchObject({ status: 'success', result: '42' });
  });

  it('should handle partial RPC failures in balance batch', async () => {
    mockFetch().mockResolvedValue({
      ok: true,
      status: 200,
      json: () =>
        Promise.resolve([
          { jsonrpc: '2.0', id: 1, result: '0x0000000000000000000000000000000000000000000000000000000000000005' },
          { jsonrpc: '2.0', id: 2, error: { code: -32000, message: 'execution reverted' } },
        ]),
    });

    const results = await client.contracts.getMembershipTokenBalancesBatch({
      walletAddresses: [WALLET_A, WALLET_B],
    });

    expect(results).toHaveLength(2);
    expect(results[0]).toMatchObject({ status: 'success', result: '5' });
    expect(results[1]).toMatchObject({ status: 'error', error: 'execution reverted' });
  });

  it('should validate all wallet addresses before making the batch request', async () => {
    await expect(
      client.contracts.getMembershipTokenBalancesBatch({
        walletAddresses: [WALLET_A, 'not-an-address'],
      }),
    ).rejects.toMatchObject({
      code: GuildPassErrorCode.INVALID_ADDRESS,
    });
    expect(fetch).not.toHaveBeenCalled();
  });

  it('should reject empty wallet addresses array', async () => {
    await expect(
      client.contracts.getMembershipTokenBalancesBatch({
        walletAddresses: [],
      }),
    ).rejects.toMatchObject({
      code: GuildPassErrorCode.INVALID_INPUT,
    });
    expect(fetch).not.toHaveBeenCalled();
  });

  it('should use per-chain config for balance batch', async () => {
    const chainClient = new GuildPassClient({
      apiUrl: BASE_URL,
      chains: {
        8453: {
          rpcUrl: 'https://base.rpc',
          contractAddress: '0x2222222222222222222222222222222222222222',
        },
      },
    });
    mockFetch().mockResolvedValue({
      ok: true,
      status: 200,
      json: () =>
        Promise.resolve([
          { jsonrpc: '2.0', id: 1, result: '0x0000000000000000000000000000000000000000000000000000000000000001' },
        ]),
    });

    await chainClient.contracts.getMembershipTokenBalancesBatch({
      walletAddresses: [WALLET_A],
      chainId: 8453,
    });

    const requestBody = JSON.parse(mockFetch().mock.calls[0][1].body as string);
    expect(fetch).toHaveBeenCalledWith(expect.stringMatching(/^https:\/\/base\.rpc\/?$/), expect.any(Object));
    expect(requestBody[0].params[0].to).toBe('0x2222222222222222222222222222222222222222');
  });

  it('should support per-call contract override in balance batch', async () => {
    const overrideContract = '0x4444444444444444444444444444444444444444';
    mockFetch().mockResolvedValue({
      ok: true,
      status: 200,
      json: () =>
        Promise.resolve([
          { jsonrpc: '2.0', id: 1, result: '0x0000000000000000000000000000000000000000000000000000000000000001' },
        ]),
    });

    await client.contracts.getMembershipTokenBalancesBatch({
      walletAddresses: [WALLET_A],
      contractAddress: overrideContract,
    });

    const requestBody = JSON.parse(mockFetch().mock.calls[0][1].body as string);
    expect(requestBody[0].params[0].to).toBe(overrideContract);
  });

  it('should reject oversized balance batch when chunking is disabled', async () => {
    const wallets = Array(101)
      .fill(null)
      .map((_, i) => `0x${(i + 1).toString(16).padStart(40, '0')}`);

    await expect(
      client.contracts.getMembershipTokenBalancesBatch({
        walletAddresses: wallets,
      }),
    ).rejects.toMatchObject({
      code: GuildPassErrorCode.INVALID_INPUT,
      message: expect.stringContaining('exceeds maxBatchSize'),
    });
    expect(fetch).not.toHaveBeenCalled();
  });

  it('should chunk balance batch when chunk: true is set', async () => {
    mockFetch()
      .mockResolvedValueOnce({
        ok: true,
        status: 200,
        json: () =>
          Promise.resolve([
            { jsonrpc: '2.0', id: 1, result: '0x000000000000000000000000000000000000000000000000000000000000000a' },
            { jsonrpc: '2.0', id: 2, result: '0x0000000000000000000000000000000000000000000000000000000000000014' },
          ]),
      })
      .mockResolvedValueOnce({
        ok: true,
        status: 200,
        json: () =>
          Promise.resolve([
            { jsonrpc: '2.0', id: 1, result: '0x000000000000000000000000000000000000000000000000000000000000001e' },
          ]),
      });

    const results = await client.contracts.getMembershipTokenBalancesBatch({
      walletAddresses: [WALLET_A, WALLET_B, WALLET_C],
      maxBatchSize: 2,
      chunk: true,
    });

    expect(results).toHaveLength(3);
    expect(results[0]).toMatchObject({ status: 'success', result: '10' });
    expect(results[1]).toMatchObject({ status: 'success', result: '20' });
    expect(results[2]).toMatchObject({ status: 'success', result: '30' });
    expect(fetch).toHaveBeenCalledTimes(2);
  });

  it('should isolate per-item errors across chunked balance batches', async () => {
    mockFetch()
      .mockResolvedValueOnce({
        ok: true,
        status: 200,
        json: () =>
          Promise.resolve([
            { jsonrpc: '2.0', id: 1, result: '0x000000000000000000000000000000000000000000000000000000000000000a' },
            { jsonrpc: '2.0', id: 2, error: { code: -32000, message: 'execution reverted' } },
          ]),
      })
      .mockResolvedValueOnce({
        ok: true,
        status: 200,
        json: () =>
          Promise.resolve([
            { jsonrpc: '2.0', id: 1, result: '0x000000000000000000000000000000000000000000000000000000000000001e' },
          ]),
      });

    const results = await client.contracts.getMembershipTokenBalancesBatch({
      walletAddresses: [WALLET_A, WALLET_B, WALLET_C],
      maxBatchSize: 2,
      chunk: true,
    });

    expect(results).toHaveLength(3);
    expect(results[0]).toMatchObject({ status: 'success', result: '10' });
    expect(results[1]).toMatchObject({ status: 'error', error: 'execution reverted' });
    expect(results[2]).toMatchObject({ status: 'success', result: '30' });
  });

  // ---------------------------------------------------------------------------
  // getGuildOwnersBatch
  // ---------------------------------------------------------------------------

  it('should batch guild owner lookups preserving order', async () => {
    mockFetch().mockResolvedValue({
      ok: true,
      status: 200,
      json: () =>
        Promise.resolve([
          { jsonrpc: '2.0', id: 1, result: `0x000000000000000000000000${OWNER.slice(2)}` },
          { jsonrpc: '2.0', id: 2, result: `0x000000000000000000000000${WALLET_A.slice(2)}` },
        ]),
    });

    const results = await client.contracts.getGuildOwnersBatch({
      guildIds: ['guild_1', 'guild_2'],
    });

    expect(results).toHaveLength(2);
    expect(results[0]).toMatchObject({ status: 'success', result: OWNER });
    expect(results[1]).toMatchObject({ status: 'success', result: WALLET_A });
  });

  it('should handle partial RPC failures in guild owner batch', async () => {
    mockFetch().mockResolvedValue({
      ok: true,
      status: 200,
      json: () =>
        Promise.resolve([
          { jsonrpc: '2.0', id: 1, result: `0x000000000000000000000000${OWNER.slice(2)}` },
          { jsonrpc: '2.0', id: 2, error: { code: -32000, message: 'execution reverted' } },
        ]),
    });

    const results = await client.contracts.getGuildOwnersBatch({
      guildIds: ['guild_1', 'guild_2'],
    });

    expect(results).toHaveLength(2);
    expect(results[0]).toMatchObject({ status: 'success', result: OWNER });
    expect(results[1]).toMatchObject({ status: 'error', error: 'execution reverted' });
  });

  it('should validate all guild IDs before making the batch request', async () => {
    await expect(
      client.contracts.getGuildOwnersBatch({
        guildIds: ['guild_1', ''],
      }),
    ).rejects.toMatchObject({
      code: GuildPassErrorCode.INVALID_INPUT,
    });
    expect(fetch).not.toHaveBeenCalled();
  });

  it('should reject empty guild IDs array', async () => {
    await expect(
      client.contracts.getGuildOwnersBatch({
        guildIds: [],
      }),
    ).rejects.toMatchObject({
      code: GuildPassErrorCode.INVALID_INPUT,
    });
    expect(fetch).not.toHaveBeenCalled();
  });
  it('should chunk guild owner batch when chunk: true is set', async () => {
    mockFetch()
      .mockResolvedValueOnce({
        ok: true,
        status: 200,
        json: () =>
          Promise.resolve([
            { jsonrpc: '2.0', id: 1, result: `0x000000000000000000000000${OWNER.slice(2)}` },
          ]),
      })
      .mockResolvedValueOnce({
        ok: true,
        status: 200,
        json: () =>
          Promise.resolve([
            { jsonrpc: '2.0', id: 1, result: `0x000000000000000000000000${WALLET_A.slice(2)}` },
          ]),
      });

    const results = await client.contracts.getGuildOwnersBatch({
      guildIds: ['guild_1', 'guild_2'],
      maxBatchSize: 1,
      chunk: true,
    });

    expect(results).toHaveLength(2);
    expect(results[0]).toMatchObject({ status: 'success', result: OWNER });
    expect(results[1]).toMatchObject({ status: 'success', result: WALLET_A });
    expect(fetch).toHaveBeenCalledTimes(2);
  });

  it('should report malformed individual results as errors', async () => {
    mockFetch().mockResolvedValue({
      ok: true,
      status: 200,
      json: () =>
        Promise.resolve([
          { jsonrpc: '2.0', id: 1, result: '0x1234' }, // too short for address
        ]),
    });

    const results = await client.contracts.getGuildOwnersBatch({
      guildIds: ['guild_1'],
    });

    expect(results).toHaveLength(1);
    expect(results[0].status).toBe('error');
    expect(results[0].error).toBe('Failed to decode guild owner result');
  });

  it('should use per-chain config for guild owner batch', async () => {
    const chainClient = new GuildPassClient({
      apiUrl: BASE_URL,
      chains: {
        8453: {
          rpcUrl: 'https://base.rpc',
          contractAddress: '0x2222222222222222222222222222222222222222',
        },
      },
    });
    mockFetch().mockResolvedValue({
      ok: true,
      status: 200,
      json: () =>
        Promise.resolve([
          { jsonrpc: '2.0', id: 1, result: `0x000000000000000000000000${OWNER.slice(2)}` },
        ]),
    });

    await chainClient.contracts.getGuildOwnersBatch({
      guildIds: ['guild_1'],
      chainId: 8453,
    });

    expect(fetch).toHaveBeenCalledWith(expect.stringMatching(/^https:\/\/base\.rpc\/?$/), expect.any(Object));
  });

  it('should use custom fetch transport in batchEthCall', async () => {
    const customFetch = vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      headers: new Headers({ 'Content-Type': 'application/json' }),
      json: () =>
        Promise.resolve([
          { jsonrpc: '2.0', id: 1, result: '0x0000000000000000000000000000000000000000000000000000000000000001' },
        ]),
    });

    const customClient = new GuildPassClient({
      apiUrl: BASE_URL,
      rpcUrl: RPC_URL,
      contractAddress: CONTRACT,
      fetch: customFetch,
    });

    const results = await customClient.contracts.batchEthCall(
      [{ to: CONTRACT, data: '0x70a08231' + '0'.repeat(64) }],
      RPC_URL,
    );

    expect(results).toHaveLength(1);
    expect(results[0].status).toBe('success');
    expect(customFetch).toHaveBeenCalledTimes(1);
    expect(mockFetch()).not.toHaveBeenCalled();
  });

  it('should support configurable timeout behaviour in batch calls', async () => {
    mockFetch().mockImplementation(
      (_, init) =>
        new Promise((resolve, reject) => {
          if (init?.signal) {
            init.signal.addEventListener('abort', () => {
              const error = new Error('Aborted');
              error.name = 'AbortError';
              reject(error);
            });
          }
        }),
    );

    const promise = client.contracts.batchEthCall(
      [{ to: CONTRACT, data: '0x70a08231' + '0'.repeat(64) }],
      RPC_URL,
      { timeoutMs: 100 },
    );

    await expect(promise).rejects.toMatchObject({
      code: GuildPassErrorCode.TIMEOUT,
      message: expect.stringContaining('timed out after 100ms'),
    });
  });

  it('should support external abort signals in batch calls', async () => {
    const controller = new AbortController();
    controller.abort();

    const promise = client.contracts.batchEthCall(
      [{ to: CONTRACT, data: '0x70a08231' + '0'.repeat(64) }],
      RPC_URL,
      { signal: controller.signal },
    );

    await expect(promise).rejects.toMatchObject({
      code: GuildPassErrorCode.REQUEST_CANCELLED,
      message: 'Request cancelled by caller',
    });
  });

  it('should retry transient RPC failures in batch calls when configured', async () => {
    mockFetch()
      .mockResolvedValueOnce({
        ok: false,
        status: 502,
        headers: new Headers(),
        json: () => Promise.resolve({ error: { message: 'Bad Gateway' } }),
      })
      .mockResolvedValueOnce({
        ok: true,
        status: 200,
        headers: new Headers({ 'Content-Type': 'application/json' }),
        json: () =>
          Promise.resolve([
            { jsonrpc: '2.0', id: 1, result: '0x0000000000000000000000000000000000000000000000000000000000000001' },
          ]),
      });

    const results = await client.contracts.batchEthCall(
      [{ to: CONTRACT, data: '0x70a08231' + '0'.repeat(64) }],
      RPC_URL,
      { retry: { maxRetries: 1, baseDelayMs: 10 } },
    );

    expect(results).toHaveLength(1);
    expect(results[0].status).toBe('success');
    expect(fetch).toHaveBeenCalledTimes(2);
  });
});

// ---------------------------------------------------------------------------
// Contract selector, encoding, and decoding unit tests
// ---------------------------------------------------------------------------
describe('Contract Selectors', () => {
  it('balanceOf(address) selector matches the hard-coded constant', () => {
    // keccak256('balanceOf(address)') first 4 bytes = 0x70a08231
    expect(BALANCE_OF_SELECTOR).toBe(contractEncodingFixtures.selectors.balanceOf.selector);
    expect(BALANCE_OF_SELECTOR).toBe('0x70a08231');
  });

  it('getGuildOwner(bytes32) selector matches the hard-coded constant', () => {
    // keccak256('getGuildOwner(bytes32)') first 4 bytes = 0xab4511dc
    expect(GET_GUILD_OWNER_SELECTOR).toBe(contractEncodingFixtures.selectors.getGuildOwner.selector);
    expect(GET_GUILD_OWNER_SELECTOR).toBe('0xab4511dc');
  });
});

describe('Address Argument Encoding', () => {
  it.each(contractEncodingFixtures.encodedAddressArguments)(
    'pads $address to 32 bytes: $encoded',
    ({ address, encoded }) => {
      expect(encodeAddressArgument(address)).toBe(encoded);
    },
  );

  it('produces consistent full calldata for balanceOf calls', () => {
    for (const fixture of contractEncodingFixtures.fullCalldata) {
      if (fixture.method !== 'balanceOf') continue;
      if (!fixture.params.walletAddress) {
        throw new Error('balanceOf calldata fixture must include walletAddress');
      }
      const encoded = `${BALANCE_OF_SELECTOR}${encodeAddressArgument(fixture.params.walletAddress)}`;
      expect(encoded).toBe(fixture.calldata);
    }
  });
});

describe('Guild ID Encoding', () => {
  it.each(contractEncodingFixtures.encodedGuildIds)(
    'encodes guild ID "$guildId" as $encoded',
    ({ guildId, encoded }) => {
      expect(encodeGuildId(guildId)).toBe(encoded);
    },
  );

  it('rejects oversized numeric guild IDs', () => {
    const largeId = '0x' + 'f'.repeat(65); // 65 hex chars > 32 bytes
    expect(() => encodeGuildId(largeId)).toThrow(
      expect.objectContaining({ code: GuildPassErrorCode.INVALID_INPUT }),
    );
  });

  it('rejects guild IDs exceeding 32 UTF-8 bytes', () => {
    const longString = 'x'.repeat(33);
    expect(() => encodeGuildId(longString)).toThrow(
      expect.objectContaining({ code: GuildPassErrorCode.INVALID_INPUT }),
    );
  });

  it('produces consistent full calldata for getGuildOwner calls', () => {
    for (const fixture of contractEncodingFixtures.fullCalldata) {
      if (fixture.method !== 'getGuildOwner') continue;
      if (!fixture.params.guildId) {
        throw new Error('getGuildOwner calldata fixture must include guildId');
      }
      const encoded = `${GET_GUILD_OWNER_SELECTOR}${encodeGuildId(fixture.params.guildId)}`;
      expect(encoded).toBe(fixture.calldata);
    }
  });
});

describe('Address Result Decoding', () => {
  it.each(
    contractEncodingFixtures.validDecodedResponses
      .filter((r) => r.type === 'address')
      .map((r) => [r.description, r.rawHex, r.expected] as const),
  )('decodes valid address response: %s', (_, rawHex, expected) => {
    expect(decodeAddressResult(rawHex)).toBe(expected);
  });

  it.each(
    contractEncodingFixtures.malformedResponses.map((r) => [r.description, r.value] as const),
  )('throws INVALID_RESPONSE for malformed input: %s', (_, value) => {
    expect(() => decodeAddressResult(value)).toThrow(
      expect.objectContaining({ code: GuildPassErrorCode.INVALID_RESPONSE }),
    );
  });

  it('throws INVALID_RESPONSE when decoded result has non-hex characters', () => {
    expect(() => decodeAddressResult('0x' + 'z'.repeat(64))).toThrow(
      expect.objectContaining({ code: GuildPassErrorCode.INVALID_RESPONSE }),
    );
  });
});

describe('Uint256 Result Decoding', () => {
  it.each(
    contractEncodingFixtures.validDecodedResponses
      .filter((r) => r.type === 'uint256')
      .map((r) => [r.description, r.rawHex, r.expected] as const),
  )('decodes valid uint256 response: %s', (_, rawHex, expected) => {
    expect(decodeUint256Result(rawHex)).toBe(expected);
  });

  it.each(
    contractEncodingFixtures.malformedResponses.map((r) => [r.description, r.value] as const),
  )('throws INVALID_RESPONSE for malformed input: %s', (_, value) => {
    expect(() => decodeUint256Result(value)).toThrow(
      expect.objectContaining({ code: GuildPassErrorCode.INVALID_RESPONSE }),
    );
  });
});

describe('JSON-RPC Error Mapping', () => {
  it.each(contractEncodingFixtures.rpcErrorPayloads)(
    'maps RPC error "$expectedMessage" to GuildPassError with code $expectedCode',
    ({ payload, expectedCode, expectedMessage }) => {
      const error = new GuildPassError(
        payload.message,
        GuildPassErrorCode.HTTP_ERROR,
        undefined,
        payload,
      );
      expect(error).toBeInstanceOf(GuildPassError);
      expect(error.code).toBe(expectedCode);
      expect(error.message).toBe(expectedMessage);
    },
  );
});
