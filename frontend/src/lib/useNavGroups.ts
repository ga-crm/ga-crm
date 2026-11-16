import { useState } from 'react'
import type { MessageKey } from '../i18n'

const STORAGE_KEY = 'crm-sidebar-closed-groups'

function readClosed(): MessageKey[] {
  try {
    const stored: unknown = JSON.parse(localStorage.getItem(STORAGE_KEY) ?? '[]')
    return Array.isArray(stored) ? (stored as MessageKey[]) : []
  } catch {
    return []
  }
}

/** Which sidebar groups are closed. Moving to a screen opens its group, so the current row is visible. */
export function useNavGroups(activeGroup?: MessageKey) {
  const [closed, setClosed] = useState(readClosed)
  const [lastActive, setLastActive] = useState<MessageKey | undefined>(undefined)

  const store = (next: MessageKey[]) => {
    setClosed(next)
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(next))
    } catch {
      // The groups still work; the choice just is not remembered
    }
  }

  if (activeGroup !== lastActive) {
    setLastActive(activeGroup)
    if (activeGroup && closed.includes(activeGroup)) store(closed.filter((group) => group !== activeGroup))
  }

  return {
    isOpen: (group: MessageKey) => !closed.includes(group),
    toggle: (group: MessageKey) => store(closed.includes(group) ? closed.filter((item) => item !== group) : [...closed, group]),
  }
}
