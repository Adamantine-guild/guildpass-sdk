import { beforeEach, describe, expect, it, vi } from 'vitest';
import { GuildPassClient } from '../src/client/GuildPassClient';
import { MULTICALL3_ADDRESS } from '../src/contracts/providers/adaptive.types';
import { GuildPassErrorCode } from '../src/errors/errorCodes';

const BASE_URL = 'https://api.test.com';
const RPC_URL = 'https://rpc.test.com';
const CONTRACT = '0x1111111111111111111111111111111111111111';
const WALLET_1 = '0x2222222222222222222222222222222222222222';
const WALLET_2 = '0x3333333333333333333333333333333333333333';

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

describe('Multicall3ContractProvider and aggregate3', () => {
  it('correctly batch-calls using Multicall3 aggregate3 with all successful responses', async () => {
    const fetchMock = vi.fn().mockImplementation(async () => {
      // Return a simulated Result[] array of two items:
      // Result 1: success=true, returnData=0x0000000000000000000000000000000000000000000000000000000000000005 (uint256 5)
      // Result 2: success=true, returnData=0x000000000000000000000000000000000000000000000000000000000000000a (uint256 10)
      //
      // ABI encoding format for Result[] output:
      // Offset of array: 32 (0x20)
      // Length of array: 2
      // Element 0 offset (from array start): 64 (0x40)
      // Element 1 offset (from array start): 192 (0xc0)
      // Element 0 struct:
      //   success: 1
      //   returnData offset (from struct start): 64 (0x40)
      //   returnData length: 32 (0x20)
      //   returnData bytes: uint256 5
      // Element 1 struct:
      //   success: 1
      //   returnData offset (from struct start): 64 (0x40)
      //   returnData length: 32 (0x20)
      //   returnData bytes: uint256 10

      const mockResultHex =
        '0x' +
        // Array offset:
        '0000000000000000000000000000000000000000000000000000000000000020' +
        // Array length:
        '0000000000000000000000000000000000000000000000000000000000000002' +
        // Element offsets (points to Word 4 and Word 8 relative to Word 2):
        '0000000000000000000000000000000000000000000000000000000000000040' +
        '00000000000000000000000000000000000000000000000000000000000000c0' +
        // Element 0 (Word 4):
        '0000000000000000000000000000000000000000000000000000000000000001' + // success=true
        '0000000000000000000000000000000000000000000000000000000000000040' + // offset to returnData
        '0000000000000000000000000000000000000000000000000000000000000020' + // length of returnData (32 bytes)
        '0000000000000000000000000000000000000000000000000000000000000005' + // data: 5
        // Element 1 (Word 8):
        '0000000000000000000000000000000000000000000000000000000000000001' + // success=true
        '0000000000000000000000000000000000000000000000000000000000000040' + // offset to returnData
        '0000000000000000000000000000000000000000000000000000000000000020' + // length of returnData (32 bytes)
        '000000000000000000000000000000000000000000000000000000000000000a'; // data: 10

      return rpcResponse(mockResultHex);
    });
    vi.stubGlobal('fetch', fetchMock);

    const client = new GuildPassClient({
      apiUrl: BASE_URL,
      rpcUrl: RPC_URL,
      contractAddress: CONTRACT,
      batchStrategy: 'multicall3',
    });

    const results = await client.contracts.getMembershipTokenBalancesBatch({
      walletAddresses: [WALLET_1, WALLET_2],
    });

    expect(results).toEqual([
      { status: 'success', result: '5' },
      { status: 'success', result: '10' },
    ]);

    // Verify it sent a single fetch call to Multicall3 contract
    expect(fetchMock).toHaveBeenCalledTimes(1);
    const callArgs = fetchMock.mock.calls[0];
    const postBody = JSON.parse(callArgs[1].body);
    expect(postBody.method).toBe('eth_call');
    expect(postBody.params[0].to).toBe(MULTICALL3_ADDRESS);
    // starts with aggregate3 selector
    expect(postBody.params[0].data.startsWith('0x82ad56cb')).toBe(true);
  });

  it('correctly maps partial-failures (when one call reverts) and decodes error message', async () => {
    const fetchMock = vi.fn().mockImplementation(async () => {
      // Element 0: success=true, returnData = 5
      // Element 1: success=false, returnData = Revert "Insufficient balance"
      // Revert reason is encoded as Error(string) selector: 08c379a0
      // 08c379a0 + offset(0x20) + length(0x14 = 20) + "Insufficient balance" (right padded)
      // "Insufficient balance" in hex = 496e73756666696369656e742062616c616e6365
      const revertHex =
        '08c379a0' +
        '0000000000000000000000000000000000000000000000000000000000000020' +
        '0000000000000000000000000000000000000000000000000000000000000014' +
        '496e73756666696369656e742062616c616e6365'.padEnd(64, '0');

      const mockResultHex =
        '0x' +
        // Array offset:
        '0000000000000000000000000000000000000000000000000000000000000020' +
        // Array length:
        '0000000000000000000000000000000000000000000000000000000000000002' +
        // Element offsets (points to Word 4 and Word 8 relative to Word 2):
        '0000000000000000000000000000000000000000000000000000000000000040' +
        '00000000000000000000000000000000000000000000000000000000000000c0' +
        // Element 0 (Word 4):
        '0000000000000000000000000000000000000000000000000000000000000001' + // success=true
        '0000000000000000000000000000000000000000000000000000000000000040' + // offset to returnData
        '0000000000000000000000000000000000000000000000000000000000000020' + // length of returnData (32 bytes)
        '0000000000000000000000000000000000000000000000000000000000000005' + // data: 5
        // Element 1 (Word 8):
        '0000000000000000000000000000000000000000000000000000000000000000' + // success=false
        '0000000000000000000000000000000000000000000000000000000000000040' + // offset to returnData
        '0000000000000000000000000000000000000000000000000000000000000064' + // length of returnData (100 bytes = 0x64)
        revertHex;

      return rpcResponse(mockResultHex);
    });
    vi.stubGlobal('fetch', fetchMock);

    const client = new GuildPassClient({
      apiUrl: BASE_URL,
      rpcUrl: RPC_URL,
      contractAddress: CONTRACT,
      batchStrategy: 'multicall3',
    });

    const results = await client.contracts.getMembershipTokenBalancesBatch({
      walletAddresses: [WALLET_1, WALLET_2],
    });

    expect(results).toEqual([
      { status: 'success', result: '5' },
      {
        status: 'error',
        error: 'Reverted: Insufficient balance',
        code: GuildPassErrorCode.HTTP_ERROR,
      },
    ]);
  });

  it('allows overriding multicall3Address in ChainConfig', async () => {
    const fetchMock = vi.fn().mockImplementation(async () => {
      // Empty Result[] array
      const mockResultHex =
        '0x' +
        '0000000000000000000000000000000000000000000000000000000000000020' +
        '0000000000000000000000000000000000000000000000000000000000000000';
      return rpcResponse(mockResultHex);
    });
    vi.stubGlobal('fetch', fetchMock);

    const CUSTOM_MULTICALL = '0x9999999999999999999999999999999999999999';

    const client = new GuildPassClient({
      apiUrl: BASE_URL,
      rpcUrl: RPC_URL,
      contractAddress: CONTRACT,
      batchStrategy: 'multicall3',
      chains: {
        1: {
          rpcUrl: RPC_URL,
          contractAddress: CONTRACT,
          multicallAddress: CUSTOM_MULTICALL,
        },
      },
      chainId: 1,
    });

    await client.contracts.getMembershipTokenBalancesBatch({
      walletAddresses: [WALLET_1],
    });

    // Verify it sent call to custom multicall Address
    const callArgs = fetchMock.mock.calls[0];
    const postBody = JSON.parse(callArgs[1].body);
    expect(postBody.params[0].to).toBe(CUSTOM_MULTICALL);
  });
});
