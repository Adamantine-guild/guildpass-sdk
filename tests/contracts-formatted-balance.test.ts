import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { GuildPassClient } from '../src/client/GuildPassClient';
import { GuildPassErrorCode } from '../src/errors/errorCodes';
import {
  BALANCE_OF_SELECTOR,
  DECIMALS_SELECTOR,
  formatUnits,
  parseUnits,
} from '../src/contracts/contractClient';

const WALLET = '0x1234567890123456789012345678901234567890';
const CONTRACT = '0x0000000000000000000000000000000000000000';
const RPC_URL = 'https://rpc.test.com';

const mockFetch = (): ReturnType<typeof vi.fn> => fetch as unknown as ReturnType<typeof vi.fn>;
const toWord = (n: bigint): string => `0x${n.toString(16).padStart(64, '0')}`;

// Mock the RPC so balanceOf and decimals() each return a chosen value, keyed by
// the call selector (getMembershipTokenBalanceFormatted fires both in parallel).
function mockRpc(balanceBaseUnits: bigint, decimals: number): void {
  mockFetch().mockImplementation((_url: string, init: { body: string }) => {
    const body = JSON.parse(init.body);
    const data: string = body.params[0].data;
    let result: string;
    if (data.startsWith(DECIMALS_SELECTOR)) {
      result = toWord(BigInt(decimals));
    } else if (data.startsWith(BALANCE_OF_SELECTOR)) {
      result = toWord(balanceBaseUnits);
    } else {
      throw new Error(`unexpected call data: ${data}`);
    }
    return Promise.resolve({
      ok: true,
      status: 200,
      headers: new Headers({ 'Content-Type': 'application/json' }),
      json: () => Promise.resolve({ jsonrpc: '2.0', id: 1, result }),
    });
  });
}

describe('formatUnits', () => {
  it('shifts the decimal point with exact string math', () => {
    expect(formatUnits('1500000', 6)).toBe('1.5');
    expect(formatUnits('250', 6)).toBe('0.00025');
    expect(formatUnits('1000000', 6)).toBe('1');
    expect(formatUnits('0', 18)).toBe('0');
    expect(formatUnits('123', 0)).toBe('123');
  });

  it('keeps full precision for balances beyond Number.MAX_SAFE_INTEGER', () => {
    // 12,345,678,901,234,567,890 base units / 1e18
    expect(formatUnits('12345678901234567890', 18)).toBe('12.34567890123456789');
  });

  it('rejects non-integer input and negative decimals', () => {
    expect(() => formatUnits('1.5', 6)).toThrow();
    expect(() => formatUnits('abc', 6)).toThrow();
    expect(() => formatUnits('100', -1)).toThrow();
  });
});

describe('parseUnits', () => {
  it('is the exact inverse of formatUnits (round-trip)', () => {
    const cases: [string, number][] = [
      ['1500000', 6],
      ['250', 6],
      ['1000000', 6],
      ['0', 18],
      ['123', 0],
      ['12345678901234567890', 18],
      ['1', 18],
      ['999999999999999999', 18],
      ['1000000000000000000', 18],
    ];
    for (const [raw, d] of cases) {
      expect(parseUnits(formatUnits(raw, d), d)).toBe(raw);
    }
  });

  it('converts a decimal string to base units', () => {
    expect(parseUnits('1.5', 6)).toBe('1500000');
    expect(parseUnits('1', 18)).toBe('1000000000000000000');
    expect(parseUnits('0.00025', 6)).toBe('250');
    expect(parseUnits('123', 0)).toBe('123');
    expect(parseUnits('0', 18)).toBe('0');
  });

  it('handles integer input without a decimal point', () => {
    expect(parseUnits('100', 6)).toBe('100000000');
    expect(parseUnits('1', 0)).toBe('1');
  });

  it('strips leading zeros from the whole part', () => {
    expect(parseUnits('00.5', 6)).toBe('500000');
  });

  it('rejects malformed input', () => {
    expect(() => parseUnits('abc', 6)).toThrow();
    expect(() => parseUnits('1.2.3', 6)).toThrow();
    expect(() => parseUnits('', 6)).toThrow();
  });

  it('rejects excess fractional precision', () => {
    expect(() => parseUnits('1.123', 2)).toThrow();
    expect(() => parseUnits('0.12345', 3)).toThrow();
  });

  it('rejects negative or non-integer decimals', () => {
    expect(() => parseUnits('1', -1)).toThrow();
    expect(() => parseUnits('1', 1.5)).toThrow();
  });
});

describe('ContractClient token metadata', () => {
  let client: GuildPassClient;

  beforeEach(() => {
    // Stub `fetch` before constructing the client: `FetchTransport`'s default
    // parameter captures `globalThis.fetch` once, at construction time, so a
    // client built before the stub is in place keeps using the real fetch.
    vi.stubGlobal('fetch', vi.fn());
    client = new GuildPassClient({
      apiUrl: 'https://api.test.com',
      rpcUrl: RPC_URL,
      contractAddress: CONTRACT,
    });
  });
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('getTokenDecimals reads decimals() via eth_call', async () => {
    mockRpc(0n, 8);
    const decimals = await client.contracts.getTokenDecimals({ walletAddress: WALLET });
    expect(decimals).toBe(8);
  });

  it('getMembershipTokenBalanceFormatted returns raw, decimals and formatted', async () => {
    mockRpc(1500000n, 6);
    const result = await client.contracts.getMembershipTokenBalanceFormatted({
      walletAddress: WALLET,
    });
    expect(result).toEqual({ raw: '1500000', decimals: 6, formatted: '1.5' });
  });

  it('throws a clear error when rpcUrl is missing', async () => {
    const noRpc = new GuildPassClient({ apiUrl: 'https://api.test.com', contractAddress: CONTRACT });
    await expect(
      noRpc.contracts.getTokenDecimals({ walletAddress: WALLET }),
    ).rejects.toMatchObject({ code: GuildPassErrorCode.INVALID_CONFIG });
  });

  it('throws a clear error when contractAddress is missing', async () => {
    const noContract = new GuildPassClient({ apiUrl: 'https://api.test.com', rpcUrl: RPC_URL });
    await expect(
      noContract.contracts.getTokenDecimals({ walletAddress: WALLET }),
    ).rejects.toMatchObject({ code: GuildPassErrorCode.INVALID_CONFIG });
  });
});
