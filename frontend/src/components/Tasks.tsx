import { zodResolver } from '@hookform/resolvers/zod'
import { useMutation } from '@tanstack/react-query'
import { useState } from 'react'
import { useForm } from 'react-hook-form'
import { Link } from 'react-router-dom'
import { z } from 'zod'
import { formatDateTime, t, tDynamic } from '../i18n'
import { api, errorMessage } from '../lib/api'
import { toLocalInput } from '../lib/leadLabels'
import { toast } from '../lib/toast'
import { useTaskRefresh } from '../lib/useTaskRefresh'
import type { TaskItem } from '../lib/types'
import { requiredText } from '../lib/validation'
import { Badge, Button, Dialog, EmptyState, Field, FormError, Input, MODAL_FOOTER, RowMenu, Checkbox } from './ui'

const schema = z.object({
  title: requiredText(200),
  dueAt: z.string().min(1, t('validation.required')),
})
type Values = z.infer<typeof schema>

/**
 * TASK-1 + TASK-2: a new personal task, a new client task (`clientCode`, optionally from a care
 * opportunity, SIG-2), or an existing task of any kind.
 */
export function TaskForm({ task, clientCode, signal, defaults, onClose }: { task?: TaskItem; clientCode?: string; signal?: string; defaults?: { title: string; dueAt: string }; onClose: () => void }) {
  const refresh = useTaskRefresh()
  const form = useForm<Values>({
    resolver: zodResolver(schema),
    mode: 'onTouched',
    defaultValues: { title: task?.title ?? defaults?.title ?? '', dueAt: toLocalInput(task?.dueAt ?? defaults?.dueAt) },
  })
  const save = useMutation({
    mutationFn: async (values: Values) => {
      const body = { title: values.title, dueAt: new Date(values.dueAt).toISOString() }
      if (task) await api.patch(`/tasks/${task.id}`, body)
      else if (clientCode) await api.post(`/clients/${clientCode}/tasks`, { ...body, ...(signal && { signal }) })
      else await api.post('/tasks', body)
    },
    onSuccess: async (_, values) => {
      await refresh()
      toast.success(t(task ? 'toast.taskSaved' : 'toast.taskAdded', { title: values.title }))
      onClose()
    },
  })
  const { errors } = form.formState
  return (
    <form noValidate onSubmit={form.handleSubmit((values) => save.mutate(values))}>
      {!task && !clientCode && <p className="mb-3 text-caption text-ink-meta">{t('tasks.personalHint')}</p>}
      <Field label={t('tasks.taskTitle')} htmlFor="task-title" required error={errors.title?.message}>
        <Input id="task-title" maxLength={200} placeholder={t('placeholder.taskTitle')} aria-invalid={!!errors.title} {...form.register('title')} />
      </Field>
      <Field label={t('tasks.dueAt')} htmlFor="task-due" required error={errors.dueAt?.message}>
        <Input id="task-due" type="datetime-local" aria-invalid={!!errors.dueAt} {...form.register('dueAt')} />
      </Field>
      <FormError message={save.isError ? errorMessage(save.error) : undefined} />
      <div className={MODAL_FOOTER}>
        <Button type="button" variant="ghost" onClick={onClose}>
          {t('common.cancel')}
        </Button>
        <Button type="submit" disabled={save.isPending}>
          {t('tasks.save')}
        </Button>
      </div>
    </form>
  )
}

/** What a task is about: its lead, its client, or nothing for a personal task. */
function Subject({ task }: { task: TaskItem }) {
  if (task.lead)
    return (
      <Link to={`/leads/${task.lead.id}?tab=tasks`} className="text-primary hover:underline">
        {task.lead.fullName}
      </Link>
    )
  if (task.client)
    return (
      <Link to={`/clients/${task.client.code}`} className="text-primary hover:underline">
        {task.client.name}
      </Link>
    )
  return <span>{t('tasks.personal')}</span>
}

/** TASK-2 + TASK-4: tasks by due time, late ones in red, done with a tick. */
export function TaskList({ items, empty, showAgent = false }: { items: TaskItem[]; empty: string; showAgent?: boolean }) {
  const refresh = useTaskRefresh()
  const [editing, setEditing] = useState<TaskItem | null>(null)
  const [now] = useState(() => Date.now())
  const change = useMutation({
    mutationFn: ({ task, body }: { task: TaskItem; body: Record<string, unknown> }) => api.patch(`/tasks/${task.id}`, body),
    onSuccess: async (_, { task, body }) => {
      await refresh()
      if (body.cancelled) toast.info(t('toast.taskCancelled', { title: task.title }))
      else if (body.done) toast.success(t('toast.taskDone', { title: task.title }))
      else toast.info(t('toast.taskReopened', { title: task.title }))
    },
    onError: (error) => toast.error(t('toast.taskToggleFailed'), errorMessage(error)),
  })
  if (items.length === 0) return <EmptyState>{empty}</EmptyState>
  return (
    <>
      <ul className="divide-y divide-band">
        {items.map((task) => {
          const overdue = task.status === 'OPEN' && new Date(task.dueAt).getTime() < now
          return (
            <li key={task.id} className="flex items-center gap-3 py-2.5 text-caption">
              <Checkbox
                aria-label={task.title}
                checked={task.status === 'DONE'}
                disabled={!task.canEdit || task.status === 'CANCELLED' || change.isPending}
                onChange={() => change.mutate({ task, body: { done: task.status !== 'DONE' } })}
              />
              <span className="min-w-0 flex-1">
                <span className={`block truncate ${task.status === 'OPEN' ? 'text-ink' : 'text-ink-meta line-through'}`} title={task.title}>
                  {task.title}
                </span>
                <span className="flex flex-wrap gap-x-2 text-ink-meta">
                  <span className={overdue ? 'font-medium text-alert' : undefined}>
                    {formatDateTime(task.dueAt)}
                    {overdue && ` · ${t('tasks.overdue')}`}
                  </span>
                  <Subject task={task} />
                  {showAgent && task.agentName && <span>{task.agentName}</span>}
                </span>
              </span>
              {task.source !== 'APP' && (
                <span className="hidden flex-none sm:block">
                  <Badge tone="muted">{tDynamic(`taskSource.${task.source}`, task.source)}</Badge>
                </span>
              )}
              {task.canEdit && task.status === 'OPEN' ? (
                <span className="flex flex-none items-center">
                  <Button variant="ghost" onClick={() => setEditing(task)}>
                    {t('tasks.edit')}
                  </Button>
                  <RowMenu label={t('common.more')} items={[{ label: t('tasks.cancel'), danger: true, onSelect: () => change.mutate({ task, body: { cancelled: true } }) }]} />
                </span>
              ) : (
                task.canEdit &&
                task.status === 'CANCELLED' && (
                  <Button variant="ghost" onClick={() => change.mutate({ task, body: { cancelled: false } })}>
                    {t('tasks.reopen')}
                  </Button>
                )
              )}
            </li>
          )
        })}
      </ul>
      <Dialog title={t('tasks.editTitle')} open={editing !== null} onClose={() => setEditing(null)}>
        {editing && <TaskForm key={editing.id} task={editing} onClose={() => setEditing(null)} />}
      </Dialog>
    </>
  )
}
