import { useQuery } from '@tanstack/react-query'
import { ArrowRight } from 'lucide-react'
import type { CSSProperties, ReactNode } from 'react'
import { Link } from 'react-router-dom'
import { formatDateTime, t, tDynamic } from '../i18n'
import { errorMessage } from '../lib/api'
import { careTone, interestTone, showDate } from '../lib/leadLabels'
import { useLeadOptions } from '../lib/leadOptions'
import { queries } from '../lib/queries'
import { buttonClass } from './buttonStyles'
import { SidePanel } from './SidePanel'
import { Alert, Badge, Spinner } from './ui'

/** How many recent notes and contacts the panel shows; the full page has them all. */
const RECENT = 3

function Fact({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="flex justify-between gap-4 py-2.5">
      <dt className="flex-none text-ink-meta">{label}</dt>
      <dd className="min-w-0 text-right break-words text-ink-body">{children ?? '-'}</dd>
    </div>
  )
}

/**
 * LEAD-19: a lead at a glance beside the Kanban, opened by double-clicking its card or from its
 * menu, so dragging a card and looking at it never get in each other's way. The full page is one
 * click further. Masking and permissions come from the same API as the detail page.
 */
export function LeadPeek({ id, onClose }: { id: string | null; onClose: () => void }) {
  const detail = useQuery({ ...queries.lead(id ?? ''), enabled: !!id })
  const catalogue = useLeadOptions()
  const data = id ? detail.data : undefined
  const lead = data?.lead

  return (
    <SidePanel
      open={!!id}
      onOpenChange={(open) => {
        if (!open) onClose()
      }}
      title={lead?.fullName ?? t('leads.peekTitle')}
      description={lead?.phone}
      footer={
        id && (
          <Link to={`/leads/${id}`} className={`${buttonClass('primary')} w-full justify-center`}>
            {t('leads.openDetail')}
            <ArrowRight aria-hidden size={16} />
          </Link>
        )
      }
    >
      {detail.isPending && !!id && <Spinner />}
      {detail.isError && <Alert className="m-5">{errorMessage(detail.error)}</Alert>}
      {lead && data && (
        <div className="space-y-5 px-5 py-5">
          {/* Where it stands: the stage in its Kanban colour, then status and interest */}
          <div className="flex flex-wrap items-center gap-2" style={{ '--stage': `var(--color-stage-${lead.stage.toLowerCase()})` } as CSSProperties}>
            <span className="inline-flex items-center gap-2 rounded-sm bg-[color-mix(in_srgb,var(--stage)_14%,transparent)] px-2 py-0.5 text-caption font-medium text-ink">
              <span aria-hidden className="size-2 rounded-sm bg-[var(--stage)]" />
              {tDynamic(`stage.${lead.stage}`, lead.stage)}
            </span>
            {lead.careStatus && <Badge tone={careTone(lead.careStatus)}>{catalogue.label('care_status', lead.careStatus)}</Badge>}
            {lead.interest && <Badge tone={interestTone(lead.interest)}>{catalogue.label('interest', lead.interest)}</Badge>}
            {lead.overdue && <Badge tone="danger">{t('leads.badgeOverdue')}</Badge>}
          </div>

          <dl className="divide-y divide-band rounded-md border border-band px-4 text-caption">
            <Fact label={t('leads.assignee')}>{data.assignee ? (data.assignee.name ?? data.assignee.agentCode) : t('leads.unassigned')}</Fact>
            <Fact label={t('leads.source')}>{catalogue.label('source', lead.source)}</Fact>
            {data.campaign && <Fact label={t('leads.campaign')}>{data.campaign.name}</Fact>}
            <Fact label={t('leads.leadDate')}>{showDate(lead.leadDate)}</Fact>
            <Fact label={t('leads.nextAction')}>{lead.nextActionAt ? formatDateTime(lead.nextActionAt) : null}</Fact>
            <Fact label={t('leads.firstContact')}>{lead.firstContactAt ? formatDateTime(lead.firstContactAt) : null}</Fact>
            <Fact label={t('leads.lastContact')}>{lead.lastContactAt ? formatDateTime(lead.lastContactAt) : null}</Fact>
            {lead.email && <Fact label={t('leads.email')}>{lead.email}</Fact>}
          </dl>

          <section>
            <h3 className="text-caption font-medium text-ink">{t('leads.notes')}</h3>
            {data.interactions.length === 0 ? (
              <p className="mt-2 text-caption text-ink-meta">{t('leads.noNotes')}</p>
            ) : (
              <ol className="mt-2 space-y-3">
                {data.interactions.slice(0, RECENT).map((item) => (
                  <li key={item.id} className="text-caption">
                    <p className="flex flex-wrap items-center gap-2 text-ink-meta">
                      {item.type !== 'NOTE' && <Badge tone="info">{tDynamic(`interaction.${item.type}`, item.type)}</Badge>}
                      {formatDateTime(item.occurredAt)}
                    </p>
                    <p className="mt-1 line-clamp-3 break-words whitespace-pre-line text-ink-body">{item.note}</p>
                  </li>
                ))}
              </ol>
            )}
          </section>
        </div>
      )}
    </SidePanel>
  )
}
