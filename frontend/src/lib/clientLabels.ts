import { t, tDynamic } from '../i18n'
import { COVERAGE_GROUPS } from './types'
import type { CoverageGroup, CoverageRow } from './types'

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
