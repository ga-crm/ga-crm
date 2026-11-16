import vi from './vi.json'

export type MessageKey = keyof typeof vi

/** UI-1: every visible string comes from the catalogue. */
export function t(key: MessageKey, params?: Record<string, string | number>): string {
  let message: string = vi[key]
  for (const [name, value] of Object.entries(params ?? {})) {
    message = message.replace(`{${name}}`, String(value))
  }
  return message
}

/** For keys built from API values, such as role codes. Unknown values show as they are. */
export function tDynamic(key: string, fallback: string): string {
  return (vi as Record<string, string>)[key] ?? fallback
}

const dateTime = new Intl.DateTimeFormat('en-GB', {
  timeZone: 'Asia/Ho_Chi_Minh',
  day: '2-digit',
  month: '2-digit',
  year: 'numeric',
  hour: '2-digit',
  minute: '2-digit',
  hour12: false,
})

/** DATA-2 and section 21.3: dd/mm/yyyy HH:mm in Vietnam time. */
export function formatDateTime(value?: string | null): string {
  return value ? dateTime.format(new Date(value)).replace(',', '') : t('common.never')
}

const dateOnly = new Intl.DateTimeFormat('vi-VN', { timeZone: 'Asia/Ho_Chi_Minh', day: '2-digit', month: '2-digit', year: 'numeric' })

/** DATA-2: dd/mm/yyyy in Vietnam time, for instants where the hour does not matter. */
export function formatDate(value?: string | null): string {
  return value ? dateOnly.format(new Date(value)) : t('common.never')
}

const vnd = new Intl.NumberFormat('vi-VN')

/** DATA-3: whole Vietnamese dong, grouped the Vietnamese way, e.g. 12.000.000 đ. */
export function formatVnd(value?: number | null): string {
  return value === null || value === undefined ? '-' : `${vnd.format(value)} đ`
}
