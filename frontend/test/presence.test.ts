import { describe, expect, it } from 'vitest'
import { applyPresenceChange, presenceText } from '../src/lib/presence'

const at = (iso: string) => Date.parse(iso)

describe('presence', () => {
  it('moves users between states, keeps when they came online, and when they left', () => {
    const start = { online: ['a', 'b'], idle: ['c'], since: { a: 1, b: 2, c: 3 } }
    const next = applyPresenceChange(start, { online: ['c'], idle: ['a'], offline: ['b'], since: { c: 3 }, lastSeen: { b: 99 } })
    expect(next).toEqual({ online: ['c'], idle: ['a'], since: { a: 1, c: 3 }, lastSeen: { b: 99 } })
  })

  it('gives the same result when an event arrives twice', () => {
    const change = { online: ['d'], idle: [], offline: ['a'], since: { d: 5 }, lastSeen: { a: 4 } }
    const once = applyPresenceChange({ online: ['a'], idle: [], since: { a: 1 } }, change)
    expect(applyPresenceChange(once, change)).toEqual(once)
  })

  it('K5: says since when someone is online, and how long ago an offline one was active', () => {
    const now = at('2026-11-14T09:30:00+07:00')
    expect(presenceText({ status: 'online', since: at('2026-11-14T08:15:00+07:00') }, now)).toBe('Trực tuyến từ 08:15')
    expect(presenceText({ status: 'idle', since: at('2026-11-13T17:05:00+07:00') }, now)).toBe('Vắng mặt · trực tuyến từ 13/11 17:05')
    expect(presenceText({ status: 'offline', lastSeen: now - 20_000 }, now)).toBe('Vừa hoạt động')
    expect(presenceText({ status: 'offline', lastSeen: now - 12 * 60_000 }, now)).toBe('Hoạt động 12 phút trước')
    expect(presenceText({ status: 'offline', lastSeen: at('2026-11-14T06:00:00+07:00') }, now)).toBe('Hoạt động 3 giờ trước')
    expect(presenceText({ status: 'offline', lastSeen: at('2026-11-13T17:40:00+07:00') }, now)).toBe('Hoạt động hôm qua lúc 17:40')
    expect(presenceText({ status: 'offline', lastSeen: at('2026-11-10T10:00:00+07:00') }, now)).toBe('Hoạt động ngày 10/11')
    expect(presenceText({ status: 'offline' }, now)).toBe('Chưa hoạt động')
  })
})
