import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { useState, type CSSProperties } from 'react'
import { formatDateTime, t, tDynamic } from '../i18n'
import { api, errorField, errorMessage } from '../lib/api'
import { APPLICATION_NO, POLICY_NO, canMove } from '../lib/leadStages'
import { keys, queries } from '../lib/queries'
import { toast } from '../lib/toast'
import type { LeadBoard as Board, LeadStage } from '../lib/types'
import { LEAD_STAGES } from '../lib/types'
import { useUrlState } from '../lib/useUrlState'
import { LeadPeek } from './LeadPeek'
import { Alert, Badge, Button, Dialog, EmptyState, Field, FormError, Input, MODAL_FOOTER, RowMenu, Spinner, TabBar, Textarea } from './ui'

type Card = Board['columns'][number]['items'][number]

/** The stage's hue (`--color-stage-*` in index.css, one per theme) as `--stage`, for tints and accents below. */
const stageColor = (stage: LeadStage) => ({ '--stage': `var(--color-stage-${stage.toLowerCase()})` }) as CSSProperties

/** API errors that belong to one field of the move form. */
const MOVE_ERRORS: Record<string, 'applicationNo' | 'policyNo'> = {
  invalid_application_no: 'applicationNo',
  won_needs_numbers: 'applicationNo',
  invalid_policy_no: 'policyNo',
}

/** LEAD-19: the move form. LOST asks for a reason, SUBMITTED for an application or policy number. */
function MoveForm({ lead, to, onClose }: { lead: Card; to: LeadStage; onClose: () => void }) {
  const queryClient = useQueryClient()
  const [note, setNote] = useState('')
  const [reason, setReason] = useState('')
  const [applicationNo, setApplicationNo] = useState('')
  const [policyNo, setPolicyNo] = useState('')
  const appBad = applicationNo.trim() !== '' && !APPLICATION_NO.test(applicationNo.trim())
  const policyBad = policyNo.trim() !== '' && !POLICY_NO.test(policyNo.trim())
  const ready = to === 'LOST' ? reason.trim() !== '' : to === 'SUBMITTED' ? (applicationNo.trim() !== '' || policyNo.trim() !== '') && !appBad && !policyBad : true
  const move = useMutation({
    mutationFn: () =>
      api.patch(`/leads/${lead.id}`, {
        stage: to,
        ...(note.trim() && { stageNote: note.trim() }),
        ...(to === 'LOST' && { lostReason: reason.trim() }),
        ...(to === 'SUBMITTED' && applicationNo.trim() && { applicationNo: applicationNo.trim() }),
        ...(to === 'SUBMITTED' && policyNo.trim() && { policyNo: policyNo.trim() }),
      }),
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: keys.leads })
      toast.success(t('toast.leadMoved', { name: lead.fullName, stage: tDynamic(`stage.${to}`, to) }))
      onClose()
    },
  })
  const fieldError = move.isError ? errorField(move.error, MOVE_ERRORS) : undefined
  return (
    <form
      noValidate
      onSubmit={(event) => {
        event.preventDefault()
        if (ready) move.mutate()
      }}
    >
      <p className="mb-3 text-caption text-ink-meta">{t('leads.moveHelp', { from: tDynamic(`stage.${lead.stage}`, lead.stage), to: tDynamic(`stage.${to}`, to) })}</p>
      {to === 'LOST' && (
        <Field label={t('leads.lostReason')} htmlFor="move-reason" required>
          <Input id="move-reason" maxLength={200} placeholder={t('placeholder.lostReason')} value={reason} onChange={(event) => setReason(event.target.value)} />
        </Field>
      )}
      {to === 'SUBMITTED' && (
        <div className="grid gap-x-4 sm:grid-cols-2">
          <Field label={t('leads.applicationNo')} htmlFor="move-app" error={appBad ? t('errors.invalid_application_no') : fieldError === 'applicationNo' ? errorMessage(move.error) : undefined} hint={t('leads.moveNumbersHint')}>
            <Input id="move-app" maxLength={20} placeholder={t('placeholder.applicationNo')} value={applicationNo} aria-invalid={appBad} onChange={(event) => setApplicationNo(event.target.value)} />
          </Field>
          <Field label={t('leads.policyNo')} htmlFor="move-policy" error={policyBad ? t('errors.invalid_policy_no') : fieldError === 'policyNo' ? errorMessage(move.error) : undefined}>
            <Input id="move-policy" inputMode="numeric" maxLength={9} placeholder={t('placeholder.policyNo')} value={policyNo} aria-invalid={policyBad} onChange={(event) => setPolicyNo(event.target.value)} />
          </Field>
        </div>
      )}
      <Field label={t('leads.moveNote')} htmlFor="move-note">
        <Textarea id="move-note" rows={2} maxLength={500} placeholder={t('placeholder.moveNote')} value={note} onChange={(event) => setNote(event.target.value)} />
      </Field>
      <FormError message={move.isError && !fieldError ? errorMessage(move.error) : undefined} />
      <div className={MODAL_FOOTER}>
        <Button type="button" variant="ghost" onClick={onClose}>
          {t('common.cancel')}
        </Button>
        <Button type="submit" disabled={!ready || move.isPending}>
          {t('leads.moveSubmit')}
        </Button>
      </div>
    </form>
  )
}

function LeadCard({ lead, manages, onMove, onDrag, onPeek }: { lead: Card; manages: boolean; onMove: (to: LeadStage) => void; onDrag: (lead: Card) => void; onPeek: () => void }) {
  const targets = lead.canWork ? LEAD_STAGES.filter((stage) => canMove(lead.stage, stage, manages)) : []
  return (
    <li
      draggable={lead.canWork}
      onDragStart={(event) => {
        event.dataTransfer.setData('text/plain', lead.id)
        onDrag(lead)
      }}
      // Dragging moves a card; a double click (or Enter, or "Xem chi tiết" in its menu) opens it beside the board
      onDoubleClick={(event) => {
        if (!(event.target as HTMLElement).closest('button, a')) onPeek()
      }}
      onKeyDown={(event) => {
        if (event.key === 'Enter' && event.target === event.currentTarget) onPeek()
      }}
      tabIndex={0}
      aria-label={t('leads.cardLabel', { name: lead.fullName })}
      style={stageColor(lead.stage)}
      // A soft stripe in the stage's hue on the left; the card itself stays on the canvas, so text reads as anywhere else
      className={`rounded-md border border-band border-l-[3px] border-l-[color-mix(in_srgb,var(--stage)_75%,var(--color-canvas))] bg-canvas p-2.5 text-caption select-none hover:border-y-hairline hover:border-r-hairline ${lead.canWork ? 'cursor-grab' : 'cursor-pointer'}`}
    >
      <div className="flex items-start gap-1">
        <span className="min-w-0 flex-1 truncate font-medium text-ink" title={lead.fullName}>
          {lead.fullName}
        </span>
        <RowMenu
          label={t('leads.cardMenu', { name: lead.fullName })}
          items={[...targets.map((stage) => ({ label: t('leads.moveToStage', { stage: tDynamic(`stage.${stage}`, stage) }), onSelect: () => onMove(stage) })), { label: t('leads.viewDetail'), onSelect: onPeek }]}
        />
      </div>
      <p className="text-ink-meta tabular-nums">{lead.phone}</p>
      <p className="truncate text-ink-meta">{lead.assignedAgentCode ? (lead.agentName ?? lead.assignedAgentCode) : t('leads.unassigned')}</p>
      {(lead.overdue || lead.isNew || lead.nextActionAt) && (
        <p className="mt-1 flex flex-wrap gap-1">
          {lead.overdue && <Badge tone="danger">{t('leads.badgeOverdue')}</Badge>}
          {lead.isNew && <Badge tone="info">{t('leads.badgeNew')}</Badge>}
          {lead.nextActionAt && <Badge tone="muted">{formatDateTime(lead.nextActionAt)}</Badge>}
        </p>
      )}
    </li>
  )
}

/**
 * Section 16 "kanban" + LEAD-19: one column per stage; cards the person may work on are dragged
 * (or moved from their menu). Phones show one stage at a time.
 */
export function LeadBoard({ params, manages }: { params: Record<string, string | number | undefined>; manages: boolean }) {
  const url = useUrlState()
  const board = useQuery(queries.leadBoard(params))
  const [dragged, setDragged] = useState<Card | null>(null)
  const column = url.oneOf('col', LEAD_STAGES) || 'NEW'
  const cards = board.data?.columns.flatMap((item) => item.items) ?? []
  const [moveId, moveTo] = url.get('move').split('.')
  const moving = cards.find((card) => card.id === moveId)
  const target = LEAD_STAGES.find((stage) => stage === moveTo)
  const open = (lead: Card, to: LeadStage) => url.set({ move: `${lead.id}.${to}` }, { push: true })

  if (board.isPending) return <Spinner />
  if (board.isError) return <Alert className="m-4">{errorMessage(board.error)}</Alert>
  const columns = board.data.columns
  if (columns.every((item) => item.total === 0)) return <EmptyState>{t('leads.noMatch')}</EmptyState>

  return (
    <>
      {/* Phones: one stage at a time */}
      <div className="flex-none px-4 pt-3 md:hidden">
        <TabBar
          label={t('leads.board')}
          value={column}
          onValueChange={(value) => url.set({ col: value === 'NEW' ? null : value })}
          items={columns.map((item) => ({ value: item.stage, label: `${tDynamic(`stage.${item.stage}`, item.stage)} (${item.total})` }))}
        />
      </div>
      <div className="flex min-h-0 flex-1 gap-3 overflow-x-auto p-4">
        {columns.map((item) => {
          const droppable = !!dragged && dragged.canWork && canMove(dragged.stage, item.stage, manages)
          return (
            <section
              key={item.stage}
              aria-label={tDynamic(`stage.${item.stage}`, item.stage)}
              onDragOver={(event) => droppable && event.preventDefault()}
              onDrop={(event) => {
                event.preventDefault()
                if (dragged && droppable) open(dragged, item.stage)
                setDragged(null)
              }}
              style={stageColor(item.stage)}
              // Each stage keeps its hue, faint: a tinted column under a thin accent line
              className={`min-h-0 w-full flex-none flex-col overflow-hidden rounded-lg border-t-[3px] border-t-[color-mix(in_srgb,var(--stage)_80%,var(--color-chrome))] bg-[color-mix(in_srgb,var(--stage)_9%,var(--color-chrome))] md:flex md:w-64 ${item.stage === column ? 'flex' : 'hidden'} ${droppable ? 'outline-2 outline-primary outline-dashed' : ''}`}
            >
              <h3 className="flex flex-none items-center gap-2 px-3 py-2 text-caption font-medium text-ink">
                <span aria-hidden className="size-2 flex-none rounded-sm bg-[var(--stage)]" />
                <span className="min-w-0 flex-1 truncate">{tDynamic(`stage.${item.stage}`, item.stage)}</span>
                <span className="rounded-sm bg-[color-mix(in_srgb,var(--stage)_16%,transparent)] px-1.5 text-ink-body tabular-nums">{item.total}</span>
              </h3>
              <ul className="min-h-0 flex-1 space-y-2 overflow-y-auto px-2 pb-2">
                {item.items.map((lead) => (
                  <LeadCard key={lead.id} lead={lead} manages={manages} onDrag={setDragged} onMove={(to) => open(lead, to)} onPeek={() => url.set({ peek: lead.id }, { push: true })} />
                ))}
                {item.total > item.items.length && <li className="px-1 py-1 text-caption text-ink-meta">{t('leads.boardMore', { count: item.total - item.items.length })}</li>}
              </ul>
            </section>
          )
        })}
      </div>
      <LeadPeek id={url.get('peek') || null} onClose={() => url.set({ peek: null })} />
      <Dialog title={moving && target ? t('leads.moveTitle', { name: moving.fullName }) : ''} open={!!moving && !!target} onClose={() => url.set({ move: null })}>
        {moving && target && <MoveForm key={`${moving.id}.${target}`} lead={moving} to={target} onClose={() => url.set({ move: null })} />}
      </Dialog>
    </>
  )
}
