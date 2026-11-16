import { useEffect, useRef, useState } from 'react'
import type { useUrlState } from './useUrlState'

const DEBOUNCE_MS = 300

/**
 * The input follows every keystroke, while the URL (and so the request) changes only after a pause.
 * Typing one name therefore costs one request instead of one per letter.
 */
export function useListSearch(url: ReturnType<typeof useUrlState>, name = 'q') {
  const committed = url.get(name)
  const [input, setInput] = useState(committed)
  const [synced, setSynced] = useState(committed)
  const timer = useRef<ReturnType<typeof setTimeout>>(undefined)

  // Back, forward or a cleared filter changes the URL; the input follows it. The trim comparison
  // keeps a space the user has just typed between two words.
  if (committed !== synced) {
    setSynced(committed)
    if (committed !== input.trim()) setInput(committed)
  }

  useEffect(() => () => clearTimeout(timer.current), [])

  const onChange = (value: string) => {
    setInput(value)
    clearTimeout(timer.current)
    timer.current = setTimeout(() => url.set({ [name]: value.trim(), page: null }), DEBOUNCE_MS)
  }

  return { input, committed, onChange }
}

/** A value that follows `value` after a pause: a search box that is not in the URL asks once per pause. */
export function useDebounced<T>(value: T, ms = DEBOUNCE_MS): T {
  const [settled, setSettled] = useState(value)
  useEffect(() => {
    const timer = setTimeout(() => setSettled(value), ms)
    return () => clearTimeout(timer)
  }, [value, ms])
  return settled
}
