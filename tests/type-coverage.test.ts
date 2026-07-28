import { expectTypeOf } from 'vitest';
import { GuildPassClient } from '../src/client/GuildPassClient';
import type { AccessCheckResult } from '../src/access/access.types';
import type { Membership } from '../src/membership/membership.types';
import type { GuildRole } from '../src/roles/roles.types';
import type { ResponseMetadata } from '../src/http/http.types';
import type { PaginatedResult } from '../src/utils/pagination';
import { describe, it } from 'vitest';

describe('TypeScript Type Coverage', () => {
  it('should have strongly typed method returns on GuildPassClient', async () => {
    // We don't need a real client since this is a type test
    const client = {} as unknown as GuildPassClient;

    // Test access service generic return types
    expectTypeOf(
      client.access.checkAccess({ walletAddress: '0x123', guildId: 'g1', resourceId: 'r1' })
    ).resolves.toEqualTypeOf<AccessCheckResult>();

    expectTypeOf(
      client.access.checkAccess(
        { walletAddress: '0x123', guildId: 'g1', resourceId: 'r1' },
        { includeMeta: true }
      )
    ).resolves.toEqualTypeOf<{ data: AccessCheckResult; meta: ResponseMetadata }>();

    // Test membership generic return types
    expectTypeOf(
      client.membership.getMembership({ walletAddress: '0x123', guildId: 'g1' })
    ).resolves.toEqualTypeOf<Membership>();

    expectTypeOf(
      client.membership.getMembership(
        { walletAddress: '0x123', guildId: 'g1' },
        { includeMeta: true }
      )
    ).resolves.toEqualTypeOf<{ data: Membership; meta: ResponseMetadata }>();

    // Test roles generic return types
    expectTypeOf(
      client.roles.getRoles({ guildId: 'g1' })
    ).resolves.toEqualTypeOf<GuildRole[]>();

    expectTypeOf(
      client.roles.getRoles({ guildId: 'g1', limit: 10 })
    ).resolves.toEqualTypeOf<PaginatedResult<GuildRole>>();

    expectTypeOf(
      client.roles.hasRole({ guildId: 'g1', walletAddress: '0x123', roleId: 'r1' })
    ).resolves.toEqualTypeOf<boolean>();
  });
});
