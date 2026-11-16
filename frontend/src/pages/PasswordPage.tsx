import { zodResolver } from '@hookform/resolvers/zod'
import { useMutation } from '@tanstack/react-query'
import { useForm } from 'react-hook-form'
import { z } from 'zod'
import { Button, Container, Field, FormError, Input, PageHeader } from '../components/ui'
import { t } from '../i18n'
import { api, errorMessage } from '../lib/api'
import { toast } from '../lib/toast'

const schema = z
  .object({
    currentPassword: z.string().min(1, t('validation.required')),
    newPassword: z.string().min(8, t('validation.password')).max(128, t('validation.password')),
    confirm: z.string(),
  })
  .refine((values) => values.newPassword === values.confirm, { path: ['confirm'], message: t('validation.passwordMatch') })
type FormValues = z.infer<typeof schema>

export function PasswordPage() {
  const form = useForm<FormValues>({
    resolver: zodResolver(schema),
    defaultValues: { currentPassword: '', newPassword: '', confirm: '' },
  })
  const change = useMutation({
    mutationFn: ({ currentPassword, newPassword }: FormValues) => api.post('/auth/password/change', { currentPassword, newPassword }),
    onSuccess: () => {
      form.reset()
      toast.success(t('toast.passwordChanged'), t('toast.passwordChangedDetail'))
    },
  })
  const signOutOthers = useMutation({
    mutationFn: () => api.post('/auth/sign-out-others'),
    onSuccess: () => toast.success(t('settings.otherDevicesSignedOut')),
    onError: (error) => toast.error(t('toast.signOutOthersFailed'), errorMessage(error)),
  })
  const { errors } = form.formState

  return (
    <>
      <PageHeader title={t('settings.password')} subtitle={t('settings.passwordHint')} />
      <Container className="pt-2 pb-8">
        <form className="max-w-md" noValidate onSubmit={form.handleSubmit((values) => change.mutate(values))}>
          <Field label={t('settings.currentPassword')} htmlFor="current-password" error={errors.currentPassword?.message}>
            <Input id="current-password" placeholder={t('placeholder.currentPassword')} type="password" autoComplete="current-password" aria-invalid={!!errors.currentPassword} {...form.register('currentPassword')} />
          </Field>
          <Field label={t('settings.newPassword')} htmlFor="new-password" error={errors.newPassword?.message}>
            <Input id="new-password" placeholder={t('placeholder.newPassword')} type="password" autoComplete="new-password" aria-invalid={!!errors.newPassword} {...form.register('newPassword')} />
          </Field>
          <Field label={t('settings.confirmPassword')} htmlFor="confirm-password" error={errors.confirm?.message}>
            <Input id="confirm-password" placeholder={t('placeholder.confirmPassword')} type="password" autoComplete="new-password" aria-invalid={!!errors.confirm} {...form.register('confirm')} />
          </Field>
          <FormError message={change.isError ? errorMessage(change.error) : undefined} />
          <Button type="submit" disabled={change.isPending}>
            {t('settings.changePassword')}
          </Button>
        </form>

        <section className="mt-10 max-w-md">
          <h2 className="text-subhead text-ink">{t('settings.otherDevices')}</h2>
          <p className="mt-1 mb-3 text-caption text-ink-meta">{t('settings.otherDevicesHint')}</p>
          <Button variant="secondary" disabled={signOutOthers.isPending} onClick={() => signOutOthers.mutate()}>
            {t('settings.signOutOthers')}
          </Button>
        </section>
      </Container>
    </>
  )
}
