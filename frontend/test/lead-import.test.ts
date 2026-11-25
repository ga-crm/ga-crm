import { describe, expect, it } from 'vitest'
import { autoMapColumns, detectHeaderRow, distinctAgentValues, headersAt, pickLeadSheet, presentColumns, rowsAfter, rowsToSend } from '../src/lib/leadImport'
import type { LeadColumn } from '../src/lib/leadImport'
import type { RawSheet } from '../src/lib/spreadsheet'

const COLUMNS: LeadColumn[] = [
  { field: 'agentValue', header: 'Mã đại lý', required: false, aliases: ['TƯ VẤN', 'FC'] },
  { field: 'fullName', header: 'TÊN KHÁCH HÀNG', required: true, aliases: ['Họ tên'] },
  { field: 'phone', header: 'SỐ ĐIỆN THOẠI', required: true, aliases: ['Sđt'] },
  { field: 'source', header: 'Nguồn', required: true, aliases: [] },
]

const sheet = (name: string, rows: (string | number | null)[][], hidden = false): RawSheet => ({
  name,
  hidden,
  rows: rows.map((cells, index) => ({ r: index + 1, cells })),
})

describe('detectHeaderRow', () => {
  it('IMP-23: finds the header below a title block', () => {
    const file = sheet('Chia Lead', [['DANH SÁCH LEAD THÁNG 11'], [null, null], ['STT', 'Họ tên', 'sđt', 'NGUỒN'], [1, 'A', '0900000001', 'Web']])
    expect(detectHeaderRow(file, COLUMNS)).toBe(2)
  })

  it('takes the best match, not the first partial one', () => {
    const file = sheet('s', [['Nguồn', 'ghi chú'], ['Họ tên', 'Sđt', 'Nguồn']])
    expect(detectHeaderRow(file, COLUMNS)).toBe(1)
  })

  it('looks at the first ten rows only, and falls back to the first row', () => {
    const late = sheet('s', [...Array.from({ length: 10 }, () => ['x']), ['Họ tên', 'Sđt', 'Nguồn']])
    expect(detectHeaderRow(late, COLUMNS)).toBe(0)
  })
})

describe('autoMapColumns', () => {
  it('section 22.8: maps by name and alias, whatever the case and spacing', () => {
    expect(autoMapColumns(['  HỌ   TÊN', 'ghi chú', 'SĐT', 'nguồn', 'FC'], COLUMNS)).toEqual({ fullName: 0, phone: 2, source: 3, agentValue: 4 })
  })

  it('the first column wins when a header repeats', () => {
    expect(autoMapColumns(['Sđt', 'SỐ ĐIỆN THOẠI'], COLUMNS)).toEqual({ phone: 0 })
  })
})

describe('presentColumns', () => {
  it('keeps template order, whatever the order in the file', () => {
    expect(presentColumns({ source: 0, fullName: 5 }, COLUMNS).map((column) => column.field)).toEqual(['fullName', 'source'])
  })
})

describe('distinctAgentValues', () => {
  it('IMP-24: lists each value once, skipping blanks, and reads numeric codes as text', () => {
    const { rows } = sheet('s', [
      ['Minh', 1],
      ['  Minh ', 2],
      [null, 3],
      [9000001, 4],
    ])
    expect(distinctAgentValues(rows, 0)).toEqual(['Minh', '9000001'])
    expect(distinctAgentValues(rows, undefined)).toEqual([])
  })
})

describe('pickLeadSheet', () => {
  it('LEAD-36: prefers the lead sheet and never starts from an archive or a hidden sheet', () => {
    expect(pickLeadSheet([sheet('00_README', []), sheet('13_Leads', [])])?.name).toBe('13_Leads')
    expect(pickLeadSheet([sheet('Dữ Liệu cũ', []), sheet('Chia Lead', [])])?.name).toBe('Chia Lead')
    expect(pickLeadSheet([sheet('Dữ Liệu cũ', []), sheet('Tháng 11', [])])?.name).toBe('Tháng 11')
    expect(pickLeadSheet([sheet('Ẩn', [], true), sheet('Tháng 11', [])])?.name).toBe('Tháng 11')
  })
})

describe('rowsToSend', () => {
  it('IMP-1: an ID card column is not sent, whatever it holds, and Excel row numbers are kept', () => {
    const file = sheet('s', [
      ['Số CCCD', 'Họ tên', 'Sđt'],
      ['012345678901', 'A', '0900000001'],
      ['012345678902', null, null],
      ['012345678903', 'C', '0900000003'],
    ])
    const sent = rowsToSend(rowsAfter(file, 0), [1, 2])
    expect(sent).toEqual([
      { r: 2, c: ['A', '0900000001'] },
      { r: 4, c: ['C', '0900000003'] },
    ])
    expect(JSON.stringify(sent)).not.toContain('01234567890')
  })

  it('reads headers from the chosen row', () => {
    const file = sheet('s', [['tiêu đề'], [' Họ tên ', null, 5]])
    expect(headersAt(file, 1)).toEqual(['Họ tên', '', '5'])
  })
})

/**
 * Decided 25/11/2026: a GA's "Chia Lead" file heads groups of columns with merged cells ("XỬ LÝ SAU",
 * "THÔNG TIN THÊM") and names each column in a row below, which may also hold the first lead.
 */
describe('two-row headers', () => {
  const GROUPED: LeadColumn[] = [
    ...COLUMNS,
    { field: 'progressNote', header: 'TIẾN ĐỘ TƯ VẤN TVV', required: false, aliases: [] },
    { field: 'lostReason', header: 'LÝ DO CHỐT XỊT/ DỪNG TÌM HIỂU', required: false, aliases: [] },
    { field: 'email', header: 'EMAIL', required: false, aliases: [] },
    { field: 'extraInfo', header: 'THÔNG TIN THÊM', required: false, aliases: [] },
  ]
  // Columns: name, phone, source, progress, (blank), group "THÔNG TIN THÊM" over email + extra info
  const file: RawSheet = {
    name: 'Chia Lead',
    hidden: false,
    merges: [{ r: 1, s: 5, e: 6 }],
    rows: [
      { r: 1, cells: ['TÊN KHÁCH HÀNG', 'SỐ ĐIỆN THOẠI', 'Nguồn', 'TIẾN ĐỘ TƯ VẤN\nTVV', null, 'THÔNG TIN THÊM', null] },
      { r: 3, cells: ['Khách Một', 900000001, 'Web', 'Đã gọi', 'LÝ DO\nCHỐT XỊT/ DỪNG TÌM HIỂU', 'EMAIL', 'THÔNG TIN THÊM'] },
      { r: 4, cells: ['Khách Hai', '0900000002', 'Web', null, 'Đã mua bên khác', 'hai@example.com', 'Gọi buổi tối'] },
    ],
  }

  it('IMP-23: picks the group row, with the names below it, over the row that only names part of the columns', () => {
    expect(detectHeaderRow(file, GROUPED)).toBe(0)
  })

  it('names each grouped or blank column from the row below; the group label names nothing', () => {
    const headers = headersAt(file, 0, GROUPED)
    expect(headers).toEqual(['TÊN KHÁCH HÀNG', 'SỐ ĐIỆN THOẠI', 'Nguồn', 'TIẾN ĐỘ TƯ VẤN\nTVV', 'LÝ DO\nCHỐT XỊT/ DỪNG TÌM HIỂU', 'EMAIL', 'THÔNG TIN THÊM'])
    expect(autoMapColumns(headers, GROUPED)).toEqual({ fullName: 0, phone: 1, source: 2, progressNote: 3, lostReason: 4, email: 5, extraInfo: 6 })
  })

  it('keeps the first lead on the row of the names, without the names as data', () => {
    const rows = rowsAfter(file, 0, GROUPED)
    expect(rows[0].cells).toEqual(['Khách Một', 900000001, 'Web', 'Đã gọi', null, null, null])
    expect(rows[1].cells).toEqual(['Khách Hai', '0900000002', 'Web', null, 'Đã mua bên khác', 'hai@example.com', 'Gọi buổi tối'])
  })

  it('never takes a data value for a column name', () => {
    const plain: RawSheet = { name: 's', hidden: false, rows: [{ r: 1, cells: ['TÊN KHÁCH HÀNG', null] }, { r: 2, cells: ['Khách', 'ghi chú bất kỳ'] }] }
    expect(headersAt(plain, 0, GROUPED)).toEqual(['TÊN KHÁCH HÀNG', ''])
    expect(rowsAfter(plain, 0, GROUPED)[0].cells).toEqual(['Khách', 'ghi chú bất kỳ'])
  })
})
