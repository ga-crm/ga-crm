import { zodResolver } from '@hookform/resolvers/zod'
import { useMutation, useQueryClient } from '@tanstack/react-query'
import { useState } from 'react'
import type { ReactNode } from 'react'
import { useForm, useWatch } from 'react-hook-form'
import { z } from 'zod'
import { formatVnd, t } from '../i18n'
import type { MessageKey } from '../i18n'
import { api, errorField, errorMessage } from '../lib/api'
import { CARE_BLOCKS, careRequired } from '../lib/clientCare'
import type { CareBlockKey } from '../lib/clientCare'
import { showDate } from '../lib/leadLabels'
import { keys } from '../lib/queries'
import { vietnamToday } from '../lib/reportPeriods'
import { toast } from '../lib/toast'
import { CARE_RECORD_KINDS, REFERRAL_RELATIONS, REFERRAL_RESULTS } from '../lib/types'
import type { CareRecord, CareRecordKind, ClientDetail, ClientReferral } from '../lib/types'
import { useUrlState } from '../lib/useUrlState'
import { optionalText, requiredDate, requiredText } from '../lib/validation'
import { Badge, Button, ConfirmDialog, Dialog, Field, FormError, Input, MODAL_FOOTER, Panel, RowMenu, Select, Textarea } from './ui'

const money = z.string().trim().regex(/^\d*$/, t('validation.money'))
const amount = (value: string) => (value === '' ? null : Number(value))
const kindLabel = (kind: CareRecordKind) => t(`care.kind.${kind}` as MessageKey)

function useRefresh() {
  const queryClient = useQueryClient()
  return () => queryClient.invalidateQueries({ queryKey: keys.clients })
}

const careSchema = z
  .object({
    kind: z.enum(CARE_RECORD_KINDS),
    occurredOn: requiredDate,
    title: optionalText(200),
    place: optionalText(200),
    amountVnd: money,
    policyNo: z.string(),
    note: optionalText(1000),
  })
  // What a kind must say, as the API checks it
  .superRefine((values, context) => {
    const required = careRequired(values.kind)
    const missing = (path: 'title' | 'place' | 'amountVnd') => context.addIssue({ code: 'custom', path: [path], message: t('validation.required') })
    if (required.title && !values.title.trim()) missing('title')
    if (required.place && !values.place.trim()) missing('place')
    if (required.amount && !Number(values.amountVnd)) missing('amountVnd')
  })
type CareValues = z.infer<typeof careSchema>
const CARE_ERRORS = { invalid_input: 'policyNo' } as const

/**
 * Decided 26/11/2026: one care record. Every field is always there, so the dialog keeps its height;
 * the kind only changes which fields are required and what the placeholders suggest.
 */
function CareRecordForm({ detail, block, record, onClose }: { detail: ClientDetail; block: (typeof CARE_BLOCKS)[number]; record?: CareRecord; onClose: () => void }) {
  const refresh = useRefresh()
  const { client } = detail
  const form = useForm<CareValues>({
    resolver: zodResolver(careSchema),
    mode: 'onTouched',
    defaultValues: record
      ? { kind: record.kind, occurredOn: record.occurredOn, title: record.title ?? '', place: record.place ?? '', amountVnd: record.amountVnd === null ? '' : String(record.amountVnd), policyNo: record.policyNo ?? '', note: record.note ?? '' }
      : { kind: block.kinds[0], occurredOn: vietnamToday(), title: '', place: '', amountVnd: '', policyNo: '', note: '' },
  })
  const kind = useWatch({ control: form.control, name: 'kind' })
  const required = careRequired(kind)
  const { errors } = form.formState
  const save = useMutation({
    mutationFn: (values: CareValues) => {
      const body = { kind: values.kind, occurredOn: values.occurredOn, title: values.title.trim() || null, place: values.place.trim() || null, amountVnd: amount(values.amountVnd), policyNo: values.policyNo || null, note: values.note.trim() || null }
      return record ? api.patch(`/clients/${client.id}/care-records/${record.id}`, body) : api.post(`/clients/${client.id}/care-records`, body)
    },
    onSuccess: async (_, values) => {
      await refresh()
      toast.success(t(record ? 'toast.careUpdated' : 'toast.careAdded', { what: kindLabel(values.kind), name: client.name }))
      onClose()
    },
    onError: (error) => {
      const field = errorField(error, CARE_ERRORS)
      if (field) form.setError(field, { message: errorMessage(error) })
    },
  })
  return (
    <form noValidate onSubmit={form.handleSubmit((values) => save.mutate(values))}>
      <div className="grid gap-x-4 sm:grid-cols-2">
        <Field label={t('care.field.kind')} htmlFor="care-kind" required>
          <Select id="care-kind" disabled={block.kinds.length === 1} {...form.register('kind')}>
            {block.kinds.map((value) => (
              <option key={value} value={value}>
                {kindLabel(value)}
              </option>
            ))}
          </Select>
        </Field>
        <Field label={t('care.field.date')} htmlFor="care-date" required error={errors.occurredOn?.message}>
          <Input id="care-date" type="date" aria-invalid={!!errors.occurredOn} {...form.register('occurredOn')} />
        </Field>
        <Field label={t('care.field.title')} htmlFor="care-title" required={required.title} error={errors.title?.message}>
          <Input id="care-title" maxLength={200} placeholder={t(`care.titlePlaceholder.${kind}` as MessageKey)} aria-invalid={!!errors.title} {...form.register('title')} />
        </Field>
        <Field label={t('care.field.place')} htmlFor="care-place" required={required.place} error={errors.place?.message}>
          <Input id="care-place" maxLength={200} placeholder={t(kind === 'CLAIM' ? 'care.placePlaceholder.CLAIM' : 'care.placePlaceholder.other')} aria-invalid={!!errors.place} {...form.register('place')} />
        </Field>
        <Field label={t('care.field.amount')} htmlFor="care-amount" required={required.amount} error={errors.amountVnd?.message}>
          <Input id="care-amount" inputMode="numeric" placeholder={t('placeholder.money')} aria-invalid={!!errors.amountVnd} {...form.register('amountVnd')} />
        </Field>
        <Field label={t('care.field.policy')} htmlFor="care-policy" error={errors.policyNo?.message}>
          <Select id="care-policy" aria-invalid={!!errors.policyNo} {...form.register('policyNo')}>
            <option value="">{t('care.field.noPolicy')}</option>
            {detail.policies.map((policy) => (
              <option key={policy.policyNo} value={policy.policyNo}>
                {t('clients.policyNo', { no: policy.policyNo })}
              </option>
            ))}
          </Select>
        </Field>
        <div className="sm:col-span-2">
          {/* PDP-1: when and where, never a diagnosis */}
          <Field label={t('care.field.note')} htmlFor="care-note" hint={t('care.field.noteHint')} error={errors.note?.message}>
            <Textarea id="care-note" rows={2} maxLength={1000} {...form.register('note')} />
          </Field>
        </div>
      </div>
      <FormError message={save.isError && !errorField(save.error, CARE_ERRORS) ? errorMessage(save.error) : undefined} />
      <div className={MODAL_FOOTER}>
        <Button type="button" variant="ghost" onClick={onClose}>
          {t('common.cancel')}
        </Button>
        <Button type="submit" disabled={save.isPending}>
          {t('care.save')}
        </Button>
      </div>
    </form>
  )
}

const referralSchema = z.object({
  personName: requiredText(200),
  relation: z.enum(REFERRAL_RELATIONS),
  referredOn: requiredDate,
  result: z.enum(REFERRAL_RESULTS),
  premiumVnd: money,
  note: optionalText(1000),
})
type ReferralValues = z.infer<typeof referralSchema>

/** Decided 26/11/2026: one person the client referred; the premium counts only once it succeeded. */
function ReferralForm({ detail, referral, onClose }: { detail: ClientDetail; referral?: ClientReferral; onClose: () => void }) {
  const refresh = useRefresh()
  const { client } = detail
  const form = useForm<ReferralValues>({
    resolver: zodResolver(referralSchema),
    mode: 'onTouched',
    defaultValues: referral
      ? { personName: referral.personName, relation: referral.relation, referredOn: referral.referredOn, result: referral.result, premiumVnd: referral.premiumVnd === null ? '' : String(referral.premiumVnd), note: referral.note ?? '' }
      : { personName: '', relation: 'FRIEND', referredOn: vietnamToday(), result: 'PENDING', premiumVnd: '', note: '' },
  })
  const succeeded = useWatch({ control: form.control, name: 'result' }) === 'SUCCESS'
  const { errors } = form.formState
  const save = useMutation({
    mutationFn: (values: ReferralValues) => {
      // A premium belongs to a successful referral only
      const body = { ...values, personName: values.personName.trim(), premiumVnd: values.result === 'SUCCESS' ? amount(values.premiumVnd) : null, note: values.note.trim() || null }
      return referral ? api.patch(`/clients/${client.id}/referrals/${referral.id}`, body) : api.post(`/clients/${client.id}/referrals`, body)
    },
    onSuccess: async (_, values) => {
      await refresh()
      toast.success(referral ? t('toast.referralUpdated', { person: values.personName }) : t('toast.referralAdded', { person: values.personName, name: client.name }))
      onClose()
    },
  })
  return (
    <form noValidate onSubmit={form.handleSubmit((values) => save.mutate(values))}>
      <div className="grid gap-x-4 sm:grid-cols-2">
        <Field label={t('referral.person')} htmlFor="referral-person" required error={errors.personName?.message}>
          <Input id="referral-person" maxLength={200} placeholder={t('placeholder.name')} aria-invalid={!!errors.personName} {...form.register('personName')} />
        </Field>
        <Field label={t('referral.relationLabel')} htmlFor="referral-relation" required>
          <Select id="referral-relation" {...form.register('relation')}>
            {REFERRAL_RELATIONS.map((value) => (
              <option key={value} value={value}>
                {t(`referral.relation.${value}`)}
              </option>
            ))}
          </Select>
        </Field>
        <Field label={t('referral.date')} htmlFor="referral-date" required error={errors.referredOn?.message}>
          <Input id="referral-date" type="date" aria-invalid={!!errors.referredOn} {...form.register('referredOn')} />
        </Field>
        <Field label={t('referral.resultLabel')} htmlFor="referral-result" required>
          <Select id="referral-result" {...form.register('result')}>
            {REFERRAL_RESULTS.map((value) => (
              <option key={value} value={value}>
                {t(`referral.result.${value}`)}
              </option>
            ))}
          </Select>
        </Field>
        <Field label={t('referral.premium')} htmlFor="referral-premium" hint={t('referral.premiumHint')} error={errors.premiumVnd?.message}>
          <Input id="referral-premium" inputMode="numeric" disabled={!succeeded} placeholder={t('placeholder.money')} aria-invalid={!!errors.premiumVnd} {...form.register('premiumVnd')} />
        </Field>
        <Field label={t('care.field.note')} htmlFor="referral-note" error={errors.note?.message}>
          <Input id="referral-note" maxLength={1000} {...form.register('note')} />
        </Field>
      </div>
      <FormError message={save.isError ? errorMessage(save.error) : undefined} />
      <div className={MODAL_FOOTER}>
        <Button type="button" variant="ghost" onClick={onClose}>
          {t('common.cancel')}
        </Button>
        <Button type="submit" disabled={save.isPending}>
          {t('care.save')}
        </Button>
      </div>
    </form>
  )
}

/** One block of the care section: its name, what it is for, an "add" for whoever may edit, its rows. */
function Block({ title, help, summary, empty, onAdd, children }: { title: string; help: string; summary?: ReactNode; empty: string | null; onAdd?: () => void; children: ReactNode }) {
  return (
    <Panel className="p-5">
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0">
          <h3 className="text-subhead text-ink">{title}</h3>
          <p className="mt-1 text-caption text-ink-meta">{help}</p>
        </div>
        {onAdd && (
          <Button variant="ghost" className="flex-none" onClick={onAdd}>
            {t('care.add')}
          </Button>
        )}
      </div>
      {summary && <p className="mt-2 text-caption font-medium text-ink-body">{summary}</p>}
      {empty ? <p className="mt-3 text-caption text-ink-meta">{empty}</p> : <ul className="mt-3 divide-y divide-band">{children}</ul>}
    </Panel>
  )
}

/** A dated row: when, what, how much, and the edit menu for whoever may edit. */
function Row({ date, tag, main, detail, amountVnd, menu }: { date: string; tag?: ReactNode; main: string; detail?: string | null; amountVnd?: number | null; menu?: ReactNode }) {
  return (
    <li className="flex items-start gap-3 py-2 text-caption">
      <span className="w-20 flex-none text-ink-meta tabular-nums">{showDate(date)}</span>
      <span className="min-w-0 flex-1">
        <span className="flex flex-wrap items-center gap-x-2 gap-y-1">
          {tag}
          <span className="min-w-0 break-words text-ink-body">{main}</span>
        </span>
        {detail && <span className="mt-0.5 block break-words whitespace-pre-line text-ink-meta">{detail}</span>}
      </span>
      {amountVnd !== null && amountVnd !== undefined && <span className="flex-none text-ink-body tabular-nums">{formatVnd(amountVnd)}</span>}
      {menu && <span className="-my-1.5 flex-none">{menu}</span>}
    </li>
  )
}

/**
 * Decided 26/11/2026: "Thông tin chăm sóc" on the client page. Four blocks of dated care records
 * (claims; seminars and health checks; gifts and visits; cash and gifts on signing) and the people
 * the client referred, with their totals. Whoever may edit the client adds, changes and removes.
 */
export function ClientCareRecords({ detail }: { detail: ClientDetail }) {
  const url = useUrlState()
  const refresh = useRefresh()
  const { client, canEdit } = detail
  // A form that is open lives in the URL; a confirmation for a removal does not
  const careKey = url.get('care')
  const newBlock = CARE_BLOCKS.find((block) => careKey === `new:${block.key}`)
  const editedRecord = careKey && !newBlock ? detail.careRecords.find((record) => record.id === careKey) : undefined
  const careBlock = newBlock ?? (editedRecord && CARE_BLOCKS.find((block) => (block.kinds as readonly CareRecordKind[]).includes(editedRecord.kind)))
  const referralKey = url.get('referral')
  const editedReferral = referralKey && referralKey !== 'new' ? detail.referrals.find((referral) => referral.id === referralKey) : undefined
  const referralOpen = canEdit && (referralKey === 'new' || !!editedReferral)
  const closeCare = () => url.set({ care: null })
  const closeReferral = () => url.set({ referral: null })

  const [removing, setRemoving] = useState<{ path: string; message: string; done: string } | null>(null)
  const remove = useMutation({
    mutationFn: (target: { path: string; done: string }) => api.delete(target.path),
    onSuccess: async (_, target) => {
      setRemoving(null)
      await refresh()
      toast.success(target.done)
    },
  })

  const recordText = (record: CareRecord) => [record.title, record.place].filter(Boolean).join(' · ')
  // What a removal or a toast calls the record
  const recordName = (record: CareRecord) => recordText(record) || kindLabel(record.kind)
  const recordDetail = (record: CareRecord) => [record.policyNo && t('care.onPolicy', { no: record.policyNo }), record.note].filter(Boolean).join('\n') || null
  const recordMenu = (record: CareRecord) =>
    canEdit && (
      <RowMenu
        label={t('common.more')}
        items={[
          { label: t('care.edit'), onSelect: () => url.set({ care: record.id }, { push: true }) },
          {
            label: t('care.delete'),
            danger: true,
            onSelect: () =>
              setRemoving({
                path: `/clients/${client.id}/care-records/${record.id}`,
                message: t('care.deleteConfirm', { what: recordName(record), date: showDate(record.occurredOn) ?? '' }),
                done: t('toast.careDeleted', { what: kindLabel(record.kind), name: client.name }),
              }),
          },
        ]}
      />
    )
  const blockTitle = (key: CareBlockKey) => t(`care.block.${key}`)
  const { signingSummary: signing, referralSummary: referred } = detail

  return (
    <>
      {CARE_BLOCKS.map((block) => {
        const records = detail.careRecords.filter((record) => (block.kinds as readonly CareRecordKind[]).includes(record.kind))
        return (
          <Block
            key={block.key}
            title={blockTitle(block.key)}
            help={t(`care.blockHelp.${block.key}`)}
            // Cash apart from gifts, as the project owner asked
            summary={block.key === 'signing' && records.length > 0 ? t('care.signingSummary', { cash: formatVnd(signing.cashVnd), gifts: signing.gifts, value: formatVnd(signing.giftValueVnd) }) : undefined}
            empty={records.length === 0 ? t(`care.empty.${block.key}`) : null}
            onAdd={canEdit ? () => url.set({ care: `new:${block.key}` }, { push: true }) : undefined}
          >
            {records.map((record) => (
              <Row
                key={record.id}
                date={record.occurredOn}
                // A block of two kinds says which one each row is
                tag={block.kinds.length > 1 ? <Badge tone="muted">{kindLabel(record.kind)}</Badge> : undefined}
                // The tag already names the kind, so a row without a title does not repeat it
                main={block.kinds.length > 1 ? recordText(record) : recordName(record)}
                detail={recordDetail(record)}
                amountVnd={record.amountVnd}
                menu={recordMenu(record)}
              />
            ))}
          </Block>
        )
      })}
      <Block
        title={t('care.block.referrals')}
        help={t('care.blockHelp.referrals')}
        summary={
          referred.total > 0 ? (
            <>
              {t('care.referralSummary', { total: referred.total, success: referred.success, pending: referred.pending, failed: referred.failed })}
              <span className="block">{t('care.referralPremium', { premium: formatVnd(referred.premiumVnd) })}</span>
            </>
          ) : undefined
        }
        empty={detail.referrals.length === 0 ? t('care.empty.referrals') : null}
        onAdd={canEdit ? () => url.set({ referral: 'new' }, { push: true }) : undefined}
      >
        {detail.referrals.map((referral) => (
          <Row
            key={referral.id}
            date={referral.referredOn}
            tag={<Badge tone={referral.result === 'SUCCESS' ? 'success' : referral.result === 'FAILED' ? 'muted' : 'info'}>{t(`referral.result.${referral.result}`)}</Badge>}
            main={`${referral.personName} · ${t(`referral.relation.${referral.relation}`)}`}
            detail={referral.note}
            amountVnd={referral.premiumVnd}
            menu={
              canEdit && (
                <RowMenu
                  label={t('common.more')}
                  items={[
                    { label: t('care.edit'), onSelect: () => url.set({ referral: referral.id }, { push: true }) },
                    {
                      label: t('care.delete'),
                      danger: true,
                      onSelect: () =>
                        setRemoving({
                          path: `/clients/${client.id}/referrals/${referral.id}`,
                          message: t('referral.deleteConfirm', { name: referral.personName }),
                          done: t('toast.referralDeleted', { person: referral.personName }),
                        }),
                    },
                  ]}
                />
              )
            }
          />
        ))}
      </Block>

      <Dialog title={careBlock ? t(editedRecord ? 'care.editTitle' : 'care.addTitle', { block: blockTitle(careBlock.key) }) : ''} open={canEdit && !!careBlock} onClose={closeCare}>
        {canEdit && careBlock && <CareRecordForm key={careKey} detail={detail} block={careBlock} record={editedRecord} onClose={closeCare} />}
      </Dialog>
      <Dialog title={t(editedReferral ? 'referral.editTitle' : 'referral.addTitle')} open={referralOpen} onClose={closeReferral}>
        {referralOpen && <ReferralForm key={referralKey} detail={detail} referral={editedReferral} onClose={closeReferral} />}
      </Dialog>
      <ConfirmDialog
        message={removing?.message ?? null}
        danger
        pending={remove.isPending}
        error={remove.isError ? errorMessage(remove.error) : undefined}
        onConfirm={() => removing && remove.mutate(removing)}
        onClose={() => {
          setRemoving(null)
          remove.reset()
        }}
      />
    </>
  )
}
