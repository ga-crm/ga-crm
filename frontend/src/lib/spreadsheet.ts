import { read, SSF, utils } from 'xlsx'
import type { CellObject, WorkSheet } from 'xlsx'

export type Cell = string | number | null

export interface ParsedRow {
  /** The row number the user sees in Excel. */
  r: number
  cells: Cell[]
}

export interface ParsedSheet {
  name: string
  headers: string[]
  rows: ParsedRow[]
}

// The limits of POST /imports (section 17.10)
const MAX_SHEETS = 30
const MAX_COLUMNS = 200
const MAX_HEADER_LENGTH = 200
const MAX_CELL_LENGTH = 4001
/**
 * IMP-13: an import stops at 20,000 rows. A sheet keeps its header and one row past the limit, so
 * the server still answers import_too_large, and a huge file cannot freeze the tab.
 */
export const MAX_ROWS = 20_000
const KEPT_ROWS = MAX_ROWS + 2

const pad = (part: number) => String(part).padStart(2, '0')

/** Excel stores a date as a number and only the format says so. This reads it without any timezone. */
function dateText(serial: number, date1904: boolean): string | null {
  const parts = SSF.parse_date_code(serial, { date1904 })
  if (!parts) return null
  const day = `${pad(parts.d)}/${pad(parts.m)}/${parts.y}`
  return parts.H || parts.M ? `${day} ${pad(parts.H)}:${pad(parts.M)}` : day
}

function cellValue(cell: CellObject | undefined, date1904: boolean): Cell {
  if (!cell || cell.v === undefined || cell.v === null) return null
  if (cell.t === 'n') {
    const value = cell.v as number
    return cell.z && SSF.is_date(cell.z as string) ? dateText(value, date1904) : value
  }
  if (cell.t === 's') {
    const text = String(cell.v).trim()
    return text ? text.slice(0, MAX_CELL_LENGTH) : null
  }
  if (cell.t === 'b') return cell.v ? 'TRUE' : 'FALSE'
  return null
}

/** A sheet as it is in the file: every non-empty row, including whichever one holds the headers. */
export interface RawSheet {
  name: string
  hidden: boolean
  rows: ParsedRow[]
  /**
   * Cells merged across columns, by Excel row number and the first and last column (as indexes of
   * `cells`). A GA's lead file heads a group of columns this way, such as "THÔNG TIN THÊM" over
   * EMAIL, TUỔI and SẢN PHẨM, with each column's own name in the row below.
   */
  merges?: { r: number; s: number; e: number }[]
}

/**
 * Walks the rows that hold cells (dense mode), never the range the file declares: a file can declare
 * A1:XFD1048576 around three cells, and looping over that range froze the tab.
 */
function readSheet(name: string, hidden: boolean, sheet: WorkSheet, date1904: boolean): RawSheet {
  const ref = sheet['!ref']
  const data = sheet['!data']
  if (!ref || !data) return { name, hidden, rows: [] }
  const range = utils.decode_range(ref)
  const merges = (sheet['!merges'] ?? [])
    .filter((merge) => merge.e.c > merge.s.c)
    .map((merge) => ({ r: merge.s.r + 1, s: merge.s.c - range.s.c, e: merge.e.c - range.s.c }))
  const lastColumn = Math.min(range.e.c, range.s.c + MAX_COLUMNS - 1)
  const rows: ParsedRow[] = []
  // forEach skips the holes of a sparse array, so only rows with cells cost anything
  data.forEach((line, row) => {
    if (rows.length >= KEPT_ROWS || !line) return
    const cells: Cell[] = []
    for (let column = range.s.c; column <= lastColumn; column++) cells.push(cellValue(line[column], date1904))
    if (cells.some((cell) => cell !== null)) rows.push({ r: row + 1, cells })
  })
  return { name, hidden, rows, merges }
}

/**
 * IMP-1: the file is read here, in the browser, and only template columns are sent on. A column the
 * server marks as banned therefore never leaves this computer (test 29).
 */
export function readWorkbook(data: ArrayBuffer | string): RawSheet[] {
  // A CSV is passed as text, already decoded as UTF-8, so Vietnamese marks survive without a BOM.
  // Its cells stay text (raw), so a code such as 0012 keeps its leading zeros.
  const text = typeof data === 'string'
  const workbook = read(data, { type: text ? 'string' : 'array', raw: text, cellNF: true, cellDates: false, cellHTML: false, dense: true })
  const date1904 = !!workbook.Workbook?.WBProps?.date1904
  const meta = workbook.Workbook?.Sheets ?? []
  return workbook.SheetNames.slice(0, MAX_SHEETS).map((name, index) => readSheet(name, !!meta[index]?.Hidden, workbook.Sheets[name], date1904))
}

/** Templates keep their headers in the first row of the sheet. */
export function parseWorkbook(data: ArrayBuffer): ParsedSheet[] {
  return readWorkbook(data).map(({ name, rows }) => {
    const [header, ...rest] = rows
    return {
      name,
      headers: (header?.cells ?? []).map((cell) => (cell === null ? '' : String(cell).slice(0, MAX_HEADER_LENGTH))),
      // A header row that is not the sheet's first still counts, because a blank row above it is skipped
      rows: rest,
    }
  })
}

/** The cells of one row, in the order the server asked for. */
export const pickCells = (row: ParsedRow, present: readonly number[]): Cell[] => present.map((index) => row.cells[index] ?? null)
