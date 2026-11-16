import { z } from 'zod'
import { t } from '../i18n'

const EARLIEST_DATE = '1900-01-01'

const todayInVietnam = () => new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Ho_Chi_Minh' }).format(new Date())

/** A real day on the calendar, written `YYYY-MM-DD`. */
export function isCalendarDate(value: string): boolean {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return false
  const date = new Date(`${value}T00:00:00Z`)
  return !Number.isNaN(date.getTime()) && date.toISOString().startsWith(value) && value >= EARLIEST_DATE
}

export const requiredText = (max: number) => z.string().trim().min(1, t('validation.required')).max(max, t('validation.tooLong', { max }))

export const optionalText = (max: number) => z.string().trim().max(max, t('validation.tooLong', { max }))

/** DATA-4: the same rule as the API, so a wrong number is caught before sending. */
export const isPhone = (value: string) => /^(?:\+?84|0)\d{9}$/.test(value.replace(/[\s.()-]/g, ''))

export const phoneField = z.string().trim().min(1, t('validation.required')).refine(isPhone, t('validation.phone'))

export const optionalEmail = z
  .string()
  .trim()
  .max(254, t('validation.tooLong', { max: 254 }))
  .refine((value) => !value || z.email().safeParse(value).success, t('validation.email'))

export const optionalDate = z.string().refine((value) => !value || isCalendarDate(value), t('validation.date'))

export const requiredDate = z.string().min(1, t('validation.required')).refine(isCalendarDate, t('validation.date'))

/** A birth date cannot be later than today. */
export const optionalBirthDate = optionalDate.refine((value) => !value || value <= todayInVietnam(), t('validation.dateFuture'))

export const agentCodeField = z
  .string()
  .trim()
  .min(1, t('validation.required'))
  .regex(/^\d{1,20}$/, t('validation.agentCode'))
