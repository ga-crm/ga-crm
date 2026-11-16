import { zodResolver } from '@hookform/resolvers/zod'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { useForm } from 'react-hook-form'
import { z } from 'zod'
import { t, tDynamic } from '../i18n'
import { api, errorField, errorMessage } from '../lib/api'
import { fromLocalInput, toLocalInput } from '../lib/leadLabels'
import { keys, queries } from '../lib/queries'
import { toast } from '../lib/toast'
import { CAMPAIGN_STATUSES, CAMPAIGN_TYPES } from '../lib/types'
import type { Campaign } from '../lib/types'
import { optionalDate, optionalText, requiredText } from '../lib/validation'
import { Button, Field, FormError, Input, MODAL_FOOTER, Select, WIDE_FORM_GRID, Textarea } from './ui'

const schema = z
  .object({
    name: requiredText(200),
    type: z.enum(CAMPAIGN_TYPES, { error: t('validation.required') }),
    status: z.enum(CAMPAIGN_STATUSES),
    channel: optionalText(100),
    startDate: optionalDate,
    endDate: optionalDate,
    budgetVnd: z.string().trim().regex(/^\d*$/, t('validation.money')),
    ownerUserId: z.string(),
    eventAt: z.string(),
    location: optionalText(300),
    notes: optionalText(2000),
  })
  // CMP-1: the same rule as the API
  .refine((values) => !values.startDate || !values.endDate || values.startDate <= values.endDate, { path: ['endDate'], message: t('validation.endBeforeStartCampaign') })
type Values = z.infer<typeof schema>

const ERRORS = { campaign_exists: 'name' } as const

/** CMP-1 + CMP-2: one form for a new campaign and an existing one. Blank clears a field on edit. */
export function CampaignForm({ campaign, onClose, onSaved }: { campaign?: Campaign; onClose: () => void; onSaved?: (id: string) => void }) {
  const queryClient = useQueryClient()
  const owners = useQuery(queries.campaignOwners())
  const form = useForm<Values>({
    resolver: zodResolver(schema),
    mode: 'onTouched',
    defaultValues: {
      name: campaign?.name ?? '',
      type: campaign?.type ?? ('' as Values['type']),
      status: campaign?.status ?? 'PLANNED',
      channel: campaign?.channel ?? '',
      startDate: campaign?.startDate ?? '',
      endDate: campaign?.endDate ?? '',
      budgetVnd: campaign?.budgetVnd === null || campaign?.budgetVnd === undefined ? '' : String(campaign.budgetVnd),
      ownerUserId: campaign?.ownerUserId ?? '',
      eventAt: toLocalInput(campaign?.eventAt),
      location: campaign?.location ?? '',
      notes: campaign?.notes ?? '',
    },
  })
  const save = useMutation({
    mutationFn: async (values: Values) => {
      const optional = {
        channel: values.channel || null,
        startDate: values.startDate || null,
        endDate: values.endDate || null,
        budgetVnd: values.budgetVnd ? Number(values.budgetVnd) : null,
        ownerUserId: values.ownerUserId || null,
        eventAt: values.eventAt ? fromLocalInput(values.eventAt) : null,
        location: values.location || null,
        notes: values.notes || null,
      }
      const base = { name: values.name, type: values.type, status: values.status }
      if (campaign) {
        await api.patch(`/campaigns/${campaign.id}`, { ...base, ...optional })
        return campaign.id
      }
      // A new campaign leaves out what is not known
      const known = Object.fromEntries(Object.entries(optional).filter(([, value]) => value !== null))
      return (await api.post<{ id: string }>('/campaigns', { ...base, ...known })).id
    },
    onSuccess: async (id, values) => {
      await queryClient.invalidateQueries({ queryKey: keys.campaigns })
      toast.success(t(campaign ? 'toast.campaignUpdated' : 'toast.campaignCreated', { name: values.name }))
      onSaved?.(id)
      onClose()
    },
    onError: (error) => {
      if (errorField(error, ERRORS)) form.setError('name', { message: errorMessage(error) })
    },
  })
  const { errors } = form.formState
  const fieldError = save.isError && errorField(save.error, ERRORS)

  return (
    <form noValidate onSubmit={form.handleSubmit((values) => save.mutate(values))}>
      <div className={WIDE_FORM_GRID}>
        <Field label={t('campaigns.name')} htmlFor="campaign-name" required error={errors.name?.message}>
          <Input id="campaign-name" maxLength={200} placeholder={t('placeholder.campaignName')} aria-invalid={!!errors.name} {...form.register('name')} />
        </Field>
        <Field label={t('campaigns.type')} htmlFor="campaign-type" required error={errors.type?.message}>
          <Select id="campaign-type" aria-invalid={!!errors.type} {...form.register('type')}>
            <option value="" disabled>
              {t('placeholder.campaignType')}
            </option>
            {CAMPAIGN_TYPES.map((type) => (
              <option key={type} value={type}>
                {tDynamic(`campaignType.${type}`, type)}
              </option>
            ))}
          </Select>
        </Field>
        <Field label={t('campaigns.status')} htmlFor="campaign-status">
          <Select id="campaign-status" {...form.register('status')}>
            {CAMPAIGN_STATUSES.map((status) => (
              <option key={status} value={status}>
                {tDynamic(`campaignStatus.${status}`, status)}
              </option>
            ))}
          </Select>
        </Field>
        <Field label={t('campaigns.channel')} htmlFor="campaign-channel" error={errors.channel?.message}>
          <Input id="campaign-channel" maxLength={100} placeholder={t('placeholder.channel')} {...form.register('channel')} />
        </Field>
        <Field label={t('campaigns.startDate')} htmlFor="campaign-start" error={errors.startDate?.message}>
          <Input id="campaign-start" type="date" aria-invalid={!!errors.startDate} {...form.register('startDate')} />
        </Field>
        <Field label={t('campaigns.endDate')} htmlFor="campaign-end" error={errors.endDate?.message}>
          <Input id="campaign-end" type="date" aria-invalid={!!errors.endDate} {...form.register('endDate')} />
        </Field>
        <Field label={t('campaigns.budget')} htmlFor="campaign-budget" error={errors.budgetVnd?.message}>
          <Input id="campaign-budget" inputMode="numeric" placeholder={t('placeholder.money')} aria-invalid={!!errors.budgetVnd} {...form.register('budgetVnd')} />
        </Field>
        <Field label={t('campaigns.owner')} htmlFor="campaign-owner">
          <Select id="campaign-owner" {...form.register('ownerUserId')}>
            <option value="">{t('campaigns.noOwner')}</option>
            {(owners.data?.items ?? []).map((owner) => (
              <option key={owner.id} value={owner.id}>
                {owner.name}
              </option>
            ))}
          </Select>
        </Field>
        <Field label={t('campaigns.eventAt')} htmlFor="campaign-event" hint={t('campaigns.eventHint')}>
          <Input id="campaign-event" type="datetime-local" {...form.register('eventAt')} />
        </Field>
        <Field label={t('campaigns.location')} htmlFor="campaign-location" error={errors.location?.message} hint={t('campaigns.eventHint')}>
          <Input id="campaign-location" maxLength={300} placeholder={t('placeholder.location')} {...form.register('location')} />
        </Field>
      </div>
      <Field label={t('campaigns.notes')} htmlFor="campaign-notes" error={errors.notes?.message}>
        <Textarea id="campaign-notes" rows={2} maxLength={2000} placeholder={t('placeholder.campaignNotes')} {...form.register('notes')} />
      </Field>
      <FormError message={save.isError && !fieldError ? errorMessage(save.error) : undefined} />
      <div className={MODAL_FOOTER}>
        <Button type="button" variant="ghost" onClick={onClose}>
          {t('common.cancel')}
        </Button>
        <Button type="submit" disabled={save.isPending}>
          {t('campaigns.save')}
        </Button>
      </div>
    </form>
  )
}
