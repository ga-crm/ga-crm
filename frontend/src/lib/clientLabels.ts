import { formatVnd, t, tDynamic } from '../i18n'
import { COVERAGE_GROUPS } from './types'
import type { ClientPolicy, CoverageGroup, CoverageRow, PolicyRole } from './types'

export const groupLabel = (group: CoverageGroup) => tDynamic(`group.${group}`, group)
export const groupList = (groups: string) =>
  groups
    .split(',')
    .map((group) => groupLabel(group as CoverageGroup))
    .join(', ')

/** COV-4: what is known of one person's cover, in a few words for the family table. */
export function coverageSummary(row?: CoverageRow): string {
  if (!row || !row.hasDetail) return t('clients.coverageNoDetail')
  const groups = COVERAGE_GROUPS.filter((group) => row.groups[group] !== undefined)
  return groups.length > 0 ? groups.map(groupLabel).join(', ') : t('clients.coverageNone')
}

const ROLE_KEYS = { PO: 'clients.rolePO', LI: 'clients.roleLI', BEN: 'clients.roleBEN' } as const

/** CUS-11: a person's roles on a policy, short ("Bên mua BH, Người thụ hưởng"). */
export const rolesLabel = (roles: readonly PolicyRole[]) => roles.map((role) => t(ROLE_KEYS[role])).join(', ')

/** A policy someone is on, as lists show it: "HĐ 010000001 · Bên mua BH". */
export const policyRolesLabel = (policy: { policyNo: string; roles: readonly PolicyRole[] }) =>
  [t('clients.policyNo', { no: policy.policyNo }), rolesLabel(policy.roles)].filter(Boolean).join(' · ')

export const yesNo = (value: boolean | null) => (value === null ? null : t(value ? 'common.yes' : 'common.no'))
export const money = (value: number | null) => (value === null ? null : formatVnd(value))

/** Decided 25/11/2026: the main product line's sum assured, else the policy's own. */
export const policySumAssured = (policy: ClientPolicy) => policy.mainSumAssuredVnd ?? policy.sumAssuredVnd
