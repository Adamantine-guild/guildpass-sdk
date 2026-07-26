import { describe, expect, it, vi } from 'vitest';
import { GuildPassClient } from '../src/client/GuildPassClient';

// Mixed case on purpose, to prove the services lowercase it before building a
// URL. The value must carry a valid EIP-55 checksum, since validateAddress
// verifies the checksum of any mixed-case address it is given.
const mixedCaseAddress = '0xf39Fd6e51aad88F6F4ce6aB8827279cffFb92266';
const normalisedAddress = mixedCaseAddress.toLowerCase();

function createClient(responseBody: unknown = {}) {
  const fetchTransport = vi.fn().mockResolvedValue({
    ok: true,
    status: 200,
    json: () => Promise.resolve(responseBody),
    headers: new Headers(),
  });

  return {
    client: new GuildPassClient({
      apiUrl: 'https://api.guildpass.test',
      fetch: fetchTransport,
    }),
    fetchTransport,
  };
}

function calledUrl(fetchTransport: ReturnType<typeof vi.fn>, callIndex = 0): string {
  return String(fetchTransport.mock.calls[callIndex][0]);
}

describe('service URL encoding', () => {
  it('encodes access query parameters with special characters exactly once', async () => {
    const { client, fetchTransport } = createClient({
      hasAccess: false,
      walletAddress: normalisedAddress,
      guildId: 'guild/alpha beta',
      resourceId: 'resource/one?flag=yes&x=1',
      requiredRoles: [],
      matchedRoles: [],
    });

    await client.access.checkAccess({
      walletAddress: mixedCaseAddress,
      guildId: 'guild/alpha beta',
      resourceId: 'resource/one?flag=yes&x=1',
    });

    const url = calledUrl(fetchTransport);
    expect(url).toContain('/access/check?');
    expect(url).toContain(`address=${normalisedAddress}`);
    expect(url).toContain('guildId=guild%2Falpha+beta');
    expect(url).toContain('resourceId=resource%2Fone%3Fflag%3Dyes%26x%3D1');
    expect(url).not.toContain('guild%252Falpha');
  });

  it('encodes membership query parameters without double-encoding values', async () => {
    const { client, fetchTransport } = createClient({
      walletAddress: normalisedAddress,
      guildId: 'guild/member space',
      isActive: true,
      roles: [],
    });

    await client.membership.getMembership({
      walletAddress: mixedCaseAddress,
      guildId: 'guild/member space',
    });

    const url = calledUrl(fetchTransport);
    expect(url).toContain('/membership?');
    expect(url).toContain(`address=${normalisedAddress}`);
    expect(url).toContain('guildId=guild%2Fmember+space');
    expect(url).not.toContain('guild%252Fmember');
  });

  it('encodes role service path segments and lowercases wallet addresses', async () => {
    const { client, fetchTransport } = createClient([]);

    await client.roles.getRoles({ guildId: 'guild/roles space' });
    await client.roles.getUserRoles({
      guildId: 'guild/user roles',
      walletAddress: mixedCaseAddress,
    });

    expect(calledUrl(fetchTransport, 0)).toBe(
      'https://api.guildpass.test/guilds/guild%2Froles%20space/roles',
    );
    expect(calledUrl(fetchTransport, 1)).toBe(
      `https://api.guildpass.test/guilds/guild%2Fuser%20roles/members/${normalisedAddress}/roles`,
    );
  });

  it('encodes guild service path segments for metadata and config requests', async () => {
    const { client, fetchTransport } = createClient({
      id: 'guild/1',
      name: 'Guild One',
      ownerAddress: normalisedAddress,
      chainId: 1,
    });

    await client.guilds.getGuild({ guildId: 'guild/main config' });
    await client.guilds.getGuildConfig({ guildId: 'guild/main config' });

    expect(calledUrl(fetchTransport, 0)).toBe(
      'https://api.guildpass.test/guilds/guild%2Fmain%20config',
    );
    expect(calledUrl(fetchTransport, 1)).toBe(
      'https://api.guildpass.test/guilds/guild%2Fmain%20config/config',
    );
  });
});
