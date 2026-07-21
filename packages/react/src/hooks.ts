import { useCallback, useEffect, useRef, useState } from 'react'
import type {
  AccessCheckParams,
  AccessCheckResult,
  MembershipParams,
  Membership,
} from '@guildpass/sdk'
import { useGuildPassClient } from './context'

interface UseQueryResult<T> {
  data: T | null
  error: Error | null
  isLoading: boolean
  refetch: () => Promise<void>
}

const useQuery = <T>(
  fetchFn: (signal: AbortSignal) => Promise<T>,
  deps: React.DependencyList
): UseQueryResult<T> => {
  const [data, setData] = useState<T | null>(null)
  const [error, setError] = useState<Error | null>(null)
  const [isLoading, setIsLoading] = useState(true)
  const controllerRef = useRef<AbortController | null>(null)

  const fetch = useCallback(async () => {
    // Cancel any previous request
    if (controllerRef.current) {
      controllerRef.current.abort()
    }

    const controller = new AbortController()
    controllerRef.current = controller

    setIsLoading(true)
    setError(null)

    try {
      const result = await fetchFn(controller.signal)
      if (!controller.signal.aborted) {
        setData(result)
      }
    } catch (err) {
      if (!controller.signal.aborted) {
        setError(err as Error)
      }
    } finally {
      if (!controller.signal.aborted) {
        setIsLoading(false)
      }
    }
  }, deps) // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    fetch()

    return () => {
      if (controllerRef.current) {
        controllerRef.current.abort()
      }
    }
  }, [fetch])

  return {
    data,
    error,
    isLoading,
    refetch: fetch,
  }
}

export const useAccessCheck = (
  params: AccessCheckParams
): UseQueryResult<AccessCheckResult> => {
  const client = useGuildPassClient()

  const fetchFn = useCallback(
    async (signal: AbortSignal) => {
      return client.access.checkAccess(params, { signal })
    },
    [client, params]
  )

  return useQuery(fetchFn, [client, params])
}

export const useMembership = (
  params: MembershipParams
): UseQueryResult<Membership> => {
  const client = useGuildPassClient()

  const fetchFn = useCallback(
    async (signal: AbortSignal) => {
      return client.membership.getMembership(params, { signal })
    },
    [client, params]
  )

  return useQuery(fetchFn, [client, params])
}
