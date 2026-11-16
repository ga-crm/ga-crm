import { useQuery } from '@tanstack/react-query'
import { Bell } from 'lucide-react'
import { useState } from 'react'
import { Link } from 'react-router-dom'
import { t } from '../i18n'
import { notificationAge, notificationText } from '../lib/notificationLabels'
import { queries } from '../lib/queries'
import { useNotificationActions } from '../lib/useNotificationOpen'
import { SidePanel } from './SidePanel'
import { Button, Spinner } from './ui'

/** The panel is as tall as the window, so it lists more than a dropdown did. */
const LATEST = 20

/** NTF-1: the bell in the global bar, with the unread count and the latest notifications. */
export function NotificationBell() {
  const [open, setOpen] = useState(false)
  const [now, setNow] = useState(() => Date.now())
  const unread = useQuery(queries.notificationsUnread())
  const latest = useQuery({ ...queries.notifications({ pageSize: LATEST }), enabled: open })
  const actions = useNotificationActions()
  const count = unread.data?.unread ?? 0

  return (
    <SidePanel
      open={open}
      onOpenChange={(next) => {
        if (next) setNow(Date.now())
        setOpen(next)
      }}
      title={t('notification.title')}
      description={count > 0 ? t('notification.unreadSummary', { count }) : undefined}
      action={
        <Button variant="ghost" disabled={count === 0 || actions.pending} onClick={actions.readAll} className="flex-none">
          {t('notification.readAll')}
        </Button>
      }
      trigger={
        <button
          type="button"
          aria-label={count > 0 ? t('notification.bellUnread', { count }) : t('notification.bell')}
          className="relative flex size-11 cursor-pointer items-center justify-center rounded-md text-ink-nav hover:bg-band hover:text-ink"
        >
          <Bell aria-hidden size={20} />
          {count > 0 && (
            <span aria-hidden className="absolute top-1.5 right-1 min-w-4.5 rounded-sm bg-primary px-1 text-center text-[11px] leading-4.5 font-medium text-on-primary tabular-nums">
              {count > 99 ? '99+' : count}
            </span>
          )}
        </button>
      }
      footer={
        <Link to="/notifications" onClick={() => setOpen(false)} className="flex min-h-11 items-center justify-center rounded-md px-3 text-caption font-medium text-primary hover:bg-band">
          {t('notification.seeAll')}
        </Link>
      }
    >
      {latest.isPending && <Spinner />}
      {latest.data && latest.data.items.length === 0 && <p className="px-5 py-8 text-center text-caption text-ink-meta">{t('notification.empty')}</p>}
      {/* Rows inset from the edge, each its own rounded hover target, like the macOS Notification Centre */}
      <ul className="flex flex-col gap-0.5 p-2">
        {latest.data?.items.map((item) => (
          <li key={item.id}>
            <button
              type="button"
              onClick={() => {
                setOpen(false)
                actions.open(item)
              }}
              className={`relative flex w-full cursor-pointer items-start gap-3 rounded-md px-3 py-3 text-left hover:bg-band ${item.read ? '' : 'bg-chrome'}`}
            >
              <span aria-hidden className={`mt-1.5 size-2 flex-none rounded-sm ${item.read ? 'bg-transparent' : 'bg-primary'}`} />
              <span className="min-w-0 flex-1">
                <span className={`block text-caption ${item.read ? 'text-ink-meta' : 'font-medium text-ink'}`}>{notificationText(item)}</span>
                <span className="block text-caption text-ink-meta">{notificationAge(item.createdAt, now)}</span>
              </span>
              {!item.read && <span className="sr-only">{t('notification.unreadLabel')}</span>}
            </button>
          </li>
        ))}
      </ul>
    </SidePanel>
  )
}
