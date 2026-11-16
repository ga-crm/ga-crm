import { useQuery } from '@tanstack/react-query'
import { Minus, TrendingDown, TrendingUp } from 'lucide-react'
import type { ReactNode } from 'react'
import { Link } from 'react-router-dom'
import { hasPermission, hasRole } from '../auth/access'
import { useMe } from '../auth/useMe'
import { ChartPanel, DayColumns, DayLines, HorizontalBars, Sparkline } from '../components/charts'
import { TodayPanel } from '../components/TodayPanel'
import { Alert, Badge, Container, FilterBand, FilterField, Notice, Panel, Segmented, Spinner } from '../components/ui'
import { formatVnd, t, tDynamic } from '../i18n'
import { errorMessage } from '../lib/api'
import { CHART_SORTS, DASHBOARD_DAYS, DEFAULT_DAYS, foldRows, shortDay, sortRows, trendOf } from '../lib/dashboard'
import type { ChartRow, ChartSort, ChartSortParam } from '../lib/dashboard'
import { canSeeReports, PERMISSION_FEATURES } from '../lib/nav'
import { queries } from '../lib/queries'
import type { Dashboard, Me } from '../lib/types'
import { useUrlState } from '../lib/useUrlState'

type Url = ReturnType<typeof useUrlState>

const compact = new Intl.NumberFormat('vi-VN', { notation: 'compact', maximumFractionDigits: 1 })
/** A large amount in a tile: "876 Tr đ", "1,2 T đ"; the full amount is in the tooltip. */
const compactVnd = (value: number) => `${compact.format(value)} đ`
type Ready = Extract<Dashboard, { available: true }>

/** A chart's order from the URL; the default is left out of it, so only a choice is shared. */
function useSort<K extends ChartSortParam>(url: Url, param: K) {
  const options = CHART_SORTS[param] as readonly ChartSort<K>[]
  const value = (url.oneOf(param, options.slice(1)) || options[0]) as ChartSort<K>
  const set = (next: ChartSort<K>) => url.set({ [param]: next === options[0] ? null : next })
  return [value, set] as const
}

/** Orders the kept rows; the folded "other" bar always stays last. */
function ordered(rows: ChartRow[], by: Parameters<typeof sortRows>[1]) {
  const other = rows.filter((row) => row.key === '__other')
  return [...sortRows(rows.filter((row) => row.key !== '__other'), by), ...other]
}

const plain = (value: number) => value.toLocaleString('vi-VN')

/** How a metric moved against the period before: an icon and a signed figure, never colour alone. */
function Trend({ now, before, format }: { now: number; before: number; format: (value: number) => string }) {
  const trend = trendOf(now, before)
  const Icon = trend.direction === 'up' ? TrendingUp : trend.direction === 'down' ? TrendingDown : Minus
  const tone = trend.direction === 'up' ? 'text-success' : trend.direction === 'down' ? 'text-alert' : 'text-ink-meta'
  const sign = trend.delta > 0 ? '+' : trend.delta < 0 ? '−' : ''
  const figure = trend.percent === null ? `${sign}${format(Math.abs(trend.delta))}` : `${sign}${trend.percent}%`
  return (
    <span className={`relative inline-flex flex-none items-center gap-1 text-caption font-medium tabular-nums ${tone}`}>
      <Icon aria-hidden size={16} />
      {figure}
      <span className="sr-only">{t(`dashboard.trend.${trend.direction}`)}</span>
    </span>
  )
}

/** A metric card: the figure, how it moved, and a sparkline of the period. */
function MetricCard({
  label,
  value,
  title,
  trend,
  spark,
  detail,
}: {
  label: string
  value: ReactNode
  title?: string
  trend?: { now: number; before: number; format: (value: number) => string }
  spark?: { days: string[]; data: number[]; format: (value: number) => string }
  detail?: string
}) {
  return (
    <Panel className="min-w-0">
      <div className="flex items-start justify-between gap-2">
        <p className="min-w-0 truncate text-caption text-ink-meta" title={label}>
          {label}
        </p>
        {trend && <Trend {...trend} />}
      </div>
      <p className="mt-1 truncate text-page-title text-ink tabular-nums" title={title}>
        {value}
      </p>
      {/* Reserved even without a sparkline, so the cards line up */}
      <div className="relative mt-2 h-12">{spark && <Sparkline days={spark.days} data={spark.data} label={label} format={spark.format} />}</div>
      <p className="mt-2 min-h-5 truncate text-caption text-ink-meta" title={detail}>
        {detail}
      </p>
    </Panel>
  )
}

function PipelineChart({ data, url }: { data: Ready; url: Url }) {
  const [sort, setSort] = useSort(url, 'stageSort')
  const rows: ChartRow[] = data.pipeline.map((row) => ({ key: row.stage, label: tDynamic(`stage.${row.stage}`, row.stage), values: [row.count, row.valueVnd] }))
  const shown = sortRows(rows, sort === 'stage' ? { kind: 'natural' } : { kind: 'value', index: sort === 'count' ? 0 : 1 })
  return (
    <ChartPanel
      id="chart-pipeline"
      title={t('dashboard.pipelineTitle')}
      note={t('dashboard.pipelineNote')}
      sort={{
        value: sort,
        onChange: setSort,
        options: [
          { value: 'stage', label: t('dashboard.sortStage') },
          { value: 'count', label: t('dashboard.sortCount') },
          { value: 'value', label: t('dashboard.sortValue') },
        ],
      }}
    >
      {data.totals.openLeads === 0 ? (
        <Notice>{t('dashboard.emptyPipeline')}</Notice>
      ) : (
        <HorizontalBars
          rows={shown}
          series={[t('dashboard.seriesOpen')]}
          description={t('dashboard.pipelineDescription')}
          note={(index) => t('dashboard.pipelineValueLine', { value: formatVnd(shown[index].values[1]) })}
        />
      )}
    </ChartPanel>
  )
}

function SourcesChart({ data, url }: { data: Ready; url: Url }) {
  const [sort, setSort] = useSort(url, 'sourceSort')
  const rows: ChartRow[] = data.sources.map((row) => ({ key: row.code ?? '', label: row.label ?? t('dashboard.noSource'), values: [row.count, row.won] }))
  const { kept, folded } = foldRows(rows, sort === 'won' ? 1 : 0, t('dashboard.other', { count: 0 }))
  const named = kept.map((row) => (row.key === '__other' ? { ...row, label: t('dashboard.other', { count: folded }) } : row))
  const shown = ordered(named, sort === 'name' ? { kind: 'label' } : { kind: 'value', index: sort === 'won' ? 1 : 0 })
  return (
    <ChartPanel
      id="chart-sources"
      title={t('dashboard.sourcesTitle')}
      note={t('dashboard.sourcesNote', { days: data.days })}
      sort={{
        value: sort,
        onChange: setSort,
        options: [
          { value: 'count', label: t('dashboard.sortLeads') },
          { value: 'won', label: t('dashboard.sortWon') },
          { value: 'name', label: t('dashboard.sortName') },
        ],
      }}
    >
      {rows.length === 0 ? (
        <Notice>{t('dashboard.empty', { days: data.days })}</Notice>
      ) : (
        <HorizontalBars rows={shown} series={[t('dashboard.seriesLeads'), t('dashboard.seriesWon')]} description={t('dashboard.sourcesDescription')} />
      )}
    </ChartPanel>
  )
}

function AgentsChart({ agents, data, url }: { agents: NonNullable<Ready['agents']>; data: Ready; url: Url }) {
  const [sort, setSort] = useSort(url, 'agentSort')
  const rows: ChartRow[] = agents.map((row) => ({
    key: row.agentCode ?? '',
    label: row.agentCode ? `${row.name ?? row.agentCode}` : t('dashboard.unassigned'),
    values: [row.open, row.contacted],
  }))
  const { kept, folded } = foldRows(rows, sort === 'contacted' ? 1 : 0, '')
  const named = kept.map((row) => (row.key === '__other' ? { ...row, label: t('dashboard.other', { count: folded }) } : row))
  const shown = ordered(named, sort === 'name' ? { kind: 'label' } : { kind: 'value', index: sort === 'contacted' ? 1 : 0 })
  return (
    <ChartPanel
      id="chart-agents"
      title={t('dashboard.agentsTitle')}
      note={t('dashboard.agentsNote', { days: data.days })}
      className="lg:col-span-2"
      sort={{
        value: sort,
        onChange: setSort,
        options: [
          { value: 'open', label: t('dashboard.sortOpen') },
          { value: 'contacted', label: t('dashboard.sortContacted') },
          { value: 'name', label: t('dashboard.sortName') },
        ],
      }}
    >
      {rows.length === 0 ? (
        <Notice>{t('dashboard.emptyPipeline')}</Notice>
      ) : (
        <HorizontalBars rows={shown} series={[t('dashboard.seriesOpen'), t('dashboard.seriesContacted')]} description={t('dashboard.agentsDescription')} />
      )}
    </ChartPanel>
  )
}

function ActiveUsersChart({ series }: { series: { day: string; active: number }[] }) {
  return (
    <ChartPanel id="chart-active" title={t('dashboard.activeTitle')} note={t('dashboard.activeNote')} className="lg:col-span-2">
      <DayColumns
        days={series.map((point) => shortDay(point.day))}
        name={t('dashboard.activeSeries')}
        data={series.map((point) => point.active)}
        description={t('dashboard.activeDescription')}
      />
    </ChartPanel>
  )
}

/** The five lead cards: two as of now (against the start of the period), three over the period. */
function MetricCards({ data }: { data: Ready }) {
  const days = data.daily.map((point) => shortDay(point.day))
  const before = t('dashboard.vsBefore', { days: data.days })
  const flow = (label: string, field: 'created' | 'contacted' | 'won', total: number, previous: number) => (
    <MetricCard
      key={field}
      label={label}
      value={plain(total)}
      trend={{ now: total, before: previous, format: plain }}
      spark={{ days, data: data.daily.map((point) => point[field]), format: plain }}
      detail={`${before}: ${plain(previous)}`}
    />
  )
  return (
    <>
      <MetricCard
        label={t('dashboard.openLeads')}
        value={plain(data.totals.openLeads)}
        trend={{ now: data.totals.openLeads, before: data.previous.openLeads, format: plain }}
        spark={{ days, data: data.daily.map((point) => point.open), format: plain }}
        detail={t('dashboard.atStart', { value: plain(data.previous.openLeads) })}
      />
      <MetricCard
        label={t('dashboard.pipelineValue')}
        value={compactVnd(data.totals.pipelineValueVnd)}
        title={formatVnd(data.totals.pipelineValueVnd)}
        trend={{ now: data.totals.pipelineValueVnd, before: data.previous.pipelineValueVnd, format: compactVnd }}
        spark={{ days, data: data.daily.map((point) => point.valueVnd), format: formatVnd }}
        detail={t('dashboard.atStart', { value: compactVnd(data.previous.pipelineValueVnd) })}
      />
      {flow(t('dashboard.newLeads'), 'created', data.totals.newLeads, data.previous.newLeads)}
      {flow(t('dashboard.contacted'), 'contacted', data.totals.contacted, data.previous.contacted)}
      {flow(t('dashboard.won'), 'won', data.totals.won, data.previous.won)}
    </>
  )
}

/** Inside a GA: the leads of the person's report scope (RPT-3), who is online, and who uses the CRM. */
function GaDashboard({ me }: { me: Me }) {
  const url = useUrlState()
  const days = url.oneOf('days', DASHBOARD_DAYS) || DEFAULT_DAYS
  const leads = canSeeReports(me)
  const dashboard = useQuery({ ...queries.dashboard(Number(days)), enabled: leads })
  const presence = useQuery(queries.presence())
  // C1: who uses the CRM, for those who manage users
  const activity = useQuery({ ...queries.activeUsers(), enabled: hasPermission(me, 'users.manage') })
  const data = dashboard.data?.available ? dashboard.data : undefined
  const online = presence.data ? presence.data.online.length + presence.data.idle.length : undefined

  return (
    <>
      <FilterBand className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
        <div className="min-w-0 sm:flex-1">
          <h2 className="text-subhead text-ink">{t('dashboard.title')}</h2>
          {/* Reserved even before the figures load, so the band keeps its height */}
          <p className="mt-1 min-h-5 text-caption text-ink-meta">{data && t(`dashboard.scope.${data.scope}`)}</p>
        </div>
        {leads && (
          <FilterField label={t('dashboard.period')} className="sm:w-auto sm:flex-none">
            <Segmented
              label={t('dashboard.period')}
              value={days}
              options={DASHBOARD_DAYS.map((value) => ({ value, label: t('dashboard.days', { days: value }) }))}
              onValueChange={(value) => url.set({ days: value === DEFAULT_DAYS ? null : value })}
            />
          </FilterField>
        )}
      </FilterBand>

      <Container className="flex-none space-y-4 py-6">
        {dashboard.isPending && leads && <Spinner />}
        {dashboard.isError && <Alert>{errorMessage(dashboard.error)}</Alert>}
        {(!leads || dashboard.data?.available === false) && <Notice>{t('dashboard.noAccess')}</Notice>}

        <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
          {data && <MetricCards data={data} />}
          <MetricCard
            label={t('dashboard.onlineNow')}
            value={online ?? '–'}
            spark={activity.data ? { days: activity.data.series.map((point) => shortDay(point.day)), data: activity.data.series.map((point) => point.active), format: plain } : undefined}
            detail={
              presence.data?.idle.length
                ? t('dashboard.onlineDetail', { idle: presence.data.idle.length })
                : activity.data
                  ? t('dashboard.activeToday', { count: activity.data.dau })
                  : undefined
            }
          />
        </div>

        <div className="grid gap-4 lg:grid-cols-2">
          {data && (
            <>
              <ChartPanel id="chart-trend" title={t('dashboard.trendTitle')} note={t('dashboard.trendNote')} className="lg:col-span-2">
                <DayLines
                  days={data.daily.map((point) => shortDay(point.day))}
                  series={[
                    { name: t('dashboard.seriesNew'), data: data.daily.map((point) => point.created) },
                    { name: t('dashboard.seriesContacted'), data: data.daily.map((point) => point.contacted) },
                  ]}
                  description={t('dashboard.trendDescription')}
                />
              </ChartPanel>
              <PipelineChart data={data} url={url} />
              <SourcesChart data={data} url={url} />
              {data.agents && <AgentsChart agents={data.agents} data={data} url={url} />}
            </>
          )}
          {/* C1: who uses the CRM, for those who manage users */}
          {activity.data && <ActiveUsersChart series={activity.data.series} />}
        </div>
      </Container>
    </>
  )
}

/** Platform staff: the GAs on the platform by their number of users. */
function PlatformDashboard() {
  const url = useUrlState()
  const [sort, setSort] = useSort(url, 'gaSort')
  const tenants = useQuery(queries.tenants({ page: 1, pageSize: 50 }))
  const rows: ChartRow[] = (tenants.data?.items ?? []).map((item) => ({ key: item.id, label: `${item.name} (${item.gaCode})`, values: [item.users] }))
  const shown = sortRows(rows, sort === 'name' ? { kind: 'label' } : { kind: 'value', index: 0 })
  return (
    <Container className="flex-none py-6">
      {tenants.isPending && <Spinner />}
      {tenants.isError && <Alert>{errorMessage(tenants.error)}</Alert>}
      {tenants.data && (
        <ChartPanel
          id="chart-gas"
          title={t('dashboard.gasTitle')}
          note={t('dashboard.gasNote', { count: tenants.data.total })}
          sort={{
            value: sort,
            onChange: setSort,
            options: [
              { value: 'users', label: t('dashboard.sortUsers') },
              { value: 'name', label: t('dashboard.sortName') },
            ],
          }}
        >
          <HorizontalBars rows={shown} series={[t('dashboard.gaUsers')]} description={t('dashboard.gasDescription')} />
        </ChartPanel>
      )}
    </Container>
  )
}

function Fact({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="border-t border-band py-4">
      <dt className="text-caption text-ink-meta">{label}</dt>
      <dd className="mt-1 text-link text-ink-body">{children}</dd>
    </div>
  )
}

export function HomePage() {
  const { data: me } = useMe()
  if (!me) return null

  return (
    <>
      {me.tenant ? <GaDashboard me={me} /> : hasRole(me, 'PLATFORM_ADMIN') && <PlatformDashboard />}

      {/* TASK-5: inside a GA, the home page is also "Hôm nay" */}
      {me.tenant && <TodayPanel />}

      <section className="flex-none bg-chrome">
        <Container className="py-8">
          <h2 className="mb-4 text-subhead text-ink">{t('dashboard.details')}</h2>
          <dl className="grid gap-x-12 md:grid-cols-2">
            <Fact label={t('users.email')}>{me.user.email}</Fact>
            <Fact label={t('home.reach')}>{tDynamic(`reach.${me.reach}`, me.reach)}</Fact>
            <Fact label={t('home.roles')}>
              <span className="flex flex-wrap gap-1">
                {me.roles.map((role) => (
                  <Badge key={role}>{tDynamic(`role.${role}`, role)}</Badge>
                ))}
              </span>
            </Fact>
            {me.user.agentCode && <Fact label={t('home.agentCode')}>{me.user.agentCode}</Fact>}
          </dl>

          <h3 className="mt-6 mb-3 text-link font-medium text-ink">{t('home.permissions')}</h3>
          {me.permissions.length ? (
            <ul className="grid gap-x-12 gap-y-2 sm:grid-cols-2 lg:grid-cols-3">
              {me.permissions.map((permission) => {
                const feature = PERMISSION_FEATURES[permission]
                const label = tDynamic(`permission.${permission}`, permission)
                return (
                  <li key={permission} className="flex items-center gap-2 text-list text-ink-list">
                    {feature ? (
                      <Link to={feature} className="text-primary hover:underline">
                        {label}
                      </Link>
                    ) : (
                      <>
                        {label}
                        <Badge tone="muted">{t('home.comingSoon')}</Badge>
                      </>
                    )}
                  </li>
                )
              })}
            </ul>
          ) : (
            <Notice>{t('home.noPermissions')}</Notice>
          )}
        </Container>
      </section>

    </>
  )
}
