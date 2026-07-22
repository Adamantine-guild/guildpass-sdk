import { useMemo } from 'react';
import { useGuildPassClient } from './context';
import { useQuery } from './useQuery';
import type {
  AccessCheckParams,
  AccessCheckResult,
  MembershipParams,
  Membership,
} from '@guildpass/sdk';

export function useAccessCheck(params: AccessCheckParams | null) {
  const client = useGuildPassClient();

  const result = useQuery(
    ({ signal }) => {
      if (!params) return Promise.resolve(null);
      return client.access.checkAccess(params, { signal });
    },
    useMemo(() => [params?.guildId, params?.resourceId, params?.walletAddress], [params?.guildId, params?.resourceId, params?.walletAddress])
  );

  return result;
}

export function useMembership(params: MembershipParams | null) {
  const client = useGuildPassClient();

  const result = useQuery(
    ({ signal }) => {
      if (!params) return Promise.resolve(null);
      return client.membership.getMembership(params, { signal });
    },
    useMemo(() => [params?.guildId, params?.walletAddress], [params?.guildId, params?.walletAddress])
  );

  return result;
}
