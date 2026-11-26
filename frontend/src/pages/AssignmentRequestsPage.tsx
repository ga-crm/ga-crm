import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { useState } from 'react'
import { Link } from 'react-router-dom'
import { hasRole } from '../auth/access'
import { useMe } from '../auth/useMe'
import { Alert, Badge, Button, Card, ConfirmDialog, EmptyState, FilterBand, FilterField, PageHeader, Select, Spinner, TableScroll } from '../components/ui'
import { formatDateTime, t, tDynamic } from '../i18n'
import { api, errorMessage } from '../lib/api'
import { keys, queries } from '../lib/queries'
import { toast } from '../lib/toast'
import type { AssignmentRequest, AssignmentStatus } from '../lib/types'
import { useUrlState } from '../lib/useUrlState'

const STATUSES: AssignmentStatus[] = ['PENDING', 'APPROVED', 'REJECTED', 'CANCELLED']
/** How many customer names a row shows before "+N". */
const SHOWN_NAMES = 3

const tone = (status: AssignmentStatus) => (status === 'PENDING' ? 'warning' : status === 'APPROVED' ? 'success' : 'muted')

/**
 * Decided 27/11/2026: "Duyệt phân công". The GA director approves or refuses the assignments that
 * Admin and line managers ask for; everyone else follows their own requests and may withdraw one.
 */
export function AssignmentRequestsPage() {
  const { data: me } = useMe()
  const director = hasRole(me, 'GAD')
  const url = useUrlState()
  const status = url.oneOf('status', [...STATUSES, 'ALL'] as const) || 'PENDING'
  const requests = useQuery(queries.assignmentRequests(status === 'ALL' ? undefined : status))
  const queryClient = useQueryClient()
  const refresh = () => Promise.all([queryClient.invalidateQueries({ queryKey: keys.assignments }), queryClient.invalidateQueries({ queryKey: keys.leads }), queryClient.invalidateQueries({ queryKey: keys.clients })])

  // Refusing and withdrawing are confirmed, and stay out of the URL
  const [confirming, setConfirming] = useState<{ request: AssignmentRequest; action: 'reject' | 'cancel' } | null>(null)
  const approve = useMutation({
    mutationFn: (request: AssignmentRequest) => api.post<{ assigned: number }>(`/assignment-requests/${request.id}/approve`),
    onSuccess: async (_, request) => {
      await refresh()
      toast.success(t('assignments.approved', { count: request.records.length, name: request.to?.name ?? t('assignments.pool') }))
    },
    onError: (error) => toast.error(t('assignments.approveFailed'), errorMessage(error)),
  })
  const decide = useMutation({
    mutationFn: ({ request, action }: { request: AssignmentRequest; action: 'reject' | 'cancel' }) => api.post(`/assignment-requests/${request.id}/${action}`, {}),
    onSuccess: async (_, { action }) => {
      setConfirming(null)
      await refresh()
      toast.info(t(action === 'reject' ? 'assignments.rejected' : 'assignments.cancelled'))
    },
  })

  const items = requests.data?.items ?? []
  return (
    <>
      <PageHeader title={t('assignments.title')} subtitle={t(director ? 'assignments.subtitleDirector' : 'assignments.subtitleOwn')} />
      <FilterBand className="flex flex-col gap-2 sm:flex-row sm:items-center">
        <FilterField label={t('assignments.status')} className="sm:w-56 sm:flex-none">
          <Select value={status} onChange={(event) => url.set({ status: event.target.value === 'PENDING' ? null : event.target.value })}>
            {STATUSES.map((value) => (
              <option key={value} value={value}>
                {tDynamic(`assignments.status.${value}`, value)}
              </option>
            ))}
            <option value="ALL">{t('assignments.statusAll')}</option>
          </Select>
        </FilterField>
      </FilterBand>
      <Card>
        {requests.isPending && <Spinner />}
        {requests.isError && <Alert>{errorMessage(requests.error)}</Alert>}
        {requests.data && items.length === 0 && <EmptyState>{t(director ? 'assignments.emptyDirector' : 'assignments.emptyOwn')}</EmptyState>}
        {items.length > 0 && (
          <TableScroll>
            <table className="data-table min-w-[860px] table-fixed">
              <colgroup>
                <col className="w-36" />
                <col className="w-40" />
                <col />
                <col className="w-44" />
                <col className="w-32" />
                <col className="w-44" />
              </colgroup>
              <thead>
                <tr>
                  <th>{t('assignments.sentAt')}</th>
                  <th>{t('assignments.sentBy')}</th>
                  <th>{t('assignments.customers')}</th>
                  <th>{t('assignments.to')}</th>
                  <th>{t('assignments.status')}</th>
                  <th className="col-actions" />
                </tr>
              </thead>
              <tbody>
                {items.map((request) => {
                  const shown = request.records.slice(0, SHOWN_NAMES)
                  const more = request.records.length - shown.length
                  const pending = request.status === 'PENDING'
                  return (
                    <tr key={request.id}>
                      <td className="tabular-nums">{formatDateTime(request.createdAt)}</td>
                      <td className="truncate" title={request.requestedBy ?? undefined}>
                        {request.requestedBy ?? '-'}
                      </td>
                      <td>
                        <span className="block text-ink-meta">{t(request.kind === 'LEAD' ? 'assignments.kindLead' : 'assignments.kindClient', { count: request.records.length })}</span>
                        <span className="block truncate">
                          {shown.map((record, index) => (
                            <span key={record.id}>
                              {index > 0 && ', '}
                              {director ? <Link to={request.kind === 'LEAD' ? `/leads/${record.id}` : `/clients/${record.id}`}>{record.name ?? '-'}</Link> : (record.name ?? '-')}
                            </span>
                          ))}
                          {more > 0 && <span className="text-ink-meta">{t('assignments.more', { count: more })}</span>}
                        </span>
                      </td>
                      <td className="truncate">{request.to ? `${request.to.name ?? request.to.code} (${request.to.code})` : t('assignments.pool')}</td>
                      <td>
                        <Badge tone={tone(request.status)}>{tDynamic(`assignments.status.${request.status}`, request.status)}</Badge>
                        {request.note && <span className="mt-1 block truncate text-ink-meta" title={request.note}>{request.note}</span>}
                      </td>
                      <td className="col-actions">
                        {pending && director && (
                          <span className="flex justify-end gap-2">
                            <Button variant="ghost" onClick={() => setConfirming({ request, action: 'reject' })}>
                              {t('assignments.reject')}
                            </Button>
                            <Button disabled={approve.isPending} onClick={() => approve.mutate(request)}>
                              {t('assignments.approve')}
                            </Button>
                          </span>
                        )}
                        {pending && !director && (
                          <span className="flex justify-end">
                            <Button variant="ghost" onClick={() => setConfirming({ request, action: 'cancel' })}>
                              {t('assignments.cancel')}
                            </Button>
                          </span>
                        )}
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </TableScroll>
        )}
      </Card>
      <ConfirmDialog
        message={confirming ? t(confirming.action === 'reject' ? 'assignments.rejectConfirm' : 'assignments.cancelConfirm', { count: confirming.request.records.length }) : null}
        danger
        pending={decide.isPending}
        error={decide.isError ? errorMessage(decide.error) : undefined}
        onConfirm={() => confirming && decide.mutate(confirming)}
        onClose={() => {
          setConfirming(null)
          decide.reset()
        }}
      />
    </>
  )
}
