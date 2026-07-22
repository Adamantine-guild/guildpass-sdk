import { useState, useEffect, useCallback, useRef, DependencyList } from 'react';

interface UseQueryState<TData, TError> {
  data: TData | null;
  error: TError | null;
  isLoading: boolean;
  isFetching: boolean;
}

type QueryFn<TData> = (options: { signal: AbortSignal }) => Promise<TData>;

export function useQuery<TData, TError = Error>(
  queryFn: QueryFn<TData>,
  deps: DependencyList = []
): UseQueryState<TData, TError> & { refetch: () => Promise<void> } {
  const [state, setState] = useState<UseQueryState<TData, TError>>({
    data: null,
    error: null,
    isLoading: true,
    isFetching: true,
  });

  const queryFnRef = useRef(queryFn);
  const depsRef = useRef(deps);

  // Keep refs up to date
  useEffect(() => {
    queryFnRef.current = queryFn;
  }, [queryFn]);

  useEffect(() => {
    depsRef.current = deps;
  }, deps);

  const execute = useCallback(async (isRefetch = false) => {
    const abortController = new AbortController();
    const signal = abortController.signal;

    setState(prev => ({
      ...prev,
      isLoading: !isRefetch,
      isFetching: true,
      error: null,
    }));

    try {
      const data = await queryFnRef.current({ signal });
      if (!signal.aborted) {
        setState({
          data,
          error: null,
          isLoading: false,
          isFetching: false,
        });
      }
    } catch (error) {
      if (!signal.aborted) {
        setState({
          data: null,
          error: error as TError,
          isLoading: false,
          isFetching: false,
        });
      }
    }

    return () => abortController.abort();
  }, []);

  // Initial fetch
  useEffect(() => {
    const cleanup = execute(false);
    return () => {
      cleanup.then(cleanupFn => cleanupFn?.());
    };
  }, deps);

  const refetch = useCallback(async () => {
    await execute(true);
  }, [execute]);

  return { ...state, refetch };
}
