import { useQuery } from '@tanstack/react-query'
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/shadcn/tooltip'
import { Alert, Container, Notice, PageHeader, Panel, Spinner, TOOLTIP_CLASS } from '../components/ui'
import { t } from '../i18n'
import { errorMessage } from '../lib/api'
import { queries } from '../lib/queries'

/** YYYY-MM-DD as dd/mm, the way the rest of the app writes short dates. */
const shortDay = (day: string) => `${day.slice(8, 10)}/${day.slice(5, 7)}`

function Stat({ label, value, detail }: { label: string; value: number | string; detail?: string }) {
  return (
    <Panel>
      <p className="text-caption text-ink-meta">{label}</p>
      <p className="mt-1 text-page-title text-ink tabular-nums">{value}</p>
      {/* Reserved even when empty, so the tiles line up */}
      <p className="mt-1 min-h-5 text-caption text-ink-meta">{detail}</p>
    </Panel>
  )
}

/** Realtime slice C1: who uses the CRM, from the GA's daily activity bitmaps (users.manage). */
export function UserActivityPage() {
  const activity = useQuery(queries.activeUsers())
  const presence = useQuery(queries.presence())
  const data = activity.data
  const share = (value: number) =>
    data && data.activeAccounts > 0 ? t('activity.share', { percent: Math.round((value / data.activeAccounts) * 100), total: data.activeAccounts }) : undefined
  const peak = Math.max(1, ...(data?.series.map((point) => point.active) ?? []))

  return (
    <>
      <PageHeader title={t('activity.title')} subtitle={t('activity.subtitle')} />
      <Container className="flex min-h-0 flex-1 flex-col gap-4 overflow-y-auto pb-6">
        {activity.isPending && <Spinner />}
        {activity.isError && <Alert>{errorMessage(activity.error)}</Alert>}
        {data && (
          <>
            {!data.live && <Notice>{t('activity.notLive')}</Notice>}
            <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
              <Stat
                label={t('activity.onlineNow')}
                value={presence.data ? presence.data.online.length + presence.data.idle.length : '–'}
                detail={presence.data?.idle.length ? t('activity.onlineDetail', { idle: presence.data.idle.length }) : undefined}
              />
              <Stat label={t('activity.today')} value={data.dau} detail={share(data.dau)} />
              <Stat label={t('activity.week')} value={data.wau} detail={share(data.wau)} />
              <Stat label={t('activity.month')} value={data.mau} detail={share(data.mau)} />
            </div>

            <Panel aria-labelledby="activity-chart" className="relative">
              <h2 id="activity-chart" className="text-subhead font-medium text-ink">
                {t('activity.chartTitle')}
              </h2>
              {/* One series, so no legend: the title names it. Screen readers get the table below */}
              <div aria-hidden className="mt-4">
                <div className="flex items-end justify-between text-caption text-ink-meta">
                  <span className="tabular-nums">{peak}</span>
                </div>
                <div className="flex h-40 items-end gap-0.5 border-b border-band">
                  {data.series.map((point) => (
                    <Tooltip key={point.day}>
                      <TooltipTrigger asChild>
                        {/* The whole column is the hover target, not just the bar */}
                        <div className="group flex h-full min-w-0 flex-1 items-end">
                          <div
                            className="w-full rounded-t-[4px] bg-ink-meta transition-colors duration-150 group-hover:bg-ink motion-reduce:transition-none"
                            style={{ height: `${(point.active / peak) * 100}%`, minHeight: point.active > 0 ? 2 : 0 }}
                          />
                        </div>
                      </TooltipTrigger>
                      <TooltipContent className={TOOLTIP_CLASS}>{t('activity.dayValue', { day: shortDay(point.day), count: point.active })}</TooltipContent>
                    </Tooltip>
                  ))}
                </div>
                <div className="mt-1 flex justify-between text-caption text-ink-meta tabular-nums">
                  <span>{shortDay(data.series[0].day)}</span>
                  <span>{shortDay(data.series[data.series.length - 1].day)}</span>
                </div>
              </div>
              {/* A table ignores the 1 px height of sr-only and would stretch the page, so a div hides it */}
              <div className="sr-only">
                <table>
                  <caption>{t('activity.chartTitle')}</caption>
                  <thead>
                    <tr>
                      <th scope="col">{t('activity.day')}</th>
                      <th scope="col">{t('activity.people')}</th>
                    </tr>
                  </thead>
                  <tbody>
                    {data.series.map((point) => (
                      <tr key={point.day}>
                        <td>{shortDay(point.day)}</td>
                        <td>{point.active}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </Panel>
          </>
        )}
      </Container>
    </>
  )
}
