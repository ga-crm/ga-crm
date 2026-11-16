import type { InfiniteData } from '@tanstack/react-query'
import { t } from '../i18n'
import type { ChatFile, ChatMessage, ChatMessagePage } from './types'

/** C2, C3: the pure parts of chat in the browser. */

export type MessagePages = InfiniteData<ChatMessagePage, unknown>

/** Messages of all loaded pages, oldest first (page 0 is the newest). */
export function flattenPages(data: MessagePages | undefined): ChatMessage[] {
  if (!data) return []
  return [...data.pages].reverse().flatMap((page) => page.items)
}

/**
 * Adds a pushed or just-sent message to the newest page. Returns `gap` when messages are missing
 * in between (the tab was asleep), so the caller reloads instead; a message already there is kept.
 */
export function addMessage(data: MessagePages, message: ChatMessage): { data: MessagePages; gap: boolean } {
  const [newest, ...older] = data.pages
  if (!newest) return { data, gap: false }
  const known = data.pages.some((page) => page.items.some((item) => item.seq === message.seq))
  if (known) {
    return {
      data: { ...data, pages: data.pages.map((page) => ({ ...page, items: page.items.map((item) => (item.seq === message.seq ? message : item)) })) },
      gap: false,
    }
  }
  const last = newest.items.at(-1)?.seq ?? 0
  if (newest.items.length > 0 && message.seq > last + 1) return { data, gap: true }
  const items = [...newest.items, message].sort((a, b) => a.seq - b.seq)
  return { data: { ...data, pages: [{ ...newest, items }, ...older] }, gap: false }
}

const named = (data: Record<string, unknown>, ids: unknown): string => {
  const names = (data.names ?? {}) as Record<string, string>
  const list = Array.isArray(ids) ? ids.map((id) => names[String(id)] ?? t('chat.someone')) : []
  return list.join(', ')
}

/** "Lan đã thêm Hùng, Mai": SYSTEM messages store what happened, with names as they were then. */
export function systemText(message: Pick<ChatMessage, 'data'>): string {
  const data = message.data
  const actor = (data.actorName as string | undefined) ?? t('chat.someone')
  switch (data.event) {
    case 'created':
      return t('chat.system.created', { actor })
    case 'renamed':
      return t('chat.system.renamed', { actor, title: String(data.title ?? '') })
    case 'added':
      return t('chat.system.added', { actor, names: named(data, data.userIds) })
    case 'removed':
      return t('chat.system.removed', { actor, names: named(data, data.userIds) })
    case 'left':
      return data.newOwnerId ? t('chat.system.leftOwner', { actor, owner: named(data, [data.newOwnerId]) }) : t('chat.system.left', { actor })
    case 'role':
      return data.role === 'ADMIN' ? t('chat.system.madeAdmin', { actor, names: named(data, data.userIds) }) : t('chat.system.unmadeAdmin', { actor, names: named(data, data.userIds) })
    default:
      return ''
  }
}

/**
 * K4 (PDP): digit runs that look like an ID card number (12 digits) or a bank account (9-16 digits)
 * ask the sender to confirm. Phone numbers (0xxxxxxxxx, 84xxxxxxxxx) are left alone. Spaces, dots and
 * dashes inside a run are ignored, as people write "0123 4567 8901".
 */
export function sensitiveNumbers(body: string): ('idCard' | 'bankAccount')[] {
  const found = new Set<'idCard' | 'bankAccount'>()
  for (const match of body.matchAll(/\d(?:[ .-]?\d){8,18}/g)) {
    const digits = match[0].replace(/\D/g, '')
    if (digits.length === 12) found.add('idCard')
    else if (digits.length >= 9 && digits.length <= 16) {
      const phone = (digits.length === 10 && digits.startsWith('0')) || (digits.length === 11 && digits.startsWith('84'))
      if (!phone) found.add('bankAccount')
    }
  }
  return [...found]
}

/** Who is typing where; each entry fades 5 seconds after its last event. */
const TYPING_MS = 5_000
const typing = new Map<string, Map<string, number>>()
const typingListeners = new Set<() => void>()

export function noteTyping(conversationId: string, userId: string, now = Date.now()): void {
  const people = typing.get(conversationId) ?? new Map<string, number>()
  people.set(userId, now + TYPING_MS)
  typing.set(conversationId, people)
  for (const listener of typingListeners) listener()
}

/** A message from someone ends their typing at once. */
export function stopTyping(conversationId: string, userId: string): void {
  if (typing.get(conversationId)?.delete(userId)) for (const listener of typingListeners) listener()
}

export function typingIn(conversationId: string, now = Date.now()): string[] {
  return [...(typing.get(conversationId) ?? new Map<string, number>())].filter(([, until]) => until > now).map(([userId]) => userId)
}

export function subscribeTyping(listener: () => void): () => void {
  typingListeners.add(listener)
  return () => typingListeners.delete(listener)
}

/** The author may still edit for 15 minutes after sending (checked again by the API). */
export const stillEditable = (createdAt: string, now = Date.now()): boolean => now - new Date(createdAt).getTime() < 15 * 60_000

/** "14:05" today, "13/11 14:05" before. */
export function messageTime(createdAt: string, now = Date.now()): string {
  const date = new Date(createdAt)
  const day = (value: Date) => new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Ho_Chi_Minh' }).format(value)
  const time = new Intl.DateTimeFormat('vi-VN', { timeZone: 'Asia/Ho_Chi_Minh', hour: '2-digit', minute: '2-digit' }).format(date)
  if (day(date) === day(new Date(now))) return time
  const [, month, dayOfMonth] = day(date).split('-')
  const short = `${dayOfMonth}/${month}`
  return `${short} ${time}`
}

/** K8: what the API accepts; checked here first so a wrong file fails before it is uploaded. */
export const MAX_FILE_BYTES = 10 * 1024 * 1024
export const MAX_FILES = 5
export const ACCEPT = '.jpg,.jpeg,.png,.webp,.heic,.pdf,.doc,.docx,.xls,.xlsx,.ppt,.pptx'
const ACCEPTED = new Set(ACCEPT.split(',').map((extension) => extension.slice(1)))

export function attachmentProblem(file: { name: string; size: number }): string | null {
  const extension = /\.([a-z0-9]+)$/i.exec(file.name)?.[1]?.toLowerCase() ?? ''
  if (!ACCEPTED.has(extension)) return t('chat.fileType', { name: file.name })
  if (file.size > MAX_FILE_BYTES) return t('chat.fileTooLarge', { name: file.name })
  return null
}

/** "850 KB", "2,4 MB". */
export function fileSize(bytes: number): string {
  if (bytes < 1024 * 1024) return `${Math.max(1, Math.round(bytes / 1024))} KB`
  return `${(bytes / 1024 / 1024).toLocaleString('vi-VN', { maximumFractionDigits: 1 })} MB`
}

/** The files a message carries (`data.files`), if any. */
export const filesOf = (message: { data: Record<string, unknown> | null }): ChatFile[] =>
  Array.isArray(message.data?.files) ? (message.data.files as ChatFile[]) : []
