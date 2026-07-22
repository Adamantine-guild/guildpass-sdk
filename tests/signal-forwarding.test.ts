import { describe, expect, it, vi, beforeEach } from 'vitest';
import { GuildPassClient } from '../src/client/GuildPassClient';
import { GuildPassErrorCode } from '../src/errors/errorCodes';

const validAddress = '0x1234567890123456789012345678901234567890';

describe('Signal forwarding across services', () => {
  let mockFetch: any;

  beforeEach(() => {
    mockFetch = vi.fn();
    vi.stubGlobal('fetch', mockFetch);
  });

  it('forwards signal from checkAccess', async () => {
    const client = new GuildPassClient({
      apiUrl: 'https://api.test.com',
      fetch: mockFetch,
    });
    const controller = new AbortController();
    controller.abort();

    await expect(
      client.access.checkAccess({
        walletAddress: validAddress,
        guildId: 'guild_1',
        resourceId: 'res_1',
      }, { signal: controller.signal }),
    ).rejects.toMatchObject({
      code: GuildPassErrorCode.REQUEST_CANCELLED,
    });
  });

  it('forwards signal from checkRoleAccess', async () => {
    const client = new GuildPassClient({
      apiUrl: 'https://api.test.com',
      fetch: mockFetch,
    });
    const controller = new AbortController();
    controller.abort();

    await expect(
      client.access.checkRoleAccess({
        walletAddress: validAddress,
        guildId: 'guild_1',
        roleId: 'role_1',
      }, { signal: controller.signal }),
    ).rejects.toMatchObject({
      code: GuildPassErrorCode.REQUEST_CANCELLED,
    });
  });

  it('forwards signal from getMembership', async () => {
    const client = new GuildPassClient({
      apiUrl: 'https://api.test.com',
      fetch: mockFetch,
    });
    const controller = new AbortController();
    controller.abort();

    await expect(
      client.membership.getMembership({
        walletAddress: validAddress,
        guildId: 'guild_1',
      }, { signal: controller.signal }),
    ).rejects.toMatchObject({
      code: GuildPassErrorCode.REQUEST_CANCELLED,
    });
  });

  it('forwards signal from isMember', async () => {
    const client = new GuildPassClient({
      apiUrl: 'https://api.test.com',
      fetch: mockFetch,
    });
    const controller = new AbortController();
    controller.abort();

    await expect(
      client.membership.isMember({
        walletAddress: validAddress,
        guildId: 'guild_1',
      }, { signal: controller.signal }),
    ).rejects.toMatchObject({
      code: GuildPassErrorCode.REQUEST_CANCELLED,
    });
  });

  it('forwards signal from getRoles', async () => {
    const client = new GuildPassClient({
      apiUrl: 'https://api.test.com',
      fetch: mockFetch,
    });
    const controller = new AbortController();
    controller.abort();

    await expect(
      client.roles.getRoles({ guildId: 'guild_1' }, { signal: controller.signal }),
    ).rejects.toMatchObject({
      code: GuildPassErrorCode.REQUEST_CANCELLED,
    });
  });

  it('forwards signal from getUserRoles', async () => {
    const client = new GuildPassClient({
      apiUrl: 'https://api.test.com',
      fetch: mockFetch,
    });
    const controller = new AbortController();
    controller.abort();

    await expect(
      client.roles.getUserRoles({
        walletAddress: validAddress,
        guildId: 'guild_1',
      }, { signal: controller.signal }),
    ).rejects.toMatchObject({
      code: GuildPassErrorCode.REQUEST_CANCELLED,
    });
  });

  it('forwards signal from getGuild', async () => {
    const client = new GuildPassClient({
      apiUrl: 'https://api.test.com',
      fetch: mockFetch,
    });
    const controller = new AbortController();
    controller.abort();

    await expect(
      client.guilds.getGuild({ guildId: 'guild_1' }, { signal: controller.signal }),
    ).rejects.toMatchObject({
      code: GuildPassErrorCode.REQUEST_CANCELLED,
    });
  });

  it('forwards signal from getGuildConfig', async () => {
    const client = new GuildPassClient({
      apiUrl: 'https://api.test.com',
      fetch: mockFetch,
    });
    const controller = new AbortController();
    controller.abort();

    await expect(
      client.guilds.getGuildConfig({ guildId: 'guild_1' }, { signal: controller.signal }),
    ).rejects.toMatchObject({
      code: GuildPassErrorCode.REQUEST_CANCELLED,
    });
  });
});
describe('Mid-batch cancellation — checkAccessBatch', () => {
  let mockFetch: any;

  beforeEach(() => {
    mockFetch = vi.fn();
    vi.stubGlobal('fetch', mockFetch);
  });

  it('stops in-flight/unstarted work when aborted mid-batch, and does not call fetch for every item', async () => {
    const client = new GuildPassClient({
      apiUrl: 'https://api.test.com',
      fetch: mockFetch,
    });
    const controller = new AbortController();

    let callCount = 0;
    mockFetch.mockImplementation((_url: string, init: RequestInit) => {
      callCount++;
      const isFirst = callCount === 1;
      return new Promise((resolve, reject) => {
        const delay = isFirst ? 5 : 200;
        const timer = setTimeout(() => {
          resolve(new Response(JSON.stringify({ allowed: true }), {
            status: 200,
            headers: { 'Content-Type': 'application/json' },
          }));
        }, delay);
        init.signal?.addEventListener('abort', () => {
          clearTimeout(timer);
          reject(new DOMException('Aborted', 'AbortError'));
        });
      });
    });

    const items = Array.from({ length: 6 }, (_, i) => ({
      walletAddress: validAddress,
      guildId: 'guild_1',
      resourceId: `res_${i}`,
    }));

    const resultsPromise = client.access.checkAccessBatch(items, {
      concurrency: 2,
      signal: controller.signal,
    });

    await new Promise((r) => setTimeout(r, 20));
    controller.abort();

    const results = await resultsPromise;

    expect(results).toHaveLength(6);
    expect(results[0].status).toBe('fulfilled');

    const cancelled = results.slice(1);
    for (const r of cancelled) {
      expect(r.status).toBe('rejected');
      expect((r.error as any)?.code).toBe(GuildPassErrorCode.REQUEST_CANCELLED);
    }

    expect(mockFetch.mock.calls.length).toBeLessThan(items.length);
  });
});
