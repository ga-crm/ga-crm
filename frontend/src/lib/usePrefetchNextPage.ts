import { useQueryClient } from '@tanstack/react-query'
import type { FetchQueryOptions } from '@tanstack/react-query'
import { useEffect } from 'react'
import type { PageParams } from './queries'

/** Loads the following page in the background, so moving to it feels instant. */
export function usePrefetchNextPage<P extends PageParams>(
  query: (params: P) => unknown,
  params: P,
  data?: { total: number },
) {
  const queryClient = useQueryClient()
  const hasNext = !!data && params.page * params.pageSize < data.total
  const key = JSON.stringify(params)

  useEffect(() => {
    if (hasNext) {
      void queryClient.prefetchQuery(query({ ...params, page: params.page + 1 }) as FetchQueryOptions)
    }
    // key stands for params, which is a new object each render
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [hasNext, key, queryClient])
}
