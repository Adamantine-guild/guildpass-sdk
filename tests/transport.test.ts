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
            json: async () => ({
              isVerified: true,
              result: true,
            }),
          };
        }
        return {
          status: 404,
          ok: false,
          getHeader: () => null,
          getHeaders: () => ({ 'content-type': 'application/json' }),
          json: async () => ({ error: 'Not Found' }),
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
    expect(result.isVerified).toBe(true);
    expect(result.result).toBe(true);
  });
});
