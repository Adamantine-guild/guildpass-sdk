import { describe, it, expect, vi } from 'vitest';
import { GuildPassClient } from '../src/client/GuildPassClient';
import { HttpTransport, TransportRequest, TransportResponse } from '../src/network/transport.types';

describe('Transport Abstraction', () => {
  it('should use custom transport when provided', async () => {
    class MockTransport implements HttpTransport {
      public async execute(request: TransportRequest): Promise<TransportResponse> {
        if (request.url.includes('/access/check')) {
          return {
            status: 200,
            ok: true,
            getHeader: () => null,
            getHeaders: () => ({ 'content-type': 'application/json' }),
            json: async <T = any>() =>
              ({
                hasAccess: true,
                walletAddress: '0x1234567890123456789012345678901234567890',
                guildId: 'guild-1',
                resourceId: 'res-1',
                requiredRoles: [],
                matchedRoles: [],
              } as T),
          };
        }
        return {
          status: 404,
          ok: false,
          getHeader: () => null,
          getHeaders: () => ({ 'content-type': 'application/json' }),
          json: async <T = any>() => ({ error: 'Not Found' } as T),
        };
      }
    }

    const transport = new MockTransport();
    const executeSpy = vi.spyOn(transport, 'execute');

    const client = new GuildPassClient({
      apiUrl: 'https://api.test.com',
      transport,
    });

    const result = await client.access.checkAccess({
      guildId: 'guild-1',
      resourceId: 'res-1',
      walletAddress: '0x1234567890123456789012345678901234567890',
    });

    expect(executeSpy).toHaveBeenCalled();
    expect(result.hasAccess).toBe(true);
    expect(result.walletAddress).toBe('0x1234567890123456789012345678901234567890');
  });
});
