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