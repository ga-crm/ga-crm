import { useQuery } from '@tanstack/react-query'
import { Plus } from 'lucide-react'
import type { ReactNode } from 'react'
import { Link } from 'react-router-dom'
import { useMe } from '../auth/useMe'
import { formatDateTime, formatVnd, t } from '../i18n'
import { errorMessage } from '../lib/api'
import { buttonClass } from './buttonStyles'
import { showDate } from '../lib/leadLabels'
import { canSeeReports, canUseLeads } from '../lib/nav'
import { queries } from '../lib/queries'
import { useUrlState } from '../lib/useUrlState'
import { TaskForm, TaskList } from './Tasks'
import { Alert, Badge, Button, Container, Dialog, Panel, Spinner, TableScroll } from './ui'

function Section({ title, action, children }: { title: string; action?: ReactNode; children: ReactNode }) {
  return (
    <Panel className="min-w-0">
      <div className="mb-3 flex items-center justify-between gap-2">
        <h2 className="text-subhead text-ink">{title}</h2>
        {action}
      </div>
      {children}
    </Panel>
  )
}

function Counter({ label, value, to, alert = false }: { label: string; value: number; to: string; alert?: boolean }) {
  return (
    <Link to={to} className="block rounded-lg bg-chrome px-4 py-3 hover:bg-band">
      <span className="block text-caption text-ink-meta">{label}</span>
      <span className={`mt-1 block text-subhead tabular-nums ${alert && value > 0 ? 'text-alert' : 'text-ink'}`}>{value}</span>
    </Link>
  )
}

/** TASK-5 + section 16.2: "Hôm nay" on the home page. */
export function TodayPanel() {
  const { data: me } = useMe()
  const url = useUrlState()
  const today = useQuery(queries.today())
  const adding = url.get('task') === 'new'
  if (!me) return null
  if (today.isPending) return <Spinner />
  if (today.isError) return <Alert className="m-4">{errorMessage(today.error)}</Alert>
  const data = today.data
  const tasks = [...data.tasks.overdue, ...data.tasks.today]
  const leads = data.leads
  const usesLeads = canUseLeads(me)

  return (
    <Container className="flex-none py-6">
      <div className="mb-4 flex flex-wrap items-center gap-2">
        <h2 className="w-full text-section-title text-ink sm:mr-auto sm:w-auto">{t('today.title')}</h2>
        {usesLeads && (
          <Link to="/leads?create=1" className={buttonClass('secondary')}>
            <Plus size={16} aria-hidden />
            {t('today.quickLead')}
          </Link>
        )}
        <Button onClick={() => url.set({ task: 'new' }, { push: true })}>
          <Plus size={16} aria-hidden />
          {t('today.quickTask')}
        </Button>
      </div>
      <div className="grid gap-4 lg:grid-cols-2">
        {/* TASK-5: tasks due today and late come first */}
        <Section
          title={t('today.tasks')}
          action={
            <Link to="/tasks" className="flex-none text-caption whitespace-nowrap text-primary hover:underline">
              {t('today.allTasks')}
            </Link>
          }
        >
          <TaskList items={tasks} empty={t('today.noTasks')} />
        </Section>
        <div className="min-w-0 space-y-4">
          {usesLeads && (
            <Section title={t('today.leads')}>
              <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
                {me.user.agentCode && <Counter label={t('today.myLeads')} value={leads.mine} to="/leads?tab=mine" />}
                <Counter label={t('today.newLeads')} value={leads.isNew} to="/leads?tab=isNew" />
                <Counter label={t('today.newComments')} value={leads.newComment} to="/leads?tab=newComment" />
                <Counter label={data.isManager || data.manages ? t('today.teamOverdue') : t('today.overdueLeads')} value={leads.overdue} to="/leads?tab=overdue" alert />
                {data.manages && <Counter label={t('today.unassigned')} value={leads.unassigned} to="/leads?tab=unassigned" />}
                {data.newLeadsToday !== null && <Counter label={t('today.newToday')} value={data.newLeadsToday} to={`/leads?from=${data.today}&to=${data.today}`} />}
              </div>
              {(data.isManager || data.manages) && canSeeReports(me) && (
                <Link to="/reports" className="mt-3 inline-block text-caption text-primary hover:underline">
                  {t('today.reports')}
                </Link>
              )}
            </Section>
          )}
          {me.user.agentCode && (
            <Section title={t('today.care')}>
              <h3 className="mb-1 text-caption font-medium text-ink">{t('today.premiumDue')}</h3>
              {data.care.premiumDue.length === 0 ? (
                <p className="mb-3 text-caption text-ink-meta">{t('today.noPremiumDue')}</p>
              ) : (
                <ul className="mb-3 space-y-1 text-caption">
                  {data.care.premiumDue.map((item) => (
                    <li key={`${item.clientId}-${item.policyNo}`} className="flex flex-wrap gap-x-2">
                      <Link to={`/clients/${item.clientId}?tab=care`} className="text-primary hover:underline">
                        {item.name}
                      </Link>
                      <span className="text-ink-meta tabular-nums">{t('today.premiumLine', { policyNo: item.policyNo, date: showDate(item.date) ?? item.date, amount: formatVnd(item.amountVnd) })}</span>
                    </li>
                  ))}
                </ul>
              )}
              <h3 className="mb-1 text-caption font-medium text-ink">{t('today.birthdays')}</h3>
              {data.care.birthdays.length === 0 ? (
                <p className="text-caption text-ink-meta">{t('today.noBirthdays')}</p>
              ) : (
                <ul className="space-y-1 text-caption">
                  {data.care.birthdays.map((item) => (
                    <li key={item.clientId} className="flex flex-wrap items-center gap-x-2">
                      <Link to={`/clients/${item.clientId}?tab=care`} className="text-primary hover:underline">
                        {item.name}
                      </Link>
                      <span className="text-ink-meta tabular-nums">{showDate(item.date)}</span>
                      {item.isToday && <Badge tone="notable">{t('today.birthdayToday')}</Badge>}
                    </li>
                  ))}
                </ul>
              )}
            </Section>
          )}
        </div>
      </div>
      {/* Section 16.2: GAD and Admin see how fresh each agent's Success data is */}
      {data.uploads && data.uploads.length > 0 && (
        <div className="mt-4">
          <Section title={t('today.uploads')}>
            <p className="mb-2 text-caption text-ink-meta">{t('today.uploadsHelp')}</p>
            <TableScroll>
              <table className="data-table min-w-[480px] table-fixed">
                <colgroup>
                  <col />
                  <col className="w-[200px]" />
                  <col className="w-[90px]" />
                </colgroup>
                <thead>
                  <tr>
                    <th>{t('reports.agent')}</th>
                    <th>{t('today.lastUpload')}</th>
                    <th />
                  </tr>
                </thead>
                <tbody>
                  {data.uploads.map((item) => (
                    <tr key={item.agentCode}>
                      <td className="truncate">{`${item.name} (${item.agentCode})`}</td>
                      <td className="text-ink-meta">{item.lastUploadAt ? formatDateTime(item.lastUploadAt) : t('today.neverUploaded')}</td>
                      <td>{item.stale && <Badge tone="warning">{t('today.stale')}</Badge>}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </TableScroll>
          </Section>
        </div>
      )}
      <Dialog title={t('tasks.addTitle')} open={adding} onClose={() => url.set({ task: null })}>
        {adding && <TaskForm onClose={() => url.set({ task: null })} />}
      </Dialog>
    </Container>
  )
}
