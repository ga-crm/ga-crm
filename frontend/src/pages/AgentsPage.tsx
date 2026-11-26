import { zodResolver } from '@hookform/resolvers/zod'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { ChevronRight, FileUp, Plus } from 'lucide-react'
import { useMemo, useState } from 'react'
import { useForm, useWatch } from 'react-hook-form'
import { Link } from 'react-router-dom'
import { z } from 'zod'
import { hasPermission } from '../auth/access'
import { useMe } from '../auth/useMe'
import { Alert, Badge, Button, Container, Dialog, EmptyState, Field, FormError, Input, MODAL_FOOTER, PageHeader, PickList, SearchInput, Select, Spinner, WIDE_FORM_GRID } from '../components/ui'
import { buttonClass } from '../components/buttonStyles'
import { t } from '../i18n'
import { indexTree, managerCandidates, searchTree, visibleRows } from '../lib/agentTree'
import { api, errorField, errorMessage } from '../lib/api'
import { keys, queries } from '../lib/queries'
import { toast } from '../lib/toast'
import { AGENT_RANKS, AGENT_STATUSES } from '../lib/types'
import type { AgentDetail, AgentNode } from '../lib/types'
import { useListSearch } from '../lib/useListSearch'
import { useUrlState } from '../lib/useUrlState'
import { agentCodeField, optionalBirthDate, optionalDate, optionalText, requiredDate, requiredText } from '../lib/validation'

const INACTIVE = AGENT_STATUSES[1]
const MAX_MANAGER_RESULTS = 50

const agentSchema = z
  .object({
    agentCode: agentCodeField,
    name: requiredText(200),
    rank: z.enum(AGENT_RANKS),
    status: z.enum(AGENT_STATUSES),
    startDate: requiredDate,
    managerCode: z.string(),
    gender: optionalText(50),
    dob: optionalBirthDate,
    phone: optionalText(30),
    endDate: optionalDate,
    officeCode: optionalText(50),
  })
  .refine((values) => !values.endDate || !values.startDate || values.endDate >= values.startDate, { path: ['endDate'], message: t('validation.endBeforeStart') })
type AgentValues = z.infer<typeof agentSchema>

const FIELD_ERRORS = { agent_exists: 'agentCode', manager_not_found: 'managerCode' } as const

/** AGT-5: search by name or code, so a GA with thousands of agents does not mean a huge dropdown. */
function ManagerPicker({ items, value, onChange, id }: { items: AgentNode[]; value: string; onChange: (code: string) => void; id: string }) {
  const [search, setSearch] = useState('')
  const shown = useMemo(() => {
    const found = searchTree(items, search)
    const matches = found ? items.filter((item) => found.has(item.agentCode)) : items
    return matches.slice(0, MAX_MANAGER_RESULTS)
  }, [items, search])
  return (
    <PickList
      id={id}
      label={t('agents.manager')}
      placeholder={t('agents.managerSearch')}
      className="h-28"
      search={search}
      onSearchChange={setSearch}
      options={[{ value: '', label: t('agents.noManager') }, ...shown.map((option) => ({ value: option.agentCode, label: option.name, meta: option.agentCode }))]}
      value={value}
      onChange={onChange}
    />
  )
}

/** Nhập tay: the same fields as a row of the template. */
function AgentForm({ agent, items, onClose, onSaved }: { agent?: AgentDetail; items: AgentNode[]; onClose: () => void; onSaved: (code: string) => void }) {
  const queryClient = useQueryClient()
  const editing = !!agent
  const form = useForm<AgentValues>({
    resolver: zodResolver(agentSchema),
    mode: 'onTouched',
    defaultValues: {
      agentCode: agent?.agentCode ?? '',
      name: agent?.name ?? '',
      rank: agent?.rank ?? 'FC',
      status: agent?.status ?? AGENT_STATUSES[0],
      startDate: agent?.startDate ?? '',
      managerCode: '',
      gender: agent?.gender ?? '',
      dob: agent?.dob ?? '',
      phone: agent?.phone ?? '',
      endDate: agent?.endDate ?? '',
      officeCode: agent?.officeCode ?? '',
    },
  })
  const managerCode = useWatch({ control: form.control, name: 'managerCode' })
  const candidates = useMemo(() => managerCandidates(items), [items])

  const save = useMutation({
    mutationFn: ({ agentCode, managerCode: manager, gender, dob, phone, endDate, officeCode, ...required }: AgentValues) => {
      const optional = {
        gender: gender || null,
        endDate: endDate || null,
        officeCode: officeCode || null,
        // AGT-6: someone who cannot see these must not send them back as blank
        ...(agent && agent.phone === undefined ? {} : { dob: dob || null, phone: phone || null }),
      }
      return editing
        ? api.patch<AgentDetail>(`/agents/${agent.agentCode}`, { ...required, ...optional })
        : api.post<AgentDetail>('/agents', { agentCode, managerCode: manager || null, ...required, ...optional })
    },
    onSuccess: async (saved) => {
      await queryClient.invalidateQueries({ queryKey: keys.agents })
      toast.success(t(editing ? 'toast.agentUpdated' : 'toast.agentCreated', { name: saved.name }))
      onSaved(saved.agentCode)
    },
    onError: (error) => {
      const field = errorField(error, FIELD_ERRORS)
      if (field) form.setError(field, { message: errorMessage(error) })
    },
  })
  const { errors } = form.formState
  const seesPersonal = !agent || agent.phone !== undefined

  return (
    <form noValidate onSubmit={form.handleSubmit((values) => save.mutate(values))}>
      <div className={WIDE_FORM_GRID}>
        <Field label={t('agents.code')} htmlFor="agent-code" required error={errors.agentCode?.message}>
          <Input id="agent-code" placeholder={t('placeholder.agentCode')} inputMode="numeric" readOnly={editing} aria-invalid={!!errors.agentCode} {...form.register('agentCode')} />
        </Field>
        <Field label={t('agents.name')} htmlFor="agent-name" required error={errors.name?.message}>
          <Input id="agent-name" placeholder={t('placeholder.name')} aria-invalid={!!errors.name} {...form.register('name')} />
        </Field>
        <Field label={t('agents.rank')} htmlFor="agent-rank" required error={errors.rank?.message}>
          <Select id="agent-rank" {...form.register('rank')}>
            {AGENT_RANKS.map((rank) => (
              <option key={rank} value={rank}>
                {rank}
              </option>
            ))}
          </Select>
        </Field>
        <Field label={t('agents.status')} htmlFor="agent-status" required error={errors.status?.message}>
          <Select id="agent-status" {...form.register('status')}>
            {AGENT_STATUSES.map((status) => (
              <option key={status} value={status}>
                {status}
              </option>
            ))}
          </Select>
        </Field>
        <Field label={t('agents.startDate')} htmlFor="agent-start" required error={errors.startDate?.message}>
          <Input id="agent-start" type="date" aria-invalid={!!errors.startDate} {...form.register('startDate')} />
        </Field>
        <Field label={t('agents.endDate')} htmlFor="agent-end" error={errors.endDate?.message}>
          <Input id="agent-end" type="date" aria-invalid={!!errors.endDate} {...form.register('endDate')} />
        </Field>
        <Field label={t('agents.gender')} htmlFor="agent-gender" error={errors.gender?.message}>
          <Input id="agent-gender" placeholder={t('agents.genderPlaceholder')} {...form.register('gender')} />
        </Field>
        <Field label={t('agents.officeCode')} htmlFor="agent-office" error={errors.officeCode?.message}>
          <Input id="agent-office" placeholder={t('agents.officePlaceholder')} {...form.register('officeCode')} />
        </Field>
        {seesPersonal && (
          <>
            <Field label={t('agents.dob')} htmlFor="agent-dob" error={errors.dob?.message}>
              <Input id="agent-dob" type="date" min="1900-01-01" aria-invalid={!!errors.dob} {...form.register('dob')} />
            </Field>
            <Field label={t('agents.phone')} htmlFor="agent-phone" error={errors.phone?.message}>
              <Input id="agent-phone" placeholder={t('agents.phonePlaceholder')} inputMode="tel" {...form.register('phone')} />
            </Field>
          </>
        )}
        {!editing && (
          <div className="sm:col-span-2">
            <Field label={t('agents.manager')} htmlFor="agent-manager" error={errors.managerCode?.message}>
              <ManagerPicker id="agent-manager" items={candidates} value={managerCode} onChange={(code) => form.setValue('managerCode', code)} />
            </Field>
          </div>
        )}
      </div>
      <FormError message={save.isError && !errorField(save.error, FIELD_ERRORS) ? errorMessage(save.error) : undefined} />
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

/** AGT-5 */
function ManagerForm({ agent, items, onClose }: { agent: AgentDetail; items: AgentNode[]; onClose: () => void }) {
  const queryClient = useQueryClient()
  const [managerCode, setManagerCode] = useState(agent.managerCode ?? '')
  const candidates = useMemo(() => managerCandidates(items, agent.agentCode), [items, agent.agentCode])
  const save = useMutation({
    mutationFn: () => api.patch(`/agents/${agent.agentCode}/manager`, { managerCode: managerCode || null }),
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: keys.agents })
      toast.success(t('toast.managerChanged', { name: agent.name }), t('toast.managerChangedDetail'))
      onClose()
    },
  })
  return (
    <div>
      <p className="mb-3 text-caption text-ink-meta">{t('agents.managerHint')}</p>
      <ManagerPicker id="manager-picker" items={candidates} value={managerCode} onChange={setManagerCode} />
      <div className="mt-3">
        <FormError message={save.isError ? errorMessage(save.error) : undefined} />
      </div>
      <div className={MODAL_FOOTER}>
        <Button variant="secondary" onClick={onClose}>
          {t('common.cancel')}
        </Button>
        <Button disabled={save.isPending} onClick={() => save.mutate()}>
          {t('common.save')}
        </Button>
      </div>
    </div>
  )
}

function Fact({ label, value }: { label: string; value?: string | null }) {
  return (
    <div className="grid grid-cols-[8rem_1fr] gap-2 border-b border-band py-2 text-caption">
      <dt className="text-ink-meta">{label}</dt>
      <dd className="min-w-0 break-words text-ink-body">{value || '-'}</dd>
    </div>
  )
}

/** DATA-2: stored as YYYY-MM-DD, shown as dd/mm/yyyy. */
const showDate = (value?: string | null) => (value ? value.split('-').reverse().join('/') : null)

function AgentPanel({ code, canEdit, teamSize, onEdit, onMove }: { code: string; canEdit: boolean; teamSize: number; onEdit: () => void; onMove: () => void }) {
  const agent = useQuery(queries.agent(code))
  if (agent.isPending) return <Spinner />
  if (agent.isError) return <Alert>{errorMessage(agent.error)}</Alert>
  const { data } = agent
  return (
    <>
      <h2 className="text-subhead text-ink">{data.name}</h2>
      <p className="mt-1 mb-3 text-caption text-ink-meta">
        {data.rank} · {data.agentCode}
      </p>
      <dl>
        <Fact label={t('agents.status')} value={data.status} />
        <Fact label={t('agents.manager')} value={data.managerCode ? `${data.managerName ?? t('agents.managerNotLoaded')} (${data.managerCode})` : t('agents.noManager')} />
        <Fact label={t('agents.team')} value={String(teamSize)} />
        <Fact label={t('agents.startDate')} value={showDate(data.startDate)} />
        <Fact label={t('agents.endDate')} value={showDate(data.endDate)} />
        <Fact label={t('agents.gender')} value={data.gender} />
        <Fact label={t('agents.officeCode')} value={data.officeCode} />
        {data.phone !== undefined && (
          <>
            <Fact label={t('agents.dob')} value={showDate(data.dob)} />
            <Fact label={t('agents.phone')} value={data.phone} />
          </>
        )}
      </dl>
      {data.managerFixed && <p className="mt-2 text-caption text-ink-meta">{t('agents.managerFixed')}</p>}
      {canEdit && (
        <div className="mt-4 flex flex-wrap gap-2">
          <Button variant="secondary" onClick={onEdit}>
            {t('agents.edit')}
          </Button>
          <Button variant="secondary" onClick={onMove}>
            {t('agents.changeManager')}
          </Button>
        </div>
      )}
    </>
  )
}

/** AGT-8 */
export function AgentsPage() {
  const { data: me } = useMe()
  const url = useUrlState()
  const search = useListSearch(url)
  const tree = useQuery(queries.agentTree())
  const items = useMemo(() => tree.data?.items ?? [], [tree.data])
  const index = useMemo(() => indexTree(items), [items])
  const shown = useMemo(() => searchTree(items, search.committed), [items, search.committed])

  const selected = url.get('agent')
  const creating = url.get('create') === '1'
  const canEdit = hasPermission(me, 'agents.edit_tree')
  const canUpload = hasPermission(me, 'imports.upload')

  // Top levels start open. What the user changes is stored as the difference from that.
  const [toggled, setToggled] = useState<ReadonlySet<string>>(new Set())
  const [allOpen, setAllOpen] = useState<boolean | null>(null)
  // A selected agent from the URL stays visible after a reload
  const selectedPath = useMemo(() => new Set(index.byCode.get(selected)?.ancestors ?? []), [index, selected])
  const isExpanded = (code: string) => {
    const open = allOpen ?? (index.byCode.get(code)?.depth ?? 0) < 1
    return (toggled.has(code) ? !open : open) || selectedPath.has(code)
  }
  const toggle = (code: string) =>
    setToggled((current) => {
      const next = new Set(current)
      if (next.has(code)) next.delete(code)
      else next.add(code)
      return next
    })
  const expandAll = (open: boolean) => {
    setAllOpen(open)
    setToggled(new Set())
  }

  const rows = visibleRows(index, isExpanded, shown)
  const selectedAgent = useQuery({ ...queries.agent(selected), enabled: !!selected && (url.get('edit') === '1' || url.get('move') === '1') })
  const closeDialogs = () => url.set({ edit: null, move: null, create: null })

  return (
    <>
      <PageHeader
        title={t('agents.title')}
        subtitle={tree.data ? t('agents.count', { count: items.length }) : undefined}
        action={
          <span className="flex flex-wrap gap-2">
            {canUpload && (
              <Link to="/agents/import" className={buttonClass('secondary')}>
                <FileUp aria-hidden size={16} />
                {t('agents.import')}
              </Link>
            )}
            {canEdit && (
              <Button onClick={() => url.set({ create: 1 }, { push: true })}>
                <Plus aria-hidden size={16} />
                {t('agents.add')}
              </Button>
            )}
          </span>
        }
      />

      <div className="flex-none bg-chrome">
        <Container className="flex flex-wrap items-center gap-3 py-2.5">
          <SearchInput className="min-w-48 flex-1 sm:max-w-md" label={t('common.search')} placeholder={t('agents.searchPlaceholder')} value={search.input} onValueChange={search.onChange} />
          <span className="flex gap-1">
            <Button variant="ghost" onClick={() => expandAll(true)}>
              {t('agents.expandAll')}
            </Button>
            <Button variant="ghost" onClick={() => expandAll(false)}>
              {t('agents.collapseAll')}
            </Button>
          </span>
        </Container>
      </div>

      <Container className="flex min-h-0 flex-1 flex-col gap-6 py-3 lg:flex-row">
        <div className="min-w-0 flex-1 overflow-auto lg:h-full">
          {tree.isPending && <Spinner />}
          {tree.isError && <Alert>{errorMessage(tree.error)}</Alert>}
          {tree.data && items.length === 0 && <EmptyState>{canEdit || canUpload ? t('agents.empty') : t('agents.emptyReadOnly')}</EmptyState>}
          {tree.data && items.length > 0 && rows.length === 0 && <EmptyState>{t('agents.noMatch')}</EmptyState>}
          {rows.length > 0 && (
            <ul role="tree" aria-label={t('agents.title')}>
              {rows.map(({ agent, level }) => {
                const hasTeam = index.children.has(agent.agentCode)
                const expanded = shown ? true : isExpanded(agent.agentCode)
                const isSelected = selected === agent.agentCode
                return (
                  <li key={agent.agentCode} role="treeitem" aria-level={level + 1} aria-expanded={hasTeam ? expanded : undefined} aria-selected={isSelected} className={`flex items-center rounded-md ${isSelected ? 'bg-band-blue' : 'hover:bg-chrome'}`} style={{ paddingLeft: `${level * 20}px` }}>
                    <button
                      type="button"
                      aria-label={expanded ? t('agents.collapseBranch', { name: agent.name }) : t('agents.expandBranch', { name: agent.name })}
                      disabled={!hasTeam || !!shown}
                      onClick={() => toggle(agent.agentCode)}
                      className={`flex size-9 flex-none cursor-pointer items-center justify-center rounded-md text-ink-meta hover:text-ink disabled:cursor-default ${hasTeam ? '' : 'invisible'}`}
                    >
                      <ChevronRight aria-hidden size={16} className={`transition-transform duration-150 motion-reduce:transition-none ${expanded ? 'rotate-90' : ''}`} />
                    </button>
                    <button type="button" onClick={() => url.set({ agent: agent.agentCode })} className="flex min-h-9 min-w-0 flex-1 cursor-pointer items-center gap-2 py-1 pr-2 text-left text-caption">
                      <Badge tone="muted">{agent.rank}</Badge>
                      <span className={`min-w-0 truncate ${isSelected ? 'font-medium text-primary-deep' : 'text-ink'}`}>{agent.name}</span>
                      <span className="flex-none text-ink-meta tabular-nums">{agent.agentCode}</span>
                      {agent.status === INACTIVE && <Badge tone="warning">{t('agents.inactive')}</Badge>}
                      {hasTeam && <span className="ml-auto flex-none text-ink-meta tabular-nums">{t('agents.teamSize', { count: index.teamSize.get(agent.agentCode) ?? 0 })}</span>}
                    </button>
                  </li>
                )
              })}
            </ul>
          )}
        </div>

        <aside className="flex-none overflow-auto rounded-lg bg-chrome p-5 lg:h-full lg:w-96">
          {selected ? (
            <AgentPanel
              key={selected}
              code={selected}
              canEdit={canEdit}
              teamSize={index.teamSize.get(selected) ?? 0}
              onEdit={() => url.set({ edit: 1 }, { push: true })}
              onMove={() => url.set({ move: 1 }, { push: true })}
            />
          ) : (
            <p className="text-caption text-ink-meta">{t('agents.selectHint')}</p>
          )}
        </aside>
      </Container>

      <Dialog wide title={t('agents.addTitle')} open={creating && canEdit} onClose={closeDialogs}>
        {creating && canEdit && <AgentForm items={items} onClose={closeDialogs} onSaved={(code) => url.set({ create: null, agent: code })} />}
      </Dialog>
      <Dialog wide title={t('agents.editTitle')} open={url.get('edit') === '1' && canEdit && !!selectedAgent.data} onClose={closeDialogs}>
        {url.get('edit') === '1' && canEdit && selectedAgent.data && <AgentForm key={selected} agent={selectedAgent.data} items={items} onClose={closeDialogs} onSaved={closeDialogs} />}
      </Dialog>
      <Dialog title={t('agents.changeManager')} open={url.get('move') === '1' && canEdit && !!selectedAgent.data} onClose={closeDialogs}>
        {url.get('move') === '1' && canEdit && selectedAgent.data && <ManagerForm key={selected} agent={selectedAgent.data} items={items} onClose={closeDialogs} />}
      </Dialog>
    </>
  )
}
