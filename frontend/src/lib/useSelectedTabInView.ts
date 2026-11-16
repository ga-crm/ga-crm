import { useEffect } from 'react'

/**
 * On a phone a tab bar scrolls sideways, so a tab opened from the URL could sit out of view. This
 * brings the selected one in whenever it changes or the page finishes loading.
 */
export function useSelectedTabInView(tab: string, ready: boolean) {
  useEffect(() => {
    if (!ready) return
    document.querySelector('[role="tab"][aria-selected="true"]')?.scrollIntoView({ block: 'nearest', inline: 'nearest' })
  }, [tab, ready])
}
