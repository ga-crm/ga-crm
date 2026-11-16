import { describe, expect, it } from 'vitest'
import { foldRows, shortDay, sortRows, trendOf, type ChartRow } from '../src/lib/dashboard'

const row = (key: string, ...values: number[]): ChartRow => ({ key, label: key, values })

describe('home chart rows', () => {
  const rows = [row('Zalo', 3, 1), row('Facebook', 9, 2), row('Ấn Độ', 3, 5), row('Website', 1, 0)]

  it('keeps the given order, or sorts by a value (largest first, ties by name) or by name in Vietnamese order', () => {
    expect(sortRows(rows, { kind: 'natural' }).map((item) => item.key)).toEqual(['Zalo', 'Facebook', 'Ấn Độ', 'Website'])
    expect(sortRows(rows, { kind: 'value', index: 0 }).map((item) => item.key)).toEqual(['Facebook', 'Ấn Độ', 'Zalo', 'Website'])
    expect(sortRows(rows, { kind: 'value', index: 1 }).map((item) => item.key)).toEqual(['Ấn Độ', 'Facebook', 'Zalo', 'Website'])
    expect(sortRows(rows, { kind: 'label' }).map((item) => item.key)).toEqual(['Ấn Độ', 'Facebook', 'Website', 'Zalo'])
  })

  it('folds what does not fit into one "other" bar that adds up the rest, keeping the order asked for', () => {
    const { kept, folded } = foldRows(rows, 0, 'Khác', 3)
    expect(folded).toBe(2)
    expect(kept).toEqual([row('Facebook', 9, 2), row('Ấn Độ', 3, 5), { key: '__other', label: 'Khác', values: [4, 1] }])
    expect(foldRows(rows, 0, 'Khác', 4)).toEqual({ kept: rows, folded: 0 })
  })

  it('says how a metric moved: in percent, or in units when the period before had none', () => {
    expect(trendOf(46, 40)).toEqual({ direction: 'up', percent: 15, delta: 6 })
    expect(trendOf(30, 40)).toEqual({ direction: 'down', percent: 25, delta: -10 })
    expect(trendOf(5, 5)).toEqual({ direction: 'flat', percent: 0, delta: 0 })
    expect(trendOf(3, 0)).toEqual({ direction: 'up', percent: null, delta: 3 })
  })

  it('writes days as dd/mm', () => {
    expect(shortDay('2026-11-04')).toBe('04/11')
  })
})
