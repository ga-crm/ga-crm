import type { ReactNode } from 'react'
import { Link } from 'react-router-dom'
import { useLeadOptions } from '../lib/leadOptions'
import { useQueryClient } from '@tanstack/react-query'
import { formatDateTime, formatVnd, t, tDynamic } from '../i18n'
import type { MessageKey } from '../i18n'
import { showDate } from '../lib/leadLabels'
import { keys } from '../lib/queries'
import { groupLabel, groupList } from '../lib/clientLabels'
import { COVERAGE_GROUPS } from '../lib/types'
import type { ClientDetail, ClientSignal } from '../lib/types'
import { addDays } from '../lib/calendarGrid'
import { vietnamToday } from '../lib/reportPeriods'
import { useUrlState } from '../lib/useUrlState'
import { CommentThread } from './CommentThread'
import { NoteComposer } from './NoteComposer'
import { TaskForm } from './Tasks'
import { Badge, Button, Dialog, Panel } from './ui'

/** COV-5: people (the client and the family) × groups, sum assured of the products in force. */
export function CoverageCard({ detail }: { detail: ClientDetail }) {
  const rows = detail.coverage
  // Only the groups someone has, so the table fits beside the client's details
  const groups = COVERAGE_GROUPS.filter((group) => rows.some((row) => row.groups[group] !== undefined))
  return (
    <section className="rounded-lg bg-chrome p-5">
      <h2 className="text-subhead text-ink">{t('clients.coverage')}</h2>
      <p className="mt-1 mb-3 text-caption text-ink-meta">{t('clients.coverageHelp')}</p>
      <div className="overflow-x-auto">
        <table className="data-table w-full">
          <thead>
            <tr>
              <th>{t('clients.coveragePerson')}</th>
              {groups.map((group) => (
                <th key={group} className="text-right">
                  {groupLabel(group)}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {rows.map((row) => (
              <tr key={row.key}>
                <td className="min-w-40">
                  <span className="block font-medium text-ink-body">{row.name}</span>
                  {!row.hasDetail ? (
                    <span className="block text-ink-meta">{t('clients.coverageNoDetail')}</span>
                  ) : (
                    // COV-4: gaps only for someone with product detail
                    // Plain text so a long list of groups wraps on a phone
                    row.gaps.length > 0 && <span className="mt-0.5 block text-warning">{t('clients.gaps', { groups: row.gaps.map(groupLabel).join(', ') })}</span>
                  )}
                </td>
                {groups.map((group) => (
                  <td key={group} className="text-right whitespace-nowrap tabular-nums">
                    {row.groups[group] === undefined ? <span className="text-ink-meta">-</span> : formatVnd(row.groups[group])}
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </section>
  )
}

/** Section 10.11: the sentence of one signal, with its amounts, dates and groups written out. */
function signalText(signal: ClientSignal): string {
  const values: Record<string, string | number> = { ...signal.values }
  if (typeof values.amount === 'number') values.amount = formatVnd(values.amount)
  if (typeof values.date === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(values.date)) values.date = showDate(values.date) ?? values.date
  if (typeof values.groups === 'string') values.groups = groupList(values.groups)
  return t(`signal.${signal.code}` as MessageKey, values)
}

/** Money owed and policies out of force stand out; a birthday is good news. */
const SIGNAL_EDGE: Partial<Record<ClientSignal['code'], string>> = {
  UNPAID: 'border-warning',
  APL: 'border-warning',
  NOT_ACTIVE: 'border-warning',
  LAPSED: 'border-warning',
  BIRTHDAY: 'border-notable',
}

/** SIG-2: the task starts as the signal's text, due at 09:00 on its date, or tomorrow when it has none. */
function signalTaskDefaults(signal: ClientSignal): { title: string; dueAt: string } {
  const today = vietnamToday()
  const date = typeof signal.values.date === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(signal.values.date) && signal.values.date > today ? signal.values.date : addDays(today, 1)
  return { title: signalText(signal).slice(0, 200), dueAt: new Date(`${date}T09:00:00+07:00`).toISOString() }
}

/** Section 10.11: "Cơ hội chăm sóc". Events only; product suggestions belong to the AI assistant. */
export function SignalsCard({ detail }: { detail: ClientDetail }) {
  const url = useUrlState()
  const picked = detail.canEdit ? detail.signals[Number(url.get('signalTask') || -1)] : undefined
  const close = () => url.set({ signalTask: null })
  return (
    <Panel className="p-5">
      <h2 className="text-subhead text-ink">{t('clients.signals')}</h2>
      <p className="mt-1 mb-3 text-caption text-ink-meta">{t('clients.signalsHelp')}</p>
      {detail.signals.length === 0 ? (
        <p className="text-caption text-ink-meta">{t('clients.noSignals')}</p>
      ) : (
        <ul className="space-y-2">
          {detail.signals.map((signal, index) => (
            <li key={`${signal.code}-${index}`} className={`flex items-center gap-2 border-l-2 py-0.5 pl-3 text-caption text-ink-body ${SIGNAL_EDGE[signal.code] ?? 'border-band'}`}>
              <span className="min-w-0 flex-1">{signalText(signal)}</span>
              {/* SIG-2: the owner turns an opportunity into a task */}
              {detail.canEdit && (
                <Button variant="ghost" className="flex-none" onClick={() => url.set({ signalTask: index }, { push: true })}>
                  {t('tasks.createFromSignal')}
                </Button>
              )}
            </li>
          ))}
        </ul>
      )}
      <Dialog title={t('tasks.signalTitle', { name: detail.client.name })} open={picked !== undefined} onClose={close}>
        {picked && <TaskForm key={url.get('signalTask')} clientId={detail.client.id} signal={picked.code} defaults={signalTaskDefaults(picked)} onClose={close} />}
      </Dialog>
    </Panel>
  )
}

/** CMT-5: comments on the client. Whoever sees it may comment (a line manager coaching, the owner replying). */
export function CommentsCard({ detail }: { detail: ClientDetail }) {
  const queryClient = useQueryClient()
  return (
    <Panel className="p-5">
      <h2 className="text-subhead text-ink">{t('clients.comments')}</h2>
      <p className="mt-1 text-caption text-ink-meta">{t('clients.commentsHelp')}</p>
      <CommentThread
        comments={detail.comments}
        userNames={detail.userNames}
        path={`/clients/${detail.client.id}`}
        sentDetail={t('toast.clientCommentSentDetail')}
        onSaved={() => queryClient.invalidateQueries({ queryKey: keys.clients })}
      />
    </Panel>
  )
}

/** NOTE-1 + NOTE-5: notes and contacts on the client, newest first. Owners write, others read. */
export function NotesCard({ detail }: { detail: ClientDetail }) {
  const queryClient = useQueryClient()
  const clientId = detail.client.id
  return (
    <Panel className="p-5">
      <h2 className="text-subhead text-ink">{t('clients.notes')}</h2>
      {detail.canEdit ? <NoteComposer path={`/clients/${clientId}`} onSaved={() => queryClient.invalidateQueries({ queryKey: keys.clients })} /> : <p className="mt-2 text-caption text-ink-meta">{t('clients.notesReadOnly')}</p>}
      {detail.notes.length === 0 ? (
        <p className="mt-3 text-caption text-ink-meta">{t('clients.noNotes')}</p>
      ) : (
        <ol className="mt-4 max-h-96 space-y-2 overflow-y-auto">
          {detail.notes.map((item) => (
            <li key={item.id} className="border-b border-band pb-2 text-caption">
              <p className="flex flex-wrap items-center gap-2 text-ink-meta">
                {item.type !== 'NOTE' && <Badge tone="info">{tDynamic(`interaction.${item.type}`, item.type)}</Badge>}
                <span>
                  {formatDateTime(item.occurredAt)} ·{' '}
                  {t('leads.by', {
                    name: detail.userNames[item.createdBy] ?? '-',
                  })}
                </span>
              </p>
              {item.outcome && <p className="mt-1 font-medium text-ink-body">{item.outcome}</p>}
              <p className="mt-1 whitespace-pre-wrap text-ink-body">{item.note}</p>
            </li>
          ))}
        </ol>
      )}
    </Panel>
  )
}

/** LEAD-34: "Lead nguồn", the lead this client came from, with its source and campaign. */
export function ClientLeadSource({ detail }: { detail: ClientDetail }) {
  const catalogue = useLeadOptions()
  const lead = detail.linkedLead
  if (!lead) return null
  const fact = (label: string, value: ReactNode) => (
    <div className="grid grid-cols-[11rem_1fr] gap-2 border-b border-band py-2 text-caption">
      <dt className="text-ink-meta">{label}</dt>
      <dd className="min-w-0 break-words text-ink-body">{value ?? '-'}</dd>
    </div>
  )
  return (
    <section className="max-w-3xl rounded-lg bg-chrome p-5">
      <p className="mb-2 text-caption text-ink-meta">{t('clients.leadHelp')}</p>
      <dl>
        {fact(
          t('clients.leadName'),
          lead.canOpen ? (
            <Link to={`/leads/${lead.id}`} className="text-primary hover:underline">
              {lead.fullName}
            </Link>
          ) : (
            lead.fullName
          ),
        )}
        {fact(t('clients.leadStage'), tDynamic(`stage.${lead.stage}`, lead.stage))}
        {fact(t('clients.leadSource'), catalogue.label('source', lead.source))}
        {fact(t('clients.leadCampaign'), lead.campaignName)}
        {fact(t('clients.leadAgent'), lead.assignedAgentCode ? `${lead.agentName ?? lead.assignedAgentCode} (${lead.assignedAgentCode})` : null)}
        {fact(t('clients.leadLinkedAt'), lead.linkedAt ? formatDateTime(lead.linkedAt) : null)}
      </dl>
    </section>
  )
}
