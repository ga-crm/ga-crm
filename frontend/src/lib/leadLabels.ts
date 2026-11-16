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

/** For `<input type="datetime-local">`, which wants local time without a zone. */
export function toLocalInput(value?: string | null): string {
  if (!value) return ''
  const date = new Date(value)
  const pad = (part: number) => String(part).padStart(2, '0')
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}T${pad(date.getHours())}:${pad(date.getMinutes())}`
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
