import { useQuery } from '@tanstack/react-query'
import { FileUp } from 'lucide-react'
import { Link } from 'react-router-dom'
import { hasPermission } from '../auth/access'
import { useMe } from '../auth/useMe'
import { Alert, Badge, Card, EmptyState, PageHeader, Pagination, Spinner, TableScroll } from '../components/ui'
import { buttonClass } from '../components/buttonStyles'
import type { BadgeTone } from '../components/ui'
import { formatDateTime, t, tDynamic } from '../i18n'
import { errorMessage } from '../lib/api'
import { queries } from '../lib/queries'
import { usePrefetchNextPage } from '../lib/usePrefetchNextPage'
import { useLeaveEmptyPage, useUrlState } from '../lib/useUrlState'

const STATUS_TONES: Record<string, BadgeTone> = {
  PARSING: 'muted',
  VALIDATED: 'warning',
  COMMITTING: 'info',
  COMMITTED: 'success',
  FAILED: 'muted',
}

/** IMP-12 */
export function ImportsPage() {
  const { data: me } = useMe()
  const url = useUrlState()
  const params = { page: url.page, pageSize: url.pageSize }
  const imports = useQuery(queries.imports(params))
  usePrefetchNextPage(queries.imports, params, imports.data)
  useLeaveEmptyPage(url, imports.data?.items.length)

  const showAll = hasPermission(me, 'imports.view_all')
  const canUpload = hasPermission(me, 'imports.upload')

  return (
    <>
      <PageHeader
        title={t('imports.historyTitle')}
        subtitle={t(showAll ? 'imports.historyAll' : 'imports.historyOwn')}
        action={
          canUpload && (
            <Link to="/imports/new" className={buttonClass('primary')}>
              <FileUp aria-hidden size={16} />
              {t('nav.importNew')}
            </Link>
          )
        }
      />
      <Card>
        {imports.isPending && <Spinner />}
        {imports.isError && <Alert className="m-4">{errorMessage(imports.error)}</Alert>}
        {imports.data && imports.data.items.length === 0 && <EmptyState>{t('imports.empty')}</EmptyState>}
        {imports.data && imports.data.items.length > 0 && (
          <>
            <TableScroll loading={imports.isPlaceholderData}>
              <table className="data-table min-w-[960px] table-fixed">
                <colgroup>
                  <col />
                  <col className="w-[130px]" />
                  <col className="w-[160px]" />
                  <col className="w-[240px]" />
                  <col className="w-[180px]" />
                  <col className="w-[152px]" />
                </colgroup>
                <thead>
                  <tr>
                    <th>{t('imports.fileName')}</th>
                    <th>{t('imports.snapshotDate')}</th>
                    <th>{t('imports.sheetStatus')}</th>
                    <th>{t('imports.result')}</th>
                    <th>{t('imports.uploader')}</th>
                    <th>{t('imports.at')}</th>
                  </tr>
                </thead>
                <tbody>
                  {imports.data.items.map((item) => {
                    const ready = item.sheets.filter((sheet) => sheet.status === 'READY')
                    const sum = (field: 'inserted' | 'updated' | 'rejected') => ready.reduce((total, sheet) => total + sheet[field], 0)
                    return (
                      <tr key={item.id}>
                        <td title={item.fileName} className="truncate">
                          <Link to={`/imports/${item.id}`} className="font-medium text-primary hover:underline">
                            {item.fileName}
                          </Link>
                        </td>
                        <td>{item.snapshotDate.split('-').reverse().join('/')}</td>
                        <td>
                          <Badge tone={STATUS_TONES[item.status]}>{tDynamic(`imports.status.${item.status}`, item.status)}</Badge>
                        </td>
                        <td className="truncate text-ink-meta">{t('imports.resultLine', { inserted: sum('inserted'), updated: sum('updated'), rejected: sum('rejected') })}</td>
                        <td title={item.userName ?? undefined} className="truncate">
                          {item.userName ?? '-'}
                        </td>
                        <td className="whitespace-nowrap text-ink-meta">{formatDateTime(item.createdAt)}</td>
                      </tr>
                    )
                  })}
                </tbody>
              </table>
            </TableScroll>
            <Pagination page={imports.data.page} pageSize={imports.data.pageSize} total={imports.data.total} onPage={url.setPage} onPageSize={url.setPageSize} />
          </>
        )}
      </Card>
    </>
  )
}
