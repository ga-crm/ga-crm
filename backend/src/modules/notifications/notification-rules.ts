/**
 * Chapter 15 (NTF): what can be notified and when. Pure functions, so the scheduler and the tests
 * share them.
 */

/** NTF-2: the events this build notifies. AI budget waits for the AI slice. */
export const NOTIFICATION_TYPES = [
  'LEAD_ASSIGNED',
  'CLIENT_ASSIGNED',
  'LEAD_COMMENT',
  'CLIENT_COMMENT',
  'MENTION',
  'TASK_DUE',
  'APPOINTMENT_SOON',
  'LEAD_DEADLINE_SOON',
  'TASKS_OVERDUE',
  'TEAM_OVERDUE',
  'CLIENT_SIGNALS',
  'INVITE_ACCEPTED',
  'FORM_REREGISTERED',
  /** Chat (C4, K6): messages left unread 5 minutes, and being @mentioned in a group */
  'CHAT_UNREAD',
  'CHAT_MENTION',
  /** Open question 12e: someone left with open leads or clients in their name */
  'DEPARTED_WORK',
] as const;
export type NotificationType = (typeof NOTIFICATION_TYPES)[number];

/** NTF-1: only the in-app channel exists so far; push and email digest come later. */
export const NOTIFICATION_CHANNELS = ['inApp'] as const;

/** NTF-3: per user, per event and channel. Anything missing is on. */
export type NotificationPrefs = Partial<
  Record<NotificationType, { inApp?: boolean }>
>;

export const wantsInApp = (
  prefs: NotificationPrefs | undefined,
  type: NotificationType,
): boolean => prefs?.[type]?.inApp !== false;

/** Section 18.7: notifications are kept 180 days. */
export const RETENTION_DAYS = 180;
/** TASK-7: a due task is still reminded if the server was down up to this long. */
export const DUE_LOOKBACK_MS = 2 * 3_600_000;
/** TASK-7: 15 minutes before an appointment. */
export const APPOINTMENT_NOTICE_MS = 15 * 60_000;
/** NTF-2 "lead sắp quá hạn": warn this long before the contact deadline (LEAD-29). */
export const DEADLINE_WARNING_MS = 4 * 3_600_000;
/** SIG-2 */
export const PREMIUM_DUE_DAYS = 7;
export const BIRTHDAY_DAYS = 3;

const VN_OFFSET_MS = 7 * 3_600_000;

/** `HH:mm` → minutes after midnight; anything else → null. */
export function minutesOfDay(value: unknown): number | null {
  if (typeof value !== 'string') return null;
  const match = /^([01]\d|2[0-3]):([0-5]\d)$/.exec(value);
  return match ? Number(match[1]) * 60 + Number(match[2]) : null;
}

/** Minutes after midnight in Vietnam (DATA-2). */
export const vietnamMinutes = (at: Date): number => {
  const shifted = new Date(at.getTime() + VN_OFFSET_MS);
  return shifted.getUTCHours() * 60 + shifted.getUTCMinutes();
};

export interface QuietHours {
  from: string;
  to: string;
}

/** NTF-3: the tenant default is 21:00 to 07:30 Vietnam time. */
export const DEFAULT_QUIET_HOURS: QuietHours = { from: '21:00', to: '07:30' };

export function quietHoursOf(value: unknown): QuietHours {
  const raw = (value ?? {}) as Partial<QuietHours>;
  return minutesOfDay(raw.from) !== null && minutesOfDay(raw.to) !== null
    ? { from: raw.from!, to: raw.to! }
    : DEFAULT_QUIET_HOURS;
}

/** NTF-3: whether an instant falls inside quiet hours, which may run past midnight. */
export function inQuietHours(at: Date, quiet: QuietHours): boolean {
  const now = vietnamMinutes(at);
  const from = minutesOfDay(quiet.from)!;
  const to = minutesOfDay(quiet.to)!;
  if (from === to) return false;
  return from < to ? now >= from && now < to : now >= from || now < to;
}

/**
 * The morning round (overdue tasks, the line's overdue leads, new care signals) runs once a day,
 * as soon as the GA's quiet hours end.
 */
export const morningRoundDue = (at: Date, quiet: QuietHours): boolean =>
  !inQuietHours(at, quiet) && vietnamMinutes(at) >= minutesOfDay(quiet.to)!;

/** SIG-2: `dd/mm` for today and the next `days` days, how Success writes a birthday. */
export function nextDayMonths(today: string, days: number): string[] {
  const start = Date.parse(`${today}T00:00:00Z`);
  return Array.from({ length: days + 1 }, (_, index) => {
    const day = new Date(start + index * 86_400_000).toISOString();
    return `${day.slice(8, 10)}/${day.slice(5, 7)}`;
  });
}
