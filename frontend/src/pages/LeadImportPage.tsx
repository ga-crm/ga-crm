import { useQuery, useQueryClient } from '@tanstack/react-query'
import { Download, FileSpreadsheet, PencilLine } from 'lucide-react'
import { useEffect, useMemo, useState } from 'react'
import type { DragEvent } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { buttonClass } from '../components/buttonStyles'
import { Alert, Button, Container, Field, Input, Notice, PageHeader, Select, Spinner } from '../components/ui'
import { t } from '../i18n'
import { api, errorMessage } from '../lib/api'
import { autoMapColumns, detectHeaderRow, distinctAgentValues, headersAt, pickLeadSheet, rowsAfter, rowsToSend } from '../lib/leadImport'
import { keys, queries } from '../lib/queries'
import { readWorkbook } from '../lib/spreadsheet'
import type { RawSheet } from '../lib/spreadsheet'
import type { ImportPlan } from '../lib/types'

const TEMPLATE_URL = '/api/v1/imports/templates/LEADS.xlsx'
const CHUNK_SIZE = 500 // Section 17.10
const MAX_FILE_BYTES = 25 * 1024 * 1024
const NOT_MAPPED = ''

const today = () => new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Ho_Chi_Minh' }).format(new Date())

/** Section 16.5: file, sheet, header row, columns, agents, then upload and check. */
export function LeadImportPage() {
  const navigate = useNavigate()
  const queryClient = useQueryClient()
  const setup = useQuery(queries.leadImportSetup())
  const columns = useMemo(() => setup.data?.columns ?? [], [setup.data])

  const [fileName, setFileName] = useState<string | null>(null)
  const [sheets, setSheets] = useState<RawSheet[]>([])
  const [sheetName, setSheetName] = useState('')
  const [headerIndex, setHeaderIndex] = useState(0)
  const [mapping, setMapping] = useState<Record<string, number>>({})
  const [agentChoices, setAgentChoices] = useState<Record<string, string>>({})
  const [snapshotDate, setSnapshotDate] = useState(today)
  const [progress, setProgress] = useState<{ done: number; total: number } | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [dragging, setDragging] = useState(false)

  const sheet = sheets.find((item) => item.name === sheetName)
  const headers = useMemo(() => (sheet ? headersAt(sheet, headerIndex, columns) : []), [sheet, headerIndex, columns])
  const dataRows = useMemo(() => (sheet ? rowsAfter(sheet, headerIndex, columns) : []), [sheet, headerIndex, columns])
  const agentValues = useMemo(() => distinctAgentValues(dataRows, mapping.agentValue), [dataRows, mapping.agentValue])
  const missing = columns.filter((column) => column.required && mapping[column.field] === undefined)

  const applySheet = (next: RawSheet) => {
    const index = detectHeaderRow(next, columns)
    setSheetName(next.name)
    setHeaderIndex(index)
    setMapping(autoMapColumns(headersAt(next, index, columns), columns))
  }

  const choose = async (chosen: File | undefined) => {
    setError(null)
    if (!chosen) return
    if (!chosen.name.toLowerCase().endsWith('.xlsx')) {
      setError(t('imports.wrongType'))
      return
    }
    if (chosen.size > MAX_FILE_BYTES) {
      setError(t('imports.tooBig'))
      return
    }
    try {
      const parsed = readWorkbook(await chosen.arrayBuffer())
      const first = pickLeadSheet(parsed)
      if (!first) {
        setError(t('imports.unreadable'))
        return
      }
      setFileName(chosen.name)
      setSheets(parsed)
      applySheet(first)
    } catch {
      setFileName(null)
      setSheets([])
      setError(t('imports.unreadable'))
    }
  }

  // IMP-24: automatic matches, which the person can change below
  const valuesKey = agentValues.join('\n')
  useEffect(() => {
    if (agentValues.length === 0) return
    let cancelled = false
    void api
      .post<{ matches: { value: string; agentCode: string | null }[] }>('/imports/lead-agents/match', { values: agentValues })
      .then(({ matches }) => {
        if (!cancelled) setAgentChoices(Object.fromEntries(matches.map(({ value, agentCode }) => [value, agentCode ?? NOT_MAPPED])))
      })
      .catch((failure: unknown) => {
        if (!cancelled) setError(errorMessage(failure))
      })
    return () => {
      cancelled = true
    }
    // valuesKey stands for agentValues, which is a new array when the rows are recomputed
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [valuesKey])

  const run = async () => {
    if (!sheet || !fileName) return
    setError(null)
    setProgress({ done: 0, total: 0 })
    let importId: string | null = null
    try {
      const plan = await api.post<ImportPlan>('/imports', {
        fileName,
        snapshotDate,
        kind: 'LEADS',
        sheets: [{ name: sheet.name, headers }],
        mapping: {
          columns: mapping,
          agents: agentValues.map((value) => ({ value, agentCode: agentChoices[value] || null })),
        },
      })
      importId = plan.id
      const planned = plan.sheets[0]
      if (planned.status === 'READY') {
        const rows = rowsToSend(dataRows, planned.present)
        let done = 0
        setProgress({ done, total: rows.length })
        for (let start = 0; start < rows.length; start += CHUNK_SIZE) {
          const chunk = rows.slice(start, start + CHUNK_SIZE)
          await api.post(`/imports/${plan.id}/rows`, { sheet: planned.name, rows: chunk })
          done += chunk.length
          setProgress({ done, total: rows.length })
        }
      }
      await api.post(`/imports/${plan.id}/validate`)
      await queryClient.invalidateQueries({ queryKey: keys.imports })
      navigate(`/imports/${plan.id}`, { replace: true })
    } catch (failure) {
      setError(errorMessage(failure))
      setProgress(null)
      if (importId) await api.post(`/imports/${importId}/cancel`).catch(() => undefined)
    }
  }

  const running = progress !== null
  const onDrop = (event: DragEvent) => {
    event.preventDefault()
    setDragging(false)
    if (!running) void choose(event.dataTransfer.files[0])
  }

  return (
    <>
      <PageHeader title={t('leadImport.title')} subtitle={t('leadImport.hint')} />
      <Container className="space-y-6 pb-8">
        <div className="grid gap-6 lg:grid-cols-2">
          <section className="rounded-lg bg-chrome p-5">
            <h2 className="text-subhead text-ink">{t('imports.optionFile')}</h2>
            <ol className="mt-3 mb-4 list-decimal space-y-1 pl-5 text-caption text-ink-list">
              <li>{t('leadImport.step1')}</li>
              <li>{t('leadImport.step2')}</li>
              <li>{t('imports.step3')}</li>
            </ol>
            <a href={TEMPLATE_URL} download className={buttonClass('secondary')}>
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
              <span className="max-w-full truncate text-link text-ink-body">{fileName ?? t('imports.dropHint')}</span>
              <span className="text-caption text-ink-meta">{t('imports.fileRules')}</span>
              <input type="file" accept=".xlsx" className="sr-only" disabled={running || !setup.data} aria-label={t('imports.chooseFile')} onChange={(event) => void choose(event.target.files?.[0])} />
            </label>
          </section>
          <section className="rounded-lg bg-chrome p-5">
            <h2 className="text-subhead text-ink">{t('leadImport.optionManual')}</h2>
            <p className="mt-3 mb-4 text-caption text-ink-list">{t('leadImport.manualHint')}</p>
            <Link to="/leads?create=1" className={buttonClass('secondary')}>
              <PencilLine aria-hidden size={16} />
              {t('leads.add')}
            </Link>
          </section>
        </div>

        {setup.isPending && <Spinner />}
        {setup.isError && <Alert>{errorMessage(setup.error)}</Alert>}
        {error && <Alert>{error}</Alert>}

        {sheet && (
          <>
            <section>
              <h2 className="mb-3 text-subhead text-ink">{t('leadImport.sheetSection')}</h2>
              <div className="grid gap-x-4 sm:grid-cols-3">
                <Field label={t('leadImport.sheet')} htmlFor="lead-sheet">
                  <Select
                    id="lead-sheet"
                    value={sheetName}
                    disabled={running}
                    onChange={(event) => {
                      const next = sheets.find((item) => item.name === event.target.value)
                      if (next) applySheet(next)
                    }}
                  >
                    {sheets
                      .filter((item) => !item.hidden)
                      .map((item) => (
                        <option key={item.name} value={item.name}>
                          {item.name}
                        </option>
                      ))}
                  </Select>
                </Field>
                <Field label={t('leadImport.headerRow')} htmlFor="lead-header">
                  <Select
                    id="lead-header"
                    value={headerIndex}
                    disabled={running}
                    onChange={(event) => {
                      const index = Number(event.target.value)
                      setHeaderIndex(index)
                      setMapping(autoMapColumns(headersAt(sheet, index, columns), columns))
                    }}
                  >
                    {sheet.rows.slice(0, 10).map((row, index) => (
                      <option key={row.r} value={index}>
                        {t('leadImport.rowOption', { row: row.r, text: row.cells.filter((cell) => cell !== null).slice(0, 3).join(', ') })}
                      </option>
                    ))}
                  </Select>
                </Field>
                <Field label={t('imports.snapshotDate')} htmlFor="lead-snapshot" required>
                  <Input id="lead-snapshot" type="date" value={snapshotDate} disabled={running} onChange={(event) => setSnapshotDate(event.target.value)} />
                </Field>
              </div>
            </section>

            <section>
              <h2 className="mb-1 text-subhead text-ink">{t('leadImport.columnSection')}</h2>
              <p className="mb-3 text-caption text-ink-meta">{t('leadImport.columnHint', { rows: dataRows.length })}</p>
              <div className="overflow-x-auto">
                <table className="data-table min-w-[720px] table-fixed">
                  <colgroup>
                    <col className="w-[260px]" />
                    <col className="w-[260px]" />
                    <col />
                  </colgroup>
                  <thead>
                    <tr>
                      <th>{t('leadImport.field')}</th>
                      <th>{t('leadImport.fileColumn')}</th>
                      <th>{t('leadImport.sample')}</th>
                    </tr>
                  </thead>
                  <tbody>
                    {columns.map((column) => {
                      const index = mapping[column.field]
                      const sample = index === undefined ? undefined : dataRows.find((row) => row.cells[index] !== null && row.cells[index] !== undefined)?.cells[index]
                      return (
                        <tr key={column.field}>
                          <td className="truncate">
                            {column.header}
                            {column.required && (
                              <span aria-hidden className="ml-0.5 text-alert">
                                *
                              </span>
                            )}
                          </td>
                          <td>
                            <Select
                              aria-label={column.header}
                              value={index ?? NOT_MAPPED}
                              disabled={running}
                              onChange={(event) =>
                                setMapping((current) => {
                                  const next = { ...current }
                                  if (event.target.value === NOT_MAPPED) delete next[column.field]
                                  else next[column.field] = Number(event.target.value)
                                  return next
                                })
                              }
                            >
                              <option value={NOT_MAPPED}>{t('leadImport.notMapped')}</option>
                              {headers.map((header, position) =>
                                header ? (
                                  <option key={position} value={position}>
                                    {header}
                                  </option>
                                ) : null,
                              )}
                            </Select>
                          </td>
                          <td title={sample === undefined ? undefined : String(sample)} className="truncate text-ink-meta">
                            {sample === undefined ? '-' : String(sample)}
                          </td>
                        </tr>
                      )
                    })}
                  </tbody>
                </table>
              </div>
            </section>

            {agentValues.length > 0 && (
              <section>
                <h2 className="mb-1 text-subhead text-ink">{t('leadImport.agentSection')}</h2>
                <p className="mb-3 text-caption text-ink-meta">{t('leadImport.agentHint')}</p>
                <ul className="grid gap-x-6 gap-y-2 md:grid-cols-2">
                  {agentValues.map((value) => (
                    <li key={value} className="grid grid-cols-[minmax(0,1fr)_minmax(0,1.4fr)] items-center gap-3 text-caption">
                      <span title={value} className="truncate text-ink-body">
                        {value}
                      </span>
                      <Select aria-label={value} value={agentChoices[value] ?? NOT_MAPPED} disabled={running} onChange={(event) => setAgentChoices((current) => ({ ...current, [value]: event.target.value }))}>
                        <option value={NOT_MAPPED}>{t('leads.unassigned')}</option>
                        {setup.data?.agents.map((agent) => (
                          <option key={agent.agentCode} value={agent.agentCode}>
                            {agent.name} ({agent.agentCode})
                          </option>
                        ))}
                      </Select>
                    </li>
                  ))}
                </ul>
              </section>
            )}

            <section className="space-y-3">
              {missing.length > 0 && <Notice>{t('leadImport.missing', { columns: missing.map((column) => column.header).join(', ') })}</Notice>}
              {progress && (
                <div role="status">
                  <div className="h-1.5 overflow-hidden rounded-sm bg-band">
                    <div className="h-full bg-primary transition-[width] duration-150 motion-reduce:transition-none" style={{ width: `${progress.total ? (progress.done / progress.total) * 100 : 0}%` }} />
                  </div>
                  <p className="mt-1 text-caption text-ink-meta">{t('imports.progress', { done: progress.done, total: progress.total })}</p>
                </div>
              )}
              <Button disabled={missing.length > 0 || !snapshotDate || running} onClick={() => void run()}>
                {running ? t('imports.checking') : t('imports.check')}
              </Button>
            </section>
          </>
        )}
      </Container>
    </>
  )
}
