import type { Cell, ParsedRow, RawSheet } from './spreadsheet'
import { PRODUCT_ROLES, RULE_STATUSES } from './types'
import type { ProductRow, RuleStatus } from './types'

/** TENANT-5: POST /platform/products takes at most this many rows at once. */
export const PRODUCT_BATCH = 500

/** The same rule as the API's PRODUCT_KEY. */
export const PRODUCT_CODE = /^[A-Za-z0-9._-]{1,30}$/

/** A header or a role as written, compared without case, Vietnamese marks, spaces or underscores. */
export const headerKey = (value: string): string =>
  value
    .normalize('NFD')
    .replace(/\p{Mark}/gu, '')
    .replace(/đ/gi, 'd')
    .toLowerCase()
    .replace(/[\s_]+/g, '')

type Field = keyof ProductRow

/** Section 19.9: the columns of 11_Products, by their header as written in the file. */
const COLUMNS: Record<string, Field> = {
  product_code: 'productCode',
  product_name: 'productName',
  product_role: 'productRole',
  category: 'category',
  min_entry_age: 'minEntryAge',
  max_entry_age: 'maxEntryAge',
  max_cover_age: 'maxCoverAge',
  gender: 'gender',
  waiting_period: 'waitingPeriod',
  key_benefits: 'keyBenefits',
  fit_rule: 'fitRule',
  trigger_event: 'triggerEvent',
  rule_status: 'ruleStatus',
}
const BY_KEY = new Map(Object.entries(COLUMNS).map(([header, field]) => [headerKey(header), field]))
export const REQUIRED_HEADERS = ['product_code', 'product_name', 'product_role'] as const

/** The API's limits on each text column. */
const MAX_LENGTH: Partial<Record<Field, number>> = {
  productName: 200,
  category: 100,
  gender: 30,
  waitingPeriod: 200,
  keyBenefits: 4000,
  fitRule: 4000,
  triggerEvent: 4000,
}
const ROLE_BY_KEY = new Map(PRODUCT_ROLES.map((role) => [headerKey(role), role]))

/** Why a row is left out; each has a label `products.problem.<reason>` in the catalogue. */
export type RowProblem = 'missingCode' | 'badCode' | 'missingName' | 'missingRole' | 'badRole' | 'badAge' | 'badRuleStatus' | 'tooLong' | 'duplicate'

export interface ProductFilePreview {
  /** The sheet the rows came from. */
  sheet: string
  /** Rows that hold anything below the header. */
  found: number
  /** Valid rows, ready to send. */
  rows: ProductRow[]
  /** Rows left out, with the Excel row number. */
  problems: { r: number; code: string | null; reasons: RowProblem[] }[]
  /** Required headers the sheet lacks; nothing can be read without them. */
  missingHeaders: string[]
}

/** Which product field each column holds, or null for a column that is not part of 11_Products. */
export const mapHeaders = (headers: readonly Cell[]): (Field | null)[] => headers.map((header) => (header === null ? null : (BY_KEY.get(headerKey(String(header))) ?? null)))

const text = (cell: Cell | undefined): string | null => {
  if (cell === null || cell === undefined) return null
  const value = String(cell).trim()
  return value === '' ? null : value
}

/** A whole number of years, 0-120; undefined when the cell holds something else. */
function age(cell: Cell | undefined): number | null | undefined {
  const value = text(cell)
  if (value === null) return null
  if (!/^\d{1,3}$/.test(value)) return undefined
  const years = Number(value)
  return years <= 120 ? years : undefined
}

/** Checks one data row; a row is sent only when it has no problem, so the API never sees a bad one. */
export function readProductRow(fields: readonly (Field | null)[], cells: readonly Cell[]): { row: ProductRow; reasons: RowProblem[] } {
  const value = (field: Field) => {
    const index = fields.indexOf(field)
    return index < 0 ? undefined : cells[index]
  }
  const reasons: RowProblem[] = []
  const code = text(value('productCode'))
  if (code === null) reasons.push('missingCode')
  else if (!PRODUCT_CODE.test(code)) reasons.push('badCode')
  const name = text(value('productName'))
  if (name === null) reasons.push('missingName')
  const roleText = text(value('productRole'))
  const role = roleText === null ? null : ROLE_BY_KEY.get(headerKey(roleText))
  if (roleText === null) reasons.push('missingRole')
  else if (!role) reasons.push('badRole')
  const ages = { minEntryAge: age(value('minEntryAge')), maxEntryAge: age(value('maxEntryAge')), maxCoverAge: age(value('maxCoverAge')) }
  if (Object.values(ages).some((years) => years === undefined)) reasons.push('badAge')
  const statusText = text(value('ruleStatus'))
  const ruleStatus = statusText === null ? undefined : RULE_STATUSES.find((status) => status === statusText.toUpperCase())
  if (statusText !== null && !ruleStatus) reasons.push('badRuleStatus')
  const row: ProductRow = {
    productCode: code ?? '',
    productName: name ?? '',
    productRole: role ?? '',
    category: text(value('category')),
    minEntryAge: ages.minEntryAge ?? null,
    maxEntryAge: ages.maxEntryAge ?? null,
    maxCoverAge: ages.maxCoverAge ?? null,
    gender: text(value('gender')),
    waitingPeriod: text(value('waitingPeriod')),
    keyBenefits: text(value('keyBenefits')),
    fitRule: text(value('fitRule')),
    triggerEvent: text(value('triggerEvent')),
    // Left out when blank, so an update keeps the status the product has
    ...(ruleStatus && { ruleStatus: ruleStatus as RuleStatus }),
  }
  const long = Object.entries(MAX_LENGTH).some(([field, max]) => {
    const current = row[field as Field]
    return typeof current === 'string' && current.length > max
  })
  if (long) reasons.push('tooLong')
  return { row, reasons }
}

/** The data rows below a header row, checked; a code repeated lower down is a problem. */
export function previewProducts(sheet: string, headers: readonly Cell[], rows: readonly ParsedRow[]): ProductFilePreview {
  const fields = mapHeaders(headers)
  const missingHeaders = REQUIRED_HEADERS.filter((header) => !fields.includes(COLUMNS[header]))
  const preview: ProductFilePreview = { sheet, found: rows.length, rows: [], problems: [], missingHeaders }
  if (missingHeaders.length > 0) return preview
  const seen = new Set<string>()
  for (const { r, cells } of rows) {
    const { row, reasons } = readProductRow(fields, cells)
    // The API refuses a request holding one code twice; the first row of a code wins
    if (row.productCode && seen.has(row.productCode)) reasons.push('duplicate')
    if (row.productCode) seen.add(row.productCode)
    if (reasons.length > 0) preview.problems.push({ r, code: row.productCode || null, reasons })
    else preview.rows.push(row)
  }
  return preview
}

/**
 * The sheet that holds 11_Products: the first whose header row (one of the first ten) has
 * product_code, preferring a sheet named like "Products". Null when no sheet has one.
 */
export function findProductSheet(sheets: readonly RawSheet[]): ProductFilePreview | null {
  const code = headerKey('product_code')
  const ordered = [...sheets].sort((a, b) => Number(!/product/i.test(a.name)) - Number(!/product/i.test(b.name)))
  for (const sheet of ordered) {
    const index = sheet.rows.slice(0, 10).findIndex((row) => row.cells.some((cell) => cell !== null && headerKey(String(cell)) === code))
    if (index >= 0) return previewProducts(sheet.name, sheet.rows[index].cells, sheet.rows.slice(index + 1))
  }
  return null
}

/** Reads an .xlsx or .csv in the browser; the spreadsheet library loads only when a file is picked. */
export async function readProductFile(file: File): Promise<ProductFilePreview | null> {
  const { readWorkbook } = await import('./spreadsheet')
  const csv = /\.(csv|txt)$/i.test(file.name)
  return findProductSheet(readWorkbook(csv ? await file.text() : await file.arrayBuffer()))
}

/** Rows in groups the API accepts in one request. */
export function batches<T>(rows: readonly T[], size = PRODUCT_BATCH): T[][] {
  const groups: T[][] = []
  for (let start = 0; start < rows.length; start += size) groups.push(rows.slice(start, start + size))
  return groups
}
