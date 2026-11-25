import { describe, expect, it } from 'vitest'
import { utils, write } from 'xlsx'
import { batches, findProductSheet, headerKey, previewProducts } from '../src/lib/productFile'
import { entryAgeLabel, filterProducts, matchProducts } from '../src/lib/products'
import { readWorkbook } from '../src/lib/spreadsheet'
import type { ProductView } from '../src/lib/types'

const HEADERS = ['product_code', 'product_name', 'product_role', 'category', 'min_entry_age', 'max_entry_age', 'max_cover_age', 'gender', 'waiting_period', 'key_benefits', 'fit_rule', 'trigger_event', 'rule_status']
const row = (r: number, cells: (string | number | null)[]) => ({ r, cells })

describe('11_Products file (TENANT-5)', () => {
  it('matches headers without case, Vietnamese marks, spaces or underscores', () => {
    expect(headerKey('Product_Code')).toBe(headerKey('product code'))
    expect(headerKey(' PRODUCT_ROLE ')).toBe('productrole')
    expect(headerKey('Bổ trợ')).toBe(headerKey('bo tro'))
  })

  it('reads a valid row, blank cells as null and roles as the catalogue writes them', () => {
    const preview = previewProducts('11_Products', HEADERS, [
      row(2, ['DEMO-HC-01', 'Bảo Hiểm Hỗ Trợ Viện Phí', 'bo tro', 'Sức khỏe', 0, '65', null, 'Nam, Nữ', '30 ngày', null, null, null, 'approved']),
    ])
    expect(preview.problems).toEqual([])
    expect(preview.rows).toEqual([
      {
        productCode: 'DEMO-HC-01',
        productName: 'Bảo Hiểm Hỗ Trợ Viện Phí',
        productRole: 'Bổ trợ',
        category: 'Sức khỏe',
        minEntryAge: 0,
        maxEntryAge: 65,
        maxCoverAge: null,
        gender: 'Nam, Nữ',
        waitingPeriod: '30 ngày',
        keyBenefits: null,
        fitRule: null,
        triggerEvent: null,
        ruleStatus: 'APPROVED',
      },
    ])
  })

  it('leaves out rows a request would refuse, saying why, so nothing invalid is sent', () => {
    const preview = previewProducts('11_Products', HEADERS, [
      row(2, [null, 'Không mã', 'Chính']),
      row(3, ['BAD CODE', 'Mã có dấu cách', 'Chính']),
      row(4, ['P1', null, null]),
      row(5, ['P2', 'Vai trò sai', 'Phụ']),
      row(6, ['P3', 'Tuổi sai', 'Chính', null, 'mười tám', 121]),
      row(7, ['P4', 'Trạng thái sai', 'Chính', null, null, null, null, null, null, null, null, null, 'LIVE']),
      row(8, ['P5', 'x'.repeat(201), 'Chính']),
      row(9, ['P6', 'Hợp lệ', 'Chính']),
      row(10, ['P6', 'Lặp mã', 'Chính']),
    ])
    expect(preview.found).toBe(9)
    expect(preview.rows.map((product) => product.productCode)).toEqual(['P6'])
    expect(preview.problems.map((problem) => [problem.r, problem.reasons])).toEqual([
      [2, ['missingCode']],
      [3, ['badCode']],
      [4, ['missingName', 'missingRole']],
      [5, ['badRole']],
      [6, ['badAge']],
      [7, ['badRuleStatus']],
      [8, ['tooLong']],
      [10, ['duplicate']],
    ])
  })

  it('a blank rule_status is left out, so an update keeps the status the product has', () => {
    const [product] = previewProducts('11_Products', HEADERS, [row(2, ['P1', 'A', 'Chính'])]).rows
    expect('ruleStatus' in product).toBe(false)
  })

  it('names the required columns a sheet lacks', () => {
    expect(previewProducts('Sheet1', ['product_code', 'category'], [row(2, ['P1', 'x'])]).missingHeaders).toEqual(['product_name', 'product_role'])
  })

  it('finds the 11_Products sheet and its header row in a whole Success workbook', () => {
    const book = utils.book_new()
    utils.book_append_sheet(book, utils.aoa_to_sheet([['agent_code'], ['00100001']]), '01_Agents')
    utils.book_append_sheet(book, utils.aoa_to_sheet([['Danh mục sản phẩm'], [], HEADERS, ['DEMO-ULP-01', 'An Phát Đầu Tư Thịnh Vượng', 'Chính']]), '11_Products')
    const preview = findProductSheet(readWorkbook(write(book, { type: 'array', bookType: 'xlsx' }) as ArrayBuffer))
    expect(preview?.sheet).toBe('11_Products')
    expect(preview?.rows.map((product) => [product.productCode, product.productRole])).toEqual([['DEMO-ULP-01', 'Chính']])
    expect(findProductSheet(readWorkbook('agent_code,name\n00100001,A\n'))).toBeNull()
  })

  it('a CSV keeps leading zeros in codes and Vietnamese marks without a BOM', () => {
    const preview = findProductSheet(readWorkbook('product_code,product_name,product_role,min_entry_age\n0012,Bảo Hiểm Tai Nạn,Bổ trợ,18\n'))
    expect(preview?.rows[0]).toMatchObject({ productCode: '0012', productName: 'Bảo Hiểm Tai Nạn', productRole: 'Bổ trợ', minEntryAge: 18 })
  })

  it('sends at most 500 rows per request', () => {
    expect(batches(Array.from({ length: 1001 }, (_, index) => index)).map((group) => group.length)).toEqual([500, 500, 1])
  })
})

const product = (productCode: string, productName: string, productRole = 'Chính'): ProductView => ({
  productCode,
  productName,
  productRole,
  category: null,
  minEntryAge: null,
  maxEntryAge: null,
  maxCoverAge: null,
  gender: null,
  waitingPeriod: null,
  keyBenefits: null,
  active: true,
})

describe('product search (TENANT-5)', () => {
  const catalogue = [product('BH_TAI_NAN_CAO_CAP', 'Bảo Hiểm Tai Nạn Cao Cấp', 'Bổ trợ'), product('DEMO-HOSP-01', 'Bảo Hiểm Hỗ Trợ Viện Phí', 'Bổ trợ'), product('DEMO-ULP-01', 'An Phát Đầu Tư Thịnh Vượng')]

  it('finds by name without marks, or by code, keeping the order by name', () => {
    expect(filterProducts(catalogue, 'vien phi').map((item) => item.productCode)).toEqual(['DEMO-HOSP-01'])
    expect(filterProducts(catalogue, 'demo').map((item) => item.productCode)).toEqual(['DEMO-HOSP-01', 'DEMO-ULP-01'])
    expect(filterProducts(catalogue, '  ')).toHaveLength(3)
  })

  it('a picker lists main products before riders', () => {
    expect(matchProducts(catalogue, '').map((item) => item.productCode)).toEqual(['DEMO-ULP-01', 'BH_TAI_NAN_CAO_CAP', 'DEMO-HOSP-01'])
  })

  it('says the entry ages the catalogue gives', () => {
    expect(entryAgeLabel({ minEntryAge: 18, maxEntryAge: 65 })).toBe('18 - 65 tuổi')
    expect(entryAgeLabel({ minEntryAge: 0, maxEntryAge: null })).toBe('Từ 0 tuổi')
    expect(entryAgeLabel({ minEntryAge: null, maxEntryAge: 60 })).toBe('Đến 60 tuổi')
    expect(entryAgeLabel({ minEntryAge: null, maxEntryAge: null })).toBeNull()
  })
})
