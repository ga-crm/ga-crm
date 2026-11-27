import { zodResolver } from '@hookform/resolvers/zod'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { ArrowLeft } from 'lucide-react'
import { useState } from 'react'
import { Controller, useForm } from 'react-hook-form'
import { Link, useNavigate, useParams } from 'react-router-dom'
import { z } from 'zod'
import { CommentThread } from '../components/CommentThread'
import { LeadAssignDialog } from '../components/LeadAssignDialog'
import { DeleteLeadForm, MergeLeadForm } from '../components/LeadRemoval'
import { LeadLinkTab } from '../components/LeadClientLink'
import { SupportTab } from '../components/LeadSupporters'
import { NoteComposer, } from '../components/NoteComposer'
import { OptionPicker } from '../components/OptionPicker'
import { PlaceFields } from '../components/PlaceFields'
import { ProductPicker } from '../components/ProductPicker'
import { hasPermission, hasRole } from '../auth/access'
import { useMe } from '../auth/useMe'
import { Alert, Badge, Button, ConfirmDialog, Container, Dialog, EmptyState, RowMenu, Field, FormError, Input, MODAL_FOOTER, Notice, Select, Spinner, WIDE_FORM_GRID, TabBar, Textarea, Checkbox } from '../components/ui'
import { formatDate, formatDateTime, t, tDynamic } from '../i18n'
import type { MessageKey } from '../i18n'
import { api, ApiError, errorField, errorMessage } from '../lib/api'
import { careTone, fromLocalInput, historyValue, interestTone, showDate, toLocalInput } from '../lib/leadLabels'
import { keys, queries } from '../lib/queries'
import { toast } from '../lib/toast'
import { useLeadOptions } from '../lib/leadOptions'
import { LEAD_WORK_STAGES } from '../lib/types'
import type { LeadOption, LeadOptionKind } from '../lib/types'
import type { LeadDetail, LeadTask } from '../lib/types'
import { useSelectedTabInView } from '../lib/useSelectedTabInView'
import { useUrlState } from '../lib/useUrlState'
import { optionalBirthDate, optionalEmail, optionalText, phoneField, requiredText } from '../lib/validation'

function useRefresh(id: string) {
  const queryClient = useQueryClient()
  return () => queryClient.invalidateQueries({ queryKey: keys.leads }).then(() => queries.lead(id))
}

function Fact({ label, value }: { label: string; value?: string | number | null }) {
  return (
    <div className="grid grid-cols-[9rem_1fr] gap-2 border-b border-band py-2 text-caption">
      <dt className="text-ink-meta">{label}</dt>
      <dd className="min-w-0 break-words whitespace-pre-line text-ink-body">{value ?? '-'}</dd>
    </div>
  )
}

const editSchema = z.object({
  fullName: requiredText(200),
  phone: phoneField,
  dob: optionalBirthDate,
  // Decided 26/11/2026: the province and commune after 1/7/2025, and the street address
  provinceCode: z.string(),
  wardCode: z.string(),
  addressLine: optionalText(300),
  email: optionalEmail,
  consent: z.enum(['yes', 'no']),
  // OPT-3: a typed value may become a catalogue label; an older, longer one is only sent back unchanged
  source: requiredText(200),
  campaignId: z.string(),
  // TENANT-5: a shown product of the catalogue, or the one the lead already has
  productCode: z.string(),
})
type EditValues = z.infer<typeof editSchema>
const EDIT_ERRORS = { invalid_phone: 'phone', phone_exists: 'phone', unknown_option: 'source', unknown_product: 'productCode', unknown_place: 'wardCode' } as const

/** LEAD-8: source and campaign are shown for lead managers only. */
function EditLeadForm({ detail, onClose }: { detail: LeadDetail; onClose: () => void }) {
  const queryClient = useQueryClient()
  const refresh = useRefresh(detail.lead.id)
  const { lead, canManage } = detail
  const facets = useQuery(queries.leadFacets())
  const catalogue = useLeadOptions()
  const form = useForm<EditValues>({
    resolver: zodResolver(editSchema),
    mode: 'onTouched',
    defaultValues: {
      fullName: lead.fullName,
      phone: lead.phone,
      dob: lead.dob ?? '',
      provinceCode: lead.provinceCode ?? '',
      wardCode: lead.wardCode ?? '',
      addressLine: lead.addressLine ?? '',
      email: lead.email ?? '',
      consent: lead.consentMarketing ? 'yes' : 'no',
      // The field shows the GA's label; the API finds the source by label or code
      source: catalogue.label('source', lead.source),
      campaignId: lead.campaignId ?? '',
      productCode: lead.productCode ?? '',
    },
  })
  const { errors, dirtyFields } = form.formState
  const sourceChanged = !!dirtyFields.source
  const save = useMutation({
    mutationFn: ({ consent, dob, provinceCode, wardCode, addressLine, email, source, campaignId, productCode, ...rest }: EditValues) =>
      api.patch(`/leads/${lead.id}`, {
        ...rest,
        consent: consent === 'yes',
        dob: dob || null,
        // Sent only when changed, so an older typed province stays until a province is chosen
        ...((dirtyFields.provinceCode || dirtyFields.wardCode) && { provinceCode: provinceCode || null, wardCode: wardCode || null }),
        ...(dirtyFields.addressLine && { addressLine: addressLine || null }),
        email: email || null,
        // Sent only when changed; null clears it
        ...(dirtyFields.productCode && { productCode: productCode || null }),
        // An untouched source is left out, so a lead keeps one the GA has since hidden (OPT-8)
        ...(canManage && { ...(sourceChanged && { source }), campaignId: campaignId || null }),
      }),
    onSuccess: async () => {
      // OPT-13: a typed source has joined the GA's list
      await Promise.all([refresh(), queryClient.invalidateQueries({ queryKey: keys.leadOptions })])
      toast.success(t('toast.leadUpdated', { name: lead.fullName }))
      onClose()
    },
    onError: (error) => {
      const field = errorField(error, EDIT_ERRORS)
      if (field) form.setError(field, { message: errorMessage(error) })
    },
  })
  return (
    <form noValidate onSubmit={form.handleSubmit((values) => save.mutate(values))}>
      <div className={WIDE_FORM_GRID}>
        <Field label={t('leads.fullName')} htmlFor="edit-name" required error={errors.fullName?.message}>
          <Input id="edit-name" placeholder={t('placeholder.name')} aria-invalid={!!errors.fullName} {...form.register('fullName')} />
        </Field>
        <Field label={t('leads.phone')} htmlFor="edit-phone" required error={errors.phone?.message}>
          <Input id="edit-phone" placeholder={t('agents.phonePlaceholder')} aria-invalid={!!errors.phone} {...form.register('phone')} />
        </Field>
        <Field label={t('leads.email')} htmlFor="edit-email" error={errors.email?.message}>
          <Input id="edit-email" type="email" placeholder={t('placeholder.email')} aria-invalid={!!errors.email} {...form.register('email')} />
        </Field>
        <Field label={t('leads.dob')} htmlFor="edit-dob" error={errors.dob?.message}>
          <Input id="edit-dob" type="date" min="1900-01-01" aria-invalid={!!errors.dob} {...form.register('dob')} />
        </Field>
        <PlaceFields control={form.control} setValue={form.setValue} errors={errors} idPrefix="edit" />
        <Field label={t('leads.productInterest')} htmlFor="edit-product" error={errors.productCode?.message}>
          <Controller
            control={form.control}
            name="productCode"
            render={({ field, fieldState }) => (
              <ProductPicker
                ref={field.ref}
                id="edit-product"
                label={t('leads.productInterest')}
                emptyLabel={t('leads.noProduct')}
                value={field.value}
                onChange={field.onChange}
                onBlur={field.onBlur}
                invalid={fieldState.invalid}
                kept={lead.productCode ? { code: lead.productCode, name: lead.productName ?? lead.productCode } : null}
              />
            )}
          />
        </Field>
        <Field label={t('leads.consent')} htmlFor="edit-consent">
          <Select id="edit-consent" {...form.register('consent')}>
            <option value="yes">{t('leads.consentYes')}</option>
            <option value="no">{t('leads.consentNo')}</option>
          </Select>
        </Field>
        {canManage && (
          <>
            <Field label={t('leads.source')} htmlFor="edit-source" required error={errors.source?.message} hint={t('leads.sourceHint')}>
              <Controller
                control={form.control}
                name="source"
                render={({ field, fieldState }) => (
                  <OptionPicker ref={field.ref} kind="source" joins id="edit-source" label={t('leads.source')} maxLength={60} placeholder={t('leads.sourcePlaceholder')} value={field.value} onChange={(next) => field.onChange(next)} onBlur={field.onBlur} invalid={fieldState.invalid} />
                )}
              />
            </Field>
            <Field label={t('leads.campaign')} htmlFor="edit-campaign">
              <Select id="edit-campaign" {...form.register('campaignId')}>
                <option value="">{t('leads.noCampaign')}</option>
                {facets.data?.campaigns.map((campaign) => (
                  <option key={campaign.id} value={campaign.id}>
                    {campaign.name}
                  </option>
                ))}
              </Select>
            </Field>
          </>
        )}
      </div>
      <FormError message={save.isError && !errorField(save.error, EDIT_ERRORS) ? errorMessage(save.error) : undefined} />
      <div className={MODAL_FOOTER}>
        <Button variant="secondary" onClick={onClose}>
          {t('common.cancel')}
        </Button>
        <Button type="submit" disabled={save.isPending}>
          {t('common.save')}
        </Button>
      </div>
    </form>
  )
}

/** OPT-8: a picker offers the shown values, plus the hidden one this lead still carries. */
function choicesFor(catalogue: ReturnType<typeof useLeadOptions>, kind: LeadOptionKind, current?: string | null): LeadOption[] {
  const shown = catalogue.active(kind)
  if (!current || shown.some((option) => option.code === current)) return shown
  const kept = catalogue.all(kind).find((option) => option.code === current)
  return kept ? [...shown, kept] : shown
}

/** Section 16.4: the status box. It only sends what changed, so an unrelated lock cannot get in the way. */
function StatusForm({ detail }: { detail: LeadDetail }) {
  const refresh = useRefresh(detail.lead.id)
  const { data: me } = useMe()
  const navigate = useNavigate()
  const queryClient = useQueryClient()
  // Who sees the pool keeps the lead on screen after dropping it
  const seesPool = hasRole(me, 'GAD') || hasPermission(me, 'leads.manage')
  const catalogue = useLeadOptions()
  const { lead, interestLocked } = detail
  const initial = {
    interest: lead.interest ?? '',
    careStatus: lead.careStatus ?? '',
    stage: lead.stage,
    lostReason: lead.lostReason ?? '',
    applicationNo: lead.applicationNo ?? '',
    policyNo: lead.policyNo ?? '',
    nextActionAt: toLocalInput(lead.nextActionAt),
  }
  const [values, setValues] = useState(initial)
  const set = (patch: Partial<typeof initial>) => setValues((current) => ({ ...current, ...patch }))
  const changedKeys = (Object.keys(initial) as (keyof typeof initial)[]).filter((key) => values[key] !== initial[key])

  const save = useMutation({
    mutationFn: () => {
      const body: Record<string, unknown> = {}
      for (const key of changedKeys) {
        if (key === 'nextActionAt') body[key] = values[key] ? fromLocalInput(values[key]) : null
        else body[key] = values[key] || null
      }
      return api.patch<{ released?: boolean }>(`/leads/${lead.id}`, body)
    },
    onSuccess: async (result) => {
      // Decided 27/11/2026: a dropped lead goes back to the pool; its agent no longer sees it
      if (result.released && !seesPool) {
        toast.info(t('toast.leadReleased', { name: lead.fullName }), t('toast.leadReleasedDetail'))
        await queryClient.invalidateQueries({ queryKey: keys.leads })
        void navigate('/leads')
        return
      }
      await refresh()
      if (result.released) toast.info(t('toast.leadReleased', { name: lead.fullName }), t('toast.leadReleasedDetail'))
      else if (values.careStatus !== initial.careStatus) toast.success(t('toast.careChanged', { value: catalogue.label('care_status', values.careStatus) }))
      else if (values.interest !== initial.interest) toast.success(t('toast.interestChanged', { value: catalogue.label('interest', values.interest) }))
      else if (values.stage !== initial.stage) toast.success(t('toast.stageChanged', { value: tDynamic(`stage.${values.stage}`, values.stage) }))
      else if (values.nextActionAt !== initial.nextActionAt) toast.success(t(values.nextActionAt ? 'toast.nextActionSet' : 'toast.nextActionCleared'), values.nextActionAt ? t('toast.nextActionSetDetail') : undefined)
      else toast.success(t('toast.leadStatusUpdated'))
    },
  })

  // Errors from the API that belong to one field show under that field
  const failure = save.error instanceof ApiError ? save.error.code : null
  const fieldError = (...codes: string[]) => (failure && codes.includes(failure) ? errorMessage(save.error) : undefined)
  const shownOnField = ['lost_reason_required', 'won_needs_numbers', 'invalid_application_no', 'invalid_policy_no', 'interest_locked'].includes(failure ?? '')

  const stageOptions = LEAD_WORK_STAGES.includes(lead.stage) ? LEAD_WORK_STAGES : [lead.stage, ...LEAD_WORK_STAGES]

  return (
    <section className="rounded-lg bg-chrome p-5">
      <h2 className="mb-3 text-subhead text-ink">{t('leads.updateStatus')}</h2>
      <div className="grid gap-x-4 sm:grid-cols-2">
        <Field label={t('leads.interest')} htmlFor="status-interest">
          <Select id="status-interest" value={values.interest} disabled={interestLocked} onChange={(event) => set({ interest: event.target.value })}>
            <option value="" disabled>
              {t('leads.choose')}
            </option>
            {choicesFor(catalogue, 'interest', lead.interest).map((option) => (
              <option key={option.id} value={option.code}>
                {option.label}
              </option>
            ))}
          </Select>
        </Field>
        <Field label={t('leads.care')} htmlFor="status-care">
          <Select id="status-care" value={values.careStatus} onChange={(event) => set({ careStatus: event.target.value })}>
            <option value="" disabled>
              {t('leads.choose')}
            </option>
            {choicesFor(catalogue, 'care_status', lead.careStatus).map((option) => (
              <option key={option.id} value={option.code}>
                {option.label}
              </option>
            ))}
          </Select>
        </Field>
        <Field label={t('leads.stage')} htmlFor="status-stage">
          <Select id="status-stage" value={values.stage} onChange={(event) => set({ stage: event.target.value as typeof lead.stage })}>
            {stageOptions.map((value) => (
              <option key={value} value={value}>
                {tDynamic(`stage.${value}`, value)}
              </option>
            ))}
          </Select>
        </Field>
        <Field label={t('leads.nextAction')} htmlFor="status-next">
          <Input id="status-next" type="datetime-local" value={values.nextActionAt} onChange={(event) => set({ nextActionAt: event.target.value })} />
        </Field>
        {values.careStatus === 'DROPPED' && (
          <div className="sm:col-span-2">
            <Field label={t('leads.lostReason')} htmlFor="status-reason" required error={fieldError('lost_reason_required')}>
              <OptionPicker kind="lost_reason" id="status-reason" label={t('leads.lostReason')} maxLength={500} invalid={!!fieldError('lost_reason_required')} placeholder={t('leads.lostReasonPlaceholder')} value={values.lostReason} onChange={(lostReason) => set({ lostReason })} />
            </Field>
          </div>
        )}
        {values.careStatus === 'WON' && (
          <>
            <Field label={t('leads.applicationNo')} htmlFor="status-application" error={fieldError('invalid_application_no', 'won_needs_numbers')}>
              <Input id="status-application" maxLength={20} aria-invalid={!!fieldError('invalid_application_no', 'won_needs_numbers')} placeholder={t('leads.applicationPlaceholder')} value={values.applicationNo} onChange={(event) => set({ applicationNo: event.target.value })} />
            </Field>
            <Field label={t('leads.policyNo')} htmlFor="status-policy" error={fieldError('invalid_policy_no')}>
              <Input id="status-policy" maxLength={9} aria-invalid={!!fieldError('invalid_policy_no')} placeholder={t('leads.policyPlaceholder')} inputMode="numeric" value={values.policyNo} onChange={(event) => set({ policyNo: event.target.value })} />
            </Field>
          </>
        )}
      </div>
      {interestLocked && <p className="mb-2 text-caption text-ink-meta">{t('errors.interest_locked')}</p>}
      <FormError message={save.isError && !shownOnField ? errorMessage(save.error) : undefined} />
      <Button disabled={changedKeys.length === 0 || save.isPending} onClick={() => save.mutate()}>
        {t('common.save')}
      </Button>
    </section>
  )
}

/** CMT-1, CMT-4, CMT-5: under "Thông tin", anyone who sees the lead comments and may @mention. */
function Comments({ detail }: { detail: LeadDetail }) {
  const refresh = useRefresh(detail.lead.id)
  return (
    <section className="mt-6">
      <h2 className="text-subhead text-ink">{t('leads.comments')}</h2>
      <CommentThread comments={detail.comments} userNames={detail.userNames} path={`/leads/${detail.lead.id}`} sentDetail={t('toast.commentSentDetail')} onSaved={refresh} />
    </section>
  )
}

/** NOTE-8: the author's own entry, within 24 hours; the text before is kept in the history. */
function EditNoteForm({ detail, item, onClose }: { detail: LeadDetail; item: LeadDetail['interactions'][number]; onClose: () => void }) {
  const refresh = useRefresh(detail.lead.id)
  const [body, setBody] = useState(item.note)
  const [outcome, setOutcome] = useState(item.outcome ?? '')
  const save = useMutation({
    mutationFn: () => api.patch(`/leads/${detail.lead.id}/notes/${item.id}`, { body: body.trim(), ...(item.type !== 'NOTE' && { outcome: outcome.trim() || null }) }),
    onSuccess: async () => {
      await refresh()
      toast.success(t('toast.noteEdited'))
      onClose()
    },
  })
  return (
    <form
      noValidate
      onSubmit={(event) => {
        event.preventDefault()
        if (body.trim()) save.mutate()
      }}
    >
      <p className="mb-3 text-caption text-ink-meta">{t('leads.editNoteHelp')}</p>
      {item.type !== 'NOTE' && (
        <Field label={t('leads.outcome')} htmlFor="edit-outcome">
          <Input id="edit-outcome" maxLength={200} placeholder={t('placeholder.outcome')} value={outcome} onChange={(event) => setOutcome(event.target.value)} />
        </Field>
      )}
      <Field label={t('leads.noteText')} htmlFor="edit-note" required>
        <Textarea id="edit-note" rows={4} maxLength={4000} value={body} onChange={(event) => setBody(event.target.value)} />
      </Field>
      <FormError message={save.isError ? errorMessage(save.error) : undefined} />
      <div className={MODAL_FOOTER}>
        <Button type="button" variant="ghost" onClick={onClose}>
          {t('common.cancel')}
        </Button>
        <Button type="submit" disabled={!body.trim() || save.isPending}>
          {t('common.save')}
        </Button>
      </div>
    </form>
  )
}

function Timeline({ detail }: { detail: LeadDetail }) {
  const refresh = useRefresh(detail.lead.id)
  const { data: me } = useMe()
  const url = useUrlState()
  const [now] = useState(() => Date.now())
  const [removing, setRemoving] = useState<LeadDetail['interactions'][number] | null>(null)
  const editing = detail.interactions.find((item) => item.id === url.get('note'))
  const mine = (item: LeadDetail['interactions'][number]) => item.createdBy === me?.user.id && item.source === 'APP' && now - new Date(item.occurredAt).getTime() < 24 * 3_600_000
  const remove = useMutation({
    mutationFn: (item: LeadDetail['interactions'][number]) => api.delete(`/leads/${detail.lead.id}/notes/${item.id}`),
    onSuccess: async () => {
      await refresh()
      toast.info(t('toast.noteDeleted'))
      setRemoving(null)
    },
  })
  return (
    <section className="mt-6">
      <h2 className="text-subhead text-ink">{t('leads.notes')}</h2>
      {detail.interactions.length === 0 && <p className="mt-2 text-caption text-ink-meta">{t('leads.noNotes')}</p>}
      <ol className="mt-2 space-y-2">
        {detail.interactions.map((item) => (
          <li key={item.id} className="border-b border-band pb-2 text-caption">
            <p className="flex flex-wrap items-center gap-2 text-ink-meta">
              {item.type !== 'NOTE' && <Badge tone="info">{tDynamic(`interaction.${item.type}`, item.type)}</Badge>}
              {item.initial && <Badge tone="muted">{t('leads.initialNote')}</Badge>}
              <span>
                {formatDateTime(item.occurredAt)} · {item.createdBy ? t('leads.by', { name: detail.userNames[item.createdBy] ?? '-' }) : t('leads.byForm')}
                {item.editedAt && ` · ${t('leads.edited')}`}
              </span>
              {mine(item) && (
                <span className="ml-auto">
                  <RowMenu
                    label={t('common.more')}
                    items={[
                      { label: t('leads.editNote'), onSelect: () => url.set({ note: item.id }, { push: true }) },
                      ...(item.type === 'NOTE' ? [{ label: t('leads.deleteNote'), danger: true, onSelect: () => setRemoving(item) }] : []),
                    ]}
                  />
                </span>
              )}
            </p>
            {item.outcome && <p className="mt-1 font-medium text-ink-body">{item.outcome}</p>}
            <p className="mt-1 whitespace-pre-wrap text-ink-body">{item.note}</p>
          </li>
        ))}
      </ol>
      {/* Decided 26/11/2026: a supporter writes notes too, but does not record contacts */}
      {detail.canContribute ? <NoteComposer path={`/leads/${detail.lead.id}`} notesOnly={!detail.canWork} onSaved={refresh} /> : <p className="mt-3 text-caption text-ink-meta">{t('leads.notesReadOnly')}</p>}
      <Dialog title={t('leads.editNoteTitle')} open={!!editing} onClose={() => url.set({ note: null })}>
        {editing && <EditNoteForm key={editing.id} detail={detail} item={editing} onClose={() => url.set({ note: null })} />}
      </Dialog>
      <ConfirmDialog message={removing ? t('leads.deleteNoteConfirm') : null} danger pending={remove.isPending} error={remove.isError ? errorMessage(remove.error) : undefined} onConfirm={() => removing && remove.mutate(removing)} onClose={() => setRemoving(null)} />
    </section>
  )
}

function InfoTab({ detail, onEdit }: { detail: LeadDetail; onEdit: () => void }) {
  const { lead, canWork, campaign } = detail
  return (
    <Container className="grid gap-8 pb-8 lg:grid-cols-2">
      {/* Decided 27/11/2026: a lead back in the pool says when, from whom and why */}
      {lead.releasedAt && !lead.assignedAgentCode && (
        <div className="lg:col-span-2">
          <Notice>
            {t('leads.released', {
              at: formatDateTime(lead.releasedAt),
              agent: lead.releasedFrom ? (detail.agentNames[lead.releasedFrom] ?? lead.releasedFrom) : '-',
              reason: lead.releaseReason ? tDynamic(`leads.releaseReason.${lead.releaseReason}`, lead.releaseReason) : '-',
            })}
          </Notice>
        </div>
      )}
      <div>
        <div className="flex items-center justify-between">
          <h2 className="text-subhead text-ink">{t('leads.info')}</h2>
          {canWork && (
            <Button variant="ghost" onClick={onEdit}>
              {t('leads.edit')}
            </Button>
          )}
        </div>
        <dl className="mt-2">
          <Fact label={t('leads.phone')} value={lead.phone} />
          <Fact label={t('leads.email')} value={lead.email} />
          <Fact label={t('leads.dob')} value={showDate(lead.dob)} />
          <Fact label={t('agents.gender')} value={lead.gender} />
          {/* Decided 26/11/2026: the place by its current names; an older typed province shows as written */}
          <Fact label={t('leads.address')} value={[lead.addressLine, lead.wardName, lead.provinceName].filter(Boolean).join(', ') || null} />
          {!lead.provinceCode && lead.province && <Fact label={t('leads.provinceOld')} value={lead.province} />}
          <Fact label={t('leads.source')} value={lead.source} />
          <Fact label={t('leads.phoneSource')} value={lead.phoneSource} />
          <Fact label={t('leads.campaign')} value={campaign?.name} />
          <Fact label={t('leads.leadDate')} value={showDate(lead.leadDate)} />
          <Fact label={t('leads.consent')} value={t(lead.consentMarketing ? 'leads.consentYes' : 'leads.consentNo')} />
          <Fact label={t('leads.firstContact')} value={lead.firstContactAt ? formatDateTime(lead.firstContactAt) : null} />
          <Fact label={t('leads.lastContact')} value={lead.lastContactAt ? formatDateTime(lead.lastContactAt) : null} />
          {/* TENANT-5: the catalogue product, next to what was written freely (an import, the public form) */}
          {lead.productCode && (
            <div className="grid grid-cols-[9rem_1fr] gap-2 border-b border-band py-2 text-caption">
              <dt className="text-ink-meta">{t('leads.productInterest')}</dt>
              <dd className="min-w-0 break-words">
                <Link to={`/products/${encodeURIComponent(lead.productCode)}`} className="text-primary hover:underline">
                  {lead.productName ?? lead.productCode}
                </Link>
              </dd>
            </div>
          )}
          {lead.productInterest && <Fact label={lead.productCode ? t('leads.productNote') : t('leads.product')} value={lead.productInterest} />}
          {lead.extraInfo && <Fact label={t('leads.extraInfo')} value={lead.extraInfo} />}
          {/* From a GA's file ("XỬ LÝ SAU", "CDYT"), shown when there is something (decided 25/11/2026) */}
          {lead.followUp10d && <Fact label={t('leads.followUp10d')} value={lead.followUp10d} />}
          {lead.followUp15d && <Fact label={t('leads.followUp15d')} value={lead.followUp15d} />}
          {lead.followUp20d && <Fact label={t('leads.followUp20d')} value={lead.followUp20d} />}
          {lead.handlingNote && <Fact label={t('leads.handlingNote')} value={lead.handlingNote} />}
          {lead.cdytStats && <Fact label={t('leads.cdytStats')} value={lead.cdytStats} />}
          {lead.cdytProfile && <Fact label={t('leads.cdytProfile')} value={lead.cdytProfile} />}
          {lead.applicationNo && <Fact label={t('leads.applicationNo')} value={lead.applicationNo} />}
          {lead.policyNo && <Fact label={t('leads.policyNo')} value={lead.policyNo} />}
          {lead.lostReason && <Fact label={t('leads.lostReason')} value={lead.lostReason} />}
        </dl>
        <Comments detail={detail} />
      </div>
      <div>
        {canWork ? (
          <StatusForm key={lead.updatedAt} detail={detail} />
        ) : (
          <Notice>{t(detail.supporting ? 'leads.supportingNotice' : 'leads.viewOnly', { name: detail.assignee?.name ?? '-' })}</Notice>
        )}
        <Timeline detail={detail} />
      </div>
    </Container>
  )
}

const taskSchema = z.object({
  title: requiredText(200),
  dueAt: z.string().min(1, t('validation.required')),
})
type TaskValues = z.infer<typeof taskSchema>

/** TASK-2 */
function TaskForm({ leadId, task, onClose }: { leadId: string; task?: LeadTask; onClose: () => void }) {
  const refresh = useRefresh(leadId)
  const form = useForm<TaskValues>({ resolver: zodResolver(taskSchema), defaultValues: { title: task?.title ?? '', dueAt: toLocalInput(task?.dueAt) } })
  const save = useMutation({
    mutationFn: ({ title, dueAt }: TaskValues) => {
      const body = { title, dueAt: fromLocalInput(dueAt) }
      return task ? api.patch(`/leads/${leadId}/tasks/${task.id}`, body) : api.post(`/leads/${leadId}/tasks`, body)
    },
    onSuccess: async (_, { title }) => {
      await refresh()
      toast.success(t(task ? 'toast.taskUpdated' : 'toast.taskAdded', { title }))
      onClose()
    },
  })
  const { errors } = form.formState
  return (
    <form noValidate onSubmit={form.handleSubmit((values) => save.mutate(values))}>
      <Field label={t('leads.taskTitle')} htmlFor="task-title" required error={errors.title?.message}>
        <Input id="task-title" placeholder={t('leads.taskPlaceholder')} aria-invalid={!!errors.title} {...form.register('title')} />
      </Field>
      <Field label={t('leads.taskDue')} htmlFor="task-due" required error={errors.dueAt?.message}>
        <Input id="task-due" type="datetime-local" aria-invalid={!!errors.dueAt} {...form.register('dueAt')} />
      </Field>
      <FormError message={save.isError ? errorMessage(save.error) : undefined} />
      <div className={MODAL_FOOTER}>
        <Button variant="secondary" onClick={onClose}>
          {t('common.cancel')}
        </Button>
        <Button type="submit" disabled={save.isPending}>
          {t('common.save')}
        </Button>
      </div>
    </form>
  )
}

function TasksTab({ detail }: { detail: LeadDetail }) {
  // Decided 26/11/2026: the assignee and the lead's supporters share its tasks
  const { lead, tasks, canContribute: canWork } = detail
  const refresh = useRefresh(lead.id)
  const [editing, setEditing] = useState<LeadTask | 'new' | null>(null)
  const toggle = useMutation({
    mutationFn: (task: LeadTask) => api.patch(`/leads/${lead.id}/tasks/${task.id}`, { done: task.status !== 'DONE' }),
    onSuccess: async (_, task) => {
      await refresh()
      if (task.status === 'DONE') toast.info(t('toast.taskReopened', { title: task.title }))
      else toast.success(t('toast.taskDone', { title: task.title }))
    },
    onError: (error) => toast.error(t('toast.taskToggleFailed'), errorMessage(error)),
  })
  const [now] = useState(() => Date.now())
  return (
    <Container className="pb-8">
      {canWork && (
        <Button className="mb-3" onClick={() => setEditing('new')}>
          {t('leads.addTask')}
        </Button>
      )}
      {tasks.length === 0 && <EmptyState>{t('leads.noTasks')}</EmptyState>}
      <ul className="divide-y divide-band">
        {tasks.map((task) => {
          const overdue = task.status === 'OPEN' && new Date(task.dueAt).getTime() < now
          return (
            <li key={task.id} className="flex items-center gap-3 py-2.5 text-caption">
              <Checkbox aria-label={task.title} checked={task.status === 'DONE'} disabled={!canWork || toggle.isPending} onChange={() => toggle.mutate(task)} />
              <span className="min-w-0 flex-1">
                <span className={`block ${task.status === 'DONE' ? 'text-ink-meta line-through' : 'text-ink'}`}>{task.title}</span>
                <span className={`block ${overdue ? 'font-medium text-alert' : 'text-ink-meta'}`}>
                  {formatDateTime(task.dueAt)}
                  {overdue && ` · ${t('leads.taskOverdue')}`}
                  {task.doneAt && ` · ${t('leads.taskDone', { name: detail.userNames[task.doneBy ?? ''] ?? '-' })}`}
                </span>
              </span>
              <Badge tone="muted">{tDynamic(`taskSource.${task.source}`, task.source)}</Badge>
              {canWork && task.status === 'OPEN' && (
                <Button variant="ghost" onClick={() => setEditing(task)}>
                  {t('leads.edit')}
                </Button>
              )}
            </li>
          )
        })}
      </ul>
      <Dialog title={editing === 'new' ? t('leads.addTask') : t('leads.editTask')} open={editing !== null} onClose={() => setEditing(null)}>
        {editing !== null && <TaskForm leadId={lead.id} task={editing === 'new' ? undefined : editing} onClose={() => setEditing(null)} />}
      </Dialog>
    </Container>
  )
}

/** LEAD-28 "Lịch sử phụ trách": who held the lead and what they did with it. */
function Handovers({ detail }: { detail: LeadDetail }) {
  if (detail.handovers.length === 0) return null
  return (
    <section className="mb-6">
      <h2 className="mb-2 text-subhead text-ink">{t('leads.handovers')}</h2>
      <div className="overflow-x-auto">
        <table className="data-table min-w-[720px] table-fixed">
          <colgroup>
            <col />
            <col className="w-[130px]" />
            <col className="w-[150px]" />
            <col className="w-[140px]" />
            <col className="w-[130px]" />
          </colgroup>
          <thead>
            <tr>
              <th>{t('leads.handoverAgent')}</th>
              <th>{t('leads.handoverFrom')}</th>
              <th>{t('leads.handoverTo')}</th>
              <th className="text-right">{t('leads.handoverDays')}</th>
              <th className="text-right">{t('leads.handoverContacts')}</th>
            </tr>
          </thead>
          <tbody>
            {detail.handovers.map((row) => {
              // Handed over without a single contact: a sign the lead was left alone
              const abandoned = row.to !== null && row.contacts === 0
              // The colour sits on the cells, because the table styles colour cells directly
              const tone = abandoned ? 'text-alert' : ''
              return (
                <tr key={`${row.agentCode}-${row.from}`} data-abandoned={abandoned || undefined}>
                  <td className={`truncate ${tone}`} title={row.name ?? row.agentCode}>
                    {row.name ? `${row.name} (${row.agentCode})` : row.agentCode}
                  </td>
                  <td className={`whitespace-nowrap ${tone}`}>{formatDate(row.from)}</td>
                  <td className={`whitespace-nowrap ${tone}`}>{row.to ? formatDate(row.to) : t('leads.handoverCurrent')}</td>
                  <td className={`text-right tabular-nums ${tone}`}>{t('leads.handoverDaysValue', { count: row.days })}</td>
                  <td className={`text-right tabular-nums ${tone}`} title={abandoned ? t('leads.handoverNoContact') : undefined}>
                    {row.contacts}
                  </td>
                </tr>
              )
            })}
          </tbody>
        </table>
      </div>
    </section>
  )
}

function HistoryTab({ detail }: { detail: LeadDetail }) {
  const catalogue = useLeadOptions()
  // TENANT-5: product codes in the history show as names when the catalogue knows them
  const products = useQuery(queries.products())
  const productNames = new Map((products.data?.items ?? []).map((product) => [product.productCode, product.productName]))
  if (detail.lead.productCode && detail.lead.productName) productNames.set(detail.lead.productCode, detail.lead.productName)
  const value = (field: string, raw: string | null) => (field === 'productCode' && raw !== null ? (productNames.get(raw) ?? raw) : historyValue(field, raw, detail.agentNames, catalogue))
  if (detail.history.length === 0 && detail.handovers.length === 0) {
    return (
      <Container className="pb-8">
        <EmptyState>{t('leads.noHistory')}</EmptyState>
      </Container>
    )
  }
  return (
    <Container className="pb-8">
      <Handovers detail={detail} />
      {detail.history.length > 0 && (
      <section>
      <h2 className="mb-2 text-subhead text-ink">{t('leads.changes')}</h2>
      <div className="overflow-x-auto">
        <table className="data-table min-w-[820px] table-fixed">
          <colgroup>
            <col className="w-[152px]" />
            <col className="w-[160px]" />
            <col />
            <col />
            <col className="w-[180px]" />
          </colgroup>
          <thead>
            <tr>
              <th>{t('leads.at')}</th>
              <th>{t('leads.field')}</th>
              <th>{t('leads.oldValue')}</th>
              <th>{t('leads.newValue')}</th>
              <th>{t('leads.changedBy')}</th>
            </tr>
          </thead>
          <tbody>
            {detail.history.map((row) => (
              <tr key={row.id}>
                <td className="whitespace-nowrap text-ink-meta">{formatDateTime(row.changedAt)}</td>
                <td>{tDynamic(`historyField.${row.field}`, row.field)}</td>
                <td className="truncate">{value(row.field, row.oldValue)}</td>
                <td className="truncate" title={row.note ?? undefined}>
                  {value(row.field, row.newValue)}
                  {row.note && <span className="block truncate text-ink-meta">{row.note}</span>}
                </td>
                <td className="truncate">
                  {row.changedBy ? (detail.userNames[row.changedBy] ?? '-') : t('leads.bySystem')}
                  {row.imported && <span className="ml-1 text-ink-meta">{t('leads.viaImport')}</span>}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      </section>
      )}
    </Container>
  )
}

const TABS: { key: 'info' | 'tasks' | 'support' | 'history' | 'link'; label: MessageKey }[] = [
  { key: 'info', label: 'leads.tabInfo' },
  { key: 'tasks', label: 'leads.tabTasks' },
  // Decided 26/11/2026: who helps with the lead, without seeing its phone
  { key: 'support', label: 'leads.tabSupport' },
  { key: 'history', label: 'leads.tabHistory' },
  // LEAD-32
  { key: 'link', label: 'leads.tabLink' },
]

export function LeadDetailPage() {
  const { id = '' } = useParams()
  const url = useUrlState()
  const lead = useQuery(queries.lead(id))
  const catalogue = useLeadOptions()
  const [assigning, setAssigning] = useState(false)
  const tab = url.oneOf('tab', ['tasks', 'support', 'history', 'link']) || 'info'
  useSelectedTabInView(tab, !!lead.data)
  const editing = url.get('edit') === '1'
  const dialog = url.oneOf('dialog', ['delete', 'merge'])

  if (lead.isPending) return <Spinner />
  if (lead.isError) {
    return (
      <Container className="py-6">
        <Alert>{errorMessage(lead.error)}</Alert>
        <Link to="/leads" className="mt-4 inline-block text-link text-primary hover:underline">
          {t('leads.back')}
        </Link>
      </Container>
    )
  }
  const { data } = lead
  const { lead: info, assignee, campaign } = data

  return (
    <>
      <Container className="flex-none pt-2 pb-4">
        <Link to="/leads" className="inline-flex items-center gap-1 text-caption text-primary hover:underline">
          <ArrowLeft aria-hidden size={14} />
          {t('leads.back')}
        </Link>
        <div className="mt-2 flex flex-wrap items-start justify-between gap-3">
          <div className="min-w-0">
            <h1 className="flex flex-wrap items-center gap-2 text-page-title text-ink">
              {info.fullName}
              <Badge tone="muted">{tDynamic(`stage.${info.stage}`, info.stage)}</Badge>
              {info.careStatus && <Badge tone={careTone(info.careStatus)}>{catalogue.label('care_status', info.careStatus)}</Badge>}
              {info.interest && <Badge tone={interestTone(info.interest)}>{catalogue.label('interest', info.interest)}</Badge>}
              {info.origin === 'FC_OWN' && <Badge tone="muted">{t('leads.badgeOwn')}</Badge>}
              {info.isNew && <Badge tone="info">{t('leads.badgeNew')}</Badge>}
              {info.overdue && <Badge tone="danger">{t('leads.badgeOverdue')}</Badge>}
            </h1>
            <p className="mt-1 text-caption text-ink-meta">
              <span className="tabular-nums">{info.phone}</span> · {assignee ? `${assignee.name ?? assignee.agentCode} (${assignee.agentCode})` : t('leads.unassigned')} · {info.source}
              {campaign && ` · ${campaign.name}`}
            </p>
          </div>
          {data.canAssign && (
            <span className="flex items-center gap-1">
              <Button variant="secondary" onClick={() => setAssigning(true)}>
                {t('leads.assign')}
              </Button>
              {/* LEAD-40, LEAD-41: for whoever manages leads */}
              {data.canManage && (
                <RowMenu
                  label={t('common.more')}
                  items={[
                    { label: t('leads.merge'), onSelect: () => url.set({ dialog: 'merge' }, { push: true }) },
                    { label: t('leads.delete'), danger: true, onSelect: () => url.set({ dialog: 'delete' }, { push: true }) },
                  ]}
                />
              )}
            </span>
          )}
        </div>
      </Container>

      <Container className="flex-none">
        <TabBar
          className="mb-2"
          label={info.fullName}
          value={tab}
          onValueChange={(key) => url.set({ tab: key === 'info' ? null : key })}
          items={TABS.map((item) => ({
            value: item.key,
            label: item.key === 'support' ? t('leads.tabSupport', { count: data.supporters.length }) : `${t(item.label)}${item.key === 'tasks' ? ` (${data.tasks.filter((task) => task.status === 'OPEN').length})` : ''}`,
          }))}
        />
      </Container>

      {tab === 'info' && <InfoTab detail={data} onEdit={() => url.set({ edit: 1 }, { push: true })} />}
      {tab === 'tasks' && <TasksTab detail={data} />}
      {tab === 'support' && <SupportTab detail={data} />}
      {tab === 'history' && <HistoryTab detail={data} />}
      {tab === 'link' && <LeadLinkTab detail={data} />}

      <Dialog wide title={t('leads.editTitle')} open={editing && data.canWork} onClose={() => url.set({ edit: null })}>
        {editing && data.canWork && <EditLeadForm detail={data} onClose={() => url.set({ edit: null })} />}
      </Dialog>
      <Dialog title={t('leads.deleteTitle', { name: info.fullName })} open={dialog === 'delete' && data.canManage} onClose={() => url.set({ dialog: null })}>
        {dialog === 'delete' && data.canManage && <DeleteLeadForm lead={info} onClose={() => url.set({ dialog: null })} />}
      </Dialog>
      <Dialog title={t('leads.mergeTitle', { name: info.fullName })} open={dialog === 'merge' && data.canManage} onClose={() => url.set({ dialog: null })}>
        {dialog === 'merge' && data.canManage && <MergeLeadForm lead={info} onClose={() => url.set({ dialog: null })} />}
      </Dialog>
      <LeadAssignDialog leadIds={[info.id]} allowUnassign={data.canManage} open={assigning} onClose={() => setAssigning(false)} onDone={() => setAssigning(false)} />
    </>
  )
}
