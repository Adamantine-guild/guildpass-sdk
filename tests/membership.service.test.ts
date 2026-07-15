import { describe, expect, it, vi, beforeEach } from 'vitest';
import { MembershipService } from '../src/membership/membership.service';
import type { HttpClient } from '../src/http/httpClient';

const validAddress = '0x1234567890123456789012345678901234567890';

function createService(response: unknown) {
  const get = vi.fn().mockResolvedValue(response);
  const http = { get } as unknown as HttpClient;
  return { get, service: new MembershipService(http) };
}

describe('MembershipService request options forwarding', () => {
  it('forwards timeoutMs option', async () => {
    const { get, service } = createService({ isActive: true, roles: [] });

    await service.getMembership({ walletAddress: validAddress, guildId: 'guild_1' }, { timeoutMs: 500 });

    expect(get).toHaveBeenCalledWith('/membership', {
      timeoutMs: 500,
      params: { address: validAddress, guildId: 'guild_1' },
    });
  });

  it('forwards signal option', async () => {
    const { get, service } = createService({ isActive: true, roles: [] });
    const controller = new AbortController();

    await service.getMembership({ walletAddress: validAddress, guildId: 'guild_1' }, { signal: controller.signal });

    expect(get).toHaveBeenCalledWith('/membership', {
      signal: controller.signal,
      params: { address: validAddress, guildId: 'guild_1' },
    });
  });

  it('forwards retry option', async () => {
    const { get, service } = createService({ isActive: true, roles: [] });

    await service.getMembership({ walletAddress: validAddress, guildId: 'guild_1' }, { retry: { maxRetries: 2 } });

    expect(get).toHaveBeenCalledWith('/membership', {
      retry: { maxRetries: 2 },
      params: { address: validAddress, guildId: 'guild_1' },
    });
  });

  it('forwards all options together', async () => {
    const { get, service } = createService({ isActive: true, roles: [] });
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