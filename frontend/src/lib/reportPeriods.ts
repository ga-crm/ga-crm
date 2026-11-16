/** RPT-4: the quick picks of the period filter. */
export const PERIOD_PRESETS = ['thisWeek', 'thisMonth', 'lastMonth', 'thisQuarter'] as const
export type PeriodPreset = (typeof PERIOD_PRESETS)[number]

const pad = (value: number) => String(value).padStart(2, '0')
const iso = (year: number, month: number, day: number) => {
  const date = new Date(Date.UTC(year, month - 1, day))
  return `${date.getUTCFullYear()}-${pad(date.getUTCMonth() + 1)}-${pad(date.getUTCDate())}`
}
/** The last day of a month, December included (RPT-8). */
const lastDay = (year: number, month: number) => new Date(Date.UTC(year, month, 0)).getUTCDate()

/** DATA-2: today in Vietnam, `YYYY-MM-DD`. */
export const vietnamToday = (now = new Date()) => new Date(now.getTime() + 7 * 3_600_000).toISOString().slice(0, 10)

/**
 * RPT-4 + RPT-8: a preset as Vietnam dates, both ends included. The API counts from the start of
 * the first day to the start of the day after the last, so a month's last day is always in it.
 */
export function presetRange(preset: PeriodPreset, today: string): { from: string; to: string } {
  const [year, month, day] = today.split('-').map(Number)
  switch (preset) {
    case 'thisWeek': {
      // Monday to Sunday
      const weekday = (new Date(Date.UTC(year, month - 1, day)).getUTCDay() + 6) % 7
      return { from: iso(year, month, day - weekday), to: iso(year, month, day - weekday + 6) }
    }
    case 'thisMonth':
      return { from: iso(year, month, 1), to: iso(year, month, lastDay(year, month)) }
    case 'lastMonth': {
      const [y, m] = month === 1 ? [year - 1, 12] : [year, month - 1]
      return { from: iso(y, m, 1), to: iso(y, m, lastDay(y, m)) }
    }
    case 'thisQuarter': {
      const first = Math.floor((month - 1) / 3) * 3 + 1
      return { from: iso(year, first, 1), to: iso(year, first + 2, lastDay(year, first + 2)) }
    }
  }
}
