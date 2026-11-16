import { useQueryClient } from '@tanstack/react-query'
import { Button } from '../components/ui'
import { api, ApiError, errorMessage } from '../lib/api'
import { setSessionUser } from '../lib/queryClient'
import { toast } from '../lib/toast'
import { Navigate, useNavigate } from 'react-router-dom'
import { useMe } from '../auth/useMe'
import { AuthLayout } from '../components/AuthLayout'
import { MfaSetup } from '../components/MfaSetup'
import { t } from '../i18n'
import { keys } from '../lib/queries'

/** USER-16: GA_HEAD, ADMIN, PLATFORM_ADMIN (or everyone, if the GA says so) set MFA up before anything else. */
export function MfaSetupPage() {
  const queryClient = useQueryClient()
  const navigate = useNavigate()
  const { data: me } = useMe()
  // Nothing to do here when MFA is not required (MFA_ENFORCE=false, or the role and GA do not ask
  // for it). Not tied to "set up", or the page would leave before the recovery codes are saved.
  if (me && !me.mfa?.required) return <Navigate to="/" replace />
  return (
    <AuthLayout title={t('mfa.requiredTitle')} subtitle={t('mfa.requiredSubtitle')}>
      <MfaSetup
        onDone={() => {
          void queryClient.invalidateQueries({ queryKey: keys.me }).then(() => navigate('/', { replace: true }))
        }}
      />
      <Button
        variant="ghost"
        className="mt-4 w-full"
        onClick={() => {
          // As in AccountMenu: leave only once the API ended the session (or no longer knows it)
          void api.post('/auth/sign-out').then(
            () => {
              setSessionUser(null)
              navigate('/login', { replace: true })
            },
            (error: unknown) => {
              if (error instanceof ApiError && error.status === 401) {
                setSessionUser(null)
                navigate('/login', { replace: true })
              } else toast.error(t('toast.signOutFailed'), errorMessage(error))
            },
          )
        }}
      >
        {t('mfa.signOut')}
      </Button>
    </AuthLayout>
  )
}
