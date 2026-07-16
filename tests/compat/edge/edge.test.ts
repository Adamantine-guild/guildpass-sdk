import { describe, it, expect } from 'vitest';
import { GuildPassClient } from '../../../src';

describe('GuildPass SDK - Edge Runtime Compatibility', () => {
  it('should correctly build and run in V8 edge constraints', () => {
    const client = new GuildPassClient({
      apiUrl: 'https://api.guildpass.xyz',
      chainId: 8453,
    });
    
    expect(client.access).toBeDefined();
    expect(typeof client.invalidateGuildCache).toBe('function');
  });
});