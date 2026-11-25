import { zodResolver } from '@hookform/resolvers/zod'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { useEffect, useState } from 'react'
import { useForm } from 'react-hook-form'
import { Link } from 'react-router-dom'
import { z } from 'zod'
import { t, tDynamic } from '../i18n'
import { api, ApiError, errorField, errorMessage } from '../lib/api'
import { coverageSummary, policyRolesLabel } from '../lib/clientLabels'
import { showDate } from '../lib/leadLabels'
import { keys, queries } from '../lib/queries'
import { toast } from '../lib/toast'
import { GENDERS, RELATIONS } from '../lib/types'
import type { ClientDetail, FamilyMember, Relation } from '../lib/types'
import { useUrlState } from '../lib/useUrlState'
import { optionalText, phoneField, requiredText } from '../lib/validation'
import { Badge, Button, ConfirmDialog, Dialog, EmptyState, Field, FormError, Input, MODAL_FOOTER, Notice, PickList, RowMenu, Select, TableScroll, Textarea, WIDE_FORM_GRID } from './ui'

const relationLabel = (relation: Relation | null) => (relation ? tDynamic(`relation.${relation}`, relation) : t('family.unlabelled'))

/** FAM-4: a birth date with any part missing, written as far as it is known. */
function birthText(member: FamilyMember): string | null {
  if (member.dob) return showDate(member.dob)
  const birth = member.birth
  if (!birth || (!birth.day && !birth.month && !birth.year)) return null
  const pad = (value: number | null) => (value ? String(value).padStart(2, '0') : '__')
  return `${pad(birth.day)}/${pad(birth.month)}/${birth.year ?? '____'}`
}

function useRefresh() {
  const queryClient = useQueryClient()
  return () => queryClient.invalidateQueries({ queryKey: keys.clients })
}

/** A whole number in a range, or nothing. */
const part = (min: number, max: number, message: string) =>
  z
    .string()
    .trim()
    .refine((value) => !value || (/^\d+$/.test(value) && Number(value) >= min && Number(value) <= max), message)
const toNumber = (value: string) => (value.trim() ? Number(value) : null)

const relativeSchema = z.object({
  fullName: requiredText(200),
  relation: z.enum(RELATIONS, { error: t('validation.required') }),
  gender: z.string(),
  birthDay: part(1, 31, t('family.dayInvalid')),
  birthMonth: part(1, 12, t('family.monthInvalid')),
  birthYear: part(1900, new Date().getFullYear(), t('family.yearInvalid')),
  note: optionalText(1000),
})
type RelativeValues = z.infer<typeof relativeSchema>
const RELATIVE_ERRORS = { already_client: 'fullName' } as const

/**
 * FAM-4: a relative who is not a client, added or edited. Labelling someone known only by a name on a
 * policy (FAM-5) adds them with that name.
 */
function RelativeForm({ clientId, member, onClose }: { clientId: string; member?: FamilyMember; onClose: () => void }) {
  const refresh = useRefresh()
  const editing = !!member?.linkId
  const form = useForm<RelativeValues>({
    resolver: zodResolver(relativeSchema),
    mode: 'onTouched',
    defaultValues: {
      fullName: member?.name ?? '',
      relation: member?.relation ?? ('' as Relation),
      gender: member?.gender ?? '',
      birthDay: String(member?.birth?.day ?? ''),
      birthMonth: String(member?.birth?.month ?? ''),
      birthYear: String(member?.birth?.year ?? ''),
      note: member?.note ?? '',
    },
  })
  const save = useMutation({
    mutationFn: (values: RelativeValues) => {
      const birth = {
        birthDay: toNumber(values.birthDay),
        birthMonth: toNumber(values.birthMonth),
        birthYear: toNumber(values.birthYear),
      }
      if (editing)
        return api.patch(`/clients/${clientId}/family/${member.linkId}`, {
          ...birth,
          fullName: values.fullName,
          relation: values.relation,
          gender: values.gender || null,
          note: values.note || null,
        })
      // A new record leaves out what is not known
      const known = Object.fromEntries(
        Object.entries({
          ...birth,
          gender: values.gender,
          note: values.note,
        }).filter(([, value]) => value !== null && value !== ''),
      )
      return api.post(`/clients/${clientId}/family`, {
        ...known,
        fullName: values.fullName,
        relation: values.relation,
      })
    },
    onSuccess: async (_, values) => {
      await refresh()
      toast.success(
        t(editing ? 'toast.familyUpdated' : 'toast.familyAdded', {
          name: values.fullName,
        }),
      )
      onClose()
    },
    onError: (error) => {
      if (errorField(error, RELATIVE_ERRORS)) form.setError('fullName', { message: errorMessage(error) })
    },
  })
  const { errors } = form.formState
  const fieldError = save.isError && errorField(save.error, RELATIVE_ERRORS)

  return (
    <form noValidate onSubmit={form.handleSubmit((values) => save.mutate(values))}>
      <div className={WIDE_FORM_GRID}>
        <Field label={t('family.name')} htmlFor="family-name" required error={errors.fullName?.message}>
          <Input id="family-name" maxLength={200} placeholder={t('placeholder.relativeName')} aria-invalid={!!errors.fullName} {...form.register('fullName')} />
        </Field>
        <Field label={t('family.relation')} htmlFor="family-relation" required error={errors.relation?.message}>
          <Select id="family-relation" aria-invalid={!!errors.relation} {...form.register('relation')}>
            <option value="" disabled>
              {t('placeholder.relation')}
            </option>
            {RELATIONS.map((relation) => (
              <option key={relation} value={relation}>
                {relationLabel(relation)}
              </option>
            ))}
          </Select>
        </Field>
        <Field label={t('family.gender')} htmlFor="family-gender">
          <Select id="family-gender" {...form.register('gender')}>
            <option value="">{t('placeholder.gender')}</option>
            {GENDERS.map((gender) => (
              <option key={gender} value={gender}>
                {gender}
              </option>
            ))}
          </Select>
        </Field>
        <Field label={t('family.birthDay')} htmlFor="family-day" error={errors.birthDay?.message} hint={t('family.birthHint')}>
          <Input id="family-day" inputMode="numeric" maxLength={2} placeholder={t('placeholder.day')} aria-invalid={!!errors.birthDay} {...form.register('birthDay')} />
        </Field>
        <Field label={t('family.birthMonth')} htmlFor="family-month" error={errors.birthMonth?.message}>
          <Input id="family-month" inputMode="numeric" maxLength={2} placeholder={t('placeholder.month')} aria-invalid={!!errors.birthMonth} {...form.register('birthMonth')} />
        </Field>
        <Field label={t('family.birthYear')} htmlFor="family-year" error={errors.birthYear?.message}>
          <Input id="family-year" inputMode="numeric" maxLength={4} placeholder={t('placeholder.year')} aria-invalid={!!errors.birthYear} {...form.register('birthYear')} />
        </Field>
      </div>
      <Field label={t('family.note')} htmlFor="family-note" error={errors.note?.message}>
        <Textarea id="family-note" rows={2} maxLength={1000} placeholder={t('placeholder.familyNote')} {...form.register('note')} />
      </Field>
      <FormError message={save.isError && !fieldError ? errorMessage(save.error) : undefined} />
      <div className={MODAL_FOOTER}>
        <Button type="button" variant="ghost" onClick={onClose}>
          {t('common.cancel')}
        </Button>
        <Button type="submit" disabled={save.isPending}>
          {t('family.save')}
        </Button>
      </div>
    </form>
  )
}

const relationSchema = z.object({
  relation: z.enum(RELATIONS, { error: t('validation.required') }),
  note: optionalText(1000),
})
type RelationValues = z.infer<typeof relationSchema>

/**
 * FAM-2 + FAM-3: the relation with someone who is a client: a client chosen from the search,
 * someone on a policy (FAM-5), or an existing relation being edited.
 */
function RelationForm({ clientId, member, onClose }: { clientId: string; member?: FamilyMember; onClose: () => void }) {
  const refresh = useRefresh()
  const editing = !!member?.linkId
  const [query, setQuery] = useState('')
  const [debounced, setDebounced] = useState('')
  const [picked, setPicked] = useState<{ id: string; name: string } | null>(member?.clientId ? { id: member.clientId, name: member.name } : null)
  const [pickError, setPickError] = useState(false)
  useEffect(() => {
    const timer = setTimeout(() => setDebounced(query.trim()), 300)
    return () => clearTimeout(timer)
  }, [query])
  const results = useQuery({
    ...queries.clientSearch(debounced),
    enabled: !member && debounced.length >= 2,
  })
  const form = useForm<RelationValues>({
    resolver: zodResolver(relationSchema),
    mode: 'onTouched',
    defaultValues: {
      relation: member?.relation ?? ('' as Relation),
      note: member?.note ?? '',
    },
  })
  const save = useMutation({
    mutationFn: (values: RelationValues) =>
      editing
        ? api.patch(`/clients/${clientId}/family/${member.linkId}`, {
            relation: values.relation,
            note: values.note || null,
          })
        : api.post(`/clients/${clientId}/family`, {
            relation: values.relation,
            relatedClientId: picked!.id,
            ...(values.note && { note: values.note }),
          }),
    onSuccess: async () => {
      await refresh()
      toast.success(
        t(editing ? 'toast.familyUpdated' : 'toast.familyAdded', {
          name: picked?.name ?? member?.name ?? '',
        }),
      )
      onClose()
    },
  })
  const { errors } = form.formState
  const options = (results.data?.items ?? []).filter((item) => item.id !== clientId)

  return (
    <form
      noValidate
      onSubmit={form.handleSubmit((values) => {
        if (!picked) return setPickError(true)
        save.mutate(values)
      })}
    >
      {member ? (
        <p className="mb-3 text-caption text-ink-body">
          <span className="font-medium">{member.name}</span>
        </p>
      ) : (
        // FAM-7: clients in scope, at most 10
        <Field label={t('family.search')} htmlFor="family-search" required error={pickError && !picked ? t('family.pickRequired') : undefined} hint={t('family.searchHint')}>
          <Input id="family-search" type="search" placeholder={t('placeholder.clientSearch')} value={query} onChange={(event) => setQuery(event.target.value)} />
        </Field>
      )}
      {!member && (
        <div className="mb-3">
          <PickList
            label={t('family.search')}
            className="h-48"
            empty={debounced.length >= 2 && results.data ? t('family.noResults') : undefined}
            options={options.map((item) => ({
              value: item.id,
              label: item.name,
              meta: [...item.policies.map((policy) => t('clients.policyNo', { no: policy.policyNo })), item.ageBand, item.gender].filter(Boolean).join(' · '),
            }))}
            value={picked?.id ?? null}
            onChange={(id) => {
              const item = options.find((option) => option.id === id)
              if (!item) return
              setPicked({ id: item.id, name: item.name })
              setPickError(false)
            }}
          />
        </div>
      )}
      <div className="grid gap-x-4 sm:grid-cols-2">
        <Field label={t('family.relation')} htmlFor="relation-select" required error={errors.relation?.message} hint={picked && !member ? picked.name : undefined}>
          <Select id="relation-select" aria-invalid={!!errors.relation} {...form.register('relation')}>
            <option value="" disabled>
              {t('placeholder.relation')}
            </option>
            {RELATIONS.map((relation) => (
              <option key={relation} value={relation}>
                {relationLabel(relation)}
              </option>
            ))}
          </Select>
        </Field>
        <Field label={t('family.note')} htmlFor="relation-note" error={errors.note?.message}>
          <Input id="relation-note" maxLength={1000} placeholder={t('placeholder.familyNote')} {...form.register('note')} />
        </Field>
      </div>
      <FormError message={save.isError ? errorMessage(save.error) : undefined} />
      <div className={MODAL_FOOTER}>
        <Button type="button" variant="ghost" onClick={onClose}>
          {t('common.cancel')}
        </Button>
        <Button type="submit" disabled={save.isPending}>
          {t('family.save')}
        </Button>
      </div>
    </form>
  )
}

const LEAD_ERRORS = { invalid_phone: 'phone', phone_exists: 'phone' } as const

const leadSchema = z.object({
  phone: phoneField,
  consent: z.enum(['yes', 'no'], { error: t('leads.consentRequired') }),
})
type LeadValues = z.infer<typeof leadSchema>

/** FAM-6: a relative who is not a client becomes a lead, or joins the lead that has the number. */
function FamilyLeadForm({ clientId, member, onClose }: { clientId: string; member: FamilyMember; onClose: () => void }) {
  const refresh = useRefresh()
  const form = useForm<LeadValues>({
    resolver: zodResolver(leadSchema),
    mode: 'onTouched',
    defaultValues: { phone: '' },
  })
  const path = `/clients/${clientId}/family/${member.linkId}/lead`
  const done = async (linked: boolean) => {
    await refresh()
    if (linked) toast.success(t('toast.familyLeadLinked', { name: member.name }))
    else toast.success(t('toast.familyLead', { name: member.name }), t('toast.familyLeadDetail'))
    onClose()
  }
  const create = useMutation({
    mutationFn: (values: LeadValues) =>
      api.post(path, {
        create: { phone: values.phone, consent: values.consent === 'yes' },
      }),
    onSuccess: () => done(false),
    onError: (error) => {
      if (errorField(error, LEAD_ERRORS)) form.setError('phone', { message: errorMessage(error) })
    },
  })
  // LEAD-1: the API names the lead with that number only to someone who may open it
  const existing = create.error instanceof ApiError && typeof create.error.details.leadId === 'string' ? create.error.details.leadId : null
  const link = useMutation({
    mutationFn: (leadId: string) => api.post(path, { leadId }),
    onSuccess: () => done(true),
  })
  const { errors } = form.formState

  return (
    <form noValidate onSubmit={form.handleSubmit((values) => create.mutate(values))}>
      <p className="mb-3 text-caption text-ink-meta">{t('family.leadHint', { name: member.name })}</p>
      <div className="grid gap-x-4 sm:grid-cols-2">
        <Field label={t('leads.phone')} htmlFor="family-lead-phone" required error={errors.phone?.message}>
          <Input id="family-lead-phone" inputMode="tel" placeholder={t('agents.phonePlaceholder')} aria-invalid={!!errors.phone} {...form.register('phone')} />
        </Field>
        <Field label={t('leads.consent')} htmlFor="family-lead-consent" required error={errors.consent?.message}>
          <Select id="family-lead-consent" defaultValue="" aria-invalid={!!errors.consent} {...form.register('consent')}>
            <option value="" disabled>
              {t('leads.consentChoose')}
            </option>
            <option value="yes">{t('leads.consentYes')}</option>
            <option value="no">{t('leads.consentNo')}</option>
          </Select>
        </Field>
      </div>
      {/* The offer to link takes the line an error would, and its button sits in the footer, so the dialog keeps its height */}
      {existing ? (
        <p className="line-clamp-2 min-h-[42px] text-caption text-ink-body">{t('family.phoneTaken')}</p>
      ) : (
        <FormError message={link.isError ? errorMessage(link.error) : create.isError && !errorField(create.error, LEAD_ERRORS) ? errorMessage(create.error) : undefined} />
      )}
      <div className={MODAL_FOOTER}>
        {existing && (
          <Button type="button" variant="secondary" className="mr-auto" disabled={link.isPending} onClick={() => link.mutate(existing)}>
            {t('family.linkExisting')}
          </Button>
        )}
        <Button type="button" variant="ghost" onClick={onClose}>
          {t('common.cancel')}
        </Button>
        <Button type="submit" disabled={create.isPending}>
          {t('family.createLead')}
        </Button>
      </div>
    </form>
  )
}

/** FAM-7: the family tab. Owners (and GA_HEAD) change it (FAM-8); everyone in scope reads it. */
export function FamilyTab({ detail }: { detail: ClientDetail }) {
  const url = useUrlState()
  const refresh = useRefresh()
  const clientId = detail.client.id
  const [removing, setRemoving] = useState<FamilyMember | null>(null)
  const remove = useMutation({
    mutationFn: (member: FamilyMember) => api.delete(`/clients/${clientId}/family/${member.linkId}`),
    onSuccess: async (_, member) => {
      await refresh()
      setRemoving(null)
      toast.success(t('toast.familyRemoved', { name: member.name }))
    },
  })
  const coverageOf = new Map(detail.coverage.map((row) => [row.key, row]))
  // Dialogs live in the URL; a key that no longer exists closes them
  const dialog = url.get('family')
  const memberOf = (key: string) => detail.family.find((member) => member.key === key)
  const target = dialog.startsWith('edit:') || dialog.startsWith('label:') || dialog.startsWith('lead:') ? memberOf(dialog.slice(dialog.indexOf(':') + 1)) : undefined
  const open = (value: string) => url.set({ family: value }, { push: true })
  const close = () => url.set({ family: null })
  const canEdit = detail.canEdit

  const relativeOpen = canEdit && (dialog === 'relative' || (!!target && !target.clientId && (dialog.startsWith('edit:') || dialog.startsWith('label:'))))
  const relationOpen = canEdit && (dialog === 'client' || (!!target && !!target.clientId && (dialog.startsWith('edit:') || dialog.startsWith('label:'))))
  const leadOpen = canEdit && !!target && dialog.startsWith('lead:') && !!target.linkId && !target.clientId

  return (
    <>
      <div className="mb-3 flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between">
        <p className="text-caption text-ink-meta sm:max-w-2xl">{t('family.help')}</p>
        {canEdit && (
          <div className="flex flex-none flex-wrap gap-2">
            <Button variant="secondary" onClick={() => open('client')}>
              {t('family.linkClient')}
            </Button>
            <Button onClick={() => open('relative')}>{t('family.addRelative')}</Button>
          </div>
        )}
      </div>
      {!canEdit && (
        <div className="mb-3">
          <Notice>{t('family.readOnly')}</Notice>
        </div>
      )}
      {detail.family.length === 0 ? (
        <EmptyState>{t('family.empty')}</EmptyState>
      ) : (
        <TableScroll>
          <table className="data-table min-w-[1120px] table-fixed">
            <colgroup>
              <col />
              <col className="w-[120px]" />
              <col className="w-[80px]" />
              <col className="w-[100px]" />
              <col className="w-[120px]" />
              <col className="w-[170px]" />
              <col className="w-[160px]" />
              <col className="w-[130px]" />
            </colgroup>
            <thead>
              <tr>
                <th>{t('family.name')}</th>
                <th>{t('family.relation')}</th>
                <th>{t('family.gender')}</th>
                <th>{t('family.dob')}</th>
                <th>{t('family.status')}</th>
                <th>{t('family.shared')}</th>
                <th>{t('family.coverage')}</th>
                <th className="col-actions">{t('common.actions')}</th>
              </tr>
            </thead>
            <tbody>
              {detail.family.map((member) => {
                const menu = [
                  ...(member.linkId && !member.clientId && !member.leadId
                    ? [
                        {
                          label: t('family.createLead'),
                          onSelect: () => open(`lead:${member.key}`),
                        },
                      ]
                    : []),
                  ...(member.linkId
                    ? [
                        {
                          label: t('family.remove'),
                          danger: true,
                          onSelect: () => setRemoving(member),
                        },
                      ]
                    : []),
                ]
                return (
                  <tr key={member.key}>
                    <td>
                      {member.canOpen ? (
                        <Link to={`/clients/${member.clientId}`} title={member.name} className="block truncate font-medium text-primary hover:underline">
                          {member.name}
                        </Link>
                      ) : (
                        <span title={member.name} className="block truncate font-medium text-ink-body">
                          {member.name}
                        </span>
                      )}
                      <span className="block truncate text-ink-meta" title={member.note ?? undefined}>
                        {member.note || (member.linkId ? '' : t('family.fromPolicy'))}
                      </span>
                      {member.leadId && (
                        <Link to={`/leads/${member.leadId}`} className="text-caption text-primary hover:underline">
                          {t('family.openLead')}
                        </Link>
                      )}
                    </td>
                    <td className={member.relation ? '' : 'text-ink-meta'}>{relationLabel(member.relation)}</td>
                    <td>{member.gender ?? '-'}</td>
                    <td className="tabular-nums">{birthText(member) ?? '-'}</td>
                    <td>
                      <Badge tone={member.isClient ? 'success' : 'muted'}>{t(member.isClient ? 'family.isClient' : 'family.notClient')}</Badge>
                    </td>
                    <td>
                      {member.sharedPolicies.length === 0 ? (
                        <span className="text-ink-meta">-</span>
                      ) : (
                        member.sharedPolicies.map((policy) => (
                          <span key={policy.policyNo} className="block truncate tabular-nums" title={policyRolesLabel(policy)}>
                            {policyRolesLabel(policy)}
                          </span>
                        ))
                      )}
                    </td>
                    <td className="truncate" title={coverageSummary(coverageOf.get(member.key))}>
                      {coverageSummary(coverageOf.get(member.key))}
                    </td>
                    <td className="col-actions">
                      {canEdit && (
                        <span className="flex items-center justify-end gap-1">
                          <Button variant="ghost" onClick={() => open(`${member.linkId ? 'edit' : 'label'}:${member.key}`)}>
                            {t(member.linkId ? 'family.edit' : 'family.label')}
                          </Button>
                          {menu.length > 0 && <RowMenu label={t('common.more')} items={menu} />}
                        </span>
                      )}
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </TableScroll>
      )}

      <Dialog
        wide
        title={
          target
            ? t(target.linkId ? 'family.editTitle' : 'family.labelTitle', {
                name: target.name,
              })
            : t('family.addRelative')
        }
        open={relativeOpen}
        onClose={close}
      >
        {relativeOpen && <RelativeForm key={dialog} clientId={clientId} member={target} onClose={close} />}
      </Dialog>
      <Dialog
        title={
          target
            ? t(target.linkId ? 'family.editTitle' : 'family.labelTitle', {
                name: target.name,
              })
            : t('family.linkClient')
        }
        open={relationOpen}
        onClose={close}
      >
        {relationOpen && <RelationForm key={dialog} clientId={clientId} member={target} onClose={close} />}
      </Dialog>
      <Dialog title={target ? t('family.leadTitle', { name: target.name }) : t('family.createLead')} open={leadOpen} onClose={close}>
        {leadOpen && target && <FamilyLeadForm clientId={clientId} member={target} onClose={close} />}
      </Dialog>
      <ConfirmDialog
        message={removing ? t('family.confirmRemove', { name: removing.name }) : null}
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
