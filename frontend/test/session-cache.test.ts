import { describe, expect, it } from 'vitest'
import { keys } from '../src/lib/queries'
import { queryClient, setSessionUser } from '../src/lib/queryClient'
import type { Me } from '../src/lib/types'

describe('setSessionUser', () => {
  it("leaves nothing of the previous person's data in the cache", () => {
    queryClient.setQueryData([...keys.users, 'list', { page: 1 }], { items: ['previous person'] })
    queryClient.setQueryData(keys.audit, { items: ['previous person'] })
    const next = { user: { id: 'next' } } as Me

    setSessionUser(next)

    expect(queryClient.getQueryData(keys.me)).toEqual(next)
    expect(queryClient.getQueryCache().getAll().map((query) => query.queryKey)).toEqual([keys.me])
  })
})
