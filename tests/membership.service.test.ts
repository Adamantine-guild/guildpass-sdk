import { describe, expect, it, vi } from 'vitest';
import { MembershipService } from '../src/membership/membership.service';
import { GuildPassConfigError } from '../src/errors/errorTypes';
import type { HttpClient } from '../src/http/httpClient';
import getMembershipSuccess from './fixtures/membership/get-membership-success.json';

const validAddress = '0x1234567890123456789012345678901234567890';

function createService(response: unknown) {
  const get = vi.fn().mockResolvedValue(response);
  const http = { get } as unknown as HttpClient;
  return { get, service: new MembershipService(http) };
}

describe('MembershipService validation errors', () => {
  it('throws a GuildPassConfigError for an invalid wallet address', async () => {
    const { get, service } = createService(getMembershipSuccess);

    await expect(
      service.getMembership({ walletAddress: 'not-an-address', guildId: 'guild_1' }),
    ).rejects.toBeInstanceOf(GuildPassConfigError);
    expect(get).not.toHaveBeenCalled();
  });

  it('rejects a non-object params value via the request schema', async () => {
    const { get, service } = createService(getMembershipSuccess);

    await expect(service.getMembership(null as any)).rejects.toBeInstanceOf(GuildPassConfigError);
    expect(get).not.toHaveBeenCalled();
  });
});

describe('MembershipService request options forwarding', () => {
  it('forwards timeoutMs option', async () => {
    const { get, service } = createService(getMembershipSuccess);

    await service.getMembership({ walletAddress: validAddress, guildId: 'guild_1' }, { timeoutMs: 500 });

    expect(get).toHaveBeenCalledWith('/membership', {
      timeoutMs: 500,
      params: { address: validAddress, guildId: 'guild_1' },
    });
  });

  it('forwards signal option', async () => {
    const { get, service } = createService(getMembershipSuccess);
    const controller = new AbortController();

    await service.getMembership({ walletAddress: validAddress, guildId: 'guild_1' }, { signal: controller.signal });

    expect(get).toHaveBeenCalledWith('/membership', {
      signal: controller.signal,
      params: { address: validAddress, guildId: 'guild_1' },
    });
  });

  it('forwards retry option', async () => {
    const { get, service } = createService(getMembershipSuccess);

    await service.getMembership({ walletAddress: validAddress, guildId: 'guild_1' }, { retry: { maxRetries: 2 } });

    expect(get).toHaveBeenCalledWith('/membership', {
      retry: { maxRetries: 2 },
      params: { address: validAddress, guildId: 'guild_1' },
    });
  });

  it('forwards all options together', async () => {
    const { get, service } = createService(getMembershipSuccess);
    const controller = new AbortController();

    await service.getMembership(
      { walletAddress: validAddress, guildId: 'guild_1' },
      { timeoutMs: 500, signal: controller.signal, retry: { maxRetries: 3 } },
    );

    expect(get).toHaveBeenCalledWith('/membership', {
      timeoutMs: 500,
      signal: controller.signal,
      retry: { maxRetries: 3 },
      params: { address: validAddress, guildId: 'guild_1' },
    });
  });
});