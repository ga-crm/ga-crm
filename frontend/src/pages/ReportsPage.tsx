import { useMutation, useQuery } from '@tanstack/react-query'
import { ChevronDown, ChevronRight, Download } from 'lucide-react'
import { useState } from 'react'
import { Link } from 'react-router-dom'
import { utils, writeFile } from 'xlsx'
import { hasPermission } from '../auth/access'
import { ActivityDetailsDialog } from '../components/ActivityDetailsDialog'
import type { ActivityCell } from '../components/ActivityDetailsDialog'
import { useMe } from '../auth/useMe'
import { Alert, Button, Card, Container, EmptyState, FilterBand, FilterField, Input, PageHeader, Segmented, Select, Spinner, TabBar, TableScroll } from '../components/ui'
import { formatDateTime, formatVnd, t, tDynamic } from '../i18n'
import type { MessageKey } from '../i18n'
import { api, errorMessage } from '../lib/api'
import { showDate } from '../lib/leadLabels'
import { queries } from '../lib/queries'
import { PERIOD_PRESETS, presetRange, vietnamToday } from '../lib/reportPeriods'
import { toast } from '../lib/toast'
import { FUNNEL_GROUPS, PIPELINE_STAGES, REPORTS } from '../lib/types'
import type { FunnelGroup, ReportData, ReportName, ReportRow } from '../lib/types'
import { useUrlState } from '../lib/useUrlState'

interface Column {
  key: string
  label: string
  hint?: string
  /** What the cell shows, from the row's additive values. */
  value: (values: Record<string, number>) => string | number
  /** RPT-5: the list behind the number, for rows of one agent, of nobody, or of one source. */
  link?: (row: ReportRow) => string | null
  /** Money needs more room than a count. */
  wide?: boolean
  /** R2 (26/11/2026): where the column's numbers come from, under its name. */
  note?: string
  /** R2 (26/11/2026): the activities a number of this column opens: one type, one source, or all. */
  opens?: { type?: string; source?: 'CRM' | 'SUCCESS' }
}

interface Context {
  name: ReportName
  data: ReportData | undefined
  from: string
  to: string
  groupBy: FunnelGroup
}

/** R2 (26/11/2026): which system records each activity type. */
const ACTIVITY_SOURCES = {
  CALL: 'both',
  ZALO: 'both',
  MEETING: 'both',
  SEMINAR: 'crm',
  PROPOSAL: 'success',
  SOCIAL_POST: 'success',
  CHECKIN: 'success',
  COACHING: 'success',
  OTHER: 'success',
} as const

const n = (values: Record<string, number>, key: string) => values[key] ?? 0
const percent = (part: number, whole: number) => (whole === 0 ? '-' : `${Math.round((part / whole) * 100)}%`)
const money = (values: Record<string, number>, key: string) => (values[key] === undefined ? '-' : formatVnd(values[key]))
const average = (sum: number, count: number) => (count === 0 ? '-' : (sum / count).toFixed(1))
const href = (path: string, query: Record<string, string>) => `${path}?${new URLSearchParams(query)}`

/** Section 13.2: the columns of each report, and where their numbers lead (RPT-5). */
function columnsOf({ name, data, from, to, groupBy }: Context): Column[] {
  const label = (key: string) => t(`reports.col.${key}` as MessageKey)
  // The lead list of one agent (or of nobody), for the leads of the period
  const leads = (row: ReportRow, extra: Record<string, string> = {}, dated = true) =>
    row.kind === 'group' || row.kind === 'item' ? null : href('/leads', { assignee: row.agentCode ?? 'NONE', ...(dated ? { from, to } : {}), ...extra })
  if (name === 'conversion') {
    const interests = (data?.interests ?? []).map<Column>((interest) => ({
      key: `interest:${interest.code}`,
      label: interest.label,
      value: (values) => n(values, `interest:${interest.code}`),
      link: (row) => leads(row, { interest: interest.code }),
    }))
    return [
      { key: 'total', label: label('total'), value: (values) => n(values, 'total'), link: (row) => leads(row) },
      { key: 'contacted', label: label('contacted'), value: (values) => n(values, 'contacted') },
      // LEAD-30: only contacts the CRM timed
      { key: 'in24h', label: label('in24h'), hint: t('reports.col.in24hHint'), value: (values) => `${n(values, 'in24h')} (${n(values, 'timed')})` },
      { key: 'overdue', label: label('overdue'), value: (values) => n(values, 'overdue'), link: (row) => leads(row, { tab: 'overdue' }) },
      ...interests,
      { key: 'opportunity', label: label('opportunity'), value: (values) => n(values, 'opportunity') },
      ...(['caring', 'won', 'dropped'] as const).map<Column>((care) => ({
        key: care,
        label: label(care),
        value: (values) => n(values, care),
        link: (row) => leads(row, { care: care.toUpperCase() }),
      })),
      { key: 'winRate', label: label('winRate'), value: (values) => percent(n(values, 'won'), n(values, 'total')) },
    ]
  }
  if (name === 'activities')
    return [
      // 26/11/2026: each type says where it comes from; Success has no seminar, the CRM records only contacts
      ...Object.entries(ACTIVITY_SOURCES).map<Column>(([type, source]) => ({ key: type, label: label(type), note: t(`reports.source.${source}`), value: (values) => n(values, type), opens: { type } })),
      { key: 'total', label: label('activityTotal'), value: (values) => n(values, 'total'), opens: {} },
      { key: 'fromCrm', label: label('fromCrm'), value: (values) => n(values, 'fromCrm'), opens: { source: 'CRM' } },
      { key: 'fromSuccess', label: label('fromSuccess'), value: (values) => n(values, 'fromSuccess'), opens: { source: 'SUCCESS' } },
      { key: 'won', label: label('wonInPeriod'), value: (values) => n(values, 'won') },
    ]
  if (name === 'funnel') {
    // The leads of one source or campaign; phone sources have no filter on the lead list
    const funnelLink = (row: ReportRow) => {
      const [kind, id] = row.key.split(':')
      if (id === 'NONE' || kind === 'phoneSource') return null
      return href('/leads', { [kind === 'campaign' ? 'campaign' : 'source']: id, from, to })
    }
    return [
      { key: 'leads', label: label('total'), value: (values) => n(values, 'leads'), link: funnelLink },
      { key: 'contacted', label: label('contacted'), value: (values) => n(values, 'contacted') },
      { key: 'contactRate', label: label('contactRate'), value: (values) => percent(n(values, 'contacted'), n(values, 'leads')) },
      { key: 'opportunity', label: label('opportunity'), value: (values) => n(values, 'opportunity') },
      { key: 'won', label: label('won'), value: (values) => n(values, 'won') },
      { key: 'winRate', label: label('winRate'), value: (values) => percent(n(values, 'won'), n(values, 'leads')) },
      { key: 'linked', label: label('linked'), value: (values) => n(values, 'linked') },
      { key: 'issued', label: label('issued'), value: (values) => n(values, 'issued') },
      { key: 'issuedApeVnd', label: label('issuedApe'), wide: true, value: (values) => formatVnd(n(values, 'issuedApeVnd')) },
      ...(groupBy === 'campaign'
        ? [
            { key: 'budgetVnd', label: label('budget'), wide: true, value: (values: Record<string, number>) => money(values, 'budgetVnd') },
            { key: 'perLeadVnd', label: label('perLead'), wide: true, value: (values: Record<string, number>) => money(values, 'perLeadVnd') },
            { key: 'perIssuedVnd', label: label('perIssued'), wide: true, value: (values: Record<string, number>) => money(values, 'perIssuedVnd') },
          ]
        : []),
    ]
  }
  if (name === 'pipeline')
    return [
      { key: 'open', label: label('open'), value: (values) => n(values, 'open'), link: (row) => leads(row, {}, false) },
      ...PIPELINE_STAGES.flatMap<Column>((stage) => [
        {
          key: `count:${stage}`,
          label: tDynamic(`stage.${stage}`, stage),
          hint: t('reports.col.stageHint'),
          // Count, then the average days the leads have sat in the stage
          value: (values) => (n(values, `count:${stage}`) ? `${n(values, `count:${stage}`)} (${average(n(values, `days:${stage}`), n(values, `count:${stage}`))})` : 0),
          link: (row) => leads(row, { stage }, false),
        },
        { key: `ape:${stage}`, label: t('reports.col.stageApe', { stage: tDynamic(`stage.${stage}`, stage) }), wide: true, value: (values) => formatVnd(n(values, `ape:${stage}`)) },
      ]),
      { key: 'apeTotal', label: label('apeTotal'), wide: true, value: (values) => formatVnd(n(values, 'apeTotal')) },
    ]
  if (name === 'care') {
    // The agent's own clients with that signal, as the client list counts them (SIG-1)
    const clients = (row: ReportRow, signal?: string) => (row.kind === 'agent' && row.agentCode ? href('/clients', { agents: row.agentCode, ...(signal ? { signal } : {}) }) : null)
    return [
      { key: 'clients', label: label('clients'), value: (values) => n(values, 'clients'), link: (row) => clients(row) },
      ...(['due', 'debt', 'maturity', 'birthday', 'lapsed'] as const).map<Column>((signal) => ({
        key: signal,
        label: tDynamic(`clients.tab.${signal}`, signal),
        value: (values) => n(values, signal),
        link: (row) => clients(row, signal),
      })),
      { key: 'contacts', label: label('clientContacts'), value: (values) => n(values, 'contacts') },
      { key: 'clientsContacted', label: label('clientsContacted'), value: (values) => n(values, 'clientsContacted') },
      { key: 'notes', label: label('clientNotes'), value: (values) => n(values, 'notes') },
    ]
  }
  return [
    { key: 'received', label: label('received'), value: (values) => n(values, 'received') },
    { key: 'handedOver', label: label('handedOver'), value: (values) => n(values, 'handedOver') },
    { key: 'noContact', label: label('noContact'), value: (values) => n(values, 'noContact') },
    { key: 'avgHold', label: label('avgHold'), value: (values) => average(n(values, 'holdDays'), n(values, 'handedOver')) },
  ]
}

/** RPT-1: "Ban kinh doanh {name}", "{name} (cá nhân)", "Chưa phân công". */
function rowLabel(row: ReportRow, hasGroup: (code: string) => boolean): string {
  if (row.kind === 'unassigned') return t('reports.unassigned')
  if (row.kind === 'item') return row.name ?? t('reports.noValue')
  if (row.kind === 'group') return tDynamic(`reports.group.${row.groupKind}`, '{name}').replace('{name}', row.name ?? '')
  // The manager's own figures sit inside their group
  return row.agentCode && hasGroup(row.agentCode) ? t('reports.own', { name: row.name ?? '' }) : (row.name ?? row.agentCode ?? '')
}

/** RPT-2: from the third level down, groups start collapsed. */
const defaultCollapsed = (rows: readonly ReportRow[]) => new Set(rows.filter((row) => row.kind === 'group' && row.depth >= 2).map((row) => row.key))

/** Section 16.10: R1, R2 and R8 in the agent-tree layout (slice 6a). */
export function ReportsPage() {
  const { data: me } = useMe()
  const url = useUrlState()
  const name = (url.oneOf('report', REPORTS) || 'conversion') as ReportName
  const month = presetRange('thisMonth', vietnamToday())
  const from = /^\d{4}-\d{2}-\d{2}$/.test(url.get('from')) ? url.get('from') : month.from
  const to = /^\d{4}-\d{2}-\d{2}$/.test(url.get('to')) ? url.get('to') : month.to
  const groupBy = (url.oneOf('groupBy', FUNNEL_GROUPS) || 'source') as FunnelGroup
  // R5 is a snapshot; the others take the period
  const snapshot = name === 'pipeline'
  const report = useQuery(queries.report(name, { from, to, ...(name === 'funnel' ? { groupBy } : {}) }))
  const data = report.data
  const columns = columnsOf({ name, data, from, to, groupBy })
  const firstColumn = name === 'funnel' ? t(`reports.groupBy.${groupBy}` as MessageKey) : t('reports.agent')
  const [collapsed, setCollapsed] = useState<{ key: string; set: ReadonlySet<string> } | null>(null)
  // A new report or period starts from the default layout
  const viewKey = `${name}|${from}|${to}|${groupBy}`
  const closed = collapsed?.key === viewKey ? collapsed.set : defaultCollapsed(data?.rows ?? [])
  const setClosed = (set: ReadonlySet<string>) => setCollapsed({ key: viewKey, set })

  const rows = data?.rows ?? []
  const parentOf = new Map(rows.map((row) => [row.key, row.parentKey]))
  const hidden = (row: ReportRow) => {
    for (let parent = row.parentKey; parent; parent = parentOf.get(parent) ?? null) if (closed.has(parent)) return true
    return false
  }
  const groups = new Set(rows.filter((row) => row.kind === 'group').map((row) => row.agentCode))
  const hasGroup = (code: string) => groups.has(code)
  const canExport = hasPermission(me, 'exports.data')

  // RPT-6: the export is recorded first; the file is the table as shown, every row open
  const exportFile = useMutation({
    mutationFn: async () => {
      await api.post('/reports/exports', { report: name, from, to })
      const header = [firstColumn, ...columns.map((column) => column.label)]
      const body = rows.map((row) => [`${'  '.repeat(row.depth)}${rowLabel(row, hasGroup)}`, ...columns.map((column) => column.value(row.values))])
      const title = snapshot ? t('reports.snapshot') : t('reports.period', { from: showDate(from) ?? from, to: showDate(to) ?? to })
      const sheet = utils.aoa_to_sheet([[title], header, ...body, [t('reports.total'), ...columns.map((column) => column.value(data?.total ?? {}))]])
      const book = utils.book_new()
      utils.book_append_sheet(book, sheet, t(`reports.tab.${name}` as MessageKey).slice(0, 31))
      writeFile(book, `bao-cao-${name}-${from}-${to}.xlsx`)
    },
    onSuccess: () => toast.success(t('toast.reportExported', { name: t(`reports.tab.${name}` as MessageKey) })),
    onError: (error) => toast.error(t('toast.reportExportFailed'), errorMessage(error)),
  })

  const linkTo = (row: ReportRow, column: Column): string | null => column.link?.(row) ?? null

  // R2 (26/11/2026): the agents behind a row: its own agent, or every agent of a group
  const allAgents = rows.flatMap((row) => (row.kind === 'agent' && row.agentCode ? [row.agentCode] : []))
  const agentsOf = (row: ReportRow): string[] => {
    if (row.kind === 'agent') return row.agentCode ? [row.agentCode] : []
    if (row.kind !== 'group') return []
    const under = (key: string): boolean => {
      for (let parent: string | null | undefined = key; parent; parent = parentOf.get(parent)) if (parent === row.key) return true
      return false
    }
    return rows.flatMap((item) => (item.kind === 'agent' && item.agentCode && under(item.key) ? [item.agentCode] : []))
  }
  // The open list lives in the URL, so a reload keeps it; a stale key closes it
  const cell = ((): ActivityCell | null => {
    if (name !== 'activities') return null
    const [rowKey, columnKey] = url.get('cell').split('|')
    const column = columns.find((item) => item.key === columnKey && item.opens)
    const row = rows.find((item) => item.key === rowKey)
    if (!column?.opens) return null
    const agents = rowKey === 'total' ? allAgents : row ? agentsOf(row) : []
    if (agents.length === 0) return null
    const who = rowKey === 'total' ? t('reports.total') : rowLabel(row!, hasGroup)
    return { title: t('reports.detail.title', { what: column.label, name: who }), agents: agents.slice(0, 300), ...column.opens }
  })()

  return (
    <>
      <PageHeader
        title={t('reports.title')}
        action={
          canExport && (
            <Button variant="secondary" disabled={!data || exportFile.isPending} onClick={() => exportFile.mutate()}>
              <Download size={16} aria-hidden />
              {t('reports.export')}
            </Button>
          )
        }
      />
      <Container className="flex-none">
        <TabBar
          label={t('reports.title')}
          value={name}
          onValueChange={(key) => url.set({ report: key === 'conversion' ? null : key })}
          items={REPORTS.map((key) => ({ value: key, label: t(`reports.tab.${key}` as MessageKey) }))}
        />
      </Container>
      <FilterBand className="flex flex-col gap-2 sm:flex-row sm:flex-wrap sm:items-end">
        {name === 'funnel' && (
          <FilterField label={t('reports.groupByLabel')} className="sm:w-44 sm:flex-none">
            <Select value={groupBy} onChange={(event) => url.set({ groupBy: event.target.value === 'source' ? null : event.target.value })}>
              {FUNNEL_GROUPS.map((value) => (
                <option key={value} value={value}>
                  {t(`reports.groupBy.${value}` as MessageKey)}
                </option>
              ))}
            </Select>
          </FilterField>
        )}
        {snapshot ? (
          <p className="text-caption text-ink-meta sm:self-center">{t('reports.snapshotHint')}</p>
        ) : (
          <>
        <FilterField label={t('reports.from')} className="sm:w-44 sm:flex-none">
          <Input type="date" value={from} max={to} onChange={(event) => event.target.value && url.set({ from: event.target.value })} />
        </FilterField>
        <FilterField label={t('reports.to')} className="sm:w-44 sm:flex-none">
          <Input type="date" value={to} min={from} onChange={(event) => event.target.value && url.set({ to: event.target.value })} />
        </FilterField>
        <Segmented
          label={t('reports.presetGroup')}
          value={PERIOD_PRESETS.find((preset) => {
            const range = presetRange(preset, vietnamToday())
            return range.from === from && range.to === to
          }) ?? null}
          onValueChange={(preset) => url.set(presetRange(preset, vietnamToday()))}
          options={PERIOD_PRESETS.map((preset) => ({ value: preset, label: t(`reports.preset.${preset}` as MessageKey) }))}
        />
          </>
        )}
        {/* RPT-2: only when there are groups to fold */}
        <div className={`gap-1 sm:ml-auto ${groups.size > 0 ? 'flex' : 'hidden'}`}>
          <Button variant="ghost" onClick={() => setClosed(new Set())}>
            {t('reports.expandAll')}
          </Button>
          <Button variant="ghost" onClick={() => setClosed(new Set(rows.filter((row) => row.kind === 'group').map((row) => row.key)))}>
            {t('reports.collapseAll')}
          </Button>
        </div>
      </FilterBand>

      <Card>
        <p className="flex-none px-4 py-2 text-caption text-ink-meta">
          {t(`reports.help.${name}` as MessageKey)}
          {/* 26/11/2026: how far the Success data goes, so a low number is not read as idle */}
          {name === 'activities' && data?.successAsOf && (
            <span className="block">
              {data.successAsOf.lastActivityDate
                ? t('reports.successAsOf', { day: showDate(data.successAsOf.lastActivityDate) ?? '', at: data.successAsOf.lastImportedAt ? formatDateTime(data.successAsOf.lastImportedAt) : '-' })
                : t('reports.successNone')}
            </span>
          )}
        </p>
        {report.isPending && <Spinner />}
        {report.isError && <Alert className="m-4">{errorMessage(report.error)}</Alert>}
        {data && rows.length === 0 && <EmptyState>{t('reports.empty')}</EmptyState>}
        {data && rows.length > 0 && (
          <TableScroll loading={report.isPlaceholderData}>
            <table className="data-table table-fixed" style={{ minWidth: 160 + columns.reduce((sum, column) => sum + (column.wide ? 136 : 104), 0) }}>
              <colgroup>
                <col className="w-[160px] md:w-[280px]" />
                {columns.map((column) => (
                  <col key={column.key} className={column.wide ? 'w-[136px]' : 'w-[104px]'} />
                ))}
              </colgroup>
              <thead>
                <tr>
                  <th className="col-first">{firstColumn}</th>
                  {columns.map((column) => (
                    <th key={column.key} className="text-right" title={column.hint ?? column.label}>
                      <span className="line-clamp-2 whitespace-normal">{column.label}</span>
                      {column.note && <span className="block font-normal whitespace-normal text-ink-meta">{column.note}</span>}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {rows
                  .filter((row) => !hidden(row))
                  .map((row) => {
                    const label = rowLabel(row, hasGroup)
                    const open = !closed.has(row.key)
                    return (
                      <tr key={row.key} className={row.kind === 'group' ? 'font-medium' : undefined}>
                        <td className="col-first">
                          <span className="flex min-w-0 items-center gap-1" style={{ paddingLeft: row.depth * 16 }}>
                            {row.kind === 'group' ? (
                              <button
                                type="button"
                                aria-expanded={open}
                                aria-label={t(open ? 'reports.collapse' : 'reports.expand', { name: label })}
                                onClick={() => {
                                  const next = new Set(closed)
                                  if (open) next.add(row.key)
                                  else next.delete(row.key)
                                  setClosed(next)
                                }}
                                className="flex size-6 flex-none cursor-pointer items-center justify-center rounded-md text-ink-meta hover:bg-chrome"
                              >
                                {open ? <ChevronDown size={14} aria-hidden /> : <ChevronRight size={14} aria-hidden />}
                              </button>
                            ) : (
                              // Keeps names under their group's name; a report without groups needs none
                              groups.size > 0 && <span className="w-6 flex-none" aria-hidden />
                            )}
                            <span className="truncate" title={label}>
                              {label}
                            </span>
                          </span>
                        </td>
                        {columns.map((column) => {
                          const value = column.value(row.values)
                          const to = value !== 0 ? linkTo(row, column) : null
                          const opens = value !== 0 && column.opens && agentsOf(row).length > 0
                          return (
                            <td key={column.key} className="text-right tabular-nums">
                              {to ? (
                                <Link to={to} className="text-primary hover:underline">
                                  {value}
                                </Link>
                              ) : opens ? (
                                <button type="button" className="cursor-pointer text-primary hover:underline" aria-label={t('reports.detail.open', { what: column.label, name: label })} onClick={() => url.set({ cell: `${row.key}|${column.key}` }, { push: true })}>
                                  {value}
                                </button>
                              ) : (
                                value
                              )}
                            </td>
                          )
                        })}
                      </tr>
                    )
                  })}
                {/* Inside the body, so it takes the table's cell styles */}
                <tr className="font-medium">
                  <td className="col-first border-t border-hairline">{t('reports.total')}</td>
                  {columns.map((column) => {
                    const value = column.value(data.total)
                    return (
                      <td key={column.key} className="border-t border-hairline text-right tabular-nums">
                        {value !== 0 && column.opens && allAgents.length > 0 ? (
                          <button type="button" className="cursor-pointer text-primary hover:underline" aria-label={t('reports.detail.open', { what: column.label, name: t('reports.total') })} onClick={() => url.set({ cell: `total|${column.key}` }, { push: true })}>
                            {value}
                          </button>
                        ) : (
                          value
                        )}
                      </td>
                    )
                  })}
                </tr>
              </tbody>
            </table>
          </TableScroll>
        )}
      </Card>
      <ActivityDetailsDialog cell={cell} from={from} to={to} onClose={() => url.set({ cell: null })} />
    </>
  )
}
