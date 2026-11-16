import { useQuery } from '@tanstack/react-query'
import { useState } from 'react'
import { Plus } from 'lucide-react'
import { Link, useNavigate } from 'react-router-dom'
import { ClientAssignDialog } from '../components/ClientAssignDialog'
import { CreateClientForm } from '../components/ClientForms'
import { hasPermission, hasRole } from '../auth/access'
import { useMe } from '../auth/useMe'
import { Alert, Badge, Button, Card, Container, Dialog, ClearFilters, EmptyState, FilterBand, FilterField, PageHeader, Pagination, SearchInput, Select, Spinner, TableScroll, TabBar, Checkbox } from '../components/ui'
import { t, tDynamic } from '../i18n'
import { errorMessage } from '../lib/api'
import { showDate } from '../lib/leadLabels'
import { queries } from '../lib/queries'
import { CLIENT_TIERS, LIST_SIGNALS } from '../lib/types'
import type { ClientRow } from '../lib/types'
import { useListSearch } from '../lib/useListSearch'
import { usePrefetchNextPage } from '../lib/usePrefetchNextPage'
import { useLeaveEmptyPage, useUrlState } from '../lib/useUrlState'

/** CUS-14: name, code, tier and the phone the GA keeps. */
function ClientCell({ client }: { client: ClientRow }) {
  return (
    <>
      <Link to={`/clients/${client.clientCode}`} title={client.name} className="block truncate font-medium text-primary hover:underline">
        {client.name}
      </Link>
      <span className="block text-ink-meta tabular-nums">
        {client.clientCode}
        {client.phone && ` · ${client.phone}`}
      </span>
      {(client.tier || client.manual) && (
        <span className="mt-1 flex flex-wrap gap-1">
          {client.tier && <Badge tone="info">{client.tier}</Badge>}
          {client.manual && <Badge tone="muted">{t('clients.badgeManual')}</Badge>}
        </span>
      )}
    </>
  )
}

/** SIG-1 + CUS-14: the signal labels of a row. */
function SignalFlags({ client }: { client: ClientRow }) {
  const flags = LIST_SIGNALS.filter((signal) => client[signal])
  if (flags.length === 0) return <span className="text-ink-meta">-</span>
  return (
    <span className="flex flex-wrap gap-1">
      {flags.map((signal) => (
        <Badge key={signal} tone={signal === 'debt' || signal === 'lapsed' ? 'warning' : signal === 'birthday' ? 'notable' : 'info'}>
          {tDynamic(`clients.flag.${signal}`, signal)}
        </Badge>
      ))}
    </span>
  )
}

/** ASG-1: one assignment takes at most this many clients. */
const MAX_ASSIGN = 200

/** Section 16.6 */
export function ClientsPage() {
  const { data: me } = useMe()
  const navigate = useNavigate()
  const url = useUrlState()
  const creating = url.get('create') === '1'
  const search = useListSearch(url)
  const tier = url.oneOf('tier', CLIENT_TIERS)
  // CUS-14: "Khách hàng của" is hidden from a FC, whose book is only their own
  const canPickAgents = me?.reach === 'TENANT' || me?.reach === 'DOWNLINE'
  const tree = useQuery({ ...queries.agentTree(), enabled: canPickAgents })
  const agents = canPickAgents ? url.get('agents') : ''

  const signal = url.oneOf('signal', LIST_SIGNALS)
  const params = { page: url.page, pageSize: url.pageSize, q: search.committed, tier, agents: agents || undefined, signal: signal || undefined }
  const clients = useQuery(queries.clients(params))
  // SIG-1: the tabs count the same "Khách hàng của" as the list
  const counts = useQuery(queries.clientCounts(agents || undefined))
  usePrefetchNextPage(queries.clients, params, clients.data)
  useLeaveEmptyPage(url, clients.data?.items.length)

  const items = clients.data?.items ?? []
  // ASG-1: GA_HEAD or clients.assign; the API checks it again (PERM-4)
  const canAssign = hasRole(me, 'GA_HEAD') || hasPermission(me, 'clients.assign')
  const [selected, setSelected] = useState<ReadonlySet<string>>(new Set())
  const [assigning, setAssigning] = useState(false)
  const allOnPage = items.length > 0 && items.every((item) => selected.has(item.clientCode))
  const toggleOne = (code: string) =>
    setSelected((current) => {
      const next = new Set(current)
      if (next.has(code)) next.delete(code)
      else next.add(code)
      return next
    })
  const setPage = (on: boolean) =>
    setSelected((current) => {
      const next = new Set(current)
      for (const item of items) {
        if (on) next.add(item.clientCode)
        else next.delete(item.clientCode)
      }
      return next
    })
  const filtered = !!(search.input || tier || agents)
  // CUS-14: "nothing in this list" differs from "the GA has no clients yet"
  const emptyText = signal && !filtered ? t('clients.noSignalMatch') : agents || (me?.user.agentCode && !filtered) ? t('clients.emptyMine') : filtered ? t('clients.noMatch') : t('clients.empty')

  return (
    <>
      <PageHeader
        title={t('clients.title')}
        action={
          // MAN-1: anyone with a client book may add a client
          <Button onClick={() => url.set({ create: 1 }, { push: true })}>
            <Plus size={16} aria-hidden />
            {t('clients.add')}
          </Button>
        }
      />
      <Container className="flex-none">
        <TabBar
          label={t('clients.title')}
          value={signal}
          onValueChange={(key) => url.set({ signal: key || null, page: null })}
          items={(['', ...LIST_SIGNALS] as const).map((key) => ({
            value: key,
            label: (
              <>
                {key ? tDynamic(`clients.tab.${key}`, key) : t('clients.tabAll')} <span className="tabular-nums">({counts.data?.[key || 'all'] ?? 0})</span>
              </>
            ),
          }))}
        />
      </Container>
      <FilterBand className="flex flex-col gap-2 sm:flex-row sm:flex-wrap sm:items-center">
        <FilterField label={t('common.search')} className="sm:w-72 sm:flex-none">
          <SearchInput label={t('common.search')} placeholder={t('clients.searchPlaceholder')} value={search.input} onValueChange={search.onChange} />
        </FilterField>
        {canPickAgents && (
          <FilterField label={t('clients.ownedBy')} className="sm:w-64 sm:flex-none">
            <Select value={agents} onChange={(event) => url.set({ agents: event.target.value, page: null })}>
              <option value="">{me?.user.agentCode ? t('clients.ownedByMe') : t('clients.ownedByAll')}</option>
              {me?.user.agentCode && <option value="ALL">{t('clients.ownedByAll')}</option>}
              {(tree.data?.items ?? [])
                .filter((agent) => agent.agentCode !== me?.user.agentCode)
                .map((agent) => (
                  <option key={agent.agentCode} value={agent.agentCode}>
                    {/* AGT-9: indented by level; plain spaces would collapse */}
                    {`${'\u00a0\u00a0'.repeat(agent.depth)}${agent.name} (${agent.agentCode})`}
                  </option>
                ))}
            </Select>
          </FilterField>
        )}
        <FilterField label={t('clients.tier')} className="sm:w-40 sm:flex-none">
          <Select value={tier} onChange={(event) => url.set({ tier: event.target.value, page: null })}>
            <option value="">{t('clients.allTiers')}</option>
            {CLIENT_TIERS.map((value) => (
              <option key={value} value={value}>
                {value}
              </option>
            ))}
          </Select>
        </FilterField>
        <ClearFilters active={filtered} onClear={() => url.set({ q: null, tier: null, agents: null, page: null })} />
      </FilterBand>

      <Card>
        {clients.isPending && <Spinner />}
        {clients.isError && <Alert className="m-4">{errorMessage(clients.error)}</Alert>}
        {clients.data && items.length === 0 && <EmptyState>{emptyText}</EmptyState>}
        {clients.data && items.length > 0 && (
          <>
            <TableScroll loading={clients.isPlaceholderData}>
              <table className="data-table min-w-[1000px] table-fixed">
                <colgroup>
                  {canAssign && <col className="w-[44px]" />}
                  <col />
                  <col className="w-[120px]" />
                  <col className="w-[90px]" />
                  <col className="w-[120px]" />
                  <col className="w-[170px]" />
                  <col className="w-[180px]" />
                </colgroup>
                <thead>
                  <tr>
                    {canAssign && (
                      <th>
                        <Checkbox aria-label={t('clients.selectPage')} checked={allOnPage} onChange={() => setPage(!allOnPage)} />
                      </th>
                    )}
                    <th>{t('clients.client')}</th>
                    <th>{t('clients.profile')}</th>
                    <th className="text-right">{t('clients.activePolicies')}</th>
                    <th>{t('clients.nextDue')}</th>
                    <th>{t('clients.agents')}</th>
                    <th>{t('clients.signalCol')}</th>
                  </tr>
                </thead>
                <tbody>
                  {items.map((client) => {
                    const names = client.agents.map((agent) => agent.name ?? agent.agentCode).join(', ')
                    return (
                      <tr key={client.clientCode}>
                        {canAssign && (
                          <td>
                            <Checkbox aria-label={t('clients.selectOne', { name: client.name })} checked={selected.has(client.clientCode)} onChange={() => toggleOne(client.clientCode)} />
                          </td>
                        )}
                        <td>
                          <ClientCell client={client} />
                        </td>
                        <td className="text-ink-meta">{[client.ageBand, client.gender].filter(Boolean).join(' · ') || '-'}</td>
                        <td className="text-right tabular-nums">{client.activePolicies}</td>
                        <td className="whitespace-nowrap">{showDate(client.nextDue) ?? '-'}</td>
                        <td title={names} className="truncate">
                          {names || <span className="text-ink-meta">-</span>}
                        </td>
                        <td>
                          <SignalFlags client={client} />
                        </td>
                      </tr>
                    )
                  })}
                </tbody>
              </table>
            </TableScroll>
            <Pagination page={clients.data.page} pageSize={clients.data.pageSize} total={clients.data.total} onPage={url.setPage} onPageSize={url.setPageSize} />
          </>
        )}
      </Card>

      {/* ASG-6: fixed at the foot of the screen, so it stays in reach after picking the last rows */}
      {canAssign && selected.size > 0 && (
        <div className="sticky bottom-0 z-10 flex-none border-t border-band bg-band-blue">
          <Container className="flex flex-wrap items-center gap-3 py-2">
            <span className="text-caption text-ink-body">{t('clients.selected', { count: selected.size })}</span>
            <Button disabled={selected.size > MAX_ASSIGN} onClick={() => setAssigning(true)}>
              {t('clients.assign')}
            </Button>
            {!allOnPage && (
              <Button variant="ghost" onClick={() => setPage(true)}>
                {t('clients.selectAllOnPage')}
              </Button>
            )}
            <Button variant="ghost" onClick={() => setSelected(new Set())}>
              {t('clients.clearSelection')}
            </Button>
            {selected.size > MAX_ASSIGN && <span className="text-caption text-alert">{t('clients.tooMany')}</span>}
          </Container>
        </div>
      )}
      <ClientAssignDialog
        clientCodes={[...selected]}
        open={assigning}
        onClose={() => setAssigning(false)}
        onDone={() => {
          setAssigning(false)
          setSelected(new Set())
        }}
      />
      <Dialog wide title={t('clients.addTitle')} open={creating} onClose={() => url.set({ create: null })}>
        {creating && <CreateClientForm onClose={() => url.set({ create: null })} onCreated={(code) => navigate(`/clients/${code}`)} />}
      </Dialog>
    </>
  )
}
