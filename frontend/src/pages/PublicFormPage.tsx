import { zodResolver } from '@hookform/resolvers/zod'
import { useMutation, useQuery } from '@tanstack/react-query'
import { CircleCheck } from 'lucide-react'
import { useState } from 'react'
import { useForm, Controller } from 'react-hook-form'
import { useParams } from 'react-router-dom'
import { z } from 'zod'
import { Alert, Button, Field, FormError, Input, Spinner, Textarea, Checkbox } from '../components/ui'
import { t } from '../i18n'
import { api, ApiError, errorMessage } from '../lib/api'
import { queries } from '../lib/queries'
import { useTurnstile } from '../lib/turnstile'
import { optionalEmail, optionalText, phoneField, requiredText } from '../lib/validation'

const schema = z.object({
  fullName: requiredText(100),
  phone: phoneField,
  email: optionalEmail,
  province: optionalText(100),
  need: optionalText(500),
  consent: z.boolean().refine((value) => value, t('publicForm.consentRequired')),
})
type Values = z.input<typeof schema>

/** CMP-4: the page a customer opens from a link or QR code. No sign-in, no CRM chrome. */
export function PublicFormPage() {
  const { slug = '' } = useParams()
  const definition = useQuery(queries.publicForm(slug))
  const [token, setToken] = useState('')
  const [sent, setSent] = useState(false)
  const box = useTurnstile(definition.data?.turnstileSiteKey ?? null, setToken)
  const form = useForm<Values>({ resolver: zodResolver(schema), mode: 'onTouched', defaultValues: { fullName: '', phone: '', email: '', province: '', need: '', consent: false } })
  const submit = useMutation({
    mutationFn: (values: Values) => api.post(`/public/forms/${encodeURIComponent(slug)}`, { ...values, turnstileToken: token || undefined }),
    onSuccess: () => setSent(true),
    onError: (error) => {
      if (error instanceof ApiError && error.code === 'invalid_phone') form.setError('phone', { message: t('validation.phone') })
    },
  })
  const { errors } = form.formState
  const fields = new Set(definition.data?.fields ?? [])
  const needsToken = !!definition.data?.turnstileSiteKey

  return (
    <div className="flex min-h-dvh flex-col bg-canvas">
      <header className="flex h-15 flex-none items-center bg-chrome px-4 md:px-6">
        <p className="truncate text-nav font-medium text-ink">{definition.data?.gaName ?? ''}</p>
      </header>
      <main className="flex flex-1 justify-center px-4 py-8">
        <div className="w-full max-w-md">
          {definition.isPending && <Spinner />}
          {definition.isError && <Alert>{errorMessage(definition.error)}</Alert>}
          {definition.data && sent && (
            <div className="rounded-lg bg-chrome p-6 text-center">
              <CircleCheck aria-hidden size={40} className="mx-auto text-success" />
              <h1 className="mt-3 text-subhead text-ink">{t('publicForm.thanks')}</h1>
              <p className="mt-2 text-link text-ink-body">{t('publicForm.thanksBody', { ga: definition.data.gaName })}</p>
            </div>
          )}
          {definition.data && !sent && (
            <>
              <h1 className="text-section-title text-ink">{definition.data.campaignName}</h1>
              <p className="mt-2 text-link text-ink-body">{t('publicForm.intro', { ga: definition.data.gaName })}</p>
              <form className="mt-6" noValidate onSubmit={form.handleSubmit((values) => submit.mutate(values))}>
                <Field label={t('publicForm.fullName')} htmlFor="pf-name" required error={errors.fullName?.message}>
                  <Input id="pf-name" autoComplete="name" maxLength={100} placeholder={t('placeholder.fullName')} aria-invalid={!!errors.fullName} {...form.register('fullName')} />
                </Field>
                <Field label={t('publicForm.phone')} htmlFor="pf-phone" required error={errors.phone?.message}>
                  <Input id="pf-phone" type="tel" autoComplete="tel" inputMode="tel" maxLength={20} placeholder={t('placeholder.phone')} aria-invalid={!!errors.phone} {...form.register('phone')} />
                </Field>
                {fields.has('email') && (
                  <Field label={t('publicForm.email')} htmlFor="pf-email" error={errors.email?.message}>
                    <Input id="pf-email" type="email" autoComplete="email" maxLength={200} placeholder={t('placeholder.email')} aria-invalid={!!errors.email} {...form.register('email')} />
                  </Field>
                )}
                {fields.has('province') && (
                  <Field label={t('publicForm.province')} htmlFor="pf-province" error={errors.province?.message}>
                    <Input id="pf-province" autoComplete="address-level1" maxLength={100} placeholder={t('placeholder.province')} aria-invalid={!!errors.province} {...form.register('province')} />
                  </Field>
                )}
                {fields.has('need') && (
                  <Field label={t('publicForm.need')} htmlFor="pf-need" error={errors.need?.message}>
                    <Textarea id="pf-need" rows={3} maxLength={500} placeholder={t('placeholder.need')} aria-invalid={!!errors.need} {...form.register('need')} />
                  </Field>
                )}
                <label className="mt-2 flex items-start gap-3 text-caption text-ink-body">
                  <Controller control={form.control} name="consent" render={({ field }) => <Checkbox ref={field.ref} className="mt-0.5" aria-invalid={!!errors.consent} checked={!!field.value} onChange={field.onChange} onBlur={field.onBlur} />} />
                  <span className="whitespace-pre-wrap">{definition.data.consentText}</span>
                </label>
                <p className="mt-1 min-h-5 text-caption text-alert">{errors.consent?.message ?? ''}</p>
                <details className="mt-2 text-caption text-ink-meta">
                  <summary className="cursor-pointer text-primary">{t('publicForm.privacy')}</summary>
                  <p className="mt-2 whitespace-pre-wrap">{definition.data.privacyNotice}</p>
                </details>
                {needsToken && <div ref={box} className="mt-4 min-h-16" />}
                <FormError message={submit.isError && !(submit.error instanceof ApiError && submit.error.code === 'invalid_phone') ? errorMessage(submit.error) : undefined} />
                <Button type="submit" className="mt-2 w-full" disabled={submit.isPending || (needsToken && !token)}>
                  {t('publicForm.submit')}
                </Button>
              </form>
            </>
          )}
        </div>
      </main>
    </div>
  )
}
