import { zodResolver } from '@hookform/resolvers/zod'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { useEffect, useRef } from 'react'
import { useForm, Controller } from 'react-hook-form'
import { z } from 'zod'
import { Alert, Button, Card, Container, Field, FormError, Input, PageHeader, Spinner, Checkbox } from '../components/ui'
import { t } from '../i18n'
import { api, errorMessage } from '../lib/api'
import { keys, queries } from '../lib/queries'
import { toast } from '../lib/toast'
import type { GaSettings } from '../lib/types'
import { optionalText } from '../lib/validation'

const hours = z.coerce.number<string>().int(t('validation.hours')).min(1, t('validation.hours')).max(720, t('validation.hours'))

const clock = z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/, t('validation.time'))

const schema = z.object({
  displayName: optionalText(120),
  address: optionalText(300),
  contactDeadlineHours: hours,
  contactedInTimeHours: hours,
  quietFrom: clock,
  quietTo: clock,
  mfaForAll: z.boolean(),
})
type Values = z.input<typeof schema>
type Parsed = z.output<typeof schema>

const toValues = (settings: GaSettings): Values => ({
  displayName: settings.profile.displayName,
  address: settings.profile.address,
  contactDeadlineHours: String(settings.leadRules.contactDeadlineHours),
  contactedInTimeHours: String(settings.leadRules.contactedInTimeHours),
  quietFrom: settings.notifications.quietHours.from,
  quietTo: settings.notifications.quietHours.to,
  mfaForAll: settings.security.mfaForAll,
})

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="border-b border-band px-4 py-5 last:border-b-0 md:px-6">
      <h2 className="mb-3 text-subhead text-ink">{title}</h2>
      {children}
    </section>
  )
}

/** Section 5.2 + 16.16: Cài đặt GA (GAD). Lists and the working calendar come with their features. */
export function GaSettingsPage() {
  const queryClient = useQueryClient()
  const settings = useQuery(queries.gaSettings())
  const form = useForm<Values, unknown, Parsed>({ resolver: zodResolver(schema), mode: 'onTouched' })
  const { errors, isDirty } = form.formState

  // The version the form was filled from. Saving sends this one, never a newer one fetched since,
  // or a form left open would overwrite someone else's save instead of getting stale_settings.
  const openedVersion = useRef<number | null>(null)

  // Fill the form from the stored values, but never over edits in progress
  useEffect(() => {
    if (settings.data && !form.formState.isDirty) {
      form.reset(toValues(settings.data))
      openedVersion.current = settings.data.version
    }
  }, [settings.data, form])

  const save = useMutation({
    mutationFn: (values: Parsed) =>
      api.put('/settings', {
        // Section 5.2: the version the form was opened with, so a newer save is never overwritten
        version: openedVersion.current,
        profile: { displayName: values.displayName, address: values.address },
        leadRules: { contactDeadlineHours: values.contactDeadlineHours, contactedInTimeHours: values.contactedInTimeHours },
        notifications: { quietHours: { from: values.quietFrom, to: values.quietTo } },
        security: { mfaForAll: values.mfaForAll },
      }),
    onSuccess: async () => {
      // Clean again, so the refetched values (and their version) fill the form
      form.reset(form.getValues())
      await Promise.all([queryClient.invalidateQueries({ queryKey: keys.gaSettings }), queryClient.invalidateQueries({ queryKey: keys.me }), queryClient.invalidateQueries({ queryKey: keys.leads })])
      toast.success(t('toast.settingsSaved'), t('toast.settingsSavedDetail'))
    },
  })

  return (
    <>
      <PageHeader
        title={t('settingsGa.title')}
        subtitle={t('settingsGa.subtitle')}
        action={
          <Button type="submit" form="ga-settings" disabled={!settings.data || !isDirty || save.isPending}>
            {t('common.save')}
          </Button>
        }
      />
      <Container className="min-h-0 flex-1 overflow-y-auto pb-6">
        {settings.isPending && <Spinner />}
        {settings.isError && <Alert>{errorMessage(settings.error)}</Alert>}
        {settings.data && (
          <form id="ga-settings" noValidate onSubmit={form.handleSubmit((values) => save.mutate(values))}>
            <Card>
              <Section title={t('settingsGa.profile')}>
                <dl className="mb-4 grid gap-x-4 gap-y-1 text-caption sm:grid-cols-2">
                  <div>
                    <dt className="text-ink-meta">{t('settingsGa.gaCode')}</dt>
                    <dd className="text-ink-body">{settings.data.gaCode}</dd>
                  </div>
                  <div>
                    <dt className="text-ink-meta">{t('settingsGa.platformName')}</dt>
                    <dd className="text-ink-body">{settings.data.gaName}</dd>
                  </div>
                </dl>
                <div className="grid gap-x-4 sm:grid-cols-2">
                  <Field label={t('settingsGa.displayName')} htmlFor="settings-display-name" error={errors.displayName?.message} hint={t('settingsGa.displayNameHint')}>
                    <Input id="settings-display-name" placeholder={t('placeholder.displayName')} maxLength={120} aria-invalid={!!errors.displayName} {...form.register('displayName')} />
                  </Field>
                  <Field label={t('settingsGa.address')} htmlFor="settings-address" error={errors.address?.message}>
                    <Input id="settings-address" placeholder={t('placeholder.address')} maxLength={300} aria-invalid={!!errors.address} {...form.register('address')} />
                  </Field>
                </div>
              </Section>
              <Section title={t('settingsGa.leadRules')}>
                <div className="grid gap-x-4 sm:grid-cols-2">
                  <Field label={t('settingsGa.deadline')} htmlFor="settings-deadline" required error={errors.contactDeadlineHours?.message} hint={t('settingsGa.deadlineHint')}>
                    <Input id="settings-deadline" type="number" min={1} max={720} inputMode="numeric" placeholder={t('placeholder.hours')} aria-invalid={!!errors.contactDeadlineHours} {...form.register('contactDeadlineHours')} />
                  </Field>
                  <Field label={t('settingsGa.inTime')} htmlFor="settings-in-time" required error={errors.contactedInTimeHours?.message} hint={t('settingsGa.inTimeHint')}>
                    <Input id="settings-in-time" type="number" min={1} max={720} inputMode="numeric" placeholder={t('placeholder.hours')} aria-invalid={!!errors.contactedInTimeHours} {...form.register('contactedInTimeHours')} />
                  </Field>
                </div>
              </Section>
              {/* NTF-3: the morning round of notifications waits for quiet hours to end */}
              <Section title={t('settingsGa.quietHours')}>
                <div className="grid gap-x-4 sm:grid-cols-2">
                  <Field label={t('settingsGa.quietFrom')} htmlFor="settings-quiet-from" required error={errors.quietFrom?.message}>
                    <Input id="settings-quiet-from" type="time" placeholder={t('placeholder.time')} aria-invalid={!!errors.quietFrom} {...form.register('quietFrom')} />
                  </Field>
                  <Field label={t('settingsGa.quietTo')} htmlFor="settings-quiet-to" required error={errors.quietTo?.message} hint={t('settingsGa.quietHint')}>
                    <Input id="settings-quiet-to" type="time" placeholder={t('placeholder.time')} aria-invalid={!!errors.quietTo} {...form.register('quietTo')} />
                  </Field>
                </div>
              </Section>
              {/* USER-16: GAD and ADMIN always; everyone when ticked */}
              <Section title={t('settingsGa.security')}>
                <label className="flex items-start gap-3">
                  <Controller control={form.control} name="mfaForAll" render={({ field }) => <Checkbox ref={field.ref} className="mt-1" checked={!!field.value} onChange={field.onChange} onBlur={field.onBlur} />} />
                  <span>
                    <span className="block text-link text-ink">{t('settingsGa.mfaForAll')}</span>
                    <span className="block text-caption text-ink-meta">{t('settingsGa.mfaForAllHint')}</span>
                  </span>
                </label>
              </Section>
              <Section title={t('settingsGa.plan')}>
                <dl className="grid gap-x-4 gap-y-1 text-caption sm:grid-cols-2">
                  <div>
                    <dt className="text-ink-meta">{t('settingsGa.planName')}</dt>
                    <dd className="text-ink-body">{settings.data.plan.name}</dd>
                  </div>
                  <div>
                    <dt className="text-ink-meta">{t('settingsGa.users')}</dt>
                    <dd className="tabular-nums text-ink-body">
                      {settings.data.plan.limits.maxUsers ? t('tenants.usersOfMax', { users: settings.data.plan.users, max: settings.data.plan.limits.maxUsers }) : settings.data.plan.users}
                    </dd>
                  </div>
                  <div>
                    <dt className="text-ink-meta">{t('tenants.limit.aiTokensPerMonth')}</dt>
                    <dd className="tabular-nums text-ink-body">{settings.data.plan.limits.aiTokensPerMonth ? new Intl.NumberFormat('vi-VN').format(settings.data.plan.limits.aiTokensPerMonth) : t('settingsGa.noLimit')}</dd>
                  </div>
                  <div>
                    <dt className="text-ink-meta">{t('tenants.limit.storageMb')}</dt>
                    <dd className="tabular-nums text-ink-body">{settings.data.plan.limits.storageMb ? new Intl.NumberFormat('vi-VN').format(settings.data.plan.limits.storageMb) : t('settingsGa.noLimit')}</dd>
                  </div>
                </dl>
                <p className="mt-2 text-caption text-ink-meta">{t('settingsGa.planHint')}</p>
              </Section>
            </Card>
            <FormError message={save.isError ? errorMessage(save.error) : undefined} />
          </form>
        )}
      </Container>
    </>
  )
}
