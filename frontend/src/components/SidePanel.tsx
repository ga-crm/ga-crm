import { X } from 'lucide-react'
import type { CSSProperties, ReactNode } from 'react'
import { Drawer, DrawerClose, DrawerContent, DrawerDescription, DrawerFooter, DrawerHeader, DrawerTitle, DrawerTrigger } from '@/components/shadcn/drawer'
import { t } from '../i18n'
import { IconButton } from './ui'

/**
 * A panel that slides in from the right and floats beside the page, like the macOS Notification
 * Centre (shadcn/ui Drawer on vaul). Used by the account menu and the notification bell.
 */
export function SidePanel({
  open,
  onOpenChange,
  trigger,
  title,
  description,
  action,
  footer,
  children,
}: {
  open: boolean
  onOpenChange: (open: boolean) => void
  /** The button that opens it; it gets the open state and keyboard handling. Left out when the page opens it. */
  trigger?: ReactNode
  title: ReactNode
  description?: ReactNode
  /** Beside the title, before the close button (for example "mark all read"). */
  action?: ReactNode
  footer?: ReactNode
  children: ReactNode
}) {
  return (
    <Drawer direction="right" open={open} onOpenChange={onOpenChange} autoFocus>
      {trigger && <DrawerTrigger asChild>{trigger}</DrawerTrigger>}
      <DrawerContent
        overlayClassName="bg-black/40"
        // Inset 8 px from the edges; slides fully off screen, gap included
        style={{ '--initial-transform': 'calc(100% + 8px)' } as CSSProperties}
        // Focus the panel itself, not its first button, so Enter cannot press "mark all read" by accident
        onOpenAutoFocus={(event) => {
          event.preventDefault()
          ;(event.currentTarget as HTMLElement | null)?.focus()
        }}
        className="w-[calc(100vw-1rem)] overflow-hidden rounded-lg border border-band bg-canvas text-ink-body outline-none data-[vaul-drawer-direction=right]:inset-y-2 data-[vaul-drawer-direction=right]:right-2 data-[vaul-drawer-direction=right]:w-[calc(100vw-1rem)] data-[vaul-drawer-direction=right]:border data-[vaul-drawer-direction=right]:border-band data-[vaul-drawer-direction=right]:sm:w-[400px] data-[vaul-drawer-direction=right]:sm:max-w-[400px]"
      >
        {/* Header and footer are chrome bands; the body is the canvas. Text sits 20 px from the edge */}
        <DrawerHeader className="flex-none flex-row items-center gap-2 bg-chrome py-3 pr-3 pl-5 md:gap-2">
          <div className="min-w-0 flex-1">
            <DrawerTitle className="truncate text-link font-medium text-ink">{title}</DrawerTitle>
            {description && <DrawerDescription className="truncate text-caption text-ink-meta">{description}</DrawerDescription>}
          </div>
          {action}
          <DrawerClose asChild>
            <IconButton label={t('common.close')} tone="neutral" className="flex-none">
              <X aria-hidden size={18} />
            </IconButton>
          </DrawerClose>
        </DrawerHeader>
        <div className="min-h-0 flex-1 overflow-y-auto">{children}</div>
        {footer && <DrawerFooter className="flex-none gap-0 border-t border-band bg-chrome p-2">{footer}</DrawerFooter>}
      </DrawerContent>
    </Drawer>
  )
}
