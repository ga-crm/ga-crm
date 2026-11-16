import { zodResolver } from '@hookform/resolvers/zod'
import { useMutation, useQueries, useQuery, useQueryClient } from '@tanstack/react-query'
import { useEffect, useState } from 'react'
import { useForm, useWatch, Controller } from 'react-hook-form'
import type { UseFormReturn } from 'react-hook-form'
import { z } from 'zod'
import { Alert, Badge, Button, Card, ConfirmDialog, Container, Dialog, Field, FormError, Input, MODAL_FOOTER, PageHeader, Select, Spinner, Checkbox } from '../components/ui'
import { formatDateTime, t } from '../i18n'
import type { MessageKey } from '../i18n'
import { api, errorMessage } from '../lib/api'
import { keys, queries } from '../lib/queries'
import { toast } from '../lib/toast'
import type { AiSettings, AiTier } from '../lib/types'
import { useUrlState } from '../lib/useUrlState'

const TIERS: AiTier[] = ['FAST', 'BALANCED', 'DEEP']
const SLOTS = [...TIERS, 'router'] as const
type Slot = (typeof SLOTS)[number]
type Provider = AiSettings['providers'][number]

const model = z.string().trim().min(1, t('validation.required')).max(100).regex(/^[\w.:/-]+$/, t('ai.modelInvalid'))
const schema = z.object({
  enabled: z.boolean(),
  monthlyTokenLimit: z.coerce.number<string>().int(t('ai.limitInvalid')).min(0, t('ai.limitInvalid')),
  ...Object.fromEntries(SLOTS.flatMap((slot) => [[`${slot}_provider`, z.string().min(1)], [`${slot}_model`, model]])),
}) as z.ZodObject<{ enabled: z.ZodBoolean; monthlyTokenLimit: z.ZodCoercedNumber<string> } & Record<`${Slot}_${'provider' | 'model'}`, z.ZodString>>
type Values = z.input<typeof schema>
type Parsed = z.output<typeof schema>

const refOf = (settings: AiSettings, slot: Slot) => (slot === 'router' ? settings.router : settings.tiers[slot])
const toValues = (settings: AiSettings): Values =>
  ({
    enabled: settings.enabled,
    monthlyTokenLimit: String(settings.monthlyTokenLimit),
    ...Object.fromEntries(SLOTS.flatMap((slot) => [[`${slot}_provider`, refOf(settings, slot).provider], [`${slot}_model`, refOf(settings, slot).model]])),
  }) as Values

const tokens = (value: number) => new Intl.NumberFormat('vi-VN').format(value)

function KeyStatus({ provider }: { provider: Provider }) {
  if (provider.keyUnreadable) return <Badge tone="danger">{t('ai.keyUnreadable')}</Badge>
  if (provider.keySource === 'GA') return <Badge tone="success">{t('ai.keyOwn', { last4: provider.last4 ?? '' })}</Badge>
  if (provider.keySource === 'PLATFORM') return <Badge tone="info">{t('ai.keyPlatform')}</Badge>
  return <Badge tone="muted">{t('ai.keyNone')}</Badge>
}

/** AI-15: the key is typed here and sent once; it never comes back from the API. */
function KeyForm({ provider, onClose }: { provider: Provider; onClose: () => void }) {
  const queryClient = useQueryClient()
  const [apiKey, setApiKey] = useState('')
  const save = useMutation({
    mutationFn: () => api.put<{ last4: string }>(`/ai/admin/keys/${provider.provider}`, { apiKey: apiKey.trim() }),
    onSuccess: async ({ last4 }) => {
      await queryClient.invalidateQueries({ queryKey: keys.ai })
      toast.success(t('toast.aiKeySaved', { provider: provider.label, last4 }), t('toast.aiKeySavedDetail'))
      onClose()
    },
  })
  const tooShort = apiKey.trim().length > 0 && apiKey.trim().length < 8
  return (
    <form
      noValidate
      onSubmit={(event) => {
        event.preventDefault()
        if (apiKey.trim().length >= 8) save.mutate()
      }}
    >
      <p className="mb-3 text-caption text-ink-meta">{t('ai.keyHelp')}</p>
      <Field label={t('ai.apiKey')} htmlFor="ai-key" required error={tooShort ? t('ai.keyTooShort') : undefined}>
        <Input id="ai-key" type="password" autoComplete="off" maxLength={500} placeholder={t('placeholder.apiKey')} value={apiKey} aria-invalid={tooShort} onChange={(event) => setApiKey(event.target.value)} />
      </Field>
      <FormError message={save.isError ? errorMessage(save.error) : undefined} />
      <div className={MODAL_FOOTER}>
        <Button type="button" variant="ghost" onClick={onClose}>
          {t('common.cancel')}
        </Button>
        <Button type="submit" disabled={apiKey.trim().length < 8 || save.isPending}>
          {t('ai.saveKey')}
        </Button>
      </div>
    </form>
  )
}

function ProviderRow({ provider, onKey, onRemove }: { provider: Provider; onKey: () => void; onRemove: () => void }) {
  const check = useMutation({
    mutationFn: () => api.post<{ model: string }>(`/ai/admin/keys/${provider.provider}/test`),
    onSuccess: ({ model }) => toast.success(t('toast.aiKeyWorks', { provider: provider.label, model })),
    onError: (error) => toast.error(t('toast.aiKeyFailed', { provider: provider.label }), errorMessage(error)),
  })
  return (
    <li className="flex flex-col gap-2 py-3 sm:flex-row sm:items-center">
      <div className="min-w-0 flex-1">
        <p className="flex flex-wrap items-center gap-2 text-link text-ink">
          {provider.label}
          <KeyStatus provider={provider} />
        </p>
        <p className="text-caption text-ink-meta">{provider.keyUpdatedAt ? t('ai.keyUpdated', { at: formatDateTime(provider.keyUpdatedAt) }) : provider.keySource === 'PLATFORM' ? t('ai.platformHint') : t('ai.noKeyHint')}</p>
      </div>
      <div className="flex flex-none flex-wrap gap-2">
        <Button variant="secondary" onClick={onKey}>
          {provider.last4 ? t('ai.replaceKey') : t('ai.enterKey')}
        </Button>
        <Button variant="ghost" disabled={!provider.ready || check.isPending} onClick={() => check.mutate()}>
          {t('ai.testKey')}
        </Button>
        {provider.last4 && (
          <Button variant="ghost" onClick={onRemove}>
            {t('ai.removeKey')}
          </Button>
        )}
      </div>
    </li>
  )
}

/** One tier (or the router): a provider and a model, with the live list as suggestions (AI-17). */
function ModelSlot({ slot, settings, models, listErrors, form }: { slot: Slot; settings: AiSettings; models: Map<string, string[] | undefined>; listErrors: Map<string, Error | null>; form: UseFormReturn<Values, unknown, Parsed> }) {
  const providerId = useWatch({ control: form.control, name: `${slot}_provider` })
  const value = useWatch({ control: form.control, name: `${slot}_model` })
  const provider = settings.providers.find((item) => item.provider === providerId)
  const list = models.get(providerId)
  const error = form.formState.errors[`${slot}_model`]?.message
  const suggested = provider?.suggested[slot === 'router' ? 'FAST' : slot] ?? ''
  const listError = listErrors.get(providerId)
  const hint = list
    ? list.includes(String(value).trim())
      ? t('ai.modelListed')
      : t('ai.modelMissing')
    : listError
      ? t('ai.modelListFailed', { error: errorMessage(listError), model: suggested })
      : provider?.ready
        ? t('ai.modelLoading', { model: suggested })
        : t('ai.modelSuggested', { model: suggested })
  return (
    <div className="grid gap-x-4 sm:grid-cols-[14rem_1fr]">
      <Field label={t(`ai.slot.${slot}` as MessageKey)} htmlFor={`ai-${slot}-provider`} hint={t(`ai.slotHint.${slot}` as MessageKey)}>
        <Select
          id={`ai-${slot}-provider`}
          {...form.register(`${slot}_provider`, {
            onChange: (event: { target: { value: string } }) => {
              const next = settings.providers.find((item) => item.provider === event.target.value)
              if (next) form.setValue(`${slot}_model`, next.suggested[slot === 'router' ? 'FAST' : slot], { shouldDirty: true })
            },
          })}
        >
          {settings.providers.map((item) => (
            <option key={item.provider} value={item.provider}>
              {item.label}
              {item.ready ? '' : ` (${t('ai.keyNone')})`}
            </option>
          ))}
        </Select>
      </Field>
      <Field label={t('ai.model')} htmlFor={`ai-${slot}-model`} required error={error} hint={hint}>
        <Input id={`ai-${slot}-model`} list={`ai-models-${providerId}`} maxLength={100} placeholder={t('placeholder.aiModel')} aria-invalid={!!error} {...form.register(`${slot}_model`)} />
      </Field>
    </div>
  )
}

/** Section 14.10 AI-37 "Mô hình và hạn mức": keys, models by tier, router, budget, on / off. */
export function AiAdminPage() {
  const queryClient = useQueryClient()
  const url = useUrlState()
  const settings = useQuery(queries.aiSettings())
  const [removing, setRemoving] = useState<Provider | null>(null)
  const form = useForm<Values, unknown, Parsed>({ resolver: zodResolver(schema), mode: 'onTouched' })
  const { isDirty, errors } = form.formState
  const providers = settings.data?.providers ?? []
  const ready = providers.filter((item) => item.ready)
  const lists = useQueries({ queries: ready.map((item) => queries.aiModels(item.provider)) })
  const models = new Map(ready.map((item, index) => [item.provider, lists[index]?.data?.items]))
  const listErrors = new Map(ready.map((item, index) => [item.provider, lists[index]?.error ?? null]))
  const editing = providers.find((item) => item.provider === url.get('provider'))

  useEffect(() => {
    if (settings.data && !form.formState.isDirty) form.reset(toValues(settings.data))
  }, [settings.data, form])

  const save = useMutation({
    mutationFn: (values: Parsed) => {
      const record = values as unknown as Record<string, string>
      const ref = (slot: Slot) => ({ provider: record[`${slot}_provider`], model: record[`${slot}_model`].trim() })
      return api.put('/ai/admin/settings', {
        enabled: values.enabled,
        monthlyTokenLimit: values.monthlyTokenLimit,
        tiers: Object.fromEntries(TIERS.map((tier) => [tier, ref(tier)])),
        router: ref('router'),
      })
    },
    onSuccess: async (_, values) => {
      form.reset(form.getValues())
      await queryClient.invalidateQueries({ queryKey: keys.ai })
      toast.success(t('toast.aiSettingsSaved'), values.enabled ? t('toast.aiOn') : t('toast.aiOff'))
    },
  })
  const remove = useMutation({
    mutationFn: (provider: Provider) => api.delete(`/ai/admin/keys/${provider.provider}`),
    onSuccess: async (_, provider) => {
      await queryClient.invalidateQueries({ queryKey: keys.ai })
      toast.info(t('toast.aiKeyRemoved', { provider: provider.label }))
      setRemoving(null)
    },
  })

  return (
    <>
      <PageHeader
        title={t('ai.title')}
        subtitle={t('ai.subtitle')}
        action={
          <Button type="submit" form="ai-settings" disabled={!settings.data || !isDirty || save.isPending}>
            {t('common.save')}
          </Button>
        }
      />
      <Container className="min-h-0 flex-1 overflow-y-auto pb-6">
        {settings.isPending && <Spinner />}
        {settings.isError && <Alert>{errorMessage(settings.error)}</Alert>}
        {settings.data && (
          <form id="ai-settings" noValidate onSubmit={form.handleSubmit((values) => save.mutate(values))}>
            {providers.map((item) => (
              <datalist key={item.provider} id={`ai-models-${item.provider}`}>
                {(models.get(item.provider) ?? Object.values(item.suggested)).map((name) => (
                  <option key={name} value={name} />
                ))}
              </datalist>
            ))}
            <Card>
              <section className="border-b border-band px-4 py-5 md:px-6">
                <h2 className="mb-1 text-subhead text-ink">{t('ai.status')}</h2>
                <label className="flex cursor-pointer items-start gap-3 py-2">
                  <Controller control={form.control} name="enabled" render={({ field }) => <Checkbox ref={field.ref} className="mt-1" checked={!!field.value} onChange={field.onChange} onBlur={field.onBlur} />} />
                  <span>
                    <span className="block text-link text-ink">{t('ai.enabled')}</span>
                    <span className="block text-caption text-ink-meta">{ready.length === 0 ? t('ai.enabledNoKey') : t('ai.enabledHint')}</span>
                  </span>
                </label>
              </section>
              <section className="border-b border-band px-4 py-5 md:px-6">
                <h2 className="text-subhead text-ink">{t('ai.providers')}</h2>
                <p className="mt-1 text-caption text-ink-meta">{t('ai.providersHint')}</p>
                <ul className="divide-y divide-band">
                  {providers.map((item) => (
                    <ProviderRow key={item.provider} provider={item} onKey={() => url.set({ provider: item.provider }, { push: true })} onRemove={() => setRemoving(item)} />
                  ))}
                </ul>
              </section>
              <section className="border-b border-band px-4 py-5 md:px-6">
                <h2 className="text-subhead text-ink">{t('ai.models')}</h2>
                <p className="mt-1 mb-3 text-caption text-ink-meta">{t('ai.modelsHint')}</p>
                {SLOTS.map((slot) => (
                  <ModelSlot key={slot} slot={slot} settings={settings.data} models={models} listErrors={listErrors} form={form} />
                ))}
              </section>
              <section className="px-4 py-5 md:px-6">
                <h2 className="mb-3 text-subhead text-ink">{t('ai.budget')}</h2>
                <div className="grid gap-x-4 sm:grid-cols-2">
                  <Field label={t('ai.monthlyLimit')} htmlFor="ai-limit" required error={errors.monthlyTokenLimit?.message} hint={settings.data.planTokenLimit ? t('ai.monthlyLimitPlanHint', { max: tokens(settings.data.planTokenLimit) }) : t('ai.monthlyLimitHint')}>
                    <Input id="ai-limit" type="number" min={0} inputMode="numeric" placeholder={t('placeholder.tokens')} aria-invalid={!!errors.monthlyTokenLimit} {...form.register('monthlyTokenLimit')} />
                  </Field>
                  <div className="pt-1">
                    <p className="text-caption text-ink-meta">{t('ai.usedThisMonth')}</p>
                    <p className="text-subhead text-ink tabular-nums">{tokens(settings.data.usedThisMonth)}</p>
                  </div>
                </div>
              </section>
            </Card>
            <FormError message={save.isError ? errorMessage(save.error) : undefined} />
          </form>
        )}
      </Container>
      <Dialog title={editing ? t('ai.keyTitle', { provider: editing.label }) : ''} open={!!editing} onClose={() => url.set({ provider: null })}>
        {editing && <KeyForm key={editing.provider} provider={editing} onClose={() => url.set({ provider: null })} />}
      </Dialog>
      <ConfirmDialog
        message={removing ? t('ai.removeConfirm', { provider: removing.label }) : null}
        danger
        pending={remove.isPending}
        error={remove.isError ? errorMessage(remove.error) : undefined}
        onConfirm={() => removing && remove.mutate(removing)}
        onClose={() => setRemoving(null)}
      />
    </>
  )
}
