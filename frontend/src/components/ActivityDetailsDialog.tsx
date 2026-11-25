import { useQuery } from '@tanstack/react-query'
import { Link } from 'react-router-dom'
import { formatDateTime, t, tDynamic } from '../i18n'
import type { MessageKey } from '../i18n'
import { errorMessage } from '../lib/api'
import { queries } from '../lib/queries'
import type { ActivityDetail } from '../lib/types'
import { Alert, Badge, Dialog, EmptyState, Notice, Spinner } from './ui'

export interface ActivityCell {
  /** What the number is: the row and column names. */
  title: string
  agents: string[]
  type?: string
  source?: 'CRM' | 'SUCCESS'
}

/** Whether a row counts, and why not: the same person that day, or a Success status. */
function CountedBadge({ item }: { item: ActivityDetail }) {
  if (item.counted) return <Badge tone="success">{t('reports.detail.counted')}</Badge>
  return <Badge tone="muted">{t(item.excluded === 'duplicate' ? 'reports.detail.duplicate' : 'reports.detail.notApproved')}</Badge>
}

/**
 * Decided 26/11/2026: the activities behind one number of R2, so a manager can check it. A CRM
 * contact opens its lead or client; a Success activity shows its id there, its approval status and
 * what it says, to look it up on Success (where posts and check-ins are proved).
 */
function Details({ cell, from, to }: { cell: ActivityCell; from: string; to: string }) {
  const details = useQuery(queries.activityDetails({ from, to, agents: cell.agents.join(','), ...(cell.type ? { type: cell.type } : {}), ...(cell.source ? { source: cell.source } : {}) }))
  if (details.isPending) return <Spinner />
  if (details.isError) return <Alert>{errorMessage(details.error)}</Alert>
  const { items, counted, total, truncated } = details.data
  if (items.length === 0) return <EmptyState>{t('reports.detail.empty')}</EmptyState>
  return (
    <>
      <p className="mb-2 text-caption text-ink-meta">{t('reports.detail.summary', { counted, total })}</p>
      {truncated && <Notice>{t('reports.detail.truncated', { shown: items.length })}</Notice>}
      <div className="mb-4 overflow-x-auto">
        <table className="data-table min-w-[760px] table-fixed">
          <colgroup>
            <col className="w-[128px]" />
            <col className="w-[150px]" />
            <col className="w-[96px]" />
            <col />
            <col className="w-[120px]" />
          </colgroup>
          <thead>
            <tr>
              <th>{t('reports.detail.when')}</th>
              <th>{t('reports.detail.agent')}</th>
              <th>{t('reports.detail.kind')}</th>
              <th>{t('reports.detail.what')}</th>
              <th>{t('reports.detail.counts')}</th>
            </tr>
          </thead>
          <tbody>
            {items.map((item) => (
              <tr key={`${item.source}-${item.ref}`}>
                <td className="tabular-nums">{formatDateTime(item.at)}</td>
                <td className="truncate" title={item.agentName ?? item.agentCode}>
                  {item.agentName ?? item.agentCode}
                </td>
                <td>
                  <span className="block truncate">{t(`reports.col.${item.type}` as MessageKey)}</span>
                  <span className="block text-ink-meta">{t(item.source === 'CRM' ? 'reports.detail.fromCrm' : 'reports.detail.fromSuccess')}</span>
                </td>
                <td className="min-w-0">
                  {item.leadId ? (
                    <Link to={`/leads/${item.leadId}`} className="text-primary hover:underline">
                      {item.person ?? t('reports.detail.openLead')}
                    </Link>
                  ) : item.clientId ? (
                    <Link to={`/clients/${item.clientId}`} className="text-primary hover:underline">
                      {item.person ?? t('reports.detail.openClient')}
                    </Link>
                  ) : (
                    item.person && <span>{item.person}</span>
                  )}
                  {item.text && (
                    <span className="block truncate text-ink-body" title={item.text}>
                      {item.text}
                    </span>
                  )}
                  {item.location && <span className="block truncate text-ink-meta">{t('reports.detail.location', { place: item.location })}</span>}
                  {/* The id to look the activity up on Success, with its approval status there */}
                  {item.source === 'SUCCESS' && (
                    <span className="block text-ink-meta">
                      {t('reports.detail.successRef', { id: item.ref, status: tDynamic(`reports.successStatus.${item.status}`, item.status ?? '') })}
                    </span>
                  )}
                </td>
                <td>
                  <CountedBadge item={item} />
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </>
  )
}

export function ActivityDetailsDialog({ cell, from, to, onClose }: { cell: ActivityCell | null; from: string; to: string; onClose: () => void }) {
  return (
    <Dialog wide title={cell?.title ?? ''} open={!!cell} onClose={onClose}>
      {cell && <Details cell={cell} from={from} to={to} />}
    </Dialog>
  )
}
