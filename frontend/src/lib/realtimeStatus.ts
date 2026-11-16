/**
 * Whether this tab holds a live WebSocket to the API. Kept apart from `realtime.ts`, so queries can
 * read it without importing the socket client.
 */
let live = false
const listeners = new Set<() => void>()

export function isRealtimeLive(): boolean {
  return live
}

export function setRealtimeLive(next: boolean): void {
  if (live === next) return
  live = next
  for (const listener of listeners) listener()
}

export function subscribeRealtimeLive(listener: () => void): () => void {
  listeners.add(listener)
  return () => listeners.delete(listener)
}

/** NTF-1: pushed events replace polling; without a socket the bell asks every minute as before. */
export const POLL_WITHOUT_SOCKET_MS = 60_000

export function pollInterval(): number | false {
  return live ? false : POLL_WITHOUT_SOCKET_MS
}
