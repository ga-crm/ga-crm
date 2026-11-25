import { describe, expect, it } from 'vitest'
import { CARE_BLOCKS, careRequired, programmeRows } from '../src/lib/clientCare'
import { CARE_RECORD_KINDS } from '../src/lib/types'
import type { ClientPolicy } from '../src/lib/types'

const policy = (patch: Partial<ClientPolicy>): ClientPolicy =>
  ({ policyNo: '000000001', status: 'Đang hiệu lực', active: true, insuredName: 'Khách', effectiveDate: '2024-06-01', sumAssuredVnd: null, products: [], ...patch }) as ClientPolicy
const line = (patch: Partial<ClientPolicy['products'][number]>) =>
  ({ productCode: 'P1', productName: 'Sản phẩm 1', catalogueName: null, productRole: 'Chính', insuredName: 'Khách', sumAssuredVnd: 500, annualPremiumVnd: 10, status: null, startDate: null, group: 'LIFE', ...patch }) as ClientPolicy['products'][number]

describe('care records (decided 26/11/2026)', () => {
  it('every kind sits in exactly one block', () => {
    const placed = CARE_BLOCKS.flatMap((block) => [...block.kinds])
    expect([...placed].sort()).toEqual([...CARE_RECORD_KINDS].sort())
  })

  it('a claim says where, a gift what, cash on signing how much', () => {
    expect(careRequired('CLAIM')).toEqual({ title: false, place: true, amount: false })
    expect(careRequired('GIFT')).toEqual({ title: true, place: false, amount: false })
    expect(careRequired('SIGNING_GIFT').title).toBe(true)
    expect(careRequired('SIGNING_CASH')).toEqual({ title: false, place: false, amount: true })
    expect(careRequired('SEMINAR')).toEqual({ title: false, place: false, amount: false })
  })
})

describe('programmeRows (decided 26/11/2026)', () => {
  it('one row per product line, policies in force first; a line follows its policy for status and start', () => {
    const rows = programmeRows([
      policy({ policyNo: '000000002', active: false, status: 'Mất hiệu lực', products: [line({ productCode: 'OLD' })] }),
      policy({ products: [line({ catalogueName: 'Tên Danh Mục' }), line({ productCode: 'P2', productName: null, status: 'Đã hủy', startDate: '2025-01-01' })] }),
    ])
    expect(rows.map((row) => [row.policyNo, row.productCode])).toEqual([
      ['000000001', 'P1'],
      ['000000001', 'P2'],
      ['000000002', 'OLD'],
    ])
    expect(rows[0]).toMatchObject({ name: 'Tên Danh Mục', inCatalogue: true, status: 'Đang hiệu lực', startDate: '2024-06-01' })
    expect(rows[1]).toMatchObject({ name: 'P2', inCatalogue: false, status: 'Đã hủy', startDate: '2025-01-01' })
  })

  it('COV-4: a policy without product detail keeps a row', () => {
    expect(programmeRows([policy({ sumAssuredVnd: 900 })])).toEqual([expect.objectContaining({ policyNo: '000000001', productCode: null, sumAssuredVnd: 900, insuredName: 'Khách' })])
  })
})
