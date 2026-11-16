import { describe, expect, it } from 'vitest'
import { monthWeeks, moveToDay, weekDays } from '../src/lib/calendarGrid'

describe('calendar grid (TASK-6)', () => {
  it('a month is whole weeks from Monday to Sunday', () => {
    const weeks = monthWeeks('2026-11-10')
    expect(weeks[0][0]).toBe('2026-10-26')
    expect(weeks.at(-1)?.at(-1)).toBe('2026-12-06')
    expect(weeks.every((week) => week.length === 7)).toBe(true)
    expect(weekDays('2026-11-15')).toEqual(['2026-11-09', '2026-11-10', '2026-11-11', '2026-11-12', '2026-11-13', '2026-11-14', '2026-11-15'])
  })

  it('moving a task to another day keeps the hour in Vietnam time', () => {
    // 23:30 on 10/11 in Vietnam
    expect(moveToDay('2026-11-10T16:30:00.000Z', '2026-11-12')).toBe('2026-11-12T16:30:00.000Z')
    expect(moveToDay('2026-12-31T02:00:00.000Z', '2027-01-01')).toBe('2027-01-01T02:00:00.000Z')
  })
})
