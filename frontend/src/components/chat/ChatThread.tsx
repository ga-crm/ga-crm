import { useInfiniteQuery, useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { ArrowLeft, Paperclip, SendHorizontal, Users, X } from 'lucide-react'
import { useEffect, useId, useLayoutEffect, useRef, useState, useSyncExternalStore } from 'react'
import { t } from '../../i18n'
import { api, errorMessage } from '../../lib/api'
import { ACCEPT, addMessage, attachmentProblem, fileSize, flattenPages, MAX_FILES, sensitiveNumbers, stillEditable, subscribeTyping, typingIn } from '../../lib/chat'
import type { MessagePages } from '../../lib/chat'
import { activeMention, insertMention, keptMentions } from '../../lib/mentions'
import { presenceText, usePresenceInfo, useNow } from '../../lib/presence'
import { keys, queries } from '../../lib/queries'
import { sendTyping } from '../../lib/realtime'
import { toast } from '../../lib/toast'
import type { ChatConversation, ChatFile, ChatMember, ChatMessage } from '../../lib/types'
import { Alert, Button, ConfirmDialog, FormError, IconButton, PresenceDot, RowMenu, Spinner, Textarea } from '../ui'
import { MessageList } from './MessageList'

/** Typing events go out at most this often; the server drops extras. */
const TYPING_EVERY_MS = 3_000

interface Pending {
  clientMsgId: string
  body: string
  mentions: string[]
  /** Files still to upload; once uploaded their ids are kept, so a retry does not upload twice. */
  files: File[]
  fileIds?: string[]
  error?: string
}

/** Who is typing in a conversation, re-rendered as entries fade. */
function useTyping(conversationId: string, members: ChatMember[]): string[] {
  const [, setTick] = useState(0)
  const ids = useSyncExternalStore(subscribeTyping, () => typingIn(conversationId).join(','))
  // Entries expire on their own; check once a second while someone is shown
  useEffect(() => {
    if (!ids) return
    const timer = setInterval(() => setTick((tick) => tick + 1), 1_000)
    return () => clearInterval(timer)
  }, [ids])
  return typingIn(conversationId)
    .map((id) => members.find((member) => member.id === id)?.name)
    .filter((name): name is string => !!name)
}

/** C2, C3: one conversation: messages, "seen", typing, and the box to write in. */
export function ChatThread({
  conversationId,
  meId,
  onBack,
  onOpenMembers,
  menuItems,
  focusSeq = null,
  onFocused,
}: {
  conversationId: string
  meId: string
  onBack: () => void
  onOpenMembers: () => void
  /** A message to bring into view and outline briefly (search result, @mention). */
  focusSeq?: number | null
  onFocused?: () => void
  menuItems: (detail: ChatConversation) => { label: string; onSelect: () => void; danger?: boolean }[]
}) {
  const queryClient = useQueryClient()
  const detail = useQuery(queries.chatConversation(conversationId))
  const messages = useInfiniteQuery(queries.chatMessages(conversationId))
  const now = useNow()
  const scroller = useRef<HTMLDivElement>(null)
  const [pending, setPending] = useState<Pending[]>([])
  const [editing, setEditing] = useState<ChatMessage | null>(null)

  const list = flattenPages(messages.data)
  const members = detail.data?.members ?? []
  const me = members.find((member) => member.id === meId)
  const group = detail.data?.kind === 'GROUP'
  const other = group ? undefined : members.find((member) => member.id !== meId)
  const readOnly = !group && !!other && !other.active
  const presenceOf = usePresenceInfo(other ? [other.id] : [])
  const typing = useTyping(conversationId, members)
  const lastSeq = list.at(-1)?.seq ?? 0

  // Keep the view at the bottom when it was there; keep the reading position when older messages load
  const anchor = useRef({ atBottom: true, height: 0, firstSeq: 0 })
  useLayoutEffect(() => {
    const box = scroller.current
    if (!box) return
    const firstSeq = list[0]?.seq ?? 0
    if (anchor.current.firstSeq && firstSeq < anchor.current.firstSeq) box.scrollTop += box.scrollHeight - anchor.current.height
    else if (anchor.current.atBottom) box.scrollTop = box.scrollHeight
    anchor.current = { ...anchor.current, height: box.scrollHeight, firstSeq }
  }, [list.length, pending.length, typing.length, list])

  // Load older pages until the wanted message is there, then bring it into view
  const [outlined, setOutlined] = useState<number | null>(null)
  const loadedFocus = focusSeq !== null && list.some((message) => message.seq === focusSeq)
  const { hasNextPage, isFetchingNextPage, fetchNextPage } = messages
  const ready = !!messages.data
  // The parent's callback may be a new function on every render; only the latest is called
  const focusedCallback = useRef(onFocused)
  useEffect(() => {
    focusedCallback.current = onFocused
  })
  useEffect(() => {
    if (focusSeq === null || !ready) return
    anchor.current.atBottom = false
    if (!loadedFocus) {
      if (hasNextPage && !isFetchingNextPage) void fetchNextPage()
      return
    }
    document.getElementById(`msg-${focusSeq}`)?.scrollIntoView({ block: 'center' })
    const show = setTimeout(() => setOutlined(focusSeq), 0)
    const hide = setTimeout(() => {
      setOutlined(null)
      focusedCallback.current?.()
    }, 2_500)
    return () => {
      clearTimeout(show)
      clearTimeout(hide)
    }
  }, [focusSeq, loadedFocus, ready, hasNextPage, isFetchingNextPage, fetchNextPage])

  // Read what is on screen while the tab is visible
  const readSeq = me?.lastReadSeq ?? 0
  useEffect(() => {
    if (lastSeq <= readSeq) return
    const read = () => {
      if (document.visibilityState === 'visible') void api.post(`/chat/conversations/${conversationId}/read`, { seq: lastSeq })
    }
    const timer = setTimeout(read, 400)
    document.addEventListener('visibilitychange', read)
    return () => {
      clearTimeout(timer)
      document.removeEventListener('visibilitychange', read)
    }
  }, [conversationId, lastSeq, readSeq])

  const store = (message: ChatMessage) =>
    queryClient.setQueryData<MessagePages>([...keys.chat, 'messages', conversationId], (data) => (data ? addMessage(data, message).data : data))

  const send = useMutation({
    mutationFn: async (item: Pending) => {
      let fileIds = item.fileIds
      if (!fileIds && item.files.length > 0) {
        fileIds = (await api.upload<{ items: ChatFile[] }>(`/chat/conversations/${conversationId}/files`, item.files)).items.map((file) => file.id)
        setPending((list) => list.map((entry) => (entry.clientMsgId === item.clientMsgId ? { ...entry, fileIds } : entry)))
      }
      return api.post<ChatMessage>(`/chat/conversations/${conversationId}/messages`, { clientMsgId: item.clientMsgId, body: item.body, mentions: item.mentions, fileIds })
    },
    onSuccess: (message, item) => {
      store(message)
      setPending((list) => list.filter((entry) => entry.clientMsgId !== item.clientMsgId))
      void queryClient.invalidateQueries({ queryKey: [...keys.chat, 'list'] })
    },
    onError: (error, item) => setPending((list) => list.map((entry) => (entry.clientMsgId === item.clientMsgId ? { ...entry, error: errorMessage(error) } : entry))),
  })
  const submit = (body: string, mentions: string[], files: File[]) => {
    const item: Pending = { clientMsgId: crypto.randomUUID(), body, mentions, files }
    anchor.current.atBottom = true
    setPending((list) => [...list, item])
    send.mutate(item)
  }

  const edit = useMutation({
    mutationFn: ({ seq, body }: { seq: number; body: string }) => api.patch(`/chat/conversations/${conversationId}/messages/${seq}`, { body }),
    onSuccess: () => {
      setEditing(null)
      void queryClient.invalidateQueries({ queryKey: [...keys.chat, 'messages', conversationId] })
    },
  })
  const [recalling, setRecalling] = useState<ChatMessage | null>(null)
  const recall = useMutation({
    mutationFn: (seq: number) => api.delete(`/chat/conversations/${conversationId}/messages/${seq}`),
    onSuccess: () => {
      setRecalling(null)
      toast.info(t('toast.messageRecalled'))
      void queryClient.invalidateQueries({ queryKey: [...keys.chat, 'messages', conversationId] })
    },
  })

  // "Seen" goes under one's last message only
  const lastOwn = [...list].reverse().find((message) => message.kind === 'TEXT' && message.senderId === meId)
  const seenBy = lastOwn ? members.filter((member) => member.id !== meId && member.lastReadSeq >= lastOwn.seq) : []

  if (detail.isError) return <Alert>{errorMessage(detail.error)}</Alert>

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <header className="flex min-h-15 flex-none items-center gap-2 border-b border-band px-2 md:px-4">
        <IconButton tone="neutral" label={t('chat.back')} onClick={onBack} className="md:hidden">
          <ArrowLeft aria-hidden size={20} />
        </IconButton>
        <div className="min-w-0 flex-1">
          <h2 className="flex items-center gap-1.5 text-subhead font-medium text-ink">
            {other && <PresenceDot status={presenceOf(other.id).status} />}
            <span className="truncate">{detail.data?.title ?? ''}</span>
          </h2>
          <p className="truncate text-caption text-ink-meta">
            {group
              ? t('chat.memberCount', { count: members.length })
              : other && !other.active
                ? t('chat.inactive')
                : other
                  ? presenceText(presenceOf(other.id), now)
                  : ' '}
          </p>
        </div>
        {group && (
          <IconButton label={t('chat.members')} onClick={onOpenMembers}>
            <Users aria-hidden size={18} />
          </IconButton>
        )}
        {detail.data && <RowMenu label={t('chat.menu')} items={menuItems(detail.data)} />}
      </header>

      <div
        ref={scroller}
        onScroll={(event) => {
          const box = event.currentTarget
          anchor.current.atBottom = box.scrollHeight - box.scrollTop - box.clientHeight < 40
        }}
        className="min-h-0 flex-1 overflow-y-auto px-3 py-3 md:px-6"
        aria-live="polite"
        aria-relevant="additions"
      >
        {messages.isPending && <Spinner />}
        {messages.hasNextPage && (
          <div className="mb-2 text-center">
            <Button variant="ghost" disabled={messages.isFetchingNextPage} onClick={() => void messages.fetchNextPage()}>
              {t('chat.older')}
            </Button>
          </div>
        )}
        {messages.data && list.length === 0 && pending.length === 0 && <p className="py-10 text-center text-caption text-ink-meta">{t('chat.emptyThread')}</p>}
        <MessageList
          messages={list}
          members={members}
          meId={meId}
          group={group}
          focusSeq={outlined}
          menu={(message) => {
            if (message.senderId !== meId || message.kind !== 'TEXT') return null
            const editable = stillEditable(message.createdAt)
            return (
              <RowMenu
                label={t('chat.messageMenu')}
                items={[
                  ...(editable ? [{ label: t('chat.edit'), onSelect: () => setEditing(message) }] : []),
                  { label: t('chat.recall'), danger: true, onSelect: () => setRecalling(message) },
                ]}
              />
            )
          }}
          footer={(message) =>
            message === lastOwn && seenBy.length > 0 ? (
              <p className="mt-0.5 px-1 text-xs text-ink-meta">{group ? t('chat.seenBy', { count: seenBy.length }) : t('chat.seen')}</p>
            ) : null
          }
        />
        {pending.length > 0 && (
          <ol className="mt-1 flex flex-col items-end gap-1">
            {pending.map((item) => (
              <li key={item.clientMsgId} className="flex max-w-[85%] flex-col items-end md:max-w-[70%]">
                <div className="rounded-lg bg-band-blue px-3 py-2 text-link break-words whitespace-pre-wrap text-ink-body opacity-70">
                  {item.files.length > 0 && <span className="block text-caption text-ink-meta">{item.files.map((file) => file.name).join(', ')}</span>}
                  {item.body}
                </div>
                {item.error ? (
                  <p className="mt-0.5 flex items-center gap-2 text-xs text-alert">
                    {item.error}
                    <button
                      type="button"
                      className="cursor-pointer text-primary underline"
                      onClick={() => {
                        setPending((list) => list.map((entry) => (entry.clientMsgId === item.clientMsgId ? { ...entry, error: undefined } : entry)))
                        send.mutate({ ...item, error: undefined })
                      }}
                    >
                      {t('chat.retry')}
                    </button>
                  </p>
                ) : (
                  <p className="mt-0.5 text-xs text-ink-meta">{item.files.length > 0 && !item.fileIds ? t('chat.uploading', { count: item.files.length }) : t('chat.sending')}</p>
                )}
              </li>
            ))}
          </ol>
        )}
      </div>

      {/* Reserved, so the box below does not jump when someone starts typing */}
      <p className="min-h-6 flex-none px-4 text-caption text-ink-meta md:px-6">{typing.length > 0 && t('chat.typing', { names: typing.join(', ') })}</p>

      {readOnly ? (
        <p className="flex-none border-t border-band px-4 py-4 text-center text-caption text-ink-meta">{t('chat.readOnly')}</p>
      ) : (
        <Composer
          key={editing?.seq ?? 'new'}
          conversationId={conversationId}
          members={group ? members.filter((member) => member.id !== meId) : []}
          editing={editing}
          editError={edit.isError ? errorMessage(edit.error) : undefined}
          onCancelEdit={() => {
            setEditing(null)
            edit.reset()
          }}
          onSubmit={(body, mentions, files) => (editing ? edit.mutate({ seq: editing.seq, body }) : submit(body, mentions, files))}
        />
      )}

      <ConfirmDialog
        message={recalling ? t('chat.recallConfirm') : null}
        danger
        pending={recall.isPending}
        error={recall.isError ? errorMessage(recall.error) : undefined}
        onConfirm={() => recalling && recall.mutate(recalling.seq)}
        onClose={() => {
          setRecalling(null)
          recall.reset()
        }}
      />
    </div>
  )
}

/**
 * The box to write in: Enter sends, Shift+Enter breaks the line, @ names a group member. Vietnamese
 * input methods compose with Enter too, so Enter during composition is left to them.
 */
function Composer({
  conversationId,
  members,
  editing,
  editError,
  onCancelEdit,
  onSubmit,
}: {
  conversationId: string
  members: ChatMember[]
  editing: ChatMessage | null
  editError?: string
  onCancelEdit: () => void
  onSubmit: (body: string, mentions: string[], files: File[]) => void
}) {
  const [body, setBody] = useState(editing?.body ?? '')
  const [files, setFiles] = useState<File[]>([])
  const [fileError, setFileError] = useState<string | null>(null)
  const picker = useRef<HTMLInputElement>(null)
  const [picked, setPicked] = useState<{ id: string; name: string }[]>([])
  const [mention, setMention] = useState<{ start: number; query: string } | null>(null)
  const [active, setActive] = useState(0)
  const [confirming, setConfirming] = useState<string | null>(null)
  const box = useRef<HTMLTextAreaElement>(null)
  const typedAt = useRef(0)
  const listId = useId()
  const options = mention ? members.filter((member) => member.name.toLowerCase().includes(mention.query.toLowerCase())).slice(0, 8) : []
  const open = mention !== null && options.length > 0

  useEffect(() => {
    box.current?.focus()
  }, [conversationId, editing])

  /** K8: checked here first, so a wrong file is named before anything is uploaded. */
  const attach = (added: File[]) => {
    if (editing || added.length === 0) return
    const problem = added.map(attachmentProblem).find(Boolean)
    if (problem) return setFileError(problem)
    const next = [...files, ...added]
    if (next.length > MAX_FILES) return setFileError(t('chat.tooManyFiles'))
    setFileError(null)
    setFiles(next)
  }
  const finish = (text: string) => {
    onSubmit(text, keptMentions(text, picked), files)
    if (!editing) {
      setBody('')
      setPicked([])
      setFiles([])
      setFileError(null)
    }
  }
  const trySend = () => {
    const text = body.trim()
    if (!text && (editing || files.length === 0)) return
    // K4 (PDP): numbers like an ID card or a bank account need a second thought
    const found = sensitiveNumbers(text)
    if (found.length > 0) setConfirming(text)
    else finish(text)
  }
  const choose = (person: ChatMember) => {
    if (!mention || !box.current) return
    const next = insertMention(body, mention.start, box.current.selectionStart, person.name)
    setBody(next.text)
    setPicked((list) => [...list.filter((item) => item.id !== person.id), { id: person.id, name: person.name }])
    setMention(null)
    requestAnimationFrame(() => {
      box.current?.focus()
      box.current?.setSelectionRange(next.caret, next.caret)
    })
  }

  return (
    <div className="flex-none border-t border-band px-3 py-2 md:px-6">
      {editing && (
        <div className="mb-1 flex items-center justify-between gap-2 text-caption text-ink-meta">
          <span>{t('chat.editing')}</span>
          <Button variant="ghost" onClick={onCancelEdit}>
            {t('common.cancel')}
          </Button>
        </div>
      )}
      {files.length > 0 && (
        <ul aria-label={t('chat.files', { count: files.length })} className="mb-1 flex flex-wrap gap-1">
          {files.map((file, index) => (
            <li key={`${file.name}-${index}`} className="flex max-w-full items-center gap-1 rounded-md bg-chrome py-0.5 pr-0.5 pl-2 text-caption text-ink-body">
              <span className="truncate">{file.name}</span>
              <span className="flex-none text-ink-meta">{fileSize(file.size)}</span>
              <IconButton tone="neutral" label={t('chat.removeAttachment', { name: file.name })} onClick={() => setFiles((list) => list.filter((_, at) => at !== index))} className="size-8 md:size-7">
                <X aria-hidden size={14} />
              </IconButton>
            </li>
          ))}
        </ul>
      )}
      <div className="relative flex items-end gap-2">
        {!editing && (
          <>
            <IconButton tone="neutral" label={t('chat.attach')} onClick={() => picker.current?.click()} className="mb-0.5">
              <Paperclip aria-hidden size={20} />
            </IconButton>
            <input
              ref={picker}
              type="file"
              multiple
              accept={ACCEPT}
              hidden
              onChange={(event) => {
                attach([...(event.target.files ?? [])])
                event.target.value = ''
              }}
            />
          </>
        )}
        <Textarea
          ref={box}
          role="combobox"
          aria-label={t('chat.box')}
          aria-autocomplete="list"
          aria-expanded={open}
          aria-controls={listId}
          aria-activedescendant={open ? `${listId}-${active}` : undefined}
          rows={2}
          maxLength={4000}
          placeholder={members.length > 0 ? t('chat.placeholderGroup') : t('chat.placeholder')}
          value={body}
          className="max-h-40 min-h-11"
          onChange={(event) => {
            setBody(event.target.value)
            if (members.length > 0) {
              setMention(activeMention(event.target.value, event.target.selectionStart))
              setActive(0)
            }
            if (!editing && Date.now() - typedAt.current > TYPING_EVERY_MS) {
              typedAt.current = Date.now()
              sendTyping(conversationId)
            }
          }}
          onBlur={() => setMention(null)}
          // A pasted screenshot is attached like a picked file
          onPaste={(event) => {
            const pasted = [...event.clipboardData.files]
            if (pasted.length === 0) return
            event.preventDefault()
            attach(pasted)
          }}
          onKeyDown={(event) => {
            if (open) {
              if (event.key === 'ArrowDown' || event.key === 'ArrowUp') {
                event.preventDefault()
                const step = event.key === 'ArrowDown' ? 1 : -1
                setActive((index) => (index + step + options.length) % options.length)
                return
              }
              if (event.key === 'Enter' || event.key === 'Tab') {
                event.preventDefault()
                choose(options[active])
                return
              }
              if (event.key === 'Escape') {
                event.preventDefault()
                setMention(null)
                return
              }
            }
            if (event.key === 'Escape' && editing) onCancelEdit()
            if (event.key === 'Enter' && !event.shiftKey && !event.nativeEvent.isComposing) {
              event.preventDefault()
              trySend()
            }
          }}
        />
        <IconButton label={editing ? t('chat.saveEdit') : t('chat.send')} disabled={!body.trim() && files.length === 0} onClick={trySend} className="mb-0.5">
          <SendHorizontal aria-hidden size={20} />
        </IconButton>
        {open && (
          <ul id={listId} role="listbox" aria-label={t('comments.mentionList')} className="absolute bottom-full left-0 z-10 mb-1 max-h-56 w-full max-w-sm overflow-y-auto rounded-md border border-hairline bg-canvas py-1">
            {options.map((person, index) => (
              <li
                key={person.id}
                id={`${listId}-${index}`}
                role="option"
                aria-selected={index === active}
                onMouseDown={(event) => event.preventDefault()}
                onClick={() => choose(person)}
                className={`flex min-h-10 cursor-pointer items-center px-3 text-caption text-ink ${index === active ? 'bg-chrome' : ''}`}
              >
                {person.name}
              </li>
            ))}
          </ul>
        )}
      </div>
      <FormError message={editError ?? fileError ?? undefined} />
      <ConfirmDialog
        message={confirming ? t('chat.sensitiveConfirm') : null}
        onConfirm={() => {
          if (confirming) finish(confirming)
          setConfirming(null)
        }}
        onClose={() => setConfirming(null)}
      />
    </div>
  )
}
