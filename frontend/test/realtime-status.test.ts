import { describe, expect, it } from 'vitest'
import { queries } from '../src/lib/queries'
import { POLL_WITHOUT_SOCKET_MS, pollInterval, setRealtimeLive, subscribeRealtimeLive } from '../src/lib/realtimeStatus'

describe('realtime status', () => {
  it('NTF-1: the bell polls only while the tab has no live socket', () => {
    const interval = queries.notificationsUnread().refetchInterval
    expect(interval).toBe(pollInterval)

    setRealtimeLive(false)
    expect(pollInterval()).toBe(POLL_WITHOUT_SOCKET_MS)
    setRealtimeLive(true)
    expect(pollInterval()).toBe(false)
    setRealtimeLive(false)
  })

  it('tells subscribers when the connection comes and goes, once per change', () => {
    const seen: number[] = []
    const stop = subscribeRealtimeLive(() => seen.push(1))
    setRealtimeLive(true)
    setRealtimeLive(true)
    setRealtimeLive(false)
    stop()
    setRealtimeLive(true)
    setRealtimeLive(false)
    expect(seen).toHaveLength(2)
  })
})
