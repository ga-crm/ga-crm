import type { ParsedRow, RawSheet } from './spreadsheet'
import { pickCells } from './spreadsheet'

export interface LeadColumn {
  field: string
  header: string
  required: boolean
  aliases: string[]
}

/** Section 19.1: ignores case, extra spaces and composition form. */
export const normalizeHeader = (value: string): string => value.normalize('NFC').replace(/\s+/g, ' ').trim().toLowerCase()

const HEADER_SEARCH_ROWS = 10
/** How far below the header row a column's own name may sit, under a merged group header. */
const SUB_HEADER_ROWS = 2

const cellText = (cell: unknown) => (cell === null || cell === undefined ? '' : String(cell))

function knownHeaders(columns: readonly LeadColumn[]): Map<string, string> {
  const known = new Map<string, string>()
  for (const column of columns) {
    for (const name of [column.header, ...column.aliases]) known.set(normalizeHeader(name), column.field)
  }
  return known
}

export interface HeaderBlock {
  headers: string[]
  /** Cells below the header row that name a column (`<Excel row>:<column>`), so they are not data. */
  used: Set<string>
}

/**
 * IMP-23, for a GA's own lead file (decided 25/11/2026): the header may take two rows. A cell merged
 * across columns heads a group ("XỬ LÝ SAU", "THÔNG TIN THÊM") and each column's name sits in a row
 * below; a column with a blank header may also be named there. Only a known header name counts, so a
 * data value is never taken for one, and the name's cell is left out of the data.
 */
export function headerBlock(sheet: RawSheet, headerIndex: number, columns: readonly LeadColumn[]): HeaderBlock {
  const row = sheet.rows[headerIndex]
  const used = new Set<string>()
  if (!row) return { headers: [], used }
  const known = knownHeaders(columns)
  const below = sheet.rows.slice(headerIndex + 1, headerIndex + 1 + SUB_HEADER_ROWS)
  const grouped = (column: number) => (sheet.merges ?? []).some((merge) => merge.r === row.r && merge.s <= column && column <= merge.e)
  const width = Math.max(row.cells.length, ...below.map((line) => line.cells.length))
  const headers = Array.from({ length: width }, (_, column) => cellText(row.cells[column]).trim())
  // Only a row that names columns itself can be the top of a two-row header, not a title above it
  if (!headers.some((header) => known.has(normalizeHeader(header)))) return { headers: headers.slice(0, row.cells.length), used }
  headers.forEach((header, column) => {
    const group = grouped(column)
    if (header && !group) return
    for (const line of below) {
      const name = cellText(line.cells[column]).trim()
      if (name && known.has(normalizeHeader(name))) {
        headers[column] = name
        used.add(`${line.r}:${column}`)
        return
      }
    }
    // A group's label is not the name of the columns under it
    if (group) headers[column] = ''
  })
  return { headers, used }
}

/** IMP-23: the row among the first ten whose header (with any names below a group) matches the most known columns. */
export function detectHeaderRow(sheet: RawSheet, columns: readonly LeadColumn[]): number {
  const known = knownHeaders(columns)
  let best = 0
  let bestScore = 0
  sheet.rows.slice(0, HEADER_SEARCH_ROWS).forEach((_, index) => {
    const fields = new Set(headerBlock(sheet, index, columns).headers.flatMap((header) => known.get(normalizeHeader(header)) ?? []))
    if (fields.size > bestScore) {
      best = index
      bestScore = fields.size
    }
  })
  return best
}

export function headersAt(sheet: RawSheet, headerIndex: number, columns: readonly LeadColumn[] = []): string[] {
  return headerBlock(sheet, headerIndex, columns).headers
}

/** The rows under the header, without the cells that only name a column. */
export function rowsAfter(sheet: RawSheet, headerIndex: number, columns: readonly LeadColumn[] = []): ParsedRow[] {
  const { used } = headerBlock(sheet, headerIndex, columns)
  return sheet.rows.slice(headerIndex + 1).map((row) => (used.size === 0 ? row : { ...row, cells: row.cells.map((cell, column) => (used.has(`${row.r}:${column}`) ? null : cell)) }))
}

/** IMP-23: by name and alias, for the person to check. The first column wins when a file repeats a header. */
export function autoMapColumns(headers: readonly string[], columns: readonly LeadColumn[]): Record<string, number> {
  const known = knownHeaders(columns)
  const mapping: Record<string, number> = {}
  headers.forEach((header, index) => {
    const field = known.get(normalizeHeader(header))
    if (field && mapping[field] === undefined) mapping[field] = index
  })
  return mapping
}

/** Section 19.1: fields in template order, each with the file column to read it from. */
export function presentColumns(mapping: Readonly<Record<string, number>>, columns: readonly LeadColumn[]) {
  return columns.filter((column) => mapping[column.field] !== undefined)
}

/** IMP-24: the different values of the agent column, for matching one by one. */
export function distinctAgentValues(rows: readonly ParsedRow[], agentColumn: number | undefined): string[] {
  if (agentColumn === undefined) return []
  const values = new Set<string>()
  for (const row of rows) {
    const text = cellText(row.cells[agentColumn]).trim()
    if (text) values.add(text)
  }
  return [...values]
}

/** IMP-23: the sheet to start from: the template's or a GA's usual one, never an archive of old data (LEAD-39). */
export function pickLeadSheet(sheets: readonly RawSheet[]): RawSheet | undefined {
  const visible = sheets.filter((sheet) => !sheet.hidden)
  const named = (pattern: RegExp) => visible.find((sheet) => pattern.test(normalizeHeader(sheet.name)))
  return named(/^13_leads$/) ?? named(/chia lead/) ?? visible.find((sheet) => !/(^0\d_|^1[0-2]_|cũ|cu$)/.test(normalizeHeader(sheet.name))) ?? visible[0]
}

/**
 * IMP-1: only mapped columns are sent, and they are read in the order the server planned. Whatever
 * else the file holds, such as an ID card column, stays on this computer.
 */
export function rowsToSend(rows: readonly ParsedRow[], present: readonly number[]) {
  return rows.map((row) => ({ r: row.r, c: pickCells(row, present) })).filter((row) => row.c.some((cell) => cell !== null))
}
