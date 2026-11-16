import { Link } from 'react-router-dom'
import { useMe } from '../auth/useMe'
import { formatDateTime, formatVnd, t, tDynamic } from '../i18n'
import { showDate } from '../lib/leadLabels'
import { canReadImports } from '../lib/nav'
import type { ClientChange, ClientDetail } from '../lib/types'
import { EmptyState, TableScroll } from './ui'

/** Which record a change belongs to, in words. */
function recordLabel(change: ClientChange): string {
  if (change.entity === 'client') return t('history.client')
  const [policyNo, productCode] = change.entityKey.split('/')
  return change.entity === 'policy_product' ? t('history.product', { no: policyNo, code: productCode }) : t('history.policy', { no: policyNo })
}

/** A stored value as people read it: dates, yes / no, money and agent shares written out. */
function valueText(field: string, value: string | null): string {
  if (value === null || value === '') return t('history.blank')
  if (value === 'true') return t('common.yes')
  if (value === 'false') return t('common.no')
  if (/^\d{4}-\d{2}-\d{2}$/.test(value)) return showDate(value) ?? value
  if (/^\d{4}-\d{2}-\d{2}T/.test(value)) return formatDateTime(value)
  if (field.endsWith('Vnd') && /^\d+$/.test(value)) return formatVnd(Number(value))
  // IMP-21: "9000001:60;9000003:40"
  if (field === 'agents')
    return value
      .split(';')
      .map((part) => {
        const [code, share] = part.split(':')
        return share ? `${code} (${share}%)` : code
      })
      .join(', ')
  return value
}

/** CUS-15 "Lịch sử": what files and people changed on the client and its policies. */
export function ClientHistory({ detail }: { detail: ClientDetail }) {
  const { data: me } = useMe()
  const canOpenImports = !!me && canReadImports(me)
  if (detail.history.length === 0) return <EmptyState>{t('history.empty')}</EmptyState>
  return (
    <>
      <p className="mb-3 text-caption text-ink-meta">{t('history.help')}</p>
      <TableScroll>
        <table className="data-table min-w-[1000px] table-fixed">
          <colgroup>
            <col className="w-[130px]" />
            <col className="w-[150px]" />
            <col className="w-[170px]" />
            <col />
            <col className="w-[150px]" />
            <col className="w-[140px]" />
          </colgroup>
          <thead>
            <tr>
              <th>{t('history.when')}</th>
              <th>{t('history.record')}</th>
              <th>{t('history.field')}</th>
              <th>{t('history.change')}</th>
              <th>{t('history.source')}</th>
              <th>{t('history.by')}</th>
            </tr>
          </thead>
          <tbody>
            {detail.history.map((change) => {
              const before = valueText(change.field, change.oldValue)
              const after = valueText(change.field, change.newValue)
              return (
                <tr key={change.id}>
                  <td className="whitespace-nowrap text-ink-meta">{formatDateTime(change.changedAt)}</td>
                  <td className="truncate tabular-nums">{recordLabel(change)}</td>
                  <td className="break-words">{tDynamic(`recordField.${change.field}`, change.field)}</td>
                  {/* Values wrap rather than hide, since the change is what the row is about */}
                  <td className="break-words">
                    <span className="text-ink-meta">{before}</span> → {after}
                  </td>
                  <td className="truncate" title={change.fileName ?? undefined}>
                    {change.importId ? (
                      canOpenImports ? (
                        <Link to={`/imports/${change.importId}`} className="text-primary hover:underline">
                          {change.fileName ?? change.importId}
                        </Link>
                      ) : (
                        change.fileName
                      )
                    ) : (
                      <span className="text-ink-meta">{t('history.byHand')}</span>
                    )}
                  </td>
                  <td className="truncate">{detail.userNames[change.changedBy] ?? '-'}</td>
                </tr>
              )
            })}
          </tbody>
        </table>
      </TableScroll>
    </>
  )
}
