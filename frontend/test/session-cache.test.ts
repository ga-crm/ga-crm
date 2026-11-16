import { describe, expect, it } from 'vitest'
import { keys, queries } from '../src/lib/queries'
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

  it('keeps what public pages load without a session, so a 401 from /me does not cancel it', () => {
    queryClient.clear()
    // Every query a signed-out visitor runs: the public form, an invite, a password reset link
    const publicKeys = [queries.publicForm('hoi-thao').queryKey, queries.invite('token').queryKey, queries.passwordReset('token').queryKey]
    for (const key of publicKeys) queryClient.setQueryData(key, { ok: true })

    setSessionUser(null)

    for (const key of publicKeys) expect(queryClient.getQueryData(key), String(key[0])).toEqual({ ok: true })
  })
})
