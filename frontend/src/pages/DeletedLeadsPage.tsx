import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { ArrowLeft } from 'lucide-react'
import { Link } from 'react-router-dom'
import { Alert, Button, Card, EmptyState, PageHeader, Pagination, Spinner, TableScroll } from '../components/ui'
import { formatDateTime, t } from '../i18n'
import { api, errorMessage } from '../lib/api'
import { keys, queries } from '../lib/queries'
import { toast } from '../lib/toast'
import type { DeletedLead } from '../lib/types'
import { usePrefetchNextPage } from '../lib/usePrefetchNextPage'
import { useUrlState } from '../lib/useUrlState'

/** LEAD-40: leads deleted in the last 30 days, restorable unless merged. */
export function DeletedLeadsPage() {
  const url = useUrlState()
  const queryClient = useQueryClient()
  const params = { page: url.page, pageSize: url.pageSize }
  const list = useQuery(queries.deletedLeads(params))
  usePrefetchNextPage(queries.deletedLeads, params, list.data)
  const restore = useMutation({
    mutationFn: (lead: DeletedLead) => api.post(`/leads/${lead.id}/restore`),
    onSuccess: async (_, lead) => {
      await queryClient.invalidateQueries({ queryKey: keys.leads })
      toast.success(t('toast.leadRestored', { name: lead.fullName }))
    },
    onError: (error) => toast.error(t('toast.leadRestoreFailed'), errorMessage(error)),
  })

  return (
    <>
      <PageHeader
        title={t('leads.deletedTitle')}
        subtitle={t('leads.deletedHelp')}
        action={
          <Link to="/leads" className="inline-flex items-center gap-1 text-caption text-primary hover:underline">
            <ArrowLeft aria-hidden size={14} />
            {t('leads.back')}
          </Link>
        }
      />
      <Card>
        {list.isPending && <Spinner />}
        {list.isError && <Alert className="m-4">{errorMessage(list.error)}</Alert>}
        {list.data && list.data.items.length === 0 && <EmptyState>{t('leads.deletedEmpty')}</EmptyState>}
        {list.data && list.data.items.length > 0 && (
          <TableScroll>
            <table className="data-table min-w-[880px] table-fixed">
              <colgroup>
                <col />
                <col className="w-[130px]" />
                <col className="w-[150px]" />
                <col className="w-[150px]" />
                <col className="w-[220px]" />
                <col className="w-[130px]" />
              </colgroup>
              <thead>
                <tr>
                  <th className="col-first">{t('leads.colName')}</th>
                  <th>{t('leads.colPhone')}</th>
                  <th>{t('leads.deletedAt')}</th>
                  <th>{t('leads.deletedBy')}</th>
                  <th>{t('leads.deleteReason')}</th>
                  <th className="col-actions" />
                </tr>
              </thead>
              <tbody>
                {list.data.items.map((item) => (
                  <tr key={item.id}>
                    <td className="col-first truncate" title={item.fullName}>
                      {item.fullName}
                    </td>
                    <td className="tabular-nums">{item.phone ?? '-'}</td>
                    <td>{formatDateTime(item.deletedAt)}</td>
                    <td className="truncate">{item.deletedBy ?? '-'}</td>
                    <td className="truncate" title={item.reason ?? ''}>
                      {item.reason ?? '-'}
                    </td>
                    <td className="col-actions">
                      {item.mergedInto ? (
                        <Link to={`/leads/${item.mergedInto}`} className="text-caption text-primary hover:underline">
                          {t('leads.mergedOpen')}
                        </Link>
                      ) : (
                        <Button variant="ghost" disabled={restore.isPending} title={t('leads.restoreUntil', { at: formatDateTime(item.restorableUntil) })} onClick={() => restore.mutate(item)}>
                          {t('leads.restore')}
                        </Button>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </TableScroll>
        )}
        {list.data && list.data.total > 0 && <Pagination page={list.data.page} pageSize={list.data.pageSize} total={list.data.total} onPage={url.setPage} onPageSize={url.setPageSize} />}
      </Card>
    </>
  )
}
