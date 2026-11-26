import type { CareRecordKind, ClientPolicy } from './types'

/**
 * Decided 26/11/2026: the care a GA records, as the client page groups it. Each block takes one or
 * two kinds of record; cash and gifts on signing sit together so their totals can be told apart.
 */
export const CARE_BLOCKS = [
  { key: 'claims', kinds: ['CLAIM'] },
  { key: 'events', kinds: ['SEMINAR', 'HEALTH_CHECK'] },
  { key: 'gifts', kinds: ['GIFT', 'VISIT'] },
  { key: 'signing', kinds: ['SIGNING_CASH', 'SIGNING_GIFT'] },
] as const satisfies readonly { key: string; kinds: readonly CareRecordKind[] }[]
export type CareBlockKey = (typeof CARE_BLOCKS)[number]['key']

/** What a kind must say, as the API checks it: a claim where, a gift what, cash on signing how much. */
export function careRequired(kind: CareRecordKind): { title: boolean; place: boolean; amount: boolean } {
  return { title: kind === 'GIFT' || kind === 'SIGNING_GIFT', place: kind === 'CLAIM', amount: kind === 'SIGNING_CASH' }
}

export interface ProgrammeRow {
  key: string
  policyNo: string
  policyActive: boolean
  /** Null for a policy with no product detail yet (COV-4). */
  productCode: string | null
  name: string | null
  /** The catalogue has the product, so its page exists (TENANT-5). */
  inCatalogue: boolean
  insuredName: string | null
  group: ClientPolicy['products'][number]['group'] | null
  role: string | null
  sumAssuredVnd: number | null
  annualPremiumVnd: number | null
  status: string | null
  startDate: string | null
}

/**
 * Decided 26/11/2026: every programme (product line) on the client's policies, one row each, policies
 * in force first. A policy with no product detail keeps one row, so it is not lost from the list.
 */
export function programmeRows(policies: readonly ClientPolicy[]): ProgrammeRow[] {
  return [...policies]
    .sort((a, b) => Number(b.active) - Number(a.active))
    .flatMap<ProgrammeRow>((policy) => {
      const base = { policyNo: policy.policyNo, policyActive: policy.active }
      if (policy.products.length === 0)
        return [
          { ...base, key: policy.policyNo, productCode: null, name: null, inCatalogue: false, insuredName: policy.insuredName, group: null, role: null, sumAssuredVnd: policy.sumAssuredVnd, annualPremiumVnd: null, status: policy.status, startDate: policy.effectiveDate },
        ]
      return policy.products.map((product, index) => ({
        ...base,
        key: `${policy.policyNo}-${index}`,
        productCode: product.productCode,
        name: product.catalogueName ?? product.productName ?? product.productCode,
        inCatalogue: !!product.catalogueName,
        insuredName: product.insuredName,
        group: product.group,
        role: product.productRole,
        sumAssuredVnd: product.sumAssuredVnd,
        annualPremiumVnd: product.annualPremiumVnd,
        // A line without its own status or start date follows its policy
        status: product.status ?? policy.status,
        startDate: product.startDate ?? policy.effectiveDate,
      }))
    })
}
