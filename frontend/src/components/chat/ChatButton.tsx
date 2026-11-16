import { useQuery } from '@tanstack/react-query'
import { MessageCircle } from 'lucide-react'
import { Link } from 'react-router-dom'
import { t } from '../../i18n'
import { queries } from '../../lib/queries'

/** C2: the chat icon in the global bar, with unread messages of conversations that are not muted. */
export function ChatButton() {
  const unread = useQuery(queries.chatUnread())
  const count = unread.data?.unread ?? 0
  return (
    <Link
      to="/chat"
      aria-label={count > 0 ? t('chat.iconUnread', { count }) : t('chat.icon')}
      className="relative flex size-11 items-center justify-center rounded-md text-ink-nav hover:bg-band hover:text-ink"
    >
      <MessageCircle aria-hidden size={20} />
      {count > 0 && (
        <span aria-hidden className="absolute top-1.5 right-1 min-w-4.5 rounded-sm bg-primary px-1 text-center text-[11px] leading-4.5 font-medium text-on-primary tabular-nums">
          {count > 99 ? '99+' : count}
        </span>
      )}
    </Link>
  )
}
