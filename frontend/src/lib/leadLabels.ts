import type { BadgeTone } from '../components/ui'
import { t, tDynamic } from '../i18n'
import type { LeadCatalogue } from './leadOptions'

const INTEREST_TONES: Record<string, BadgeTone> = {
  NOT_REACHED: 'muted',
  UNDETERMINED: 'muted',
  NOT_INTERESTED: 'warning',
  LIFE: 'success',
  HEALTH_CARD: 'info',
}

const CARE_TONES: Record<string, BadgeTone> = {
  CARING: 'info',
  WON: 'success',
  DROPPED: 'danger',
  NOT_INTERESTED: 'warning',
}

export const interestTone = (value: string): BadgeTone => INTEREST_TONES[value] ?? 'muted'
export const careTone = (value: string): BadgeTone => CARE_TONES[value] ?? 'muted'

/** DATA-2: stored as YYYY-MM-DD, shown as dd/mm/yyyy. */
export const showDate = (value?: string | null): string | null => (value ? value.split('-').reverse().join('/') : null)

const VIETNAM_CLOCK = new Intl.DateTimeFormat('en-CA', {
  timeZone: 'Asia/Ho_Chi_Minh',
  year: 'numeric',
  month: '2-digit',
  day: '2-digit',
  hour: '2-digit',
  minute: '2-digit',
  hourCycle: 'h23',
})

/**
 * DATA-2: for `<input type="datetime-local">`, which holds a time without a zone. The app shows
 * Vietnam time everywhere, so the field does too, whatever the computer's own zone is.
 */
export function toLocalInput(value?: string | null): string {
  if (!value) return ''
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return ''
  const part = Object.fromEntries(VIETNAM_CLOCK.formatToParts(date).map(({ type, value: text }) => [type, text]))
  return `${part.year}-${part.month}-${part.day}T${part.hour}:${part.minute}`
}

/** The reverse of toLocalInput: what was typed is Vietnam time (UTC+7, no daylight saving). */
export function fromLocalInput(value: string): string {
  return new Date(`${value.slice(0, 16)}:00+07:00`).toISOString()
}

/** LEAD-20: a history value in words: labels for codes, names for agents. */
export function historyValue(field: string, value: string | null, agentNames: Readonly<Record<string, string>>, catalogue: LeadCatalogue): string {
  if (value === null) return '-'
  switch (field) {
    case 'stage':
      return tDynamic(`stage.${value}`, value)
    // OPT-9: the GA's label for the code, even if the value was renamed or hidden since
    case 'interest':
      return catalogue.label('interest', value)
    case 'careStatus':
      return catalogue.label('care_status', value)
    case 'assignee':
      return agentNames[value] ? `${agentNames[value]} (${value})` : value
    case 'consent':
      return t(value === 'true' ? 'leads.consentYes' : 'leads.consentNo')
    case 'dob':
      return showDate(value) ?? '-'
    case 'nextAction':
      return new Intl.DateTimeFormat('en-GB', { timeZone: 'Asia/Ho_Chi_Minh', dateStyle: 'short', timeStyle: 'short' }).format(new Date(value))
    default:
      return value
  }
}
