import { QueryClient } from '@tanstack/react-query'
import { ApiError } from './api'
import { keys } from './queries'
import type { Me } from './types'

/** 4xx will fail the same way again; a retry only adds load, and could trip the server's rate limits. */
const isRetryable = (error: unknown) => !(error instanceof ApiError && error.status >= 400 && error.status < 500)

export const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      // Screens reuse what they just loaded instead of asking again on every visit
      staleTime: 30_000,
      gcTime: 5 * 60_000,
      refetchOnWindowFocus: false,
      refetchOnReconnect: true,
      retry: (count, error) => isRetryable(error) && count < 2,
    },
    // Writes are never repeated automatically: the first one may have succeeded
    mutations: { retry: false },
  },
})

/**
 * Whoever is signed in has changed, so nothing loaded for the previous person may stay in memory.
 * `me` is kept as a query rather than removed, because mounted screens are observing it.
 */
/** Public pages load these without a session, so a sign-in or a 401 must not drop them mid-flight. */
export const SESSION_FREE = new Set<unknown>([keys.me[0], keys.devAccounts[0], 'publicForm', 'invite', 'password-reset'])

export function setSessionUser(me: Me | null) {
  queryClient.removeQueries({ predicate: (query) => !SESSION_FREE.has(query.queryKey[0]) })
  queryClient.setQueryData(keys.me, me)
}
