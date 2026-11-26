import { useQueryClient } from '@tanstack/react-query'
import { Download, FileSpreadsheet, PencilLine } from 'lucide-react'
import { useState } from 'react'
import type { DragEvent } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { hasPermission } from '../auth/access'
import { useMe } from '../auth/useMe'
import { Alert, Button, Container, Field, Input, PageHeader } from '../components/ui'
import { buttonClass } from '../components/buttonStyles'
import { t } from '../i18n'
import { api, errorMessage } from '../lib/api'
import { keys } from '../lib/queries'
import { parseWorkbook, pickCells } from '../lib/spreadsheet'
import type { ImportPlan } from '../lib/types'

/**
 * Decided 27/11/2026: "Dữ liệu" has one screen per kind of data: leads (their own page), clients and
 * their policies, agents and their activities. Each takes only its sheets of a Success workbook, so a
 * full file works on either; "all" stays for the import history's button.
 */
export type ImportScope = 'all' | 'clients' | 'agents'
const SCOPES: Record<ImportScope, { template: string; sheets: readonly string[] | null; title: 'imports.newTitle' | 'imports.clientsTitle' | 'imports.agentsTitle'; hint: 'imports.newHint' | 'imports.clientsHint' | 'imports.agentsHint' }> = {
  all: { template: '/api/v1/imports/templates/SUCCESS.xlsx', sheets: null, title: 'imports.newTitle', hint: 'imports.newHint' },
  clients: { template: '/api/v1/imports/templates/CLIENTS.xlsx', sheets: ['02_Clients', '03_Policies', '04_Policy_Products', '05_Applications'], title: 'imports.clientsTitle', hint: 'imports.clientsHint' },
  agents: { template: '/api/v1/imports/templates/AGENTS.xlsx', sheets: ['01_Agents', '07_Activities'], title: 'imports.agentsTitle', hint: 'imports.agentsHint' },
}
const CHUNK_SIZE = 500 // Section 17.10
const MAX_FILE_BYTES = 25 * 1024 * 1024

const today = () => new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Ho_Chi_Minh' }).format(new Date())

/** IMP-3: plan, send in chunks, check. Nothing is written until the next screen confirms it. */
export function ImportNewPage({ scope = 'all' }: { scope?: ImportScope }) {
  const config = SCOPES[scope]
  const { data: me } = useMe()
  const navigate = useNavigate()
  const queryClient = useQueryClient()
  const [file, setFile] = useState<File | null>(null)
  const [snapshotDate, setSnapshotDate] = useState(today)
  const [progress, setProgress] = useState<{ done: number; total: number } | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [dragging, setDragging] = useState(false)

  const choose = (chosen: File | undefined) => {
    setError(null)
    if (!chosen) return
    if (!chosen.name.toLowerCase().endsWith('.xlsx')) {
      setFile(null)
      setError(t('imports.wrongType'))
      return
    }
    if (chosen.size > MAX_FILE_BYTES) {
      setFile(null)
      setError(t('imports.tooBig'))
      return
    }
    setFile(chosen)
  }

  const run = async () => {
    if (!file) return
    setError(null)
    setProgress({ done: 0, total: 0 })
    let importId: string | null = null
    try {
      let sheets
      try {
        sheets = parseWorkbook(await file.arrayBuffer())
      } catch {
        setError(t('imports.unreadable'))
        setProgress(null)
        return
      }
      // This screen keeps only its own sheets of the workbook
      const wanted = config.sheets?.map((name) => name.toLowerCase())
      if (wanted) {
        sheets = sheets.filter((sheet) => wanted.includes(sheet.name.trim().toLowerCase()))
        if (sheets.length === 0) {
          setError(t('imports.noSheetHere', { sheets: config.sheets!.join(', ') }))
          setProgress(null)
          return
        }
      }

      const plan = await api.post<ImportPlan>('/imports', {
        fileName: file.name,
        snapshotDate,
        kind: 'SUCCESS',
        sheets: sheets.map(({ name, headers }) => ({ name, headers })),
      })
      importId = plan.id

      const work = plan.sheets
        .filter((sheet) => sheet.status === 'READY')
        .flatMap((sheet) => {
          const source = sheets.find((candidate) => candidate.name.trim().toLowerCase() === sheet.name.toLowerCase())
          // A row with data only in columns outside the template has nothing to send
          const rows = (source?.rows ?? []).map((row) => ({ r: row.r, c: pickCells(row, sheet.present) })).filter((row) => row.c.some((cell) => cell !== null))
          const chunks = []
          for (let start = 0; start < rows.length; start += CHUNK_SIZE) chunks.push({ sheet: sheet.name, rows: rows.slice(start, start + CHUNK_SIZE) })
          return chunks
        })

      const total = work.reduce((sum, chunk) => sum + chunk.rows.length, 0)
      let done = 0
      setProgress({ done, total })
      for (const chunk of work) {
        await api.post(`/imports/${plan.id}/rows`, chunk)
        done += chunk.rows.length
        setProgress({ done, total })
      }

      await api.post(`/imports/${plan.id}/validate`)
      await queryClient.invalidateQueries({ queryKey: keys.imports })
      navigate(`/imports/${plan.id}`, { replace: true })
    } catch (failure) {
      setError(errorMessage(failure))
      setProgress(null)
      // Half-sent rows must not wait around as an open import
      if (importId) await api.post(`/imports/${importId}/cancel`).catch(() => undefined)
    }
  }

  const running = progress !== null
  const onDrop = (event: DragEvent) => {
    event.preventDefault()
    setDragging(false)
    if (!running) choose(event.dataTransfer.files[0])
  }

  return (
    <>
      <PageHeader title={t(config.title)} subtitle={t(config.hint)} />
      <Container className="grid gap-6 pb-8 lg:grid-cols-2">
        <section className="rounded-lg bg-chrome p-5">
          <h2 className="text-subhead text-ink">{t('imports.optionFile')}</h2>
          <ol className="mt-3 mb-4 list-decimal space-y-1 pl-5 text-caption text-ink-list">
            <li>{t('imports.step1')}</li>
            <li>{t('imports.step2')}</li>
            <li>{t('imports.step3')}</li>
          </ol>
          <a href={config.template} download className={buttonClass('secondary')}>
            <Download aria-hidden size={16} />
            {t('imports.downloadTemplate')}
          </a>

          <label
            onDragOver={(event) => {
              event.preventDefault()
              setDragging(true)
            }}
            onDragLeave={() => setDragging(false)}
            onDrop={onDrop}
            className={`mt-5 flex cursor-pointer flex-col items-center gap-2 rounded-lg border border-dashed p-8 text-center ${dragging ? 'border-primary bg-band-blue' : 'border-hairline bg-canvas'}`}
          >
            <FileSpreadsheet aria-hidden size={28} className="text-ink-meta" />
            <span className="max-w-full truncate text-link text-ink-body">{file ? file.name : t('imports.dropHint')}</span>
            <span className="text-caption text-ink-meta">{t('imports.fileRules')}</span>
            <input type="file" accept=".xlsx" className="sr-only" disabled={running} aria-label={t('imports.chooseFile')} onChange={(event) => choose(event.target.files?.[0])} />
          </label>

          <div className="mt-4 max-w-xs">
            <Field label={t('imports.snapshotDate')} htmlFor="snapshot-date" required>
              <Input id="snapshot-date" type="date" value={snapshotDate} disabled={running} onChange={(event) => setSnapshotDate(event.target.value)} />
            </Field>
          </div>

          {error && <Alert className="mb-3">{error}</Alert>}
          {progress && (
            <div className="mb-3" role="status">
              <div className="h-1.5 overflow-hidden rounded-sm bg-band">
                <div className="h-full bg-primary transition-[width] duration-150 motion-reduce:transition-none" style={{ width: `${progress.total ? (progress.done / progress.total) * 100 : 0}%` }} />
              </div>
              <p className="mt-1 text-caption text-ink-meta">{t('imports.progress', { done: progress.done, total: progress.total })}</p>
            </div>
          )}
          <Button disabled={!file || !snapshotDate || running} onClick={() => void run()}>
            {running ? t('imports.checking') : t('imports.check')}
          </Button>
        </section>

        {scope === 'clients' ? (
          <section className="rounded-lg bg-chrome p-5">
            <h2 className="text-subhead text-ink">{t('imports.optionManualClient')}</h2>
            <p className="mt-3 mb-4 text-caption text-ink-list">{t('imports.manualClientHint')}</p>
            <Link to="/clients?create=1" className={buttonClass('secondary')}>
              <PencilLine aria-hidden size={16} />
              {t('clients.add')}
            </Link>
          </section>
        ) : (
          <section className="rounded-lg bg-chrome p-5">
            <h2 className="text-subhead text-ink">{t('imports.optionManual')}</h2>
            <p className="mt-3 mb-4 text-caption text-ink-list">{t(hasPermission(me, 'agents.edit_tree') ? 'imports.manualHint' : 'imports.manualNotAllowed')}</p>
            {hasPermission(me, 'agents.edit_tree') && (
              <Link to="/agents?create=1" className={buttonClass('secondary')}>
                <PencilLine aria-hidden size={16} />
                {t('agents.add')}
              </Link>
            )}
          </section>
        )}
      </Container>
    </>
  )
}

/** Decided 27/11/2026: "Nhập khách hàng". */
export const ClientImportPage = () => <ImportNewPage scope="clients" />
/** Decided 27/11/2026: "Nhập đại lý". */
export const AgentImportPage = () => <ImportNewPage scope="agents" />
