import { zodResolver } from '@hookform/resolvers/zod'
import { useMutation } from '@tanstack/react-query'
import { useState } from 'react'
import { useForm } from 'react-hook-form'
import { Navigate, useLocation, useNavigate } from 'react-router-dom'
import { z } from 'zod'
import { useMe } from '../auth/useMe'
import { AuthLayout } from '../components/AuthLayout'
import { Button, Field, FormError, Input, Spinner } from '../components/ui'
import { t } from '../i18n'
import { api, errorMessage } from '../lib/api'
import { setSessionUser } from '../lib/queryClient'
import { DevAccountSwitcher } from '../components/DevAccountSwitcher'
import type { Me } from '../lib/types'

const schema = z.object({
  email: z.string().trim().pipe(z.email(t('validation.email'))),
  password: z.string().min(1, t('validation.required')),
})
type FormValues = z.infer<typeof schema>

export function LoginPage() {
  const me = useMe()
  const navigate = useNavigate()
  const location = useLocation()
  const from = (location.state as { from?: string } | null)?.from ?? '/'

  const form = useForm<FormValues>({ resolver: zodResolver(schema) })
  // USER-16: the password was right and the account asks for its MFA code
  const [askCode, setAskCode] = useState(false)
  const [code, setCode] = useState('')
  const signIn = useMutation({
    mutationFn: (values: FormValues) => api.post<Me | { mfaRequired: true }>('/auth/sign-in/email', values),
    onSuccess: (data) => {
      if ('mfaRequired' in data) {
        setAskCode(true)
        return
      }
      setSessionUser(data)
      navigate(from, { replace: true })
    },
  })
  const verify = useMutation({
    mutationFn: async () => {
      await api.post('/auth/mfa/verify', { code: code.trim() })
      return api.get<Me>('/me')
    },
    onSuccess: (data) => {
      setSessionUser(data)
      navigate(from, { replace: true })
    },
  })

  if (me.isPending) return <Spinner fullPage />
  if (me.data) return <Navigate to={from} replace />

  const { errors } = form.formState
  if (askCode)
    return (
      <AuthLayout title={t('mfa.signInTitle')} subtitle={t('mfa.signInSubtitle')}>
        <form
          noValidate
          onSubmit={(event) => {
            event.preventDefault()
            if (code.trim()) verify.mutate()
          }}
        >
          <Field label={t('mfa.codeOrRecovery')} htmlFor="mfa-code" hint={t('mfa.signInHint')}>
            <Input id="mfa-code" autoFocus autoComplete="one-time-code" inputMode="numeric" maxLength={20} placeholder={t('placeholder.mfaCode')} value={code} onChange={(event) => setCode(event.target.value)} />
          </Field>
          <FormError message={verify.isError ? errorMessage(verify.error) : undefined} />
          <Button type="submit" className="w-full" disabled={!code.trim() || verify.isPending}>
            {t('mfa.verify')}
          </Button>
          <Button
            type="button"
            variant="ghost"
            className="mt-2 w-full"
            onClick={() => {
              void api.post('/auth/sign-out').catch(() => undefined)
              setAskCode(false)
              setCode('')
            }}
          >
            {t('mfa.back')}
          </Button>
        </form>
      </AuthLayout>
    )
  return (
    <AuthLayout title={t('signIn.title')} subtitle={t('signIn.subtitle')}>
      <form noValidate onSubmit={form.handleSubmit((values) => signIn.mutate(values))}>
        <Field label={t('signIn.email')} htmlFor="email" error={errors.email?.message}>
          <Input id="email" type="email" placeholder={t('placeholder.email')} autoComplete="username" aria-invalid={!!errors.email} {...form.register('email')} />
        </Field>
        <Field label={t('signIn.password')} htmlFor="password" error={errors.password?.message}>
          <Input id="password" type="password" placeholder={t('placeholder.password')} autoComplete="current-password" aria-invalid={!!errors.password} {...form.register('password')} />
        </Field>
        <FormError message={signIn.isError ? errorMessage(signIn.error) : undefined} />
        <Button type="submit" className="w-full" disabled={signIn.isPending}>
          {t('signIn.submit')}
        </Button>
      </form>
      {/* Testing only: hidden unless DEV_ACCOUNT_SWITCHER is on and this is a development build */}
      {import.meta.env.DEV && (
        <div className="mt-4">
          <DevAccountSwitcher variant="login" />
        </div>
      )}
    </AuthLayout>
  )
}
