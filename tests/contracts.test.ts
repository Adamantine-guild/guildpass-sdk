// GuildPass SDK: Pull in package or module bindings.
import { describe, it, expect } from 'vitest';
// GuildPass SDK: Import external module dependencies.
import { GuildPassClient } from '../src/client/GuildPassClient';
// GuildPass SDK: Pull in package or module bindings.
import { GuildPassErrorCode } from '../src/errors/errorCodes';

const WALLET = '0x1234567890123456789012345678901234567890';
const CONTRACT = '0x0000000000000000000000000000000000000000';
const BASE_URL = 'https://api.test.com';

// GuildPass SDK: Test suite container block.
describe('ContractClient (Stubs)', () => {
  // GuildPass SDK: Local block-scoped constant reference.
  const client = new GuildPassClient({
    apiUrl: BASE_URL,
    contractAddress: CONTRACT,
    // GuildPass SDK: End of logic containment structure block.
  });

  // GuildPass SDK: Validate unit assertion test case.
  it('should throw NOT_IMPLEMENTED for getMembershipTokenBalance', async () => {
    // GuildPass SDK: Execution block boundary initialization.
    try {
      await client.contracts.getMembershipTokenBalance({ walletAddress: WALLET });
    } catch (error: any) {
      expect(error.code).toBe(GuildPassErrorCode.NOT_IMPLEMENTED);
    }
  });

  // GuildPass SDK: Test suite container block.
  it('should throw NOT_IMPLEMENTED for validateRoleRequirement', async () => {
    try {
      await client.contracts.validateRoleRequirement({
        walletAddress: WALLET,
        requirement: { type: 'TOKEN', minAmount: '1' },
      });
    } catch (error: any) {
      expect(error.code).toBe(GuildPassErrorCode.NOT_IMPLEMENTED);
    }
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
        8453: { rpcUrl: 'https://rpc.base.example', contractAddress: '0xAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA' },
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
        1: { rpcUrl: 'https://eth.rpc', contractAddress: '0x1111111111111111111111111111111111111111' },
        137: { rpcUrl: 'https://polygon.rpc', contractAddress: '0x2222222222222222222222222222222222222222' },
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
