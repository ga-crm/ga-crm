import { zodResolver } from '@hookform/resolvers/zod'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { FileUp, Plus, Trash2 } from 'lucide-react'
import { useState } from 'react'
import { Controller, useForm } from 'react-hook-form'
import { Link, useNavigate } from 'react-router-dom'
import { z } from 'zod'
import { hasPermission } from '../auth/access'
import { canAssignLeads } from '../lib/nav'
import { useContactDeadlineHours, useMe } from '../auth/useMe'
import { buttonClass } from '../components/buttonStyles'
import { LeadBoard } from '../components/LeadBoard'
import { LeadAssignDialog } from '../components/LeadAssignDialog'
import { OptionPicker } from '../components/OptionPicker'
import { PlaceFields } from '../components/PlaceFields'
import { ProvincePicker, WardPicker } from '../components/PlacePicker'
import { ProductPicker } from '../components/ProductPicker'
import { SavedFilters } from '../components/SavedFilters'
import { Alert, Badge, Button, Card, Checkbox, ClearFilters, Container, Dialog, EmptyState, Field, FilterBand, FilterField, FormError, Input, MODAL_FOOTER, PageHeader, Pagination, SearchInput, Segmented, Select, SortButton, Spinner, TabBar, TableScroll, Textarea, WIDE_FORM_GRID } from '../components/ui'
import { formatDateTime, t, tDynamic } from '../i18n'
import { api, errorField, errorMessage } from '../lib/api'
import { careTone, interestTone, showDate } from '../lib/leadLabels'
import { keys, queries } from '../lib/queries'
import { toast } from '../lib/toast'
import { useLeadOptions } from '../lib/leadOptions'
import { DepartedWorkNotice } from '../components/DepartedWorkNotice'
import { LEAD_STAGES } from '../lib/types'
import type { LeadCounts, LeadRow } from '../lib/types'
import { useListSearch } from '../lib/useListSearch'
import { usePrefetchNextPage } from '../lib/usePrefetchNextPage'
import { useLeaveEmptyPage, useUrlState } from '../lib/useUrlState'
import { optionalBirthDate, optionalEmail, optionalText, phoneField, requiredText } from '../lib/validation'

type TabKey = 'mine' | 'isNew' | 'newComment' | 'overdue' | 'all' | 'unassigned' | 'released'

/** LEAD-36 */
const TABS: { key: TabKey; label: Parameters<typeof t>[0]; count: keyof LeadCounts; managerOnly?: boolean; query: Record<string, string> }[] = [
  { key: 'all', label: 'leads.tabAll', count: 'all', managerOnly: true, query: {} },
  { key: 'mine', label: 'leads.tabMine', count: 'mine', query: { mine: '1' } },
  { key: 'isNew', label: 'leads.tabNew', count: 'isNew', query: { isNew: '1' } },
  { key: 'newComment', label: 'leads.tabComment', count: 'newComment', query: { newComment: '1' } },
  { key: 'overdue', label: 'leads.tabOverdue', count: 'overdue', query: { overdue: '1' } },
  { key: 'unassigned', label: 'leads.tabUnassigned', count: 'unassigned', managerOnly: true, query: { assignee: 'NONE' } },
  // Decided 27/11/2026: leads their agent dropped or left without care, waiting for someone else
  { key: 'released', label: 'leads.tabReleased', count: 'released', managerOnly: true, query: { released: '1' } },
]

/** LEAD-21: one assignment takes at most this many leads. */
const MAX_ASSIGN = 200

const schema = z.object({
  fullName: requiredText(200),
  phone: phoneField,
  // OPT-3: a typed value may become a catalogue label
  source: requiredText(60),
  // LEAD-3, changed 26/11/2026: may stay blank and be answered later
  consent: z.enum(['', 'yes', 'no']),
  email: optionalEmail,
  // Decided 26/11/2026: the province and commune after 1/7/2025, and the street address
  provinceCode: z.string(),
  wardCode: z.string(),
  addressLine: optionalText(300),
  gender: optionalText(50),
  dob: optionalBirthDate,
  note: optionalText(4000),
  campaignId: z.string(),
  assignedAgentCode: z.string(),
  // TENANT-5: a shown product of the shared catalogue, optional
  productCode: z.string(),
})
type FormValues = z.infer<typeof schema>

const FIELD_ERRORS = { invalid_phone: 'phone', phone_exists: 'phone', agent_not_found: 'assignedAgentCode', campaign_not_found: 'campaignId', unknown_option: 'source', unknown_product: 'productCode', unknown_place: 'wardCode' } as const

/** LEAD-3 */
function CreateLeadForm({ manages, onClose, onCreated }: { manages: boolean; onClose: () => void; onCreated: (id: string) => void }) {
  const queryClient = useQueryClient()
  const facets = useQuery(queries.leadFacets())
  const assignees = useQuery({ ...queries.leadAssignees(), enabled: manages })
  const form = useForm<FormValues>({
    resolver: zodResolver(schema),
    // Errors appear when leaving a field, then update while it is being corrected
    mode: 'onTouched',
    defaultValues: { fullName: '', phone: '', source: '', consent: '', email: '', provinceCode: '', wardCode: '', addressLine: '', gender: '', dob: '', note: '', campaignId: '', assignedAgentCode: '', productCode: '' },
  })
  const create = useMutation({
    mutationFn: ({ consent, email, provinceCode, wardCode, addressLine, gender, dob, note, campaignId, assignedAgentCode, productCode, ...required }: FormValues) =>
      api.post<{ id: string }>('/leads', {
        ...required,
        ...(consent && { consent: consent === 'yes' }),
        email: email || undefined,
        provinceCode: provinceCode || undefined,
        wardCode: wardCode || undefined,
        addressLine: addressLine || undefined,
        gender: gender || undefined,
        dob: dob || undefined,
        note: note || undefined,
        campaignId: campaignId || undefined,
        assignedAgentCode: assignedAgentCode || undefined,
        productCode: productCode || undefined,
      }),
    onSuccess: async ({ id }, { fullName }) => {
      // OPT-13: a typed source has joined the GA's list, so the pickers and filters need it
      await Promise.all([queryClient.invalidateQueries({ queryKey: keys.leads }), queryClient.invalidateQueries({ queryKey: keys.leadOptions })])
      toast.success(t('toast.leadCreated', { name: fullName }))
      onCreated(id)
    },
    onError: (error) => {
      const field = errorField(error, FIELD_ERRORS)
      if (field) form.setError(field, { message: errorMessage(error) })
    },
  })
  const { errors } = form.formState

  return (
    <form noValidate onSubmit={form.handleSubmit((values) => create.mutate(values))}>
      {!manages && <p className="mb-3 text-caption text-ink-meta">{t('leads.ownHint')}</p>}
      <div className={WIDE_FORM_GRID}>
        <Field label={t('leads.fullName')} htmlFor="lead-name" required error={errors.fullName?.message}>
          <Input id="lead-name" placeholder={t('placeholder.name')} aria-invalid={!!errors.fullName} {...form.register('fullName')} />
        </Field>
        <Field label={t('leads.phone')} htmlFor="lead-phone" required error={errors.phone?.message}>
          <Input id="lead-phone" placeholder={t('agents.phonePlaceholder')} inputMode="tel" aria-invalid={!!errors.phone} {...form.register('phone')} />
        </Field>
        <Field label={t('leads.source')} htmlFor="lead-source" required error={errors.source?.message} hint={t('leads.sourceHint')}>
          {/* OPT-13 (24/11/2026): pick one of the GA's shown sources or type a new one, which joins the list */}
          <Controller
            control={form.control}
            name="source"
            render={({ field, fieldState }) => (
              <OptionPicker ref={field.ref} kind="source" joins id="lead-source" label={t('leads.source')} maxLength={60} placeholder={t('leads.sourcePlaceholder')} value={field.value} onChange={field.onChange} onBlur={field.onBlur} invalid={fieldState.invalid} />
            )}
          />
        </Field>
        <Field label={t('leads.consent')} htmlFor="lead-consent" error={errors.consent?.message}>
          <Select id="lead-consent" aria-invalid={!!errors.consent} {...form.register('consent')}>
            <option value="">{t('leads.consentLater')}</option>
            <option value="yes">{t('leads.consentYes')}</option>
            <option value="no">{t('leads.consentNo')}</option>
          </Select>
        </Field>
        <Field label={t('leads.email')} htmlFor="lead-email" error={errors.email?.message}>
          <Input id="lead-email" type="email" placeholder={t('placeholder.email')} aria-invalid={!!errors.email} {...form.register('email')} />
        </Field>
        <Field label={t('leads.dob')} htmlFor="lead-dob" error={errors.dob?.message}>
          <Input id="lead-dob" type="date" min="1900-01-01" aria-invalid={!!errors.dob} {...form.register('dob')} />
        </Field>
        <PlaceFields control={form.control} setValue={form.setValue} errors={errors} idPrefix="lead" />
        <Field label={t('agents.gender')} htmlFor="lead-gender" error={errors.gender?.message}>
          <Input id="lead-gender" placeholder={t('agents.genderPlaceholder')} {...form.register('gender')} />
        </Field>
        <Field label={t('leads.productInterest')} htmlFor="lead-product" error={errors.productCode?.message}>
          <Controller
            control={form.control}
            name="productCode"
            render={({ field, fieldState }) => (
              <ProductPicker ref={field.ref} id="lead-product" label={t('leads.productInterest')} emptyLabel={t('leads.noProduct')} value={field.value} onChange={field.onChange} onBlur={field.onBlur} invalid={fieldState.invalid} />
            )}
          />
        </Field>
        {manages && (
          <>
            <Field label={t('leads.campaign')} htmlFor="lead-campaign" error={errors.campaignId?.message}>
              <Select id="lead-campaign" {...form.register('campaignId')}>
                <option value="">{t('leads.noCampaign')}</option>
                {facets.data?.campaigns.map((campaign) => (
                  <option key={campaign.id} value={campaign.id}>
                    {campaign.name}
                  </option>
                ))}
              </Select>
            </Field>
            <Field label={t('leads.assignee')} htmlFor="lead-assignee" error={errors.assignedAgentCode?.message}>
              <Select id="lead-assignee" {...form.register('assignedAgentCode')}>
                <option value="">{t('leads.unassigned')}</option>
                {assignees.data?.items.map((agent) => (
                  <option key={agent.agentCode} value={agent.agentCode}>
                    {agent.name} ({agent.agentCode})
                  </option>
                ))}
              </Select>
            </Field>
          </>
        )}
      </div>
      <Field label={t('leads.initialNote')} htmlFor="lead-note" error={errors.note?.message}>
        <Textarea id="lead-note" rows={2} placeholder={t('leads.notePlaceholder')} {...form.register('note')} />
      </Field>
      <FormError message={create.isError && !errorField(create.error, FIELD_ERRORS) ? errorMessage(create.error) : undefined} />
      <div className={MODAL_FOOTER}>
        <Button variant="secondary" onClick={onClose}>
          {t('common.cancel')}
        </Button>
        <Button type="submit" disabled={create.isPending}>
          {t('common.save')}
        </Button>
      </div>
    </form>
  )
}

function CustomerCell({ lead }: { lead: LeadRow }) {
  return (
    <>
      <Link to={`/leads/${lead.id}`} title={lead.fullName} className="block truncate font-medium text-primary hover:underline">
        {lead.fullName}
      </Link>
      <span className="block text-ink-meta tabular-nums">{lead.phone}</span>
      {(lead.isNew || lead.newComment || lead.origin === 'FC_OWN' || lead.overdue || lead.supporting) && (
        <span className="mt-1 flex flex-wrap gap-1">
          {/* Decided 26/11/2026: seen only as a supporter, so the phone above is masked */}
          {lead.supporting && <Badge tone="notable">{t('leads.badgeSupporting')}</Badge>}
          {lead.overdue && <Badge tone="danger">{t('leads.badgeOverdue')}</Badge>}
          {lead.isNew && <Badge tone="info">{t('leads.badgeNew')}</Badge>}
          {lead.newComment && <Badge tone="notable">{t('leads.badgeComment')}</Badge>}
          {lead.origin === 'FC_OWN' && <Badge tone="muted">{t('leads.badgeOwn')}</Badge>}
        </span>
      )}
    </>
  )
}

/** Section 16.3 */
export function LeadsPage() {
  const { data: me } = useMe()
  const navigate = useNavigate()
  const url = useUrlState()
  const search = useListSearch(url)
  const manages = hasPermission(me, 'leads.manage')
  const assigns = !!me && canAssignLeads(me)
  const canImport = hasPermission(me, 'leads.import')
  const tabs = TABS.filter((tab) => manages || !tab.managerOnly)
  const tabKey = url.oneOf(
    'tab',
    tabs.map((tab) => tab.key),
  )
  const tab = tabs.find((item) => item.key === tabKey) ?? tabs[0]

  const catalogue = useLeadOptions()
  // OPT-1: the codes are the GA's own, so the API simply finds nothing for an unknown one
  const interest = url.get('interest')
  const care = url.get('care')
  const stage = url.oneOf('stage', LEAD_STAGES)
  const source = url.get('source')
  const campaignId = url.get('campaign')
  const assignee = url.get('assignee')
  // TENANT-5: leads interested in one catalogue product
  const product = url.get('product')
  // Decided 26/11/2026: leads in a province, and in one of its communes
  const province = url.get('province')
  const ward = province ? url.get('ward') : ''
  const from = url.get('from')
  const to = url.get('to')
  const order = url.oneOf('order', ['asc', 'desc']) as 'asc' | 'desc' | ''
  // Section 16: table or kanban
  const board = url.oneOf('view', ['board']) === 'board'

  const params = {
    page: url.page,
    pageSize: url.pageSize,
    q: search.committed,
    interest,
    care,
    stage,
    source,
    campaignId,
    product,
    province,
    ward,
    from,
    to,
    order,
    assignee,
    ...tab.query,
  }
  const leads = useQuery({ ...queries.leads(params), enabled: !board })
  usePrefetchNextPage(queries.leads, params, leads.data)
  useLeaveEmptyPage(url, leads.data?.items.length)
  const counts = useQuery(queries.leadCounts())
  const facets = useQuery(queries.leadFacets())

  const queryClient = useQueryClient()
  const deadlineHours = useContactDeadlineHours()
  const [selected, setSelected] = useState<ReadonlySet<string>>(new Set())
  const [assigning, setAssigning] = useState(false)
  const creating = url.get('create') === '1'
  const items = leads.data?.items ?? []
  // A lead one only supports is not theirs to assign, so it cannot be selected
  const selectable = items.filter((item) => !item.supporting)
  const allOnPage = selectable.length > 0 && selectable.every((item) => selected.has(item.id))
  const toggleOne = (id: string) =>
    setSelected((current) => {
      const next = new Set(current)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })
  const togglePage = () =>
    setSelected((current) => {
      const next = new Set(current)
      for (const item of selectable) {
        if (allOnPage) next.delete(item.id)
        else next.add(item.id)
      }
      return next
    })

  // LEAD-24: "Chọn tất cả theo bộ lọc", the ids in list order, capped at one assignment
  const { page: _page, pageSize: _pageSize, ...filterParams } = params
  const total = leads.data?.total ?? 0
  const selectByFilter = useMutation({
    mutationFn: () => queryClient.fetchQuery(queries.leadIds(filterParams)),
    onSuccess: ({ ids }) => setSelected(new Set(ids)),
    onError: (error) => toast.error(t('leads.selectByFilterFailed'), errorMessage(error)),
  })
  const canSelectMore = allOnPage && total > items.length && selected.size < Math.min(total, MAX_ASSIGN)

  const filtered = !!(search.input || interest || care || stage || source || campaignId || product || province || assignee || from || to)
  const clearFilters = () => url.set({ q: null, interest: null, care: null, stage: null, source: null, campaign: null, product: null, province: null, ward: null, assignee: null, from: null, to: null, page: null })

  return (
    <>
      <PageHeader
        title={t('leads.title')}
        action={
          <span className="flex flex-wrap gap-2">
            {manages && (
              <Link to="/leads/deleted" className={buttonClass('ghost')}>
                <Trash2 aria-hidden size={16} />
                {t('leads.deletedLink')}
              </Link>
            )}
            {canImport && (
              <Link to="/leads/import" className={buttonClass('secondary')}>
                <FileUp aria-hidden size={16} />
                {t('leads.import')}
              </Link>
            )}
            <Button onClick={() => url.set({ create: 1 }, { push: true })}>
              <Plus aria-hidden size={16} />
              {t('leads.add')}
            </Button>
          </span>
        }
      />

      <Container className="flex-none">
        <TabBar
          label={t('leads.title')}
          value={tab.key}
          onValueChange={(key) => {
            setSelected(new Set())
            url.set({ tab: key, page: null })
          }}
          items={tabs.map((item) => ({
            value: item.key,
            label: (
              <>
                {t(item.label, { hours: deadlineHours })} <span className="tabular-nums">({counts.data?.[item.count] ?? 0})</span>
              </>
            ),
          }))}
        />
      </Container>
      {manages && assignee !== 'DEPARTED' && (
        <Container className="flex-none pb-2">
          <DepartedWorkNotice variant="leads" onShowLeads={() => url.set({ assignee: 'DEPARTED', page: null }, { push: true })} />
        </Container>
      )}

      <FilterBand className="flex flex-col gap-2 sm:flex-row sm:flex-wrap sm:items-center">
        <FilterField label={t('common.search')} className="sm:w-64 sm:flex-none">
          <SearchInput label={t('common.search')} placeholder={t(manages ? 'leads.searchManager' : 'leads.searchAgent')} value={search.input} onValueChange={search.onChange} />
        </FilterField>
        <FilterField label={t('leads.interest')} className="sm:w-44 sm:flex-none">
          <Select value={interest} onChange={(event) => url.set({ interest: event.target.value, page: null })}>
            <option value="">{t('leads.allInterests')}</option>
            <option value="NONE">{t('leads.noInterest')}</option>
            {catalogue.all('interest').map((option) => (
              <option key={option.id} value={option.code}>
                {option.label}
              </option>
            ))}
          </Select>
        </FilterField>
        <FilterField label={t('leads.care')} className="sm:w-44 sm:flex-none">
          <Select value={care} onChange={(event) => url.set({ care: event.target.value, page: null })}>
            <option value="">{t('leads.allCare')}</option>
            <option value="NONE">{t('leads.noCare')}</option>
            {catalogue.all('care_status').map((option) => (
              <option key={option.id} value={option.code}>
                {option.label}
              </option>
            ))}
          </Select>
        </FilterField>
        <FilterField label={t('leads.stage')} className="sm:w-44 sm:flex-none">
          <Select value={stage} onChange={(event) => url.set({ stage: event.target.value, page: null })}>
            <option value="">{t('leads.allStages')}</option>
            {LEAD_STAGES.map((value) => (
              <option key={value} value={value}>
                {tDynamic(`stage.${value}`, value)}
              </option>
            ))}
          </Select>
        </FilterField>
        <FilterField label={t('leads.source')} className="sm:w-40 sm:flex-none">
          <Select value={source} onChange={(event) => url.set({ source: event.target.value, page: null })}>
            <option value="">{t('leads.allSources')}</option>
            {catalogue.all('source').map((option) => (
              <option key={option.id} value={option.code}>
                {option.label}
              </option>
            ))}
          </Select>
        </FilterField>
        <FilterField label={t('leads.campaign')} className="sm:w-44 sm:flex-none">
          <Select value={campaignId} onChange={(event) => url.set({ campaign: event.target.value, page: null })}>
            <option value="">{t('leads.allCampaigns')}</option>
            {facets.data?.campaigns.map((campaign) => (
              <option key={campaign.id} value={campaign.id}>
                {campaign.name}
              </option>
            ))}
          </Select>
        </FilterField>
        <FilterField label={t('leads.productInterest')} className="sm:w-56 sm:flex-none">
          <ProductPicker label={t('leads.productInterest')} placeholder={t('leads.allProducts')} emptyLabel={t('leads.allProducts')} value={product} onChange={(code) => url.set({ product: code, page: null })} />
        </FilterField>
        <FilterField label={t('leads.province')} className="sm:w-48 sm:flex-none">
          <ProvincePicker label={t('leads.province')} placeholder={t('leads.allProvinces')} emptyLabel={t('leads.allProvinces')} value={province} onChange={(code) => url.set({ province: code, ward: null, page: null })} />
        </FilterField>
        <FilterField label={t('leads.ward')} className="sm:w-48 sm:flex-none">
          <WardPicker label={t('leads.ward')} provinceCode={province} placeholder={t('leads.allWards')} emptyLabel={t('leads.allWards')} value={ward} onChange={(code) => url.set({ ward: code, page: null })} />
        </FilterField>
        {tab.key !== 'unassigned' && tab.key !== 'mine' && (
          <FilterField label={t('leads.assignee')} className="sm:w-48 sm:flex-none">
            <Select value={assignee} onChange={(event) => url.set({ assignee: event.target.value, page: null })}>
              <option value="">{t('leads.allAssignees')}</option>
              {manages && <option value="NONE">{t('leads.unassigned')}</option>}
              {manages && <option value="DEPARTED">{t('departed.filter')}</option>}
              {facets.data?.agents.map((agent) => (
                <option key={agent.code} value={agent.code}>
                  {agent.name}
                </option>
              ))}
            </Select>
          </FilterField>
        )}
        <FilterField label={t('leads.from')} className="sm:w-40 sm:flex-none">
          <Input type="date" title={t('leads.from')} value={from} onChange={(event) => url.set({ from: event.target.value, page: null })} />
        </FilterField>
        <FilterField label={t('leads.to')} className="sm:w-40 sm:flex-none">
          <Input type="date" title={t('leads.to')} value={to} onChange={(event) => url.set({ to: event.target.value, page: null })} />
        </FilterField>
        <ClearFilters active={filtered} onClear={clearFilters} />
        <span className="flex items-center gap-1 sm:ml-auto">
          <SavedFilters />
          <Segmented
            label={t('leads.view')}
            value={board ? 'board' : 'table'}
            onValueChange={(key) => url.set({ view: key === 'board' ? 'board' : null, page: null, col: null })}
            options={[
              { value: 'table', label: t('leads.viewTable') },
              { value: 'board', label: t('leads.viewBoard') },
            ]}
          />
        </span>
      </FilterBand>

      {board ? (
        <Card>
          <LeadBoard params={filterParams} manages={manages} />
        </Card>
      ) : (
      <Card>
        {leads.isPending && <Spinner />}
        {leads.isError && <Alert className="m-4">{errorMessage(leads.error)}</Alert>}
        {leads.data && items.length === 0 && <EmptyState>{filtered ? t('leads.noMatch') : t('leads.empty')}</EmptyState>}
        {leads.data && items.length > 0 && (
          <>
            <TableScroll loading={leads.isPlaceholderData}>
              <table className="data-table min-w-[1180px] table-fixed">
                <colgroup>
                  {assigns && <col className="w-[44px]" />}
                  <col className="w-[120px]" />
                  <col />
                  <col className="w-[130px]" />
                  <col className="w-[150px]" />
                  <col className="w-[150px]" />
                  <col className="w-[130px]" />
                  <col className="w-[150px]" />
                  <col className="w-[150px]" />
                </colgroup>
                <thead>
                  <tr>
                    {assigns && (
                      <th>
                        <Checkbox aria-label={t('leads.selectPage')} checked={allOnPage} onChange={togglePage} />
                      </th>
                    )}
                    <th aria-sort={order === 'asc' ? 'ascending' : order === 'desc' ? 'descending' : 'none'}>
                      <SortButton label={t('leads.leadDate')} direction={order || null} onToggle={() => url.set({ order: order === '' ? 'desc' : order === 'desc' ? 'asc' : null, page: null })} />
                    </th>
                    <th>{t('leads.customer')}</th>
                    <th>{t('leads.source')}</th>
                    <th>{t('leads.assignee')}</th>
                    <th>{t('leads.interest')}</th>
                    <th>{t('leads.care')}</th>
                    <th>{t('leads.lastContact')}</th>
                    <th>{t('leads.nextAction')}</th>
                  </tr>
                </thead>
                <tbody>
                  {items.map((lead) => (
                    <tr key={lead.id}>
                      {assigns && (
                        <td>
                          <Checkbox aria-label={t('leads.selectOne', { name: lead.fullName })} disabled={lead.supporting} checked={selected.has(lead.id)} onChange={() => toggleOne(lead.id)} />
                        </td>
                      )}
                      <td className="whitespace-nowrap text-ink-meta">{showDate(lead.leadDate)}</td>
                      <td>
                        <CustomerCell lead={lead} />
                      </td>
                      <td title={lead.campaignName ? `${lead.source} · ${lead.campaignName}` : lead.source} className="truncate">
                        {lead.source}
                      </td>
                      <td title={lead.agentName ?? undefined} className="truncate">
                        {lead.assignedAgentCode ? (lead.agentName ?? lead.assignedAgentCode) : <span className="text-ink-meta">{t('leads.unassigned')}</span>}
                      </td>
                      <td>{lead.interest ? <Badge tone={interestTone(lead.interest)}>{catalogue.label('interest', lead.interest)}</Badge> : <span className="text-ink-meta">-</span>}</td>
                      <td>{lead.careStatus ? <Badge tone={careTone(lead.careStatus)}>{catalogue.label('care_status', lead.careStatus)}</Badge> : <span className="text-ink-meta">-</span>}</td>
                      <td className="whitespace-nowrap text-ink-meta">{lead.lastContactAt ? formatDateTime(lead.lastContactAt) : '-'}</td>
                      <td className="whitespace-nowrap text-ink-meta">{lead.nextActionAt ? formatDateTime(lead.nextActionAt) : '-'}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </TableScroll>
            <Pagination page={leads.data.page} pageSize={leads.data.pageSize} total={leads.data.total} onPage={url.setPage} onPageSize={url.setPageSize} />
          </>
        )}
      </Card>
      )}

      {/* LEAD-24: fixed at the foot of the screen, so it stays in reach after picking the last rows */}
      {assigns && selected.size > 0 && (
        <div className="sticky bottom-0 z-10 flex-none border-t border-band bg-band-blue">
          <Container className="flex flex-wrap items-center gap-3 py-2">
            <span className="text-caption text-ink-body">{t('leads.selected', { count: selected.size })}</span>
            <Button disabled={selected.size > MAX_ASSIGN} onClick={() => setAssigning(true)}>
              {t('leads.assign')}
            </Button>
            {canSelectMore && (
              <Button variant="ghost" disabled={selectByFilter.isPending} onClick={() => selectByFilter.mutate()}>
                {total > MAX_ASSIGN ? t('leads.selectByFilterCapped', { count: MAX_ASSIGN }) : t('leads.selectByFilter', { count: total })}
              </Button>
            )}
            <Button variant="ghost" onClick={() => setSelected(new Set())}>
              {t('leads.clearSelection')}
            </Button>
            {selected.size > MAX_ASSIGN && <span className="text-caption text-alert">{t('leads.tooMany')}</span>}
          </Container>
        </div>
      )}

      <Dialog wide title={t('leads.addTitle')} open={creating} onClose={() => url.set({ create: null })}>
        {creating && <CreateLeadForm manages={manages} onClose={() => url.set({ create: null })} onCreated={(id) => navigate(`/leads/${id}`)} />}
      </Dialog>
      <LeadAssignDialog
        leadIds={[...selected]}
        allowUnassign={manages}
        open={assigning}
        onClose={() => setAssigning(false)}
        onDone={() => {
          setAssigning(false)
          setSelected(new Set())
        }}
      />
    </>
  )
}
