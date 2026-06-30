// GuildPass SDK: Pull in package or module bindings.
import { describe, it, expect, vi } from 'vitest';
// GuildPass SDK: Import external module dependencies.
import { GuildPassClient } from '../src/client/GuildPassClient';
import { GuildPassError } from '../src/errors/GuildPassError';
import { GuildPassErrorCode } from '../src/errors/errorCodes';

// GuildPass SDK: Test suite container block.
describe('GuildPassClient', () => {
  // GuildPass SDK: Validate unit assertion test case.
  it('should initialise with provided config', () => {
    // GuildPass SDK: Variable binding initialization.
    const config = {
      apiUrl: 'https://test-api.com',
      chainId: 137,
      apiKey: 'test-key',
      // GuildPass SDK: End of logic containment structure block.
    };
    // GuildPass SDK: Local block-scoped constant reference.
    const client = new GuildPassClient(config);

    expect(client.getConfig().apiUrl).toBe('https://test-api.com');
    expect(client.getConfig().chainId).toBe(137);
    expect('apiKey' in client.getConfig()).toBe(false);
    // GuildPass SDK: End of logic containment structure block.
  });

  it('should accept a custom fetch implementation', () => {
    const customFetch = vi.fn() as unknown as typeof fetch;
    const client = new GuildPassClient({
      apiUrl: 'https://test-api.com',
      fetch: customFetch,
    });

    expect(client.getConfig().fetch).toBe(customFetch);
  });

  // GuildPass SDK: Test suite container block.
  it('should use default values for optional config', () => {
    // GuildPass SDK: Define internal reference identifier.
    const client = new GuildPassClient({ apiUrl: 'https://test-api.com' });

    expect(client.getConfig().timeoutMs).toBe(10000);
    expect(client.getConfig().chainId).toBe(1);
    // GuildPass SDK: End of logic containment structure block.
  });

  // GuildPass SDK: Validate unit assertion test case.
  it('should expose all required services', () => {
    // GuildPass SDK: Variable binding initialization.
    const client = new GuildPassClient({ apiUrl: 'https://test-api.com' });

    expect(client.access).toBeDefined();
    expect(client.membership).toBeDefined();
    expect(client.roles).toBeDefined();
    expect(client.guilds).toBeDefined();
    expect(client.contracts).toBeDefined();
    // GuildPass SDK: End of logic containment structure block.
  });

  it('should pass a custom fetch transport through to SDK requests', async () => {
    const transport = vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      json: () => Promise.resolve({ hasAccess: true }),
      headers: new Headers(),
    });
    const globalFetch = vi.fn();
    vi.stubGlobal('fetch', globalFetch);
    const client = new GuildPassClient({
      apiUrl: 'https://test-api.com',
      apiKey: 'test-key',
      fetch: transport,
    });

    const result = await client.access.checkAccess({
      walletAddress: '0x742d35cc6634c0532925a3b844bc9e7595f0beef',
      guildId: 'guild-1',
      resourceId: 'resource-1',
    });

    expect(result).toEqual({ hasAccess: true });
    expect(transport).toHaveBeenCalled();
    expect(transport).toHaveBeenCalledWith(
      expect.stringContaining('/access/check'),
      expect.objectContaining({
        headers: expect.objectContaining({ 'X-API-Key': 'test-key' }),
      }),
    );
    expect(globalFetch).not.toHaveBeenCalled();
  });
  // GuildPass SDK: End of logic containment structure block.
});

describe('GuildPassClient config validation', () => {
  it('should throw when apiUrl is missing', () => {
    expect(() => new GuildPassClient({ apiUrl: '' }))
      .toThrow(GuildPassError);
    expect(() => new GuildPassClient({ apiUrl: '' }))
      .toThrow(expect.objectContaining({ code: GuildPassErrorCode.INVALID_CONFIG }));
  });

  it('should throw when apiUrl is an invalid URL', () => {
    expect(() => new GuildPassClient({ apiUrl: 'not-a-url' }))
      .toThrow(expect.objectContaining({ code: GuildPassErrorCode.INVALID_CONFIG }));
  });

  it('should throw when timeoutMs is zero', () => {
    expect(() => new GuildPassClient({ apiUrl: 'https://api.guildpass.xyz', timeoutMs: 0 }))
      .toThrow(expect.objectContaining({ code: GuildPassErrorCode.INVALID_CONFIG }));
  });

  it('should throw when timeoutMs is negative', () => {
    expect(() => new GuildPassClient({ apiUrl: 'https://api.guildpass.xyz', timeoutMs: -1 }))
      .toThrow(expect.objectContaining({ code: GuildPassErrorCode.INVALID_CONFIG }));
  });

  it('should not throw for valid config', () => {
    expect(() => new GuildPassClient({ apiUrl: 'https://api.guildpass.xyz', timeoutMs: 5000 }))
      .not.toThrow();
  });

  it('should throw when a chains entry has an invalid chain ID', () => {
    expect(() => new GuildPassClient({
      apiUrl: 'https://api.guildpass.xyz',
      chains: {
        0: { rpcUrl: 'https://rpc.guildpass.xyz' },
      },
    })).toThrow(expect.objectContaining({
      code: GuildPassErrorCode.INVALID_CONFIG,
      message: expect.stringContaining('chains[0]'),
    }));
  });

  it('should throw when a chains entry has an invalid RPC URL', () => {
    expect(() => new GuildPassClient({
      apiUrl: 'https://api.guildpass.xyz',
      chains: {
        8453: { rpcUrl: 'wss://base.example' },
      },
    })).toThrow(expect.objectContaining({
      code: GuildPassErrorCode.INVALID_CONFIG,
      message: expect.stringContaining('chains[8453].rpcUrl'),
    }));
  });

  it('should throw when a chains entry has an invalid contract address', () => {
    expect(() => new GuildPassClient({
      apiUrl: 'https://api.guildpass.xyz',
      chains: {
        8453: {
          rpcUrl: 'https://base.example',
          contractAddress: '0x1234',
        },
      },
    })).toThrow(expect.objectContaining({
      code: GuildPassErrorCode.INVALID_CONFIG,
      message: expect.stringContaining('chains[8453].contractAddress'),
    }));
  });

  it('should throw when neither global fetch nor custom fetch exists', () => {
    const originalFetch = globalThis.fetch;

    try {
      vi.stubGlobal('fetch', undefined);
      expect(() => new GuildPassClient({ apiUrl: 'https://api.guildpass.xyz' }))
        .toThrow(expect.objectContaining({ code: GuildPassErrorCode.INVALID_CONFIG }));
      expect(() => new GuildPassClient({ apiUrl: 'https://api.guildpass.xyz' }))
        .toThrow(/fetch-compatible transport/i);
    } finally {
      vi.stubGlobal('fetch', originalFetch);
    }
  });
});

describe('GuildPassClient multi-chain config', () => {
  it('accepts a chains map and stores it in config', () => {
    const chains = {
      1: { rpcUrl: 'https://eth.rpc', contractAddress: '0x1111111111111111111111111111111111111111' },
      8453: { rpcUrl: 'https://base.rpc', contractAddress: '0x2222222222222222222222222222222222222222' },
    };
    const client = new GuildPassClient({ apiUrl: 'https://api.guildpass.xyz', chains });
    expect(client.getConfig().chains).toEqual(chains);
  });
});
