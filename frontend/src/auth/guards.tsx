import type { ReactNode } from 'react'
import { Navigate, Outlet, useLocation } from 'react-router-dom'
import { Alert, Spinner } from '../components/ui'
import { errorMessage } from '../lib/api'
import type { Me } from '../lib/types'
import { ForbiddenPage } from '../pages/ForbiddenPage'
import { useMe } from './useMe'

export function RequireAuth() {
  const me = useMe()
  const location = useLocation()

  if (me.isPending) return <Spinner fullPage />
  if (me.isError) return <Alert className="m-4">{errorMessage(me.error)}</Alert>
  if (!me.data) return <Navigate to="/login" replace state={{ from: `${location.pathname}${location.search}` }} />
  // USER-16: nothing else opens until MFA is set up
  if (me.data.mfa?.setupRequired && location.pathname !== '/mfa/setup') return <Navigate to="/mfa/setup" replace />
  return <Outlet />
}


/** PERM-4: hides screens only. The API checks every permission on its own. */
export function Allow({ when, children }: { when: (me: Me) => boolean; children: ReactNode }) {
  const { data: me } = useMe()
  return me && when(me) ? children : <ForbiddenPage />
}
