import { zodResolver } from '@hookform/resolvers/zod'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { useState } from 'react'
import { useForm } from 'react-hook-form'
import { z } from 'zod'
import { t } from '../../i18n'
import { api, errorMessage } from '../../lib/api'
import { presenceText, usePresenceInfo, useNow } from '../../lib/presence'
import { keys, queries } from '../../lib/queries'
import { toast } from '../../lib/toast'
import { useDebounced } from '../../lib/useListSearch'
import type { ChatConversation, ChatPerson } from '../../lib/types'
import { Badge, Button, ConfirmDialog, Dialog, Field, FormError, Input, MODAL_FOOTER, PickList, PresenceDot, RowMenu } from '../ui'
import { MemberPicker } from './MemberPicker'

const titleSchema = z.object({ title: z.string().trim().min(1, t('validation.required')).max(100) })

/** K1: pick anyone active in the GA to write to. */
export function NewChatDialog({ open, onClose, onOpened }: { open: boolean; onClose: () => void; onOpened: (id: string) => void }) {
  const queryClient = useQueryClient()
  const [search, setSearch] = useState('')
  const q = useDebounced(search.trim())
  const people = useQuery({ ...queries.chatPeople(q), enabled: open })
  const start = useMutation({
    mutationFn: (userId: string) => api.post<{ id: string }>('/chat/direct', { userId }),
    onSuccess: ({ id }) => {
      setSearch('')
      // The opener sees the new conversation in the list even before the first message
      void queryClient.invalidateQueries({ queryKey: [...keys.chat, 'list'] })
      onOpened(id)
    },
  })
  return (
    <Dialog title={t('chat.newChat')} open={open} onClose={onClose}>
      <PickList
        label={t('chat.searchPeople')}
        placeholder={t('chat.searchPeople')}
        search={search}
        onSearchChange={setSearch}
        loading={people.isPending}
        empty={t('chat.noPeople')}
        options={(people.data?.items ?? []).map((person) => ({ value: person.id, label: person.name, meta: person.agentCode ?? person.email }))}
        value={null}
        onChange={(userId) => start.mutate(userId)}
      />
      <FormError message={start.isError ? errorMessage(start.error) : undefined} />
      <div className={MODAL_FOOTER}>
        <Button variant="secondary" onClick={onClose}>
          {t('common.cancel')}
        </Button>
      </div>
    </Dialog>
  )
}

/** C3: a named group; the creator owns it. */
export function CreateGroupDialog({ open, onClose, onCreated }: { open: boolean; onClose: () => void; onCreated: (id: string) => void }) {
  const queryClient = useQueryClient()
  const [people, setPeople] = useState<ChatPerson[]>([])
  const form = useForm<{ title: string }>({ resolver: zodResolver(titleSchema), defaultValues: { title: '' }, mode: 'onTouched' })
  const [noMembers, setNoMembers] = useState(false)
  const create = useMutation({
    mutationFn: (title: string) => api.post<{ id: string }>('/chat/groups', { title, memberIds: people.map((person) => person.id) }),
    onSuccess: ({ id }, title) => {
      toast.success(t('toast.groupCreated', { name: title }))
      void queryClient.invalidateQueries({ queryKey: [...keys.chat, 'list'] })
      form.reset()
      setPeople([])
      onCreated(id)
    },
  })
  return (
    <Dialog title={t('chat.newGroup')} open={open} onClose={onClose} wide>
      <form
        noValidate
        onSubmit={form.handleSubmit(({ title }) => {
          setNoMembers(people.length === 0)
          if (people.length > 0) create.mutate(title)
        })}
      >
        <Field label={t('chat.groupName')} htmlFor="group-title" required error={form.formState.errors.title?.message}>
          <Input id="group-title" placeholder={t('placeholder.groupName')} aria-invalid={!!form.formState.errors.title} {...form.register('title')} />
        </Field>
        <p className="mb-1 text-caption font-medium text-ink">{t('chat.groupMembers')}</p>
        <MemberPicker value={people} onChange={setPeople} />
        <FormError message={noMembers && people.length === 0 ? t('chat.pickSomeone') : create.isError ? errorMessage(create.error) : undefined} />
        <div className={MODAL_FOOTER}>
          <Button variant="secondary" onClick={onClose}>
            {t('common.cancel')}
          </Button>
          <Button type="submit" disabled={create.isPending}>
            {t('chat.createGroup')}
          </Button>
        </div>
      </form>
    </Dialog>
  )
}

export function RenameGroupDialog({ conversation, onClose }: { conversation: ChatConversation | null; onClose: () => void }) {
  const queryClient = useQueryClient()
  const form = useForm<{ title: string }>({ resolver: zodResolver(titleSchema), values: { title: conversation?.title ?? '' }, mode: 'onTouched' })
  const rename = useMutation({
    mutationFn: (title: string) => api.patch(`/chat/conversations/${conversation!.id}`, { title }),
    onSuccess: (_, title) => {
      toast.success(t('toast.groupRenamed', { name: title }))
      void queryClient.invalidateQueries({ queryKey: keys.chat })
      onClose()
    },
  })
  return (
    <Dialog title={t('chat.rename')} open={!!conversation} onClose={onClose}>
      <form noValidate onSubmit={form.handleSubmit(({ title }) => rename.mutate(title))}>
        <Field label={t('chat.groupName')} htmlFor="rename-title" required error={form.formState.errors.title?.message}>
          <Input id="rename-title" placeholder={t('placeholder.groupName')} aria-invalid={!!form.formState.errors.title} {...form.register('title')} />
        </Field>
        <FormError message={rename.isError ? errorMessage(rename.error) : undefined} />
        <div className={MODAL_FOOTER}>
          <Button variant="secondary" onClick={onClose}>
            {t('common.cancel')}
          </Button>
          <Button type="submit" disabled={rename.isPending}>
            {t('common.save')}
          </Button>
        </div>
      </form>
    </Dialog>
  )
}

const ROLE_RANK = { OWNER: 3, ADMIN: 2, MEMBER: 1 } as const

/** C3: who is in the group; the owner names admins, owners and admins add and remove people. */
export function MembersDialog({ conversation, meId, open, onClose }: { conversation: ChatConversation | undefined; meId: string; open: boolean; onClose: () => void }) {
  const queryClient = useQueryClient()
  const now = useNow()
  const presenceOf = usePresenceInfo(conversation?.members.map((member) => member.id) ?? [])
  const [adding, setAdding] = useState<ChatPerson[] | null>(null)
  const [removing, setRemoving] = useState<{ id: string; name: string } | null>(null)
  const myRole = conversation?.role ?? 'MEMBER'
  const canManage = ROLE_RANK[myRole] >= ROLE_RANK.ADMIN
  const refresh = () => queryClient.invalidateQueries({ queryKey: keys.chat })
  const path = `/chat/conversations/${conversation?.id}`

  const add = useMutation({
    mutationFn: (people: ChatPerson[]) => api.post(`${path}/members`, { userIds: people.map((person) => person.id) }),
    onSuccess: (_, people) => {
      toast.success(t('toast.membersAdded', { count: people.length }))
      setAdding(null)
      void refresh()
    },
  })
  const remove = useMutation({
    mutationFn: (userId: string) => api.delete(`${path}/members/${userId}`),
    onSuccess: () => {
      toast.info(t('toast.memberRemoved', { name: removing?.name ?? '' }))
      setRemoving(null)
      void refresh()
    },
  })
  const setRole = useMutation({
    mutationFn: ({ userId, role }: { userId: string; role: 'ADMIN' | 'MEMBER' }) => api.put(`${path}/members/${userId}/role`, { role }),
    onSuccess: () => void refresh(),
    onError: (error) => toast.error(t('toast.chatActionFailed'), errorMessage(error)),
  })

  return (
    <Dialog title={t('chat.members')} open={open && !!conversation} onClose={onClose}>
      {adding ? (
        <>
          <MemberPicker value={adding} onChange={(next) => setAdding((list) => (typeof next === 'function' ? next(list ?? []) : next))} exclude={conversation?.members.map((member) => member.id)} />
          <FormError message={add.isError ? errorMessage(add.error) : undefined} />
          <div className={MODAL_FOOTER}>
            <Button variant="secondary" onClick={() => setAdding(null)}>
              {t('common.cancel')}
            </Button>
            <Button disabled={adding.length === 0 || add.isPending} onClick={() => add.mutate(adding)}>
              {t('chat.addPeople')}
            </Button>
          </div>
        </>
      ) : (
        <>
          <ul className="max-h-96 divide-y divide-band overflow-y-auto">
            {conversation?.members.map((member) => {
              const items = [
                ...(myRole === 'OWNER' && member.id !== meId
                  ? [member.role === 'ADMIN'
                      ? { label: t('chat.unmakeAdmin'), onSelect: () => setRole.mutate({ userId: member.id, role: 'MEMBER' }) }
                      : member.role === 'MEMBER'
                        ? { label: t('chat.makeAdmin'), onSelect: () => setRole.mutate({ userId: member.id, role: 'ADMIN' }) }
                        : null].filter((item) => item !== null)
                  : []),
                ...(canManage && member.id !== meId && ROLE_RANK[myRole] > ROLE_RANK[member.role]
                  ? [{ label: t('chat.removeMember'), danger: true, onSelect: () => setRemoving({ id: member.id, name: member.name }) }]
                  : []),
              ]
              return (
                <li key={member.id} className="flex min-h-12 items-center gap-2 py-1">
                  <PresenceDot status={presenceOf(member.id).status} />
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-caption text-ink">
                      {member.name}
                      {member.id === meId && ` ${t('chat.you')}`}
                    </span>
                    {/* K5: since when online, or how long ago they were active */}
                    {member.id !== meId && <span className="block truncate text-xs text-ink-meta">{presenceText(presenceOf(member.id), now)}</span>}
                  </span>
                  {member.role !== 'MEMBER' && <Badge tone="muted">{t(member.role === 'OWNER' ? 'chat.role.OWNER' : 'chat.role.ADMIN')}</Badge>}
                  {items.length > 0 ? <RowMenu label={t('chat.memberMenu', { name: member.name })} items={items} /> : <span className="size-8 flex-none" />}
                </li>
              )
            })}
          </ul>
          <div className={MODAL_FOOTER}>
            <Button variant="secondary" onClick={onClose}>
              {t('common.close')}
            </Button>
            {canManage && <Button onClick={() => setAdding([])}>{t('chat.addPeople')}</Button>}
          </div>
        </>
      )}
      <ConfirmDialog
        message={removing ? t('chat.removeConfirm', { name: removing.name }) : null}
        danger
        pending={remove.isPending}
        error={remove.isError ? errorMessage(remove.error) : undefined}
        onConfirm={() => removing && remove.mutate(removing.id)}
        onClose={() => {
          setRemoving(null)
          remove.reset()
        }}
      />
    </Dialog>
  )
}
