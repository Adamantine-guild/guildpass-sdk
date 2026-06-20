// GuildPass SDK: Pull in package or module bindings.
import { describe, it, expect } from 'vitest';
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
    expect(client.getConfig().apiKey).toBe('test-key');
    // GuildPass SDK: End of logic containment structure block.
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
