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

const cellText = (cell: unknown) => (cell === null || cell === undefined ? '' : String(cell))

function knownHeaders(columns: readonly LeadColumn[]): Map<string, string> {
  const known = new Map<string, string>()
  for (const column of columns) {
    for (const name of [column.header, ...column.aliases]) known.set(normalizeHeader(name), column.field)
  }
  return known
}

/** IMP-23: the row among the first ten that matches the most known headers. */
export function detectHeaderRow(sheet: RawSheet, columns: readonly LeadColumn[]): number {
  const known = knownHeaders(columns)
  let best = 0
  let bestScore = 0
  sheet.rows.slice(0, HEADER_SEARCH_ROWS).forEach((row, index) => {
    const score = row.cells.filter((cell) => known.has(normalizeHeader(cellText(cell)))).length
    if (score > bestScore) {
      best = index
      bestScore = score
    }
  })
  return best
}

export function headersAt(sheet: RawSheet, headerIndex: number): string[] {
  return (sheet.rows[headerIndex]?.cells ?? []).map((cell) => cellText(cell).trim())
}

export const rowsAfter = (sheet: RawSheet, headerIndex: number): ParsedRow[] => sheet.rows.slice(headerIndex + 1)

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
