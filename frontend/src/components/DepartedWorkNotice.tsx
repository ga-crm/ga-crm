import { useQuery } from '@tanstack/react-query'
import { Link } from 'react-router-dom'
import { t } from '../i18n'
import { queries } from '../lib/queries'
import { buttonClass } from './buttonStyles'
import { Button } from './ui'

const STATUS_KEY = { DISABLED: 'departed.status.DISABLED', ARCHIVED: 'departed.status.ARCHIVED', STOPPED: 'departed.status.STOPPED' } as const

/**
 * Open question 12e (decided 14/11/2026): the reminder "còn N lead / khách của người đã nghỉ", with
 * a shortcut to reassign. On the lead list it filters the list; on the user list it names each person.
 */
export function DepartedWorkNotice({ variant, onShowLeads }: { variant: 'leads' | 'users'; onShowLeads?: () => void }) {
  const work = useQuery(queries.departedWork())
  const data = work.data
  if (!data || data.items.length === 0) return null
  if (variant === 'leads') {
    if (data.openLeads === 0) return null
    const names = data.items.filter((item) => item.openLeads > 0).map((item) => `${item.name ?? item.agentCode} (${item.openLeads})`)
    return (
      <div role="status" className="flex flex-wrap items-center gap-x-3 gap-y-1 rounded-md bg-warning-band px-3 py-2 text-caption text-ink-body">
        <span className="min-w-0 flex-1">{t('departed.leadsNotice', { count: data.openLeads, names: names.slice(0, 3).join(', ') + (names.length > 3 ? ', ...' : '') })}</span>
        {onShowLeads && (
          <Button variant="ghost" onClick={onShowLeads}>
            {t('departed.showLeads')}
          </Button>
        )}
      </div>
    )
  }
  return (
    <section aria-labelledby="departed-title" className="rounded-md bg-warning-band px-3 py-2 text-caption text-ink-body">
      <h2 id="departed-title" className="font-medium text-ink">
        {t('departed.usersTitle', { leads: data.openLeads, clients: data.clients })}
      </h2>
      <ul className="mt-1 divide-y divide-band">
        {data.items.map((item) => (
          <li key={item.agentCode} className="flex flex-wrap items-center gap-x-3 gap-y-1 py-1.5">
            <span className="min-w-0 flex-1">
              <span className="font-medium text-ink">{item.name ?? item.agentCode}</span> ({item.agentCode}, {t(STATUS_KEY[item.status])}):{' '}
              {t('departed.counts', { leads: item.openLeads, clients: item.clients })}
            </span>
            {item.openLeads > 0 && (
              <Link to={`/leads?assignee=${item.agentCode}`} className={buttonClass('ghost')}>
                {t('departed.reassignLeads')}
              </Link>
            )}
            {item.clients > 0 && (
              <Link to={`/clients?agents=${item.agentCode}`} className={buttonClass('ghost')}>
                {t('departed.showClients')}
              </Link>
            )}
          </li>
        ))}
      </ul>
    </section>
  )
}
