/**
 * Home charts: how each chart can be ordered, and the helpers that order and fold its rows.
 * The order lives in the URL (only a non-default one), so a reload or a shared link keeps it.
 */

/** How each chart can be ordered; the first is the default and never goes in the URL. */
export const CHART_SORTS = {
  /** Pipeline: the stage order of the funnel, or by count or value. */
  stageSort: ['stage', 'count', 'value'],
  /** Sources: most leads first, most won first, or by name. */
  sourceSort: ['count', 'won', 'name'],
  /** Agents: most open leads first, most contacted first, or by name. */
  agentSort: ['open', 'contacted', 'name'],
  /** Platform: GAs with the most users first, or by name. */
  gaSort: ['users', 'name'],
} as const
export type ChartSortParam = keyof typeof CHART_SORTS
export type ChartSort<K extends ChartSortParam> = (typeof CHART_SORTS)[K][number]

export const DASHBOARD_DAYS = ['7', '30', '90'] as const
export const DEFAULT_DAYS = '30'

/** At most this many bars; the rest fold into one "Khác" bar so the chart stays readable. */
export const MAX_BARS = 10

export interface ChartRow {
  key: string
  label: string
  values: number[]
}

/**
 * Orders rows by one of their values (largest first) or by label (A to Z, Vietnamese order),
 * keeping the given order for `natural`. Ties fall back to the label, so the order is stable.
 */
export function sortRows(rows: ChartRow[], by: { kind: 'natural' } | { kind: 'label' } | { kind: 'value'; index: number }): ChartRow[] {
  if (by.kind === 'natural') return rows
  const byLabel = (a: ChartRow, b: ChartRow) => a.label.localeCompare(b.label, 'vi')
  if (by.kind === 'label') return [...rows].sort(byLabel)
  return [...rows].sort((a, b) => b.values[by.index] - a.values[by.index] || byLabel(a, b))
}

/**
 * Keeps the MAX_BARS - 1 largest rows by `index` and adds the rest up as one `other` row, then
 * hands back the kept rows in the order asked for. Nothing is folded when the rows fit.
 */
export function foldRows(rows: ChartRow[], index: number, other: string, max = MAX_BARS): { kept: ChartRow[]; folded: number } {
  if (rows.length <= max) return { kept: rows, folded: 0 }
  const largest = sortRows(rows, { kind: 'value', index })
  const top = new Set(largest.slice(0, max - 1).map((row) => row.key))
  const rest = rows.filter((row) => !top.has(row.key))
  const sum = rest[0].values.map((_, at) => rest.reduce((total, row) => total + row.values[at], 0))
  return { kept: [...rows.filter((row) => top.has(row.key)), { key: '__other', label: other, values: sum }], folded: rest.length }
}

/** YYYY-MM-DD as dd/mm, the way the rest of the app writes short dates. */
export const shortDay = (day: string) => `${day.slice(8, 10)}/${day.slice(5, 7)}`

/**
 * How a metric moved against the period before: the change in percent, or in units when the
 * period before had none (a percent of zero means nothing).
 */
export function trendOf(now: number, before: number): { direction: 'up' | 'down' | 'flat'; percent: number | null; delta: number } {
  const delta = now - before
  const direction = delta > 0 ? 'up' : delta < 0 ? 'down' : 'flat'
  return { direction, percent: before === 0 ? null : Math.round((Math.abs(delta) / Math.abs(before)) * 100), delta }
}
