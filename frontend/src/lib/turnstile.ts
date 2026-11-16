import { useEffect, useRef } from 'react'

type Turnstile = {
  render: (element: HTMLElement, options: Record<string, unknown>) => string
  remove: (id: string) => void
}
declare global {
  interface Window {
    turnstile?: Turnstile
  }
}

const SCRIPT = 'https://challenges.cloudflare.com/turnstile/v0/api.js?render=explicit'
let loading: Promise<void> | null = null

function load(): Promise<void> {
  if (window.turnstile) return Promise.resolve()
  loading ??= new Promise((resolve, reject) => {
    const script = document.createElement('script')
    script.src = SCRIPT
    script.async = true
    script.onload = () => resolve()
    script.onerror = () => reject(new Error('turnstile'))
    document.head.append(script)
  })
  return loading
}

/** CMP-4: renders Cloudflare Turnstile into the returned element; `onToken('')` when it expires. */
export function useTurnstile(siteKey: string | null, onToken: (token: string) => void) {
  const box = useRef<HTMLDivElement>(null)
  const callback = useRef(onToken)
  useEffect(() => {
    callback.current = onToken
  })
  useEffect(() => {
    if (!siteKey || !box.current) return
    const controller = new AbortController()
    const widget: { id: string | null } = { id: null }
    const element = box.current
    load()
      .then(() => {
        if (controller.signal.aborted || !window.turnstile) return
        widget.id = window.turnstile.render(element, {
          sitekey: siteKey,
          language: 'vi',
          callback: (token: string) => callback.current(token),
          'expired-callback': () => callback.current(''),
          'error-callback': () => callback.current(''),
        })
      })
      .catch(() => callback.current(''))
    return () => {
      controller.abort()
      if (widget.id) window.turnstile?.remove(widget.id)
    }
  }, [siteKey])
  return box
}
