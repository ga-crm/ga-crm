import { useQueryClient } from '@tanstack/react-query'
import { useEffect } from 'react'
import { io } from 'socket.io-client'
import { addMessage, noteTyping, stopTyping } from './chat'
import type { MessagePages } from './chat'
import { applyPresenceChange, IDLE_AFTER_MS } from './presence'
import type { PresenceChange } from './presence'
import { keys } from './queries'
import { setRealtimeLive } from './realtimeStatus'
import { t } from '../i18n'
import { toast } from './toast'
import type { ChatConversation, ChatMessage, ImportDetail, ImportProgress, Presence } from './types'

/** The tab's socket, for the few things the browser sends (typing). Null while signed out. */
let current: ReturnType<typeof io> | null = null

/** C2: tells the other members this person is typing; the server drops extras. */
export function sendTyping(conversationId: string): void {
  current?.emit('chat.typing', { conversationId })
}

/** Retry a refused handshake this often; a dropped connection retries sooner, with backoff. */
const RETRY_REFUSED_MS = 60_000
/** C1: keeps this user's bit set in the current minute's presence bitmap. */
const HEARTBEAT_MS = 30_000
/** Spread of the refetch after `dashboard.changed`, across a GA's open tabs. */
const DASHBOARD_JITTER_MS = 2_000
const INPUT_EVENTS = ['pointerdown', 'keydown', 'wheel', 'touchstart'] as const

/**
 * Section 9: one WebSocket per signed-in tab, on the API's own origin (`/socket.io`, proxied by
 * Vite in development), authenticated by the session cookie. Events carry ids only, so each one
 * refreshes queries through REST. Without a socket, polling takes over (`pollInterval`).
 */
export function useRealtime(userId: string | undefined): void {
  const queryClient = useQueryClient()

  useEffect(() => {
    if (!userId) return
    const refreshNotifications = () => void queryClient.invalidateQueries({ queryKey: keys.notifications })
    // Signed out, disabled or suspended elsewhere: /me answers null and the app leaves for sign-in
    const recheckSession = () => void queryClient.invalidateQueries({ queryKey: keys.me })

    const socket = io({
      path: '/socket.io',
      transports: ['websocket'],
      reconnectionDelay: 2_000,
      reconnectionDelayMax: 30_000,
    })
    current = socket
    let retry: ReturnType<typeof setTimeout> | undefined

    // C1: "active" means the person used this tab in the last 5 minutes and it is in view
    const tab = { lastInput: Date.now(), sentActive: null as boolean | null }
    const isActive = () => document.visibilityState === 'visible' && Date.now() - tab.lastInput < IDLE_AFTER_MS
    const beat = (onlyIfChanged = false) => {
      const active = isActive()
      if (!socket.connected || (onlyIfChanged && active === tab.sentActive)) return
      tab.sentActive = active
      socket.emit('presence.heartbeat', { active })
    }
    const onInput = () => {
      tab.lastInput = Date.now()
      // Coming back from idle shows at once; otherwise the next beat carries it
      if (tab.sentActive === false) beat(true)
    }
    const onVisibility = () => beat(true)
    for (const name of INPUT_EVENTS) window.addEventListener(name, onInput, { passive: true })
    document.addEventListener('visibilitychange', onVisibility)
    const beats = setInterval(() => beat(), HEARTBEAT_MS)
    const retryLater = () => {
      clearTimeout(retry)
      retry = setTimeout(() => socket.connect(), RETRY_REFUSED_MS)
    }

    socket.on('connect', () => {
      setRealtimeLive(true)
      // The server counts a new socket as active; tell it otherwise at once
      tab.sentActive = true
      beat(true)
      // Anything sent while disconnected was missed, so read it once
      refreshNotifications()
      void queryClient.invalidateQueries({ queryKey: keys.presence })
      void queryClient.invalidateQueries({ queryKey: keys.chat })
      void queryClient.invalidateQueries({ queryKey: [...keys.reports, 'dashboard'] })
    })
    socket.on('disconnect', (reason) => {
      setRealtimeLive(false)
      // Restarts the minute poll, which only reschedules after a fetch
      refreshNotifications()
      // The server ended it: the session changed (a password change gives this tab a new one) or ended
      if (reason === 'io server disconnect') {
        recheckSession()
        retry = setTimeout(() => socket.connect(), 1_000)
      }
    })
    socket.on('connect_error', (error) => {
      setRealtimeLive(false)
      if (error.message === 'unauthenticated') recheckSession()
      // Refused by the server's check rather than a network failure: socket.io does not retry those
      if (!socket.active) retryLater()
    })
    socket.on('session.ended', recheckSession)
    socket.on('notification.new', refreshNotifications)
    socket.on('notification.read', refreshNotifications)
    // C2, C3: chat
    const refreshChatList = () => {
      void queryClient.invalidateQueries({ queryKey: [...keys.chat, 'list'] })
      void queryClient.invalidateQueries({ queryKey: [...keys.chat, 'unread'] })
    }
    socket.on('chat.message', (message: ChatMessage) => {
      const key = [...keys.chat, 'messages', message.conversationId]
      let gap = false
      queryClient.setQueryData<MessagePages>(key, (data) => {
        if (!data) return data
        const result = addMessage(data, message)
        gap = result.gap
        return result.data
      })
      // Messages were missed while the tab slept: read the conversation again
      if (gap) void queryClient.invalidateQueries({ queryKey: key })
      if (message.senderId) stopTyping(message.conversationId, message.senderId)
      refreshChatList()
    })
    socket.on('chat.updated', ({ conversationId }: { conversationId: string }) => {
      void queryClient.invalidateQueries({ queryKey: [...keys.chat, 'messages', conversationId] })
      refreshChatList()
    })
    socket.on('chat.read', ({ conversationId, userId: reader, seq }: { conversationId: string; userId: string; seq: number }) => {
      // "Seen" under one's own messages
      queryClient.setQueryData<ChatConversation>([...keys.chat, 'detail', conversationId], (detail) =>
        detail && { ...detail, members: detail.members.map((member) => (member.id === reader ? { ...member, lastReadSeq: Math.max(member.lastReadSeq, seq) } : member)) },
      )
      if (reader === userId) refreshChatList()
    })
    socket.on('chat.conversation', ({ conversationId }: { conversationId: string }) => {
      void queryClient.invalidateQueries({ queryKey: [...keys.chat, 'detail', conversationId] })
      refreshChatList()
    })
    socket.on('chat.typing', ({ conversationId, userId: typist }: { conversationId: string; userId: string }) => noteTyping(conversationId, typist))
    // Home charts: lead data of the GA changed. Each tab waits a moment at random, so a GA's
    // open tabs do not all ask at once; only a mounted dashboard refetches
    let dashboardRefresh: ReturnType<typeof setTimeout> | undefined
    socket.on('dashboard.changed', () => {
      clearTimeout(dashboardRefresh)
      dashboardRefresh = setTimeout(() => void queryClient.invalidateQueries({ queryKey: [...keys.reports, 'dashboard'] }), Math.random() * DASHBOARD_JITTER_MS)
    })
    // Open question I: a batched import moved on, or finished
    socket.on('import.progress', ({ importId, finished, ...progress }: ImportProgress & { importId: string; finished: boolean }) => {
      if (!finished) {
        queryClient.setQueryData<ImportDetail>([...keys.imports, 'detail', importId], (detail) => detail && { ...detail, progress })
        return
      }
      for (const queryKey of [keys.imports, keys.agents, keys.leads, keys.clients]) void queryClient.invalidateQueries({ queryKey })
      if (progress.failedRows > 0) toast.warning(t('toast.importBatchedPartial', { rows: progress.failedRows }), t('toast.importBatchedPartialDetail'))
      else toast.success(t('toast.importBatchedDone'))
    })
    socket.on('presence.changed', (change: PresenceChange) => {
      queryClient.setQueryData<Presence>(keys.presence, (current) => current && applyPresenceChange(current, change))
    })

    return () => {
      current = null
      clearInterval(beats)
      for (const name of INPUT_EVENTS) window.removeEventListener(name, onInput)
      document.removeEventListener('visibilitychange', onVisibility)
      clearTimeout(retry)
      clearTimeout(dashboardRefresh)
      socket.disconnect()
      setRealtimeLive(false)
    }
  }, [queryClient, userId])
}
