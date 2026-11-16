import { FileText } from 'lucide-react'
import type { ReactNode } from 'react'
import { t } from '../../i18n'
import { chatFileUrl } from '../../lib/api'
import { filesOf, fileSize, messageTime, systemText } from '../../lib/chat'
import { splitMentions } from '../../lib/mentions'
import type { ChatMember, ChatMessage } from '../../lib/types'
import { cn } from '../../lib/utils'

/** The text of a message, with the people it mentions picked out. */
function Body({ message, members }: { message: ChatMessage; members: ChatMember[] }) {
  const names = message.mentions.map((id) => members.find((member) => member.id === id)?.name ?? '').filter(Boolean)
  return (
    <>
      {splitMentions(message.body ?? '', names).map((part, index) =>
        part.mention ? (
          <span key={index} className="font-medium text-primary-deep">
            {part.text}
          </span>
        ) : (
          <span key={index}>{part.text}</span>
        ),
      )}
    </>
  )
}

/** C4: images show in the message; other files are a row to download. */
function Attachments({ message }: { message: ChatMessage }) {
  const files = filesOf(message)
  if (files.length === 0) return null
  const images = files.filter((file) => file.kind === 'IMAGE')
  const documents = files.filter((file) => file.kind !== 'IMAGE')
  return (
    <div className="mb-1 flex flex-col gap-1">
      {images.length > 0 && (
        <div className={cn('grid gap-1', images.length > 1 && 'grid-cols-2')}>
          {images.map((file) => (
            <a key={file.id} href={chatFileUrl(file.id)} target="_blank" rel="noreferrer" aria-label={t('chat.openImage', { name: file.name })} className="block overflow-hidden rounded-md">
              <img src={chatFileUrl(file.id)} alt={file.name} loading="lazy" className="max-h-60 w-full bg-band object-cover" />
            </a>
          ))}
        </div>
      )}
      {documents.map((file) => (
        <a
          key={file.id}
          href={chatFileUrl(file.id, true)}
          aria-label={t('chat.download', { name: file.name })}
          className="flex min-h-11 items-center gap-2 rounded-md bg-canvas/60 px-2 py-1.5 text-caption text-primary hover:underline"
        >
          <FileText aria-hidden size={18} className="flex-none" />
          <span className="min-w-0 flex-1 truncate">{file.name}</span>
          <span className="flex-none text-ink-meta">{fileSize(file.size)}</span>
        </a>
      ))}
    </div>
  )
}

/** Brief outline on a message reached from search or a notification. */
const FOCUS_CLASS = 'ring-2 ring-primary ring-offset-2 ring-offset-canvas'

/**
 * C2, C3: messages oldest first. Own messages sit right on a blue band, others left on grey; in a
 * group the sender's name heads each run of their messages. Used by the chat and, read-only, by the
 * GA head's review.
 */
export function MessageList({
  messages,
  members,
  meId,
  group,
  menu,
  footer,
  focusSeq,
}: {
  messages: ChatMessage[]
  members: ChatMember[]
  /** Null for the GA head's review, where nobody's messages are "own". */
  meId: string | null
  group: boolean
  /** The "…" menu of a message, if it has one. */
  menu?: (message: ChatMessage) => ReactNode
  /** Under a message: "seen", or a failed send. */
  footer?: (message: ChatMessage) => ReactNode
  /** A message to point out (search result, @mention); it gets `id="msg-<seq>"` like all others. */
  focusSeq?: number | null
}) {
  return (
    <ol className="flex flex-col gap-1">
      {messages.map((message, index) => {
        if (message.kind === 'SYSTEM')
          return (
            <li key={message.seq} id={`msg-${message.seq}`} className="py-2 text-center text-caption text-ink-meta">
              {systemText(message)}
            </li>
          )
        const own = message.senderId === meId
        const previous = messages[index - 1]
        const startsRun = !previous || previous.kind === 'SYSTEM' || previous.senderId !== message.senderId
        return (
          <li key={message.seq} id={`msg-${message.seq}`} className={cn('group flex flex-col', own ? 'items-end' : 'items-start', startsRun && index > 0 && 'mt-2')}>
            {group && !own && startsRun && <p className="mb-0.5 px-1 text-caption text-ink-meta">{message.senderName}</p>}
            <div className={cn('flex max-w-[85%] items-center gap-1 md:max-w-[70%]', own && 'flex-row-reverse')}>
              <div
                className={cn(
                  'min-w-0 rounded-lg px-3 py-2 text-link break-words whitespace-pre-wrap transition-shadow duration-200 motion-reduce:transition-none',
                  own ? 'bg-band-blue text-ink-body' : 'bg-chrome text-ink-body',
                  message.deletedAt && 'text-ink-meta italic',
                  focusSeq === message.seq && FOCUS_CLASS,
                )}
              >
                {!message.deletedAt && <Attachments message={message} />}
                {message.deletedAt ? t('chat.recalled') : message.body ? <Body message={message} members={members} /> : null}
                <span className="mt-0.5 block text-right text-xs text-ink-meta">
                  {message.editedAt && !message.deletedAt && `${t('chat.edited')} · `}
                  {messageTime(message.createdAt)}
                </span>
              </div>
              {menu && !message.deletedAt && <div className="flex-none opacity-100 md:opacity-0 md:group-focus-within:opacity-100 md:group-hover:opacity-100">{menu(message)}</div>}
            </div>
            {footer?.(message)}
          </li>
        )
      })}
    </ol>
  )
}
