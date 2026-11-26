import { useMutation, useQuery } from '@tanstack/react-query'
import { CalendarSync, ChevronLeft, ChevronRight } from 'lucide-react'
import { useState } from 'react'
import { Link } from 'react-router-dom'
import { Alert, Button, Card, CopyLink, Dialog, FilterBand, IconButton, PageHeader, Segmented, Spinner } from '../components/ui'
import { t } from '../i18n'
import type { MessageKey } from '../i18n'
import { api, errorMessage } from '../lib/api'
import { addDays, monthWeeks, moveToDay, vietnamDayOf, weekDays } from '../lib/calendarGrid'
import { showDate } from '../lib/leadLabels'
import { queries } from '../lib/queries'
import { vietnamToday } from '../lib/reportPeriods'
import { toast } from '../lib/toast'
import type { CalendarData, TaskItem } from '../lib/types'
import { useTaskRefresh } from '../lib/useTaskRefresh'
import { useUrlState } from '../lib/useUrlState'

/** One thing on a day: a task (which may be dragged) or an appointment (LEAD-31 at APPOINTMENT). */
type Entry = { kind: 'task'; at: string; task: TaskItem } | { kind: 'appointment'; at: string; leadId: string; name: string }

const time = (at: string) => new Intl.DateTimeFormat('vi-VN', { timeZone: 'Asia/Ho_Chi_Minh', hour: '2-digit', minute: '2-digit', hour12: false }).format(new Date(at))

function entriesByDay(data: CalendarData | undefined): Map<string, Entry[]> {
  const result = new Map<string, Entry[]>()
  const add = (entry: Entry) => {
    const day = vietnamDayOf(entry.at)
    result.set(day, [...(result.get(day) ?? []), entry])
  }
  for (const task of data?.tasks ?? []) add({ kind: 'task', at: task.dueAt, task })
  for (const item of data?.appointments ?? []) add({ kind: 'appointment', at: item.at, leadId: item.leadId, name: item.fullName })
  for (const list of result.values()) list.sort((a, b) => a.at.localeCompare(b.at))
  return result
}

function EntryChip({ entry, onDragStart }: { entry: Entry; onDragStart: (task: TaskItem) => void }) {
  if (entry.kind === 'appointment')
    return (
      <Link to={`/leads/${entry.leadId}`} className="block truncate rounded-sm bg-band-blue px-1.5 py-0.5 text-caption text-primary-deep hover:underline" title={t('calendar.appointment', { name: entry.name })}>
        {time(entry.at)} {t('calendar.appointment', { name: entry.name })}
      </Link>
    )
  const { task } = entry
  const movable = task.canEdit && task.status === 'OPEN'
  const target = task.lead ? `/leads/${task.lead.id}?tab=tasks` : task.client ? `/clients/${task.client.id}` : '/tasks'
  return (
    <Link
      to={target}
      draggable={movable}
      onDragStart={(event) => {
        event.dataTransfer.setData('text/plain', task.id)
        onDragStart(task)
      }}
      className={`block truncate rounded-sm border border-band px-1.5 py-0.5 text-caption hover:bg-chrome ${task.status === 'DONE' ? 'text-ink-meta line-through' : 'text-ink-body'} ${movable ? 'cursor-grab' : ''}`}
      title={task.title}
    >
      {time(task.dueAt)} {task.title}
    </Link>
  )
}

/** TASK-6: the person's month or week; tasks dragged to another day keep their hour. */
export function CalendarPage() {
  const url = useUrlState()
  const refresh = useTaskRefresh()
  const today = vietnamToday()
  const view = url.oneOf('view', ['week']) ? 'week' : 'month'
  const anchor = /^\d{4}-\d{2}-\d{2}$/.test(url.get('date')) ? url.get('date') : today
  const weeks = view === 'week' ? [weekDays(anchor)] : monthWeeks(anchor)
  const from = weeks[0][0]
  const to = weeks.at(-1)!.at(-1)!
  const calendar = useQuery(queries.calendar(from, to))
  const byDay = entriesByDay(calendar.data)
  const [dragged, setDragged] = useState<TaskItem | null>(null)
  const [feedUrl, setFeedUrl] = useState<string | null>(null)
  const [month, year] = [Number(anchor.slice(5, 7)), Number(anchor.slice(0, 4))]

  const move = useMutation({
    mutationFn: ({ task, day }: { task: TaskItem; day: string }) => api.patch(`/tasks/${task.id}`, { dueAt: moveToDay(task.dueAt, day) }),
    onSuccess: async (_, { task, day }) => {
      await refresh()
      toast.success(t('toast.taskMoved', { title: task.title, date: showDate(day) ?? day }))
    },
    onError: (error) => toast.error(t('toast.taskMoveFailed'), errorMessage(error)),
  })
  const feed = useMutation({
    mutationFn: () => api.post<{ url: string }>('/calendar/token'),
    onSuccess: ({ url: link }) => {
      setFeedUrl(link)
      toast.success(t('toast.feedCreated'), t('toast.feedCreatedDetail'))
    },
    onError: (error) => toast.error(t('toast.feedCreated'), errorMessage(error)),
  })
  const step = (direction: 1 | -1) => {
    if (view === 'week') return url.set({ date: addDays(anchor, 7 * direction) })
    const target = new Date(Date.UTC(year, month - 1 + direction, 1)).toISOString().slice(0, 10)
    url.set({ date: target })
  }
  const title = view === 'week' ? `${showDate(from)} – ${showDate(to)}` : t('calendar.monthTitle', { month, year })
  const visibleDays = weeks.flat()

  return (
    <>
      <PageHeader
        title={t('calendar.title')}
        action={
          <Button variant="secondary" disabled={feed.isPending} onClick={() => feed.mutate()}>
            <CalendarSync size={16} aria-hidden />
            {t('calendar.feed')}
          </Button>
        }
      />
      <FilterBand className="flex flex-wrap items-center gap-2">
        <IconButton label={t('calendar.previous')} onClick={() => step(-1)}>
          <ChevronLeft size={16} aria-hidden />
        </IconButton>
        <span className="min-w-40 text-center text-caption font-medium text-ink">{title}</span>
        <IconButton label={t('calendar.next')} onClick={() => step(1)}>
          <ChevronRight size={16} aria-hidden />
        </IconButton>
        <Button variant="ghost" onClick={() => url.set({ date: null })}>
          {t('calendar.today')}
        </Button>
        <Segmented
          className="sm:ml-auto"
          label={t('calendar.view')}
          value={view}
          onValueChange={(key) => url.set({ view: key === 'week' ? 'week' : null })}
          options={[
            { value: 'month', label: t('calendar.month') },
            { value: 'week', label: t('calendar.week') },
          ]}
        />
      </FilterBand>
      <Card>
        <p className="hidden flex-none px-4 py-2 text-caption text-ink-meta md:block">{t('calendar.dragHint')}</p>
        {calendar.isPending && <Spinner />}
        {calendar.isError && <Alert className="m-4">{errorMessage(calendar.error)}</Alert>}
        {calendar.data && (
          <div className="min-h-0 flex-1 overflow-y-auto px-4 pb-4">
            {/* Phones: one list of days that have something */}
            <ol className="space-y-3 pt-2 md:hidden">
              {visibleDays.filter((day) => byDay.has(day)).length === 0 && <li className="text-caption text-ink-meta">{t('calendar.empty')}</li>}
              {visibleDays
                .filter((day) => byDay.has(day))
                .map((day) => (
                  <li key={day}>
                    <p className={`mb-1 text-caption font-medium ${day === today ? 'text-primary-deep' : 'text-ink'}`}>{showDate(day)}</p>
                    <div className="space-y-1">
                      {byDay.get(day)!.map((entry, index) => (
                        <EntryChip key={index} entry={entry} onDragStart={setDragged} />
                      ))}
                    </div>
                  </li>
                ))}
            </ol>
            <div className="hidden md:block">
              <div className="grid grid-cols-7 border-b border-band">
                {Array.from({ length: 7 }, (_, index) => (
                  <div key={index} className="px-2 py-1.5 text-caption text-ink-meta">
                    {t(`calendar.weekday.${index}` as MessageKey)}
                  </div>
                ))}
              </div>
              {weeks.map((week) => (
                <div key={week[0]} className="grid grid-cols-7 border-b border-band">
                  {week.map((day) => {
                    const entries = byDay.get(day) ?? []
                    const shown = view === 'month' ? entries.slice(0, 3) : entries
                    const outside = view === 'month' && Number(day.slice(5, 7)) !== month
                    return (
                      <div
                        key={day}
                        onDragOver={(event) => dragged && event.preventDefault()}
                        onDrop={(event) => {
                          event.preventDefault()
                          if (dragged && vietnamDayOf(dragged.dueAt) !== day) move.mutate({ task: dragged, day })
                          setDragged(null)
                        }}
                        className={`border-r border-band p-1.5 last:border-r-0 ${view === 'week' ? 'min-h-72' : 'min-h-28'} ${outside ? 'bg-chrome' : ''}`}
                      >
                        <p className={`mb-1 text-caption ${day === today ? 'font-medium text-primary-deep' : outside ? 'text-ink-meta' : 'text-ink'}`}>{Number(day.slice(8))}</p>
                        <div className="space-y-1">
                          {shown.map((entry, index) => (
                            <EntryChip key={index} entry={entry} onDragStart={setDragged} />
                          ))}
                          {entries.length > shown.length && (
                            <button type="button" className="cursor-pointer text-caption text-primary hover:underline" onClick={() => url.set({ view: 'week', date: day })}>
                              {t('calendar.more', { count: entries.length - shown.length })}
                            </button>
                          )}
                        </div>
                      </div>
                    )
                  })}
                </div>
              ))}
            </div>
          </div>
        )}
      </Card>
      <Dialog title={t('calendar.feedTitle')} open={feedUrl !== null} onClose={() => setFeedUrl(null)}>
        {feedUrl && <CopyLink url={feedUrl} hint={t('calendar.feedHelp')} onClose={() => setFeedUrl(null)} />}
      </Dialog>
    </>
  )
}
