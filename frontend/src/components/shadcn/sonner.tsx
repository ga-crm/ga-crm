import { CircleCheckIcon, InfoIcon, Loader2Icon, OctagonXIcon, TriangleAlertIcon } from 'lucide-react'
import { Toaster as Sonner, type ToasterProps } from 'sonner'

/**
 * shadcn/ui Sonner, coloured by the app's tokens instead of next-themes: each kind uses its status
 * band, so every theme and accent keeps it readable.
 */
const Toaster = ({ ...props }: ToasterProps) => (
  <Sonner
    className="toaster group"
    icons={{
      success: <CircleCheckIcon className="size-4" />,
      info: <InfoIcon className="size-4" />,
      warning: <TriangleAlertIcon className="size-4" />,
      error: <OctagonXIcon className="size-4" />,
      loading: <Loader2Icon className="size-4 animate-spin" />,
    }}
    toastOptions={{
      unstyled: true,
      classNames: {
        toast: 'flex w-full items-start gap-2.5 rounded-md border border-current/25 px-3 py-2.5 text-caption font-sans',
        title: 'font-medium',
        description: 'mt-0.5 opacity-90',
        icon: 'mt-0.5 flex-none',
        closeButton: '!static order-last -mt-0.5 -mr-1 !size-6 flex-none !translate-none !border-0 !bg-transparent opacity-70 hover:opacity-100',
        success: 'bg-success-band text-success',
        info: 'bg-band-blue text-primary-deep',
        warning: 'bg-warning-band text-warning',
        error: 'bg-alert-band text-alert',
      },
    }}
    {...props}
  />
)

export { Toaster }
