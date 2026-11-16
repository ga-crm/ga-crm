const DAY_MS = 86_400_000
const pad = (value: number) => String(value).padStart(2, '0')

export const addDays = (day: string, days: number): string => new Date(Date.parse(`${day}T00:00:00Z`) + days * DAY_MS).toISOString().slice(0, 10)

/** Monday of the week of a day (weeks start on Monday in Vietnam). */
export const mondayOf = (day: string): string => addDays(day, -((new Date(`${day}T00:00:00Z`).getUTCDay() + 6) % 7))

/** TASK-6: the days of the week view, Monday to Sunday. */
export const weekDays = (day: string): string[] => Array.from({ length: 7 }, (_, index) => addDays(mondayOf(day), index))

/** TASK-6: the month view as whole weeks, from the Monday before the 1st to the Sunday after the last day. */
export function monthWeeks(day: string): string[][] {
  const [year, month] = day.split('-').map(Number)
  const first = `${year}-${pad(month)}-01`
  const last = new Date(Date.UTC(year, month, 0)).toISOString().slice(0, 10)
  const weeks: string[][] = []
  for (let start = mondayOf(first); start <= last; start = addDays(start, 7)) weeks.push(weekDays(start))
  return weeks
}

/** The Vietnam day of an instant (DATA-2). */
export const vietnamDayOf = (at: string | Date): string => new Date(new Date(at).getTime() + 7 * 3_600_000).toISOString().slice(0, 10)

/** TASK-6: dragging a task to another day keeps its time of day (in Vietnam). */
export function moveToDay(at: string, day: string): string {
  const offset = new Date(at).getTime() - Date.parse(`${vietnamDayOf(at)}T00:00:00+07:00`)
  return new Date(Date.parse(`${day}T00:00:00+07:00`) + offset).toISOString()
}
