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
import { constantTimeEqual } from '../../../src/utils/constantTime';

describe('constantTimeEqual - Edge Runtime Compatibility', () => {
  it('works under V8 edge constraints', () => {
    expect(constantTimeEqual('abc', 'abc')).toBe(true);
    expect(constantTimeEqual('abc', 'abd')).toBe(false);
    expect(constantTimeEqual('abc', 'abcd')).toBe(false);
  });
});
