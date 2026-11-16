const DAY_MS = 86_400_000;
const VN_OFFSET_MS = 7 * 3_600_000;

/** DATA-2: the Vietnam day of an instant, `YYYY-MM-DD`. */
export const vietnamDay = (at: Date): string =>
  new Date(at.getTime() + VN_OFFSET_MS).toISOString().slice(0, 10);

/** The instant a Vietnam day starts. */
export const dayStart = (day: string): Date =>
  new Date(`${day}T00:00:00+07:00`);

export const addDays = (day: string, days: number): string =>
  new Date(Date.parse(`${day}T00:00:00Z`) + days * DAY_MS)
    .toISOString()
    .slice(0, 10);

/**
 * TASK-5: the days of this week in Vietnam, Monday to Sunday, as `dd/mm` (how Success writes a
 * birthday), so "sinh nhật tuần này" is a simple match.
 */
export function weekDayMonths(
  today: string,
): { dayMonth: string; day: string }[] {
  const weekday = (new Date(`${today}T00:00:00Z`).getUTCDay() + 6) % 7;
  return Array.from({ length: 7 }, (_, index) => {
    const day = addDays(today, index - weekday);
    return { day, dayMonth: `${day.slice(8, 10)}/${day.slice(5, 7)}` };
  });
}

/** Section 16.2: Success data older than this is shown as stale. */
export const STALE_UPLOAD_DAYS = 14;
