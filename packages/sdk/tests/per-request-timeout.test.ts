import { describe, expect, it, vi, beforeEach } from 'vitest';
import { GuildPassClient } from '../src/client/GuildPassClient';
import { GuildPassErrorCode } from '../src/errors/errorCodes';

describe('Per-request timeout behavior (#10)', () => {
  let mockFetch: any;

  beforeEach(() => {
    mockFetch = vi.fn();
    vi.stubGlobal('fetch', mockFetch);
  });

  it('uses the global timeout when no per-request override is given', async () => {
    const client = new GuildPassClient({
      apiUrl: 'https://api.test.com',
      timeoutMs: 5000,
      fetch: mockFetch,
    });

    mockFetch.mockImplementation((_url: string, init: RequestInit) => {
      // Verify the signal is set (timeout mechanism active)
      expect(init.signal).toBeDefined();
      return Promise.resolve({
        ok: true,
        status: 200,
        json: () => Promise.resolve({ hasAccess: true, matchedRoles: [] }),
        headers: new Headers(),
      });
    });

    await client.access.checkAccess({
      walletAddress: '0x1234567890123456789012345678901234567890',
      guildId: 'guild_1',
      resourceId: 'res_1',
    });

    expect(mockFetch).toHaveBeenCalledTimes(1);
  });

  it('per-request timeout overrides the global timeout', async () => {
    const client = new GuildPassClient({
      apiUrl: 'https://api.test.com',
      timeoutMs: 10000,
      fetch: mockFetch,
    });

    mockFetch.mockImplementation((_url: string, init: RequestInit) => {
      const error = new Error('AbortError');
      error.name = 'AbortError';
      init.signal?.dispatchEvent(new Event('abort'));
      return Promise.reject(error);
    });

    await expect(
      client.membership.getMembership(
        {
          walletAddress: '0x1234567890123456789012345678901234567890',
          guildId: 'guild_1',
        },
        { timeoutMs: 50 },
      ),
    ).rejects.toMatchObject({
      code: GuildPassErrorCode.TIMEOUT,
      message: 'Request timed out after 50ms',
    });
  });

  it('per-request timeout works on getUserRoles', async () => {
    const client = new GuildPassClient({
      apiUrl: 'https://api.test.com',
      timeoutMs: 10000,
      fetch: mockFetch,
    });

    mockFetch.mockImplementation((_url: string, init: RequestInit) => {
      const error = new Error('AbortError');
      error.name = 'AbortError';
      init.signal?.dispatchEvent(new Event('abort'));
      return Promise.reject(error);
    });

    await expect(
      client.roles.getUserRoles(
        {
          walletAddress: '0x1234567890123456789012345678901234567890',
          guildId: 'guild_1',
        },
        { timeoutMs: 75 },
      ),
    ).rejects.toMatchObject({
      code: GuildPassErrorCode.TIMEOUT,
      message: 'Request timed out after 75ms',
    });
  });

  it('per-request timeout works on getGuild', async () => {
    const client = new GuildPassClient({
      apiUrl: 'https://api.test.com',
      timeoutMs: 10000,
      fetch: mockFetch,
    });

    mockFetch.mockImplementation((_url: string, init: RequestInit) => {
      const error = new Error('AbortError');
      error.name = 'AbortError';
      init.signal?.dispatchEvent(new Event('abort'));
      return Promise.reject(error);
    });

    await expect(
      client.guilds.getGuild(
        { guildId: 'guild_1' },
        { timeoutMs: 100 },
      ),
    ).rejects.toMatchObject({
      code: GuildPassErrorCode.TIMEOUT,
      message: 'Request timed out after 100ms',
    });
  });

  it('per-request timeout works on checkAccessBatch (failFast)', async () => {
    const client = new GuildPassClient({
      apiUrl: 'https://api.test.com',
      timeoutMs: 10000,
      fetch: mockFetch,
    });

    mockFetch.mockImplementation((_url: string, init: RequestInit) => {
      const error = new Error('AbortError');
      error.name = 'AbortError';
      init.signal?.dispatchEvent(new Event('abort'));
      return Promise.reject(error);
    });

    await expect(
      client.access.checkAccessBatch(
        [
          { walletAddress: '0x1234567890123456789012345678901234567890', guildId: 'g1', resourceId: 'r1' },
        ],
        { timeoutMs: 30, concurrency: 1, failFast: true },
      ),
    ).rejects.toMatchObject({
      code: GuildPassErrorCode.TIMEOUT,
      message: 'Request timed out after 30ms',
    });
  });

  it('existing call signatures remain usable without options', async () => {
    const client = new GuildPassClient({
      apiUrl: 'https://api.test.com',
      fetch: mockFetch,
    });

    mockFetch.mockResolvedValue({
      ok: true,
      status: 200,
      json: () => Promise.resolve({ hasAccess: true, matchedRoles: [] }),
      headers: new Headers(),
    });

    // No second argument — backwards compatible
    const result = await client.access.checkAccess({
      walletAddress: '0x1234567890123456789012345678901234567890',
      guildId: 'guild_1',
      resourceId: 'res_1',
    });

    expect(result).toEqual({ hasAccess: true, matchedRoles: [] });
  });
});
