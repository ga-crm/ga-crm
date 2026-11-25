import { t, tDynamic } from '../i18n'
import type { NotificationItem } from './types'

/** NTF-2: every event this build sends, in the order the settings page lists them. */
export const NOTIFICATION_TYPES = [
  'LEAD_ASSIGNED',
  'LEAD_COMMENT',
  'MENTION',
  'LEAD_DEADLINE_SOON',
  'APPOINTMENT_SOON',
  'TASK_DUE',
  'TASKS_OVERDUE',
  'CLIENT_ASSIGNED',
  'CLIENT_COMMENT',
  'CLIENT_SIGNALS',
  'TEAM_OVERDUE',
  'INVITE_ACCEPTED',
  'FORM_REREGISTERED',
  'CHAT_MENTION',
  'CHAT_UNREAD',
  'DEPARTED_WORK',
] as const

const time = (at: string | number) => new Intl.DateTimeFormat('vi-VN', { timeZone: 'Asia/Ho_Chi_Minh', hour: '2-digit', minute: '2-digit', hour12: false }).format(new Date(at))

/** The sentence a notification shows. Names come from the API at read time (NTF-4). */
export function notificationText(item: NotificationItem): string {
  const count = Number(item.data.count ?? 0)
  const name = item.subject ?? t('notification.unknown')
  switch (item.type) {
    case 'LEAD_ASSIGNED':
      return count === 1 ? t('notification.leadAssignedOne', { name }) : t('notification.leadAssignedMany', { count })
    case 'CLIENT_ASSIGNED':
      return count === 1 ? t('notification.clientAssignedOne', { name }) : t('notification.clientAssignedMany', { count })
    case 'LEAD_COMMENT':
      return t('notification.leadComment', { name })
    case 'CLIENT_COMMENT':
      return t('notification.clientComment', { name })
    case 'MENTION':
      return item.data.clientId ? t('notification.mentionClient', { name }) : t('notification.mentionLead', { name })
    case 'LEAD_DEADLINE_SOON':
      return count === 1 ? t('notification.deadlineOne', { name }) : t('notification.deadlineMany', { count })
    case 'APPOINTMENT_SOON':
      return t('notification.appointment', { name, time: item.data.at ? time(item.data.at) : '' })
    case 'TASK_DUE':
      return t('notification.taskDue', { name })
    case 'TASKS_OVERDUE':
      return t('notification.tasksOverdue', { count })
    case 'TEAM_OVERDUE':
      return t('notification.teamOverdue', { count })
    case 'CLIENT_SIGNALS': {
      const parts = [
        Number(item.data.premiumDue) > 0 && t('notification.signalPremium', { count: item.data.premiumDue }),
        Number(item.data.birthdays) > 0 && t('notification.signalBirthday', { count: item.data.birthdays }),
      ].filter(Boolean)
      return t('notification.signals', { what: parts.join(t('notification.and')) })
    }
    case 'FORM_REREGISTERED':
      return t('notification.formReregistered', { name })
    case 'CHAT_MENTION':
      return t('notification.chatMention', { name })
    case 'CHAT_UNREAD':
      return item.data.conversationId ? t('notification.chatUnreadGroup', { count, name }) : t('notification.chatUnreadDirect', { count, name })
    case 'DEPARTED_WORK':
      return t('notification.departedWork', { name, leads: Number(item.data.leads ?? 0), clients: Number(item.data.clients ?? 0) })
    case 'INVITE_ACCEPTED':
      return t('notification.inviteAccepted', { name })
    default:
      return tDynamic(`notificationType.${item.type}`, item.type)
  }
}

/** "5 phút trước", or the date for anything older than a day. */
export function notificationAge(createdAt: string, now: number): string {
  const minutes = Math.max(0, Math.round((now - new Date(createdAt).getTime()) / 60_000))
  if (minutes < 1) return t('notification.justNow')
  if (minutes < 60) return t('notification.minutesAgo', { count: minutes })
  if (minutes < 24 * 60) return t('notification.hoursAgo', { count: Math.floor(minutes / 60) })
  return new Intl.DateTimeFormat('vi-VN', { timeZone: 'Asia/Ho_Chi_Minh', day: '2-digit', month: '2-digit', year: 'numeric' }).format(new Date(createdAt))
}
