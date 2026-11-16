import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { BellOff, MessageSquarePlus, Pin, UsersRound } from 'lucide-react'
import { useEffect, useState } from 'react'
import { useMe } from '../auth/useMe'
import { CreateGroupDialog, MembersDialog, NewChatDialog, RenameGroupDialog } from '../components/chat/ChatDialogs'
import { ChatThread } from '../components/chat/ChatThread'
import { Alert, ConfirmDialog, EmptyState, IconButton, PresenceDot, SearchInput, Spinner } from '../components/ui'
import { t } from '../i18n'
import { ApiError, api, errorMessage } from '../lib/api'
import { filesOf, messageTime, systemText } from '../lib/chat'
import { usePresence } from '../lib/presence'
import { keys, queries } from '../lib/queries'
import { toast } from '../lib/toast'
import type { ChatConversation, ChatConversationItem } from '../lib/types'
import { useDebounced } from '../lib/useListSearch'
import { useUrlState } from '../lib/useUrlState'
import { cn } from '../lib/utils'

const DIALOGS = ['new', 'group', 'members', 'rename'] as const

/** The line under a conversation's name: who said what last. */
function preview(item: ChatConversationItem, meId: string): string {
  const last = item.lastMessage
  if (!last) return t('chat.noMessages')
  if (last.kind === 'SYSTEM') return systemText({ data: last.data ?? {} })
  const files = filesOf(last)
  const text = last.deleted ? t('chat.recalled') : last.body || (files.length > 0 ? `📎 ${files.map((file) => file.name).join(', ')}` : '')
  if (last.senderId === meId) return t('chat.youSaid', { text })
  return item.kind === 'GROUP' ? `${last.senderName ?? ''}: ${text}` : text
}

const initials = (name: string) =>
  name
    .trim()
    .split(/\s+/)
    .filter((word) => /\p{L}/u.test(word))
    .slice(-2)
    .map((word) => word[0].toUpperCase())
    .join('') || '?'

/**
 * C2, C3: chat inside the GA. Conversations on the left, the open one on the right; on phones one
 * at a time. The open conversation and dialog live in the URL, so a reload returns to them.
 */
export function ChatPage() {
  const { data: me } = useMe()
  const meId = me?.user.id ?? ''
  const url = useUrlState()
  const queryClient = useQueryClient()
  const selected = url.get('c')
  const focusSeq = /^\d+$/.test(url.get('m')) ? Number(url.get('m')) : null
  const dialog = url.oneOf('dialog', DIALOGS)
  const conversations = useQuery(queries.chatConversations())
  const detail = useQuery({ ...queries.chatConversation(selected), enabled: !!selected })
  const statusOf = usePresence()
  const [filter, setFilter] = useState('')
  const q = useDebounced(filter.trim())
  const search = useQuery({ ...queries.chatSearch(q), enabled: q.length >= 2 })
  const [leaving, setLeaving] = useState<ChatConversation | null>(null)

  // A conversation that is gone, or no longer ours, closes instead of showing an error
  const missing = detail.error instanceof ApiError && detail.error.status === 404
  useEffect(() => {
    if (missing) url.set({ c: null, dialog: null })
  }, [missing, url])

  const open = (id: string, seq?: number) => url.set({ c: id, m: seq ?? null, dialog: null }, { push: true })
  // Once the message has been shown, a reload should not jump back to it
  const focused = () => url.set({ m: null })
  const refresh = () => queryClient.invalidateQueries({ queryKey: keys.chat })

  const prefs = useMutation({
    mutationFn: ({ id, ...body }: { id: string; muted?: boolean; pinned?: boolean }) => api.put(`/chat/conversations/${id}/prefs`, body),
    onSuccess: () => void refresh(),
    onError: (error) => toast.error(t('toast.chatActionFailed'), errorMessage(error)),
  })
  const leave = useMutation({
    mutationFn: (conversation: ChatConversation) => api.delete(`/chat/conversations/${conversation.id}/members/${meId}`),
    onSuccess: (_, conversation) => {
      toast.info(t('toast.groupLeft', { name: conversation.title ?? '' }))
      setLeaving(null)
      url.set({ c: null, dialog: null })
      void refresh()
    },
  })

  const items = (conversations.data?.items ?? []).filter((item) => !filter.trim() || (item.title ?? '').toLowerCase().includes(filter.trim().toLowerCase()))
  const current = conversations.data?.items.find((item) => item.id === selected)

  const menuItems = (conversation: ChatConversation) => {
    const manage = conversation.role === 'OWNER' || conversation.role === 'ADMIN'
    return [
      { label: current?.pinned ? t('chat.unpin') : t('chat.pin'), onSelect: () => prefs.mutate({ id: conversation.id, pinned: !current?.pinned }) },
      { label: current?.muted ? t('chat.unmute') : t('chat.mute'), onSelect: () => prefs.mutate({ id: conversation.id, muted: !current?.muted }) },
      ...(conversation.kind === 'GROUP' && manage ? [{ label: t('chat.rename'), onSelect: () => url.set({ dialog: 'rename' }, { push: true }) }] : []),
      ...(conversation.kind === 'GROUP' ? [{ label: t('chat.leave'), danger: true, onSelect: () => setLeaving(conversation) }] : []),
    ]
  }

  return (
    <div className="flex min-h-0 flex-1 border-t border-band">
      <aside className={cn('min-h-0 w-full flex-none flex-col border-band md:flex md:w-80 md:border-r lg:w-96', selected ? 'hidden' : 'flex')}>
        <div className="flex flex-none items-center justify-between gap-2 px-4 pt-3 pb-2">
          <h1 className="text-page-title text-ink">{t('chat.title')}</h1>
          <div className="flex items-center">
            <IconButton label={t('chat.newChat')} onClick={() => url.set({ dialog: 'new' }, { push: true })}>
              <MessageSquarePlus aria-hidden size={20} />
            </IconButton>
            <IconButton label={t('chat.newGroup')} onClick={() => url.set({ dialog: 'group' }, { push: true })}>
              <UsersRound aria-hidden size={20} />
            </IconButton>
          </div>
        </div>
        <div className="flex-none px-4 pb-2">
          <SearchInput value={filter} onValueChange={setFilter} label={t('chat.filterMessages')} placeholder={t('chat.filterMessages')} />
        </div>
        <nav aria-label={t('chat.list')} className="min-h-0 flex-1 overflow-y-auto">
          {conversations.isPending && <Spinner />}
          {conversations.isError && <Alert>{errorMessage(conversations.error)}</Alert>}
          {conversations.data && items.length === 0 && <p className="px-4 py-8 text-center text-caption text-ink-meta">{filter ? t('chat.noMatch') : t('chat.emptyList')}</p>}
          <ul>
            {items.map((item) => {
              const name = item.title ?? t('chat.someone')
              return (
                <li key={item.id}>
                  <button
                    type="button"
                    aria-current={item.id === selected ? 'page' : undefined}
                    onClick={() => open(item.id)}
                    className={cn('flex w-full cursor-pointer items-center gap-3 px-4 py-2.5 text-left hover:bg-chrome', item.id === selected && 'bg-band-blue hover:bg-band-blue')}
                  >
                    <span aria-hidden className="relative flex size-10 flex-none items-center justify-center rounded-md bg-chrome text-caption font-medium text-ink-list">
                      {item.kind === 'GROUP' ? <UsersRound size={18} /> : initials(name)}
                      {item.other && <PresenceDot status={statusOf(item.other.id)} className="absolute -right-0.5 -bottom-0.5 ring-2 ring-canvas" />}
                    </span>
                    <span className="min-w-0 flex-1">
                      <span className="flex items-center gap-1.5">
                        <span className={cn('truncate text-caption', item.unread > 0 ? 'font-medium text-ink' : 'text-ink-list')}>{name}</span>
                        {item.pinned && <Pin aria-label={t('chat.pinned')} size={12} className="flex-none text-ink-meta" />}
                        {item.muted && <BellOff aria-label={t('chat.muted')} size={12} className="flex-none text-ink-meta" />}
                        <span className="ml-auto flex-none text-xs text-ink-meta">{messageTime(item.updatedAt)}</span>
                      </span>
                      <span className="flex items-center gap-2">
                        <span className={cn('truncate text-caption', item.unread > 0 ? 'text-ink-body' : 'text-ink-meta')}>{preview(item, meId)}</span>
                        {item.unread > 0 && (
                          <span className={cn('ml-auto min-w-5 flex-none rounded-sm px-1 text-center text-xs leading-5 font-medium tabular-nums', item.muted ? 'bg-band text-ink-meta' : 'bg-primary text-on-primary')}>
                            <span className="sr-only">{t('chat.unreadLabel')}</span>
                            {item.unread > 99 ? '99+' : item.unread}
                          </span>
                        )}
                      </span>
                    </span>
                  </button>
                </li>
              )
            })}
          </ul>
          {q.length >= 2 && (
            <section aria-labelledby="chat-search-results" className="border-t border-band">
              <h2 id="chat-search-results" className="px-4 pt-3 pb-1 text-caption font-medium text-ink-meta">
                {t('chat.searchMessages')}
              </h2>
              {search.isPending && <Spinner />}
              {search.data && search.data.items.length === 0 && <p className="px-4 pb-4 text-caption text-ink-meta">{t('chat.searchNone')}</p>}
              <ul>
                {search.data?.items.map((hit) => (
                  <li key={`${hit.conversationId}-${hit.seq}`}>
                    <button type="button" onClick={() => open(hit.conversationId, hit.seq)} className="flex w-full cursor-pointer flex-col px-4 py-2 text-left hover:bg-chrome">
                      <span className="flex items-center gap-2">
                        <span className="truncate text-caption font-medium text-ink">{hit.conversationTitle ?? t('chat.someone')}</span>
                        <span className="ml-auto flex-none text-xs text-ink-meta">{messageTime(hit.createdAt)}</span>
                      </span>
                      <span className="line-clamp-2 text-caption text-ink-list">
                        {hit.senderName ? `${hit.senderName}: ` : ''}
                        {hit.body}
                      </span>
                    </button>
                  </li>
                ))}
              </ul>
            </section>
          )}
        </nav>
      </aside>

      <section className={cn('min-h-0 min-w-0 flex-1 flex-col md:flex', selected ? 'flex' : 'hidden')}>
        {selected && !missing ? (
          <ChatThread
            key={selected}
            conversationId={selected}
            meId={meId}
            onBack={() => url.set({ c: null, dialog: null }, { push: true })}
            onOpenMembers={() => url.set({ dialog: 'members' }, { push: true })}
            menuItems={menuItems}
            focusSeq={focusSeq}
            onFocused={focused}
          />
        ) : (
          <div className="flex flex-1 items-center justify-center p-6">
            <EmptyState>{t('chat.pick')}</EmptyState>
          </div>
        )}
      </section>

      <NewChatDialog open={dialog === 'new'} onClose={() => url.set({ dialog: null })} onOpened={open} />
      <CreateGroupDialog open={dialog === 'group'} onClose={() => url.set({ dialog: null })} onCreated={open} />
      <MembersDialog conversation={detail.data} meId={meId} open={dialog === 'members'} onClose={() => url.set({ dialog: null })} />
      <RenameGroupDialog conversation={dialog === 'rename' ? (detail.data ?? null) : null} onClose={() => url.set({ dialog: null })} />
      <ConfirmDialog
        message={leaving ? t('chat.leaveConfirm', { name: leaving.title ?? '' }) : null}
        danger
        pending={leave.isPending}
        error={leave.isError ? errorMessage(leave.error) : undefined}
        onConfirm={() => leaving && leave.mutate(leaving)}
        onClose={() => {
          setLeaving(null)
          leave.reset()
        }}
      />
    </div>
  )
}
