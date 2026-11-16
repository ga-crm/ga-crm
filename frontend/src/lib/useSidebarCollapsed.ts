import { useState } from 'react'

const STORAGE_KEY = 'crm-sidebar-collapsed'

function readCollapsed(): boolean {
  try {
    return localStorage.getItem(STORAGE_KEY) === '1'
  } catch {
    return false
  }
}

/**
 * Remembered on this browser only: it is a convenience, not an account setting. Drives the
 * shadcn/ui SidebarProvider (`open` / `onOpenChange`), which keeps no state of its own here.
 */
export function useSidebarCollapsed(): [boolean, (collapsed: boolean) => void] {
  const [collapsed, setCollapsed] = useState(readCollapsed)

  const store = (next: boolean) => {
    setCollapsed(next)
    try {
      localStorage.setItem(STORAGE_KEY, next ? '1' : '0')
    } catch {
      // The sidebar still works; the choice just is not remembered
    }
  }

  return [collapsed, store]
}
