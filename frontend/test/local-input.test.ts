import { describe, expect, it } from 'vitest'
import { fromLocalInput, toLocalInput } from '../src/lib/leadLabels'

/** Run with any TZ (the check script uses Asia/Tokyo too): the fields follow Vietnam time only. */
describe('datetime-local fields', () => {
  it('DATA-2: show and read Vietnam time, whatever the computer zone is', () => {
    expect(toLocalInput('2026-11-17T02:00:00.000Z')).toBe('2026-11-17T09:00')
    expect(fromLocalInput('2026-11-17T09:00')).toBe('2026-11-17T02:00:00.000Z')
    // Across midnight in UTC
    expect(toLocalInput('2026-11-16T20:30:00.000Z')).toBe('2026-11-17T03:30')
    expect(fromLocalInput('2026-11-17T03:30')).toBe('2026-11-16T20:30:00.000Z')
  })

  it('round-trips what it shows, and leaves empty or broken values empty', () => {
    const at = '2026-03-08T23:45:00.000Z'
    expect(fromLocalInput(toLocalInput(at))).toBe(at)
    expect(toLocalInput(null)).toBe('')
    expect(toLocalInput('not a date')).toBe('')
  })
})
