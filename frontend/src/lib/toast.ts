import { toast as sonner } from 'sonner'

export type ToastKind = 'success' | 'info' | 'warning' | 'error'

// Problems stay longer, because they usually need reading and acting on
export const DISMISS_AFTER_MS: Record<ToastKind, number> = {
  success: 4000,
  info: 4000,
  warning: 7000,
  error: 8000,
}

function show(kind: ToastKind, text: string, detail?: string) {
  return sonner[kind](text, {
    description: detail,
    duration: DISMISS_AFTER_MS[kind],
    closeButton: true,
  })
}

/**
 * Section 21.3: every action confirms its result in place. Say what happened, in words about this
 * action, and pick the kind by the outcome: `warning` when it worked only in part or needs attention.
 * Shown by the shadcn/ui Sonner toaster (`components/shadcn/sonner.tsx`).
 */
export const toast = {
  success: (text: string, detail?: string) => show('success', text, detail),
  info: (text: string, detail?: string) => show('info', text, detail),
  warning: (text: string, detail?: string) => show('warning', text, detail),
  error: (text: string, detail?: string) => show('error', text, detail),
  dismiss: (id?: string | number) => sonner.dismiss(id),
}
