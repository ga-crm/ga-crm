import { useEffect } from 'react'
import { applyAppearance } from '../lib/theme'
import { useMe } from './useMe'

/** Keeps the page in line with the signed-in user's appearance, and with the OS when set to "system". */
export function useAppearanceSync() {
  const { data: me } = useMe()
  const theme = me?.appearance.theme
  const accent = me?.appearance.accent

  useEffect(() => {
    if (!theme || !accent) return
    applyAppearance({ theme, accent })
    if (theme !== 'system') return

    const media = matchMedia('(prefers-color-scheme: dark)')
    const onChange = () => applyAppearance({ theme, accent })
    media.addEventListener('change', onChange)
    return () => {
      media.removeEventListener('change', onChange)
    }
  }, [theme, accent])
}
