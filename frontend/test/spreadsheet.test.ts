import { describe, expect, it } from 'vitest'
import { CFB, utils, write } from 'xlsx'
import type { CellObject, WorkSheet } from 'xlsx'
import { MAX_ROWS, parseWorkbook, pickCells } from '../src/lib/spreadsheet'

/** Builds a real .xlsx in memory, so these tests go through the same parser as a user's file. */
function workbook(sheets: Record<string, WorkSheet>, options: { date1904?: boolean } = {}): ArrayBuffer {
  const book = utils.book_new()
  for (const [name, sheet] of Object.entries(sheets)) utils.book_append_sheet(book, sheet, name)
  if (options.date1904) book.Workbook = { ...book.Workbook, WBProps: { date1904: true } }
  return write(book, { type: 'array', bookType: 'xlsx' }) as ArrayBuffer
}

const text = (v: string): CellObject => ({ t: 's', v })
const date = (serial: number, z = 'dd/mm/yyyy'): CellObject => ({ t: 'n', v: serial, z })

describe('parseWorkbook', () => {
  it('reads every sheet with its headers and Excel row numbers', () => {
    const sheets = parseWorkbook(
      workbook({
        '01_Agents': utils.aoa_to_sheet([
          ['Quản lý', 'Tư vấn tài chính'],
          ['', 'FC: 1-A'],
        ]),
        '12_Lookups': utils.aoa_to_sheet([['x']]),
      }),
    )
    expect(sheets.map((sheet) => sheet.name)).toEqual(['01_Agents', '12_Lookups'])
    expect(sheets[0].headers).toEqual(['Quản lý', 'Tư vấn tài chính'])
    expect(sheets[0].rows).toEqual([{ r: 2, cells: [null, 'FC: 1-A'] }])
    expect(sheets[1].rows).toEqual([])
  })

  it('DATA-1: text keeps its leading zeros; a number stays a number for the server to judge', () => {
    const [sheet] = parseWorkbook(workbook({ s: utils.aoa_to_sheet([['a', 'b'], ['0090001', 90001]]) }))
    expect(sheet.rows[0].cells).toEqual(['0090001', 90001])
  })

  it('DATA-2: a real Excel date becomes dd/mm/yyyy, without any timezone shift', () => {
    const sheet = utils.aoa_to_sheet([['d', 'e', 'f', 'g']])
    sheet.A2 = date(32888) // 15/01/1990
    sheet.B2 = date(45292, 'm/d/yy') // 01/01/2024, in the format US Excel uses
    sheet.C2 = date(45292.5, 'dd/mm/yyyy hh:mm') // midday
    sheet.D2 = date(45351) // 29/02/2024
    sheet['!ref'] = 'A1:D2'
    const [parsed] = parseWorkbook(workbook({ s: sheet }))
    expect(parsed.rows[0].cells).toEqual(['15/01/1990', '01/01/2024', '01/01/2024 12:00', '29/02/2024'])
  })

  it('keeps a date typed as text exactly as typed, including an impossible one', () => {
    const [sheet] = parseWorkbook(workbook({ s: utils.aoa_to_sheet([['d'], ['31/02/2024']]) }))
    expect(sheet.rows[0].cells).toEqual(['31/02/2024'])
  })

  it('a plain number with no date format is not mistaken for a date', () => {
    const [sheet] = parseWorkbook(workbook({ s: utils.aoa_to_sheet([['n'], [45292]]) }))
    expect(sheet.rows[0].cells).toEqual([45292])
  })

  it('skips empty rows but keeps the row numbers of the others', () => {
    const [sheet] = parseWorkbook(workbook({ s: utils.aoa_to_sheet([['a'], ['x'], [null], ['  '], ['y']]) }))
    expect(sheet.rows.map((row) => row.r)).toEqual([2, 5])
  })

  it('starts where the data starts, when a sheet has an empty column on the left', () => {
    const sheet: WorkSheet = { '!ref': 'B1:C2', B1: text('a'), C1: text('b'), B2: text('1'), C2: text('2') }
    const [parsed] = parseWorkbook(workbook({ s: sheet }))
    expect(parsed.headers).toEqual(['a', 'b'])
    expect(parsed.rows[0]).toEqual({ r: 2, cells: ['1', '2'] })
  })

  it('section 20.9: clips what the API would refuse, so one long cell cannot fail a whole chunk', () => {
    const long = 'x'.repeat(5000)
    const [sheet] = parseWorkbook(workbook({ s: utils.aoa_to_sheet([[long], [long]]) }))
    expect(sheet.headers[0]).toHaveLength(200)
    expect(sheet.rows[0].cells[0]).toHaveLength(4001)
  })

  it('reads booleans as text and formulas by their result', () => {
    const sheet: WorkSheet = {
      '!ref': 'A1:B2',
      A1: text('a'),
      B1: text('b'),
      A2: { t: 'b', v: true },
      B2: { t: 'n', v: 3, f: '1+2' },
    }
    const [parsed] = parseWorkbook(workbook({ s: sheet }))
    expect(parsed.rows[0].cells).toEqual(['TRUE', 3])
  })

  it('handles a sheet with nothing in it', () => {
    const [sheet] = parseWorkbook(workbook({ s: utils.aoa_to_sheet([]) }))
    expect(sheet.rows).toEqual([])
  })

  it('IMP-13: a declared range of a whole worksheet costs only the cells it holds', () => {
    // Writing such a range would itself loop over it, so the file's <dimension> is edited instead
    const zip = CFB.read(new Uint8Array(workbook({ s: utils.aoa_to_sheet([['a', 'b'], ['x', 'y']]) })), { type: 'array' })
    const entry = zip.FileIndex.find((_, index) => zip.FullPaths[index].endsWith('sheet1.xml'))!
    const xml = new TextDecoder().decode(entry.content as Uint8Array)
    entry.content = new TextEncoder().encode(xml.replace(/<dimension ref="[^"]*"\/>/, '<dimension ref="A1:XFD1048576"/>'))
    const file = Uint8Array.from(CFB.write(zip, { type: 'array', fileType: 'zip' }) as ArrayLike<number>).buffer
    const started = performance.now()
    const [parsed] = parseWorkbook(file)
    expect(performance.now() - started).toBeLessThan(2_000)
    expect(parsed.headers.slice(0, 2)).toEqual(['a', 'b'])
    expect(parsed.rows.map((row) => row.cells.slice(0, 2))).toEqual([['x', 'y']])
  })

  it('IMP-13: keeps one row past 20,000, enough for the server to refuse the file', () => {
    const rows = Array.from({ length: MAX_ROWS + 50 }, (_, index) => [`FC: ${index}`])
    const [parsed] = parseWorkbook(workbook({ s: utils.aoa_to_sheet([['h'], ...rows]) }))
    expect(parsed.rows).toHaveLength(MAX_ROWS + 1)
    expect(parsed.rows.at(-1)).toEqual({ r: MAX_ROWS + 2, cells: [`FC: ${MAX_ROWS}`] })
  })

  it('throws on a file that is not a spreadsheet, for the screen to report', () => {
    const notExcel = new TextEncoder().encode('PK\u0003\u0004 broken zip').buffer as ArrayBuffer
    expect(() => parseWorkbook(notExcel)).toThrow()
  })
})

describe('pickCells', () => {
  it('test 19: sends only the requested columns, so a banned column never leaves the browser', () => {
    const row = { r: 2, cells: ['012345678901', 'FC: 1-A', 'Đang hoạt động'] }
    expect(pickCells(row, [1, 2])).toEqual(['FC: 1-A', 'Đang hoạt động'])
    expect(JSON.stringify(pickCells(row, [1, 2]))).not.toContain('012345678901')
  })

  it('fills columns missing from a short row with null', () => {
    expect(pickCells({ r: 2, cells: ['a'] }, [0, 5])).toEqual(['a', null])
  })
})
