import { useQuery } from '@tanstack/react-query'
import { useEffect, useMemo, useState } from 'react'
import { useMe } from '../auth/useMe'
import { t } from '../i18n'
import { queries } from './queries'
import type { Presence } from './types'

export type PresenceStatus = 'online' | 'idle' | 'offline'

/** One `presence.changed` event: user ids that moved into each state, with their times (epoch ms). */
export interface PresenceChange {
  online: string[]
  idle: string[]
  offline: string[]
  since?: Record<string, number>
  lastSeen?: Record<string, number>
}

/** Applies a change to what the tab knows; applying it twice gives the same result. */
export function applyPresenceChange(current: Presence, change: PresenceChange): Presence {
  const moved = new Set([...change.online, ...change.idle, ...change.offline])
  const since = { ...current.since, ...change.since }
  for (const id of change.offline) delete since[id]
  return {
    online: [...current.online.filter((id) => !moved.has(id)), ...change.online],
    idle: [...current.idle.filter((id) => !moved.has(id)), ...change.idle],
    since,
    lastSeen: { ...current.lastSeen, ...change.lastSeen },
  }
}

/** Activity the tab counts as "using the CRM": the idle threshold is 5 minutes without it. */
export const IDLE_AFTER_MS = 5 * 60_000

export interface PresenceInfo {
  status: PresenceStatus
  /** Online or idle: when this stretch began. */
  since?: number
  /** Offline: when they were last active. */
  lastSeen?: number
}

const clock = (at: number) => new Intl.DateTimeFormat('vi-VN', { timeZone: 'Asia/Ho_Chi_Minh', hour: '2-digit', minute: '2-digit', hour12: false }).format(at)
const dayOf = (at: number) => new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Ho_Chi_Minh' }).format(at)
/** dd/mm, built from the parts: some runtimes write vi-VN day and month as "13-11". */
const shortDate = (at: number) => {
  const [, month, day] = dayOf(at).split('-')
  return `${day}/${month}`
}

/** "08:15" today, "13/11 08:15" before. */
function when(at: number, now: number): string {
  return dayOf(at) === dayOf(now) ? clock(at) : `${shortDate(at)} ${clock(at)}`
}

/**
 * K5: "Trực tuyến từ 08:15", "Vắng mặt · trực tuyến từ 08:15", "Hoạt động 12 phút trước",
 * "Hoạt động 3 giờ trước", "Hoạt động hôm qua lúc 17:40", "Hoạt động 10/11".
 */
export function presenceText(info: PresenceInfo, now: number): string {
  if (info.status !== 'offline') {
    const since = info.since ? t('presence.since', { time: when(info.since, now) }) : ''
    if (info.status === 'online') return since ? t('presence.onlineSince', { time: when(info.since!, now) }) : t('presence.online')
    return since ? t('presence.idleSince', { time: when(info.since!, now) }) : t('presence.idleShort')
  }
  if (!info.lastSeen) return t('presence.never')
  const minutes = Math.max(0, Math.floor((now - info.lastSeen) / 60_000))
  if (minutes < 1) return t('presence.justNow')
  if (minutes < 60) return t('presence.minutesAgo', { count: minutes })
  if (minutes < 24 * 60 && dayOf(info.lastSeen) === dayOf(now)) return t('presence.hoursAgo', { count: Math.floor(minutes / 60) })
  if (dayOf(info.lastSeen) === dayOf(now - 86_400_000)) return t('presence.yesterday', { time: clock(info.lastSeen) })
  return t('presence.onDate', { date: shortDate(info.lastSeen) })
}

/** The time, re-read every `ms`, so "12 phút trước" keeps counting. */
export function useNow(ms = 30_000): number {
  const [now, setNow] = useState(() => Date.now())
  useEffect(() => {
    const timer = setInterval(() => setNow(Date.now()), ms)
    return () => clearInterval(timer)
  }, [ms])
  return now
}

function usePresenceData() {
  const { data: me } = useMe()
  return useQuery({ ...queries.presence(), enabled: !!me?.tenant }).data
}

/** The status of any user of the signed-in GA; everyone is offline for platform staff. */
export function usePresence(): (userId: string) => PresenceStatus {
  const data = usePresenceData()
  return useMemo(() => {
    const online = new Set(data?.online)
    const idle = new Set(data?.idle)
    return (userId: string) => (online.has(userId) ? 'online' : idle.has(userId) ? 'idle' : 'offline')
  }, [data])
}

/**
 * K5: status with its time for these people. Last-seen times of offline people are asked for once
 * (and again each minute); a time this tab saw live is newer and wins.
 */
export function usePresenceInfo(userIds: string[]): (userId: string) => PresenceInfo {
  const { data: me } = useMe()
  const data = usePresenceData()
  const statusOf = usePresence()
  const ids = useMemo(() => [...new Set(userIds)].sort(), [userIds])
  const offline = ids.filter((id) => statusOf(id) === 'offline')
  const stored = useQuery({ ...queries.lastSeen(offline), enabled: !!me?.tenant && offline.length > 0 }).data
  return useMemo(() => {
    const fromApi = new Map((stored?.items ?? []).map((item) => [item.id, item.lastSeenAt ?? undefined]))
    return (userId: string) => {
      const status = statusOf(userId)
      if (status !== 'offline') return { status, since: data?.since?.[userId] }
      const live = data?.lastSeen?.[userId]
      const known = fromApi.get(userId)
      return { status, lastSeen: live && known ? Math.max(live, known) : (live ?? known) }
    }
  }, [data, stored, statusOf])
}
