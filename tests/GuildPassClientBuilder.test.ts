import { describe, it, expect, vi } from 'vitest';
import { GuildPassClientBuilder } from '../src/client/GuildPassClientBuilder';
import { GuildPassClient } from '../src/client/GuildPassClient';
import { GuildPassConfigError } from '../src/errors/errorTypes';

describe('GuildPassClientBuilder', () => {
  it('should build a client with only apiUrl', () => {
    const builder = new GuildPassClientBuilder('https://api.test.com');
    
    // We mock global fetch just for validation if we are in node where fetch might not exist
    const fetchSpy = vi.fn();
    vi.stubGlobal('fetch', fetchSpy);

    const client = builder.build();

    expect(client).toBeInstanceOf(GuildPassClient);
    expect(client.getConfig().apiUrl).toBe('https://api.test.com');

    vi.unstubAllGlobals();
  });

  it('should allow building config fluently', () => {
    const fetchSpy = vi.fn();
    vi.stubGlobal('fetch', fetchSpy);

    const client = new GuildPassClientBuilder()
      .withApiUrl('https://api.test.com')
      .withApiKey('secret-key')
      .withTimeout(5000)
      .withRpcUrl('https://rpc.test.com')
      .withStrictAddressChecksum(true)
      .build();

    const config = client.getConfig();
    expect(config.apiUrl).toBe('https://api.test.com');
    // apiKey is redacted from getConfig(), so we can't assert it easily via getConfig
    // but we can check other public config values
    expect(config.defaultTimeoutMs).toBe(5000);
    expect(config.rpcUrl).toBe('https://rpc.test.com');
    expect(config.strictAddressChecksum).toBe(true);

    vi.unstubAllGlobals();
  });

  it('should validate configuration before building', () => {
    const builder = new GuildPassClientBuilder('not-a-valid-url');
    
    expect(() => builder.build()).toThrow(GuildPassConfigError);
  });

  it('should support advanced options like retry and cache', () => {
    const fetchSpy = vi.fn();
    vi.stubGlobal('fetch', fetchSpy);

    const mockCache = {
      get: async () => null,
      set: async () => {},
      delete: async () => {},
      clear: async () => {},
    };

    const client = new GuildPassClientBuilder('https://api.test.com')
      .withRetry({ maxRetries: 3, baseDelayMs: 100 })
      .withCache(mockCache, 60000)
      .withBatchStrategy('multicall3')
      .build();

    const config = client.getConfig();
    expect(config.retry?.maxRetries).toBe(3);
    expect(config.cacheTtl).toBe(60000);
    expect(config.batchStrategy).toBe('multicall3');

    vi.unstubAllGlobals();
  });
});
