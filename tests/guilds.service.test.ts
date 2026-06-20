import { beforeEach, describe, expect, it, vi } from 'vitest';
import { GuildPassErrorCode } from '../src/errors/errorCodes';
import { GuildsService } from '../src/guilds/guilds.service';
import { Guild, GuildConfig } from '../src/guilds/guilds.types';
import { HttpClient } from '../src/http/httpClient';

describe('GuildsService', () => {
  const guild: Guild = {
    id: 'guild_1',
    name: 'Test Guild',
    ownerAddress: '0x1234567890123456789012345678901234567890',
    chainId: 1,
  };
  const guildConfig: GuildConfig = {
    id: 'guild_1',
    theme: 'dark',
    logoUrl: 'https://example.com/logo.png',
    socialLinks: {
      website: 'https://example.com',
    },
  };

  let http: { get: ReturnType<typeof vi.fn> };
  let service: GuildsService;

  beforeEach(() => {
    http = { get: vi.fn() };
    service = new GuildsService(http as unknown as HttpClient);
  });

  it('fetches guild metadata from the guild endpoint', async () => {
    http.get.mockResolvedValue(guild);

    await expect(service.getGuild({ guildId: 'guild_1' })).resolves.toEqual(guild);

    expect(http.get).toHaveBeenCalledWith('/guilds/guild_1');
  });

  it('fetches guild configuration from the config endpoint', async () => {
    http.get.mockResolvedValue(guildConfig);

    await expect(service.getGuildConfig({ guildId: 'guild_1' })).resolves.toEqual(guildConfig);

    expect(http.get).toHaveBeenCalledWith('/guilds/guild_1/config');
  });

  it('encodes guild IDs before adding them to endpoint paths', async () => {
    http.get.mockResolvedValue(guild);

    await service.getGuild({ guildId: 'guild/with spaces' });
    await service.getGuildConfig({ guildId: 'guild/with spaces' });

    expect(http.get).toHaveBeenNthCalledWith(1, '/guilds/guild%2Fwith%20spaces');
    expect(http.get).toHaveBeenNthCalledWith(2, '/guilds/guild%2Fwith%20spaces/config');
  });

  it('rejects invalid guild IDs before calling the API', async () => {
    await expect(service.getGuild({ guildId: '  ' })).rejects.toMatchObject({
      code: GuildPassErrorCode.INVALID_INPUT,
    });
    await expect(service.getGuildConfig({ guildId: '' })).rejects.toMatchObject({
      code: GuildPassErrorCode.INVALID_INPUT,
    });

    expect(http.get).not.toHaveBeenCalled();
  });

  it('validates guild responses when response validation is enabled', async () => {
    const validatingService = new GuildsService(http as unknown as HttpClient, true);
    http.get.mockResolvedValue({ id: 'guild_1', name: 'Missing owner and chain' });

    await expect(validatingService.getGuild({ guildId: 'guild_1' })).rejects.toMatchObject({
      code: GuildPassErrorCode.INVALID_RESPONSE,
      message: expect.stringContaining('Guild'),
    });
  });

  it('validates guild config responses when response validation is enabled', async () => {
    const validatingService = new GuildsService(http as unknown as HttpClient, true);
    http.get.mockResolvedValue({ theme: 'dark' });

    await expect(validatingService.getGuildConfig({ guildId: 'guild_1' })).rejects.toMatchObject({
      code: GuildPassErrorCode.INVALID_RESPONSE,
      message: expect.stringContaining('GuildConfig'),
    });
  });
});
