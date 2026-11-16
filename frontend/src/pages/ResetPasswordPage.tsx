import { zodResolver } from '@hookform/resolvers/zod'
import { useMutation, useQuery } from '@tanstack/react-query'
import { useForm } from 'react-hook-form'
import { Link, useParams } from 'react-router-dom'
import { z } from 'zod'
import { AuthLayout } from '../components/AuthLayout'
import { Alert, Button, Field, FormError, Input, Notice, Spinner } from '../components/ui'
import { t } from '../i18n'
import { api, ApiError, errorMessage } from '../lib/api'
import { queries } from '../lib/queries'

const schema = z
  .object({
    password: z.string().min(8, t('validation.password')).max(128, t('validation.password')),
    confirm: z.string(),
  })
  .refine((values) => values.password === values.confirm, { path: ['confirm'], message: t('validation.passwordMatch') })
type FormValues = z.infer<typeof schema>

// The API shares invite_invalid with invitations (section 17.2), but its message talks about invites
const linkError = (error: unknown) => (error instanceof ApiError && error.code === 'invite_invalid' ? t('reset.invalid') : errorMessage(error))

/** USER-16: public page opened from a link an administrator created. */
export function ResetPasswordPage() {
  const { token = '' } = useParams()
  const form = useForm<FormValues>({ resolver: zodResolver(schema) })

  const info = useQuery(queries.passwordReset(token))
  const reset = useMutation({
    mutationFn: ({ password }: FormValues) => api.post('/auth/password/reset', { token, password }),
  })

  const signInLink = (
    <Link to="/login" className="inline-block text-link text-primary hover:underline">
      {t('reset.toSignIn')}
    </Link>
  )
  const { errors } = form.formState

  return (
    <AuthLayout title={t('reset.title')}>
      {reset.isSuccess ? (
        <div className="space-y-4">
          <Notice>{t('reset.done')}</Notice>
          {signInLink}
        </div>
      ) : (
        <>
          {info.isPending && <Spinner />}
          {info.isError && (
            <div className="space-y-4">
              <Alert>{linkError(info.error)}</Alert>
              {signInLink}
            </div>
          )}
          {info.data && (
            <form noValidate onSubmit={form.handleSubmit((values) => reset.mutate(values))}>
              <Field label={t('invite.email')} htmlFor="email">
                <Input id="email" readOnly autoComplete="username" value={info.data.email} />
              </Field>
              <Field label={t('settings.newPassword')} htmlFor="password" error={errors.password?.message}>
                <Input id="password" type="password" placeholder={t('placeholder.newPassword')} autoComplete="new-password" aria-invalid={!!errors.password} {...form.register('password')} />
              </Field>
              <Field label={t('settings.confirmPassword')} htmlFor="confirm" error={errors.confirm?.message}>
                <Input id="confirm" type="password" placeholder={t('placeholder.confirmPassword')} autoComplete="new-password" aria-invalid={!!errors.confirm} {...form.register('confirm')} />
              </Field>
              <FormError message={reset.isError ? linkError(reset.error) : undefined} />
              <Button type="submit" className="w-full" disabled={reset.isPending}>
                {t('reset.submit')}
              </Button>
            </form>
          )}
        </>
      )}
    </AuthLayout>
  )
}
