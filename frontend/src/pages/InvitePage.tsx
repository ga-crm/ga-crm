import { zodResolver } from '@hookform/resolvers/zod'
import { useMutation, useQuery } from '@tanstack/react-query'
import { useForm } from 'react-hook-form'
import { Link, useNavigate, useParams } from 'react-router-dom'
import { z } from 'zod'
import { AuthLayout } from '../components/AuthLayout'
import { Alert, Button, Field, FormError, Input, Spinner } from '../components/ui'
import { t } from '../i18n'
import { api, errorMessage } from '../lib/api'
import { queries } from '../lib/queries'
import { setSessionUser } from '../lib/queryClient'
import type { Me } from '../lib/types'

// USER-4
const schema = z
  .object({
    password: z.string().min(8, t('validation.password')).max(128, t('validation.password')),
    confirm: z.string(),
  })
  .refine((values) => values.password === values.confirm, { path: ['confirm'], message: t('validation.passwordMatch') })
type FormValues = z.infer<typeof schema>

export function InvitePage() {
  const { token = '' } = useParams()
  const navigate = useNavigate()
  const form = useForm<FormValues>({ resolver: zodResolver(schema) })

  const invite = useQuery(queries.invite(token))
  const accept = useMutation({
    mutationFn: ({ password }: FormValues) => api.post<Me>('/invites/accept', { token, password }),
    onSuccess: (me) => {
      setSessionUser(me)
      navigate('/', { replace: true })
    },
  })

  const { errors } = form.formState
  return (
    <AuthLayout title={t('invite.title')}>
      {invite.isPending && <Spinner />}
      {invite.isError && (
        <div className="space-y-4">
          <Alert>{errorMessage(invite.error)}</Alert>
          <Link to="/login" className="text-link text-primary hover:underline">
            {t('invite.backToSignIn')}
          </Link>
        </div>
      )}
      {invite.data && (
        <form noValidate onSubmit={form.handleSubmit((values) => accept.mutate(values))}>
          {invite.data.tenantName && (
            <Field label={t('invite.ga')} htmlFor="ga">
              <Input id="ga" readOnly value={invite.data.tenantName} />
            </Field>
          )}
          <Field label={t('invite.email')} htmlFor="email">
            <Input id="email" readOnly autoComplete="username" value={invite.data.email} />
          </Field>
          <Field label={t('invite.password')} htmlFor="password" error={errors.password?.message}>
            <Input id="password" type="password" placeholder={t('placeholder.newPassword')} autoComplete="new-password" aria-invalid={!!errors.password} {...form.register('password')} />
          </Field>
          <Field label={t('invite.confirm')} htmlFor="confirm" error={errors.confirm?.message}>
            <Input id="confirm" type="password" placeholder={t('placeholder.confirmPassword')} autoComplete="new-password" aria-invalid={!!errors.confirm} {...form.register('confirm')} />
          </Field>
          <FormError message={accept.isError ? errorMessage(accept.error) : undefined} />
          <Button type="submit" className="w-full" disabled={accept.isPending}>
            {t('invite.submit')}
          </Button>
        </form>
      )}
    </AuthLayout>
  )
}
