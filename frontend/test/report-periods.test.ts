import { describe, expect, it } from 'vitest'
import { presetRange } from '../src/lib/reportPeriods'

describe('report periods (RPT-4, RPT-8)', () => {
  it('test 47: months end on their last day, December too', () => {
    expect(presetRange('thisMonth', '2026-12-15')).toEqual({ from: '2026-12-01', to: '2026-12-31' })
    expect(presetRange('lastMonth', '2027-01-05')).toEqual({ from: '2026-12-01', to: '2026-12-31' })
    expect(presetRange('thisMonth', '2028-02-10')).toEqual({ from: '2028-02-01', to: '2028-02-29' })
  })

  it('weeks run Monday to Sunday; quarters are calendar quarters', () => {
    // 10/11/2026 is a Tuesday
    expect(presetRange('thisWeek', '2026-11-10')).toEqual({ from: '2026-11-09', to: '2026-11-15' })
    expect(presetRange('thisWeek', '2026-11-15')).toEqual({ from: '2026-11-09', to: '2026-11-15' })
    expect(presetRange('thisQuarter', '2026-11-10')).toEqual({ from: '2026-10-01', to: '2026-12-31' })
  })
})
