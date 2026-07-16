import { describe, it, expect, vi } from 'vitest';
import { GuildPassClient } from '../../../src'; 

describe('GuildPass SDK - Browser (JSDOM) Compatibility', () => {
  it('should initialize without Node.js globals', () => {
    expect(() => new GuildPassClient({ apiUrl: 'https://api.guildpass.xyz' })).not.toThrow();
  });

  it('should support a custom fetch transport', async () => {
    const mockFetch = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ hasAccess: true }),
    });

    const originalFetch = globalThis.fetch;
    globalThis.fetch = mockFetch;

    const client = new GuildPassClient({ apiUrl: 'https://api.guildpass.xyz' });
    const result = await client.access.checkAccess({
      walletAddress: '0x1234567890123456789012345678901234567890',
      guildId: 'test-guild',
      resourceId: 'test-resource',
    });

    expect(mockFetch).toHaveBeenCalled();
    expect(result.hasAccess).toBe(true);

    globalThis.fetch = originalFetch; 
  });
});