import { describe, expect, it, vi } from 'vitest';

import { AccessService } from '../src/access/access.service';
import { RolesService } from '../src/roles/roles.service';
import { MembershipService } from '../src/membership/membership.service';
import { GuildsService } from '../src/guilds/guilds.service';
import { ContractClient } from '../src/contracts/contractClient';

import { GuildPassError } from '../src/errors/GuildPassError';
import { GuildPassConfigError } from '../src/errors/GuildPassConfigError';
import { GuildPassNetworkError } from '../src/errors/GuildPassNetworkError';
import { GuildPassApiError } from '../src/errors/GuildPassApiError';
import { GuildPassResponseValidationError } from '../src/errors/GuildPassResponseValidationError';

import type { HttpClient } from '../src/http/httpClient';

const validAddress = '0x1234567890123456789012345678901234567890';

function httpThatRejectsWith(error: unknown) {
  const get = vi.fn().mockRejectedValue(error);
  const post = vi.fn().mockRejectedValue(error);
  return { get, post, http: { get, post } as unknown as HttpClient };
}

describe('GuildPass typed error hierarchy (#289)', () => {
  // ---------------------------------------------------------------------
  // The four concrete subclasses all extend GuildPassError.
  // ---------------------------------------------------------------------
  it('every subclass is instanceof GuildPassError and instanceof Error', () => {
    const config = new GuildPassConfigError('bad config');
    const network = new GuildPassNetworkError('unreachable', 'HTTP_ERROR' as any);
    const api = GuildPassApiError.fromHttpError(404);
    const responseValidation = new GuildPassResponseValidationError('bad shape');

    for (const err of [config, network, api, responseValidation]) {
      expect(err).toBeInstanceOf(GuildPassError);
      expect(err).toBeInstanceOf(Error);
    }
  });

  it('GuildPassApiError always carries the HTTP status code', () => {
    const err = GuildPassApiError.fromHttpError(429, { message: 'slow down' });
    expect(err).toBeInstanceOf(GuildPassApiError);
    expect(err.status).toBe(429);
    expect(err.code).toBe('RATE_LIMITED');
  });

  it('subclasses are mutually exclusive (an API error is not a config error, etc.)', () => {
    const api = GuildPassApiError.fromHttpError(500);
    expect(api).not.toBeInstanceOf(GuildPassConfigError);
    expect(api).not.toBeInstanceOf(GuildPassResponseValidationError);

    const cfg = new GuildPassConfigError('bad config');
    expect(cfg).not.toBeInstanceOf(GuildPassApiError);
    expect(cfg).not.toBeInstanceOf(GuildPassNetworkError);
  });

  // ---------------------------------------------------------------------
  // access — checkAccess() propagates an API-level failure from the HTTP
  // layer as a GuildPassApiError.
  // ---------------------------------------------------------------------
  it('access module: propagates HTTP failures as GuildPassApiError', async () => {
    const { http } = httpThatRejectsWith(GuildPassApiError.fromHttpError(404, { message: 'guild not found' }));
    const service = new AccessService(http);

    const call = service.checkAccess({ walletAddress: validAddress, guildId: 'guild_1', resourceId: 'resource_1' });

    await expect(call).rejects.toBeInstanceOf(GuildPassApiError);
    await expect(call).rejects.toMatchObject({ status: 404 });
  });

  // ---------------------------------------------------------------------
  // roles — hasRole() throws a GuildPassConfigError when the service is
  // wired up without the AccessService dependency it needs.
  // ---------------------------------------------------------------------
  it('roles module: throws GuildPassConfigError when AccessService is not configured', async () => {
    const { http } = httpThatRejectsWith(new Error('should not be called'));
    const service = new RolesService(http);

    const call = service.hasRole({ walletAddress: validAddress, guildId: 'guild_1', roleId: 'role_1' });

    await expect(call).rejects.toBeInstanceOf(GuildPassConfigError);
    await expect(call).rejects.toBeInstanceOf(GuildPassError);
  });

  // ---------------------------------------------------------------------
  // membership — getMembershipStatus() propagates an API-level failure
  // from the HTTP layer as a GuildPassApiError.
  // ---------------------------------------------------------------------
  it('membership module: propagates HTTP failures as GuildPassApiError', async () => {
    const { http } = httpThatRejectsWith(GuildPassApiError.fromHttpError(401));
    const service = new MembershipService(http);

    const call = service.getMembership({ walletAddress: validAddress, guildId: 'guild_1' });

    await expect(call).rejects.toBeInstanceOf(GuildPassApiError);
    await expect(call).rejects.toMatchObject({ status: 401, code: 'UNAUTHORISED' });
  });

  // ---------------------------------------------------------------------
  // guilds — getGuild() propagates a transport-level failure from the
  // HTTP layer as a GuildPassNetworkError.
  // ---------------------------------------------------------------------
  it('guilds module: propagates transport failures as GuildPassNetworkError', async () => {
    const { http } = httpThatRejectsWith(new GuildPassNetworkError('socket hang up', 'HTTP_ERROR' as any));
    const service = new GuildsService(http);

    const call = service.getGuild({ guildId: 'guild_1' });

    await expect(call).rejects.toBeInstanceOf(GuildPassNetworkError);
    await expect(call).rejects.not.toBeInstanceOf(GuildPassApiError);
  });

  // ---------------------------------------------------------------------
  // contracts — a batch contract call throws GuildPassConfigError when
  // no RPC URL is configured for the chain.
  // ---------------------------------------------------------------------
  it('contracts module: throws GuildPassConfigError when no RPC URL is configured', async () => {
    const client = new ContractClient({ apiUrl: 'https://api.example.com' });

    await expect(
      client.getMembershipTokenBalancesBatch({
        walletAddresses: [validAddress],
        contractAddress: validAddress,
      }),
    ).rejects.toBeInstanceOf(GuildPassConfigError);
  });

  it('contracts module: throws GuildPassResponseValidationError on an out-of-range decimals value', async () => {
    const http = { get: vi.fn(), post: vi.fn() } as unknown as HttpClient;
    const client = new ContractClient(
      {
        apiUrl: 'https://api.example.com',
        contractProvider: {
          ethCall: vi.fn().mockResolvedValue('0x' + 'ff'.repeat(32)), // decodes to a value > 255
          batchEthCall: vi.fn(),
        },
      },
      http,
    );

    await expect(
      client.getTokenDecimals({ walletAddress: validAddress, contractAddress: validAddress }),
    ).rejects.toBeInstanceOf(GuildPassResponseValidationError);
  });
});
