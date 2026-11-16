import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { Download } from 'lucide-react'
import { Link, useParams } from 'react-router-dom'
import { Alert, Badge, Button, Card, Container, EmptyState, FilterBand, FilterField, Notice, PageHeader, Pagination, Select, Spinner, TableScroll } from '../components/ui'
import { buttonClass } from '../components/buttonStyles'
import type { BadgeTone } from '../components/ui'
import { formatDateTime, t, tDynamic } from '../i18n'
import { api, errorMessage } from '../lib/api'
import { keys, queries } from '../lib/queries'
import { toast } from '../lib/toast'
import type { ImportDetail, ImportProgress, ImportSheet } from '../lib/types'
import { useLeaveEmptyPage, useUrlState } from '../lib/useUrlState'

const SEVERITIES = ['error', 'warning', 'skipped']
/** Open question I: from this many rows the API writes a file batch by batch (BATCH_THRESHOLD). */
const BATCH_THRESHOLD = 2_000
const BATCH_SIZE = 500
/** Fallback refresh while a batched write runs, for a tab without a live socket. */
const COMMITTING_POLL_MS = 3_000
const pollWhileCommitting = (status?: string) => (status === 'COMMITTING' ? COMMITTING_POLL_MS : false)

/** Open question I: how far a batched write got, then which batches failed. */
function BatchProgress({ status, progress }: { status: string; progress: ImportProgress | null }) {
  if (!progress) return null
  if (status === 'COMMITTING') {
    const percent = progress.total > 0 ? Math.round((progress.done / progress.total) * 100) : 0
    return (
      <div className="space-y-2">
        <p className="text-caption text-ink-body" aria-live="polite">
          {progress.total > 0 ? t('imports.committing', { done: progress.done, total: progress.total }) : t('imports.committingStart')}
        </p>
        <div
          role="progressbar"
          aria-label={t('imports.progressLabel')}
          aria-valuemin={0}
          aria-valuemax={100}
          aria-valuenow={percent}
          className="h-2 overflow-hidden rounded-sm bg-band"
        >
          <div className="h-full bg-success transition-[width] duration-200 ease-out motion-reduce:transition-none" style={{ width: `${percent}%` }} />
        </div>
      </div>
    )
  }
  if (progress.failedBatches === 0) return null
  return <Alert>{t('imports.batchesFailed', { batches: progress.failedBatches, rows: progress.failedRows })}</Alert>
}

const IMPORT_STATUS_TONES: Record<string, BadgeTone> = {
  PARSING: 'muted',
  VALIDATED: 'warning',
  COMMITTING: 'info',
  COMMITTED: 'success',
  FAILED: 'danger',
}

const SHEET_STATUS_TONES: Record<string, BadgeTone> = {
  READY: 'info',
  BLOCKED: 'danger',
  LATER: 'muted',
  IGNORED: 'muted',
}

function SheetTable({ sheets }: { sheets: ImportSheet[] }) {
  return (
    <div className="overflow-x-auto">
      <table className="data-table min-w-[760px] table-fixed">
        <colgroup>
          <col />
          <col className="w-[200px]" />
          <col className="w-[80px]" />
          <col className="w-[80px]" />
          <col className="w-[90px]" />
          <col className="w-[110px]" />
          <col className="w-[100px]" />
          <col className="w-[100px]" />
        </colgroup>
        <thead>
          <tr>
            <th>{t('imports.sheet')}</th>
            <th>{t('imports.sheetStatus')}</th>
            <th>{t('imports.found')}</th>
            <th>{t('imports.inserted')}</th>
            <th>{t('imports.updated')}</th>
            <th>{t('imports.skipped')}</th>
            <th>{t('imports.rejected')}</th>
            <th>{t('imports.warnings')}</th>
          </tr>
        </thead>
        <tbody>
          {sheets.map((sheet) => (
            <tr key={sheet.name}>
              <td title={sheet.name} className="truncate font-medium text-ink">
                {sheet.name}
              </td>
              <td>
                <Badge tone={SHEET_STATUS_TONES[sheet.status]}>{tDynamic(`imports.sheetStatus.${sheet.status}`, sheet.status)}</Badge>
              </td>
              {sheet.status === 'READY' ? (
                <>
                  <td>{sheet.found}</td>
                  <td>{sheet.inserted}</td>
                  <td>{sheet.updated}</td>
                  <td>{sheet.skipped}</td>
                  <td className={sheet.rejected ? 'font-medium text-alert' : ''}>{sheet.rejected}</td>
                  <td>{sheet.warnings}</td>
                </>
              ) : (
                <td colSpan={6} className="text-ink-meta">
                  {sheet.reason ? tDynamic(`imports.reason.${sheet.reason}`, sheet.reason) : tDynamic(`imports.reason.${sheet.status}`, '')}
                </td>
              )}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}

function Actions({ detail }: { detail: ImportDetail }) {
  const queryClient = useQueryClient()
  const refresh = () =>
    Promise.all([queryClient.invalidateQueries({ queryKey: keys.imports }), queryClient.invalidateQueries({ queryKey: keys.agents }), queryClient.invalidateQueries({ queryKey: keys.leads })])
  const commit = useMutation({
    mutationFn: () => api.post<ImportDetail>(`/imports/${detail.id}/commit`),
    onSuccess: async (done) => {
      await refresh()
      if (done.status === 'COMMITTING') {
        toast.info(t('toast.importBatched', { file: detail.fileName }), t('toast.importBatchedDetail'))
        return
      }
      const written = done.sheets.reduce((sum, sheet) => sum + sheet.inserted + sheet.updated, 0)
      const refused = done.sheets.reduce((sum, sheet) => sum + sheet.rejected, 0)
      if (refused > 0) toast.warning(t('toast.importPartial', { written, refused }), t('toast.importPartialDetail'))
      else toast.success(t(detail.kind === 'LEADS' ? 'toast.importLeadsDone' : 'toast.importAgentsDone', { written }))
    },
    onError: (error) => toast.error(t('toast.importCommitFailed'), errorMessage(error)),
  })
  const cancel = useMutation({
    mutationFn: () => api.post(`/imports/${detail.id}/cancel`),
    onSuccess: async () => {
      await refresh()
      toast.info(t('toast.importCancelled', { file: detail.fileName }))
    },
    onError: (error) => toast.error(t('toast.importCancelFailed'), errorMessage(error)),
  })
  const counts = detail.sheets.reduce((sum, sheet) => sum + sheet.inserted + sheet.updated, 0)
  const open = detail.status === 'PARSING' || detail.status === 'VALIDATED'
  if (!detail.canCommit || !open) return null

  return (
    <>
      {detail.status === 'PARSING' && <Notice>{t('imports.incomplete')}</Notice>}
      <div className="flex flex-wrap items-center gap-2">
        {detail.status === 'VALIDATED' && (
          <Button disabled={commit.isPending || cancel.isPending || counts === 0} onClick={() => commit.mutate()}>
            {counts === 0 ? t('imports.nothingToWrite') : t('imports.commit', { count: counts })}
          </Button>
        )}
        <Button variant="secondary" disabled={commit.isPending || cancel.isPending} onClick={() => cancel.mutate()}>
          {t('imports.cancel')}
        </Button>
      </div>
    </>
  )
}

/** IMP-3 steps 4 and 5: the preview, with every problem listed, and the confirmation. */
export function ImportDetailPage() {
  const { id = '' } = useParams()
  const url = useUrlState()
  const { page } = url
  const severity = url.oneOf('severity', SEVERITIES)
  const detail = useQuery({ ...queries.importDetail(id), refetchInterval: (query) => pollWhileCommitting(query.state.data?.status) })
  const errors = useQuery({
    ...queries.importErrors(id, { page, pageSize: url.pageSize, severity }),
    refetchInterval: pollWhileCommitting(detail.data?.status),
  })
  useLeaveEmptyPage(url, errors.data?.items.length)

  if (detail.isPending) return <Spinner />
  if (detail.isError) {
    return (
      <Container className="py-6">
        <Alert>{errorMessage(detail.error)}</Alert>
      </Container>
    )
  }
  const { data } = detail
  const problems = data.errorsTotal + data.warningsTotal + data.skippedTotal

  return (
    <>
      <PageHeader
        title={data.fileName}
        subtitle={t('imports.summary', { date: data.snapshotDate.split('-').reverse().join('/'), user: data.userName ?? '-', at: formatDateTime(data.createdAt) })}
        action={<Badge tone={IMPORT_STATUS_TONES[data.status]}>{tDynamic(`imports.status.${data.status}`, data.status)}</Badge>}
      />
      <Container className="flex-none space-y-3 pb-4">
        <SheetTable sheets={data.sheets} />
        {data.status === 'VALIDATED' && <Notice>{t('imports.previewNotice')}</Notice>}
        {data.status === 'VALIDATED' && data.sheets.reduce((sum, sheet) => sum + sheet.found, 0) >= BATCH_THRESHOLD && (
          <Notice>{t('imports.batchNotice', { threshold: BATCH_THRESHOLD.toLocaleString('vi-VN'), size: BATCH_SIZE })}</Notice>
        )}
        <BatchProgress status={data.status} progress={data.progress} />
        <Actions detail={data} />
      </Container>

      {problems > 0 && (
        <>
          <FilterBand className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
            <FilterField label={t('imports.severity')} className="sm:w-56 sm:flex-none">
              <Select value={severity} onChange={(event) => url.set({ severity: event.target.value, page: null })}>
                <option value="">{t('imports.allSeverities', { count: problems })}</option>
                <option value="error">{t('imports.onlyErrors', { count: data.errorsTotal })}</option>
                <option value="warning">{t('imports.onlyWarnings', { count: data.warningsTotal })}</option>
                {data.skippedTotal > 0 && <option value="skipped">{t('imports.onlySkipped', { count: data.skippedTotal })}</option>}
              </Select>
            </FilterField>
            <a href={`/api/v1/imports/${data.id}/report.xlsx`} download className={buttonClass('secondary')}>
              <Download aria-hidden size={16} />
              {t('imports.downloadReport')}
            </a>
          </FilterBand>
          <Card>
            {errors.isPending && <Spinner />}
            {errors.isError && <Alert className="m-4">{errorMessage(errors.error)}</Alert>}
            {errors.data && errors.data.items.length === 0 && <EmptyState>{t('imports.noProblems')}</EmptyState>}
            {errors.data && errors.data.items.length > 0 && (
              <>
                <TableScroll loading={errors.isPlaceholderData}>
                  <table className="data-table min-w-[900px] table-fixed">
                    <colgroup>
                      <col className="w-[70px]" />
                      <col className="w-[190px]" />
                      <col className="w-[170px]" />
                      <col className="w-[100px]" />
                      <col />
                    </colgroup>
                    <thead>
                      <tr>
                        <th>{t('imports.row')}</th>
                        <th>{t('imports.column')}</th>
                        <th>{t('imports.recordKey')}</th>
                        <th>{t('imports.severity')}</th>
                        <th>{t('imports.message')}</th>
                      </tr>
                    </thead>
                    <tbody>
                      {errors.data.items.map((item) => (
                        <tr key={item.id}>
                          <td>{item.row}</td>
                          <td title={item.column ?? undefined} className="truncate">
                            {item.column ?? '-'}
                          </td>
                          <td title={item.recordKey ?? undefined} className="truncate">
                            {item.recordKey ?? '-'}
                          </td>
                          <td>
                            <Badge tone={item.severity === 'error' ? 'danger' : item.severity === 'warning' ? 'warning' : 'muted'}>{t(item.severity === 'error' ? 'imports.error' : item.severity === 'warning' ? 'imports.warning' : 'imports.skippedLabel')}</Badge>
                          </td>
                          <td className="whitespace-normal">{item.messageVi}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </TableScroll>
                <Pagination page={errors.data.page} pageSize={errors.data.pageSize} total={errors.data.total} onPage={url.setPage} onPageSize={url.setPageSize} />
              </>
            )}
          </Card>
        </>
      )}

      <Container className="flex-none py-3">
        <Link to={data.kind === 'LEADS' ? '/leads' : '/imports'} className="text-link text-primary hover:underline">
          {t(data.kind === 'LEADS' ? 'leads.back' : 'imports.backToHistory')}
        </Link>
      </Container>
    </>
  )
}
