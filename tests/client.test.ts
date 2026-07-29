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

  it('should never expose apiKey through getConfig, including nested config', () => {
    const secretApiKey = 'super-secret-api-key';

    const chains = {
      1: {
        rpcUrl: 'https://ethereum.example',
        contractAddress: '0x1111111111111111111111111111111111111111',
      },
      8453: {
        rpcUrl: 'https://base.example',
        contractAddress: '0x2222222222222222222222222222222222222222',
      },
    };

    const client = new GuildPassClient({
      apiUrl: 'https://test-api.com',
      apiKey: secretApiKey,
      chains,
    });

    const publicConfig = client.getConfig();
    const serializedConfig = JSON.stringify(publicConfig);

    expect(Object.keys(publicConfig)).not.toContain('apiKey');
    expect(serializedConfig).not.toContain('"apiKey"');
    expect(serializedConfig).not.toContain(secretApiKey);
    expect(publicConfig.chains).toEqual(chains);
  });

  it('should accept a custom fetch implementation', () => {
    const customFetch = vi.fn() as unknown as typeof fetch;
    const client = new GuildPassClient({
      apiUrl: 'https://test-api.com',
      fetch: customFetch,
    });

    expect('fetch' in client.getConfig()).toBe(false);
  });

  it('should omit function-valued fields from getConfig', () => {
    const client = new GuildPassClient({
      apiUrl: 'https://test-api.com',
      fetch: vi.fn() as unknown as typeof fetch,
      hooks: { onRequest: vi.fn(), onResponse: vi.fn(), onError: vi.fn() },
    });

    const publicConfig = client.getConfig() as Record<string, unknown>;
    for (const key of ['fetch', 'hooks', 'contractProvider', 'cache', 'middleware']) {
      expect(key in publicConfig).toBe(false);
    }
    expect(() => JSON.stringify(publicConfig)).not.toThrow();
  });

  it('should redact credentials from RPC URLs in getConfig', () => {
    const infuraKey = 'a1b2c3d4e5f60718293a4b5c6d7e8f90';
    const client = new GuildPassClient({
      apiUrl: 'https://test-api.com',
      rpcUrl: `https://mainnet.infura.io/v3/${infuraKey}`,
      rpcUrls: [
        'https://user:secretpass@rpc.example.com',
        'https://rpc.example.com/?apikey=abc123&region=eu',
      ],
      chains: {
        1: {
          rpcUrl: `https://eth-mainnet.g.alchemy.com/v2/${infuraKey}`,
          contractAddress: '0x1111111111111111111111111111111111111111',
        },
      },
    });

    const publicConfig = client.getConfig();
    const serialized = JSON.stringify(publicConfig);
    expect(serialized).not.toContain(infuraKey);
    expect(serialized).not.toContain('secretpass');
    expect(serialized).not.toContain('abc123');
    expect(serialized).toContain('region=eu');
    expect(publicConfig.rpcUrl).toBe('https://mainnet.infura.io/v3/[REDACTED]');
    expect(publicConfig.chains?.[1]?.contractAddress).toBe(
      '0x1111111111111111111111111111111111111111',
    );
  });

  it('should leave credential-free RPC URLs untouched in getConfig', () => {
    const client = new GuildPassClient({
      apiUrl: 'https://test-api.com',
      rpcUrl: 'https://ethereum.publicnode.com',
    });

    expect(client.getConfig().rpcUrl).toBe('https://ethereum.publicnode.com');
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
    // GuildPass SDK: Define internal reference identifier.
    const client = new GuildPassClient({ apiUrl: 'https://test-api.com' });

    expect(client.access).toBeDefined();
    expect(client.membership).toBeDefined();
    expect(client.roles).toBeDefined();
    expect(client.guilds).toBeDefined();
    expect(client.contracts).toBeDefined();
    // GuildPass SDK: End of logic containment structure block.
  });

  it('should pass a custom fetch transport through to SDK requests', async () => {
    const mockResult = {
      hasAccess: true,
      walletAddress: '0x742d35cc6634c0532925a3b844bc9e7595f0beef',
      guildId: 'guild-1',
      resourceId: 'resource-1',
      requiredRoles: [],
      matchedRoles: [],
    };
    const transport = vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      json: () => Promise.resolve(mockResult),
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

    expect(result).toEqual(mockResult);
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