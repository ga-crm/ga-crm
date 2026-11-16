import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { ArrowLeft } from 'lucide-react'
import { useEffect, useState } from 'react'
import { Link, useNavigate, useParams } from 'react-router-dom'
import { PublicFormSettingsCard } from '../components/PublicFormSettings'
import { CampaignForm } from '../components/CampaignForm'
import { Alert, Badge, Button, Checkbox, ConfirmDialog, Container, Dialog, EmptyState, FormError, MODAL_FOOTER, Panel, SearchInput, Select, Spinner, TableScroll } from '../components/ui'
import { formatDateTime, formatVnd, t, tDynamic } from '../i18n'
import type { MessageKey } from '../i18n'
import { ApiError, api, errorMessage } from '../lib/api'
import { campaignStatusTone } from '../lib/campaignLabels'
import { showDate } from '../lib/leadLabels'
import { useLeadOptions } from '../lib/leadOptions'
import { keys, queries } from '../lib/queries'
import { toast } from '../lib/toast'
import { MEMBER_STATUSES } from '../lib/types'
import type { CampaignDetail, MemberStatus } from '../lib/types'
import { useUrlState } from '../lib/useUrlState'
import { NotFoundPage } from './ForbiddenPage'

function Stat({ label, value }: { label: string; value: string | number }) {
  return (
    <div className="rounded-lg bg-chrome px-4 py-3">
      <p className="text-caption text-ink-meta">{label}</p>
      <p className="mt-1 text-subhead text-ink tabular-nums">{value}</p>
    </div>
  )
}

/** One breakdown of CMP-3, largest first. */
function Breakdown({ title, counts, label }: { title: string; counts: Record<string, number>; label: (code: string) => string }) {
  const rows = Object.entries(counts).sort((a, b) => b[1] - a[1])
  return (
    <Panel className="sm:p-4">
      <h3 className="mb-2 text-caption font-medium text-ink">{title}</h3>
      {rows.length === 0 ? (
        <p className="text-caption text-ink-meta">{t('campaigns.none')}</p>
      ) : (
        <ul className="space-y-1 text-caption">
          {rows.map(([code, count]) => (
            <li key={code} className="flex justify-between gap-2 border-b border-band pb-1 last:border-b-0">
              <span className="min-w-0 truncate text-ink-body">{code === 'NONE' ? t('campaigns.none') : label(code)}</span>
              <span className="flex-none tabular-nums text-ink-body">{count}</span>
            </li>
          ))}
        </ul>
      )}
    </Panel>
  )
}

/** CMP-2: pick leads the person sees and put them on the seminar list. */
function AddMembersDialog({ campaignId, open, onClose }: { campaignId: string; open: boolean; onClose: () => void }) {
  const queryClient = useQueryClient()
  const [input, setInput] = useState('')
  const [q, setQ] = useState('')
  const [chosen, setChosen] = useState<ReadonlySet<string>>(new Set())
  const [status, setStatus] = useState<MemberStatus>('INVITED')
  useEffect(() => {
    const timer = setTimeout(() => setQ(input.trim()), 300)
    return () => clearTimeout(timer)
  }, [input])
  const leads = useQuery({ ...queries.leads({ page: 1, pageSize: 20, q: q || undefined }), enabled: open })
  const add = useMutation({
    mutationFn: () => api.post<{ added: number }>(`/campaigns/${campaignId}/members`, { leadIds: [...chosen], status }),
    onSuccess: async ({ added }) => {
      await queryClient.invalidateQueries({ queryKey: keys.campaigns })
      toast.success(t('toast.membersAdded', { count: added }), status === 'ATTENDED' ? t('toast.memberAttendedDetail') : undefined)
      setChosen(new Set())
      setInput('')
      onClose()
    },
  })
  const toggle = (id: string) =>
    setChosen((current) => {
      const next = new Set(current)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })
  const close = () => {
    add.reset()
    onClose()
  }
  return (
    <Dialog title={t('campaigns.addMembersTitle')} open={open} onClose={close}>
      <SearchInput label={t('campaigns.memberSearch')} placeholder={t('campaigns.memberSearch')} value={input} onValueChange={setInput} />
      <ul aria-label={t('campaigns.memberSearch')} className="mt-3 h-64 overflow-y-auto rounded-md border border-band">
        {leads.isPending && <Spinner />}
        {leads.data && leads.data.items.length === 0 && <li className="px-3 py-2 text-caption text-ink-meta">{t('campaigns.noLeadsFound')}</li>}
        {(leads.data?.items ?? []).map((lead) => (
          <li key={lead.id}>
            <label className="flex cursor-pointer items-center gap-2 border-b border-band px-3 py-2 text-caption hover:bg-chrome">
              <Checkbox checked={chosen.has(lead.id)} onChange={() => toggle(lead.id)} />
              <span className="min-w-0 flex-1 truncate text-ink-body">{lead.fullName}</span>
              <span className="flex-none text-ink-meta tabular-nums">{lead.phone}</span>
            </label>
          </li>
        ))}
      </ul>
      <div className="mt-3 flex flex-wrap items-center gap-3">
        <span className="text-caption text-ink-body">{t('campaigns.selectedLeads', { count: chosen.size })}</span>
        <div className="sm:w-48">
          <Select aria-label={t('campaigns.memberStatus')} value={status} onChange={(event) => setStatus(event.target.value as MemberStatus)}>
            {MEMBER_STATUSES.map((value) => (
              <option key={value} value={value}>
                {tDynamic(`memberStatus.${value}`, value)}
              </option>
            ))}
          </Select>
        </div>
      </div>
      <FormError message={add.isError ? errorMessage(add.error) : undefined} />
      <div className={MODAL_FOOTER}>
        <Button variant="ghost" onClick={close}>
          {t('common.cancel')}
        </Button>
        <Button disabled={chosen.size === 0 || add.isPending} onClick={() => add.mutate()}>
          {t('campaigns.addMembers')}
        </Button>
      </div>
    </Dialog>
  )
}

/** CMP-2: the seminar's people; managers and whoever works a lead mark it. */
function Members({ detail, onAdd }: { detail: CampaignDetail; onAdd: () => void }) {
  const queryClient = useQueryClient()
  const update = useMutation({
    mutationFn: ({ leadId, status }: { leadId: string; name: string; status: MemberStatus }) => api.patch(`/campaigns/${detail.campaign.id}/members/${leadId}`, { status }),
    onSuccess: async (_, { name, status }) => {
      await queryClient.invalidateQueries({ queryKey: keys.campaigns })
      toast.success(t('toast.memberUpdated', { name, status: tDynamic(`memberStatus.${status}`, status) }), status === 'ATTENDED' ? t('toast.memberAttendedDetail') : undefined)
    },
    onError: (error) => toast.error(t('toast.memberFailed'), errorMessage(error)),
  })
  return (
    <section className="mt-6">
      <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
        <h2 className="text-subhead text-ink">{t('campaigns.members', { count: detail.members.length })}</h2>
        {detail.canManage && (
          <Button variant="secondary" onClick={onAdd}>
            {t('campaigns.addMembers')}
          </Button>
        )}
      </div>
      <p className="mb-3 text-caption text-ink-meta">{t('campaigns.membersHelp')}</p>
      {detail.members.length === 0 ? (
        <EmptyState>{t('campaigns.noMembers')}</EmptyState>
      ) : (
        <TableScroll>
          <table className="data-table min-w-[720px] table-fixed">
            <colgroup>
              <col />
              <col className="w-[170px]" />
              <col className="w-[190px]" />
              <col className="w-[150px]" />
            </colgroup>
            <thead>
              <tr>
                <th>{t('campaigns.lead')}</th>
                <th>{t('campaigns.stage')}</th>
                <th>{t('campaigns.memberStatus')}</th>
                <th>{t('campaigns.updatedAt')}</th>
              </tr>
            </thead>
            <tbody>
              {detail.members.map((member) => (
                <tr key={member.leadId}>
                  <td>
                    <Link to={`/leads/${member.leadId}`} className="block truncate font-medium text-primary hover:underline">
                      {member.fullName}
                    </Link>
                  </td>
                  <td className="truncate">{tDynamic(`stage.${member.stage}`, member.stage)}</td>
                  <td>
                    {member.canUpdate ? (
                      <Select
                        aria-label={`${t('campaigns.memberStatus')}: ${member.fullName}`}
                        value={member.status}
                        disabled={update.isPending}
                        onChange={(event) => update.mutate({ leadId: member.leadId, name: member.fullName, status: event.target.value as MemberStatus })}
                      >
                        {MEMBER_STATUSES.map((value) => (
                          <option key={value} value={value}>
                            {tDynamic(`memberStatus.${value}`, value)}
                          </option>
                        ))}
                      </Select>
                    ) : (
                      tDynamic(`memberStatus.${member.status}`, member.status)
                    )}
                  </td>
                  <td className="whitespace-nowrap text-ink-meta">{formatDateTime(member.updatedAt)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </TableScroll>
      )}
    </section>
  )
}

/** Section 16.9 + CMP-3: one campaign, its figures, and for a seminar its people. */
export function CampaignDetailPage() {
  const { id = '' } = useParams()
  const navigate = useNavigate()
  const url = useUrlState()
  const queryClient = useQueryClient()
  const catalogue = useLeadOptions()
  const campaign = useQuery(queries.campaign(id))
  const [deleting, setDeleting] = useState(false)
  const remove = useMutation({
    mutationFn: () => api.delete(`/campaigns/${id}`),
    onSuccess: async () => {
      const name = campaign.data?.campaign.name ?? ''
      await queryClient.invalidateQueries({ queryKey: keys.campaigns })
      toast.success(t('toast.campaignDeleted', { name }))
      navigate('/campaigns')
    },
  })
  const editing = url.get('edit') === '1'
  const adding = url.get('members') === 'add'

  if (campaign.isPending) return <Spinner />
  if (campaign.error instanceof ApiError && campaign.error.status === 404) return <NotFoundPage />
  if (campaign.isError) return <Alert className="m-4">{errorMessage(campaign.error)}</Alert>
  const detail = campaign.data
  const info = detail.campaign
  const { stats } = detail
  const facts: [MessageKey, string | null][] = [
    ['campaigns.type', tDynamic(`campaignType.${info.type}`, info.type)],
    ['campaigns.channel', info.channel],
    ['campaigns.dates', info.startDate || info.endDate ? `${showDate(info.startDate) ?? '…'} – ${showDate(info.endDate) ?? '…'}` : null],
    ['campaigns.eventAt', info.eventAt ? formatDateTime(info.eventAt) : null],
    ['campaigns.location', info.location],
    ['campaigns.owner', info.ownerName],
    ['campaigns.budget', info.budgetVnd === null ? null : formatVnd(info.budgetVnd)],
  ]

  return (
    <Container className="min-h-0 flex-1 overflow-y-auto pb-8">
      <Link to="/campaigns" className="mt-2 inline-flex items-center gap-1 text-caption text-primary hover:underline">
        <ArrowLeft size={14} aria-hidden />
        {t('campaigns.back')}
      </Link>
      <header className="mt-2 mb-4 flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <h1 className="flex flex-wrap items-center gap-2 text-page-title text-ink">
            {info.name}
            <Badge tone={campaignStatusTone(info.status)}>{tDynamic(`campaignStatus.${info.status}`, info.status)}</Badge>
          </h1>
          <dl className="mt-2 flex flex-wrap gap-x-5 gap-y-1 text-caption">
            {facts
              .filter(([, value]) => value)
              .map(([label, value]) => (
                <div key={label} className="flex gap-1">
                  <dt className="text-ink-meta">{t(label)}:</dt>
                  <dd className="text-ink-body">{value}</dd>
                </div>
              ))}
          </dl>
          {info.notes && <p className="mt-2 max-w-3xl whitespace-pre-wrap text-caption text-ink-body">{info.notes}</p>}
        </div>
        <div className="flex flex-wrap gap-2">
          <Link to={`/leads?campaign=${info.id}`} className="inline-flex min-h-9 items-center text-caption text-primary hover:underline">
            {t('campaigns.viewLeads')}
          </Link>
          {detail.canManage && (
            <>
              <Button variant="secondary" onClick={() => url.set({ edit: 1 }, { push: true })}>
                {t('campaigns.edit')}
              </Button>
              <Button variant="ghost" onClick={() => setDeleting(true)}>
                {t('campaigns.delete')}
              </Button>
            </>
          )}
        </div>
      </header>

      <section>
        <h2 className="text-subhead text-ink">{t('campaigns.stats')}</h2>
        <p className="mb-3 text-caption text-ink-meta">{t('campaigns.statsHelp')}</p>
        <div className="grid grid-cols-2 gap-3 md:grid-cols-3 xl:grid-cols-6">
          <Stat label={t('campaigns.statLeads')} value={stats.leads} />
          <Stat label={t('campaigns.statLinked')} value={stats.linkedClients} />
          <Stat label={t('campaigns.statIssued')} value={stats.issued} />
          <Stat label={t('campaigns.statApe')} value={formatVnd(stats.issuedApeVnd)} />
          <Stat label={t('campaigns.statPerLead')} value={formatVnd(stats.perLeadVnd)} />
          <Stat label={t('campaigns.statPerIssued')} value={formatVnd(stats.perIssuedVnd)} />
        </div>
        <div className="mt-3 grid gap-3 md:grid-cols-3">
          <Breakdown title={t('campaigns.byStage')} counts={stats.byStage} label={(code) => tDynamic(`stage.${code}`, code)} />
          <Breakdown title={t('campaigns.byInterest')} counts={stats.byInterest} label={(code) => catalogue.label('interest', code)} />
          <Breakdown title={t('campaigns.byCare')} counts={stats.byCareStatus} label={(code) => catalogue.label('care_status', code)} />
        </div>
      </section>

      {info.type === 'SEMINAR' && <Members detail={detail} onAdd={() => url.set({ members: 'add' }, { push: true })} />}

      {/* CMP-4: the public form, for whoever manages campaigns */}
      {detail.canManage && <PublicFormSettingsCard key={detail.publicForm?.updatedAt ?? 'new'} campaignId={info.id} campaignName={info.name} form={detail.publicForm} />}

      <Dialog wide title={t('campaigns.editTitle', { name: info.name })} open={editing && detail.canManage} onClose={() => url.set({ edit: null })}>
        {editing && detail.canManage && <CampaignForm campaign={info} onClose={() => url.set({ edit: null })} />}
      </Dialog>
      {info.type === 'SEMINAR' && detail.canManage && <AddMembersDialog campaignId={info.id} open={adding} onClose={() => url.set({ members: null })} />}
      <ConfirmDialog
        message={deleting ? t('campaigns.confirmDelete', { name: info.name }) : null}
        danger
        pending={remove.isPending}
        error={remove.isError ? errorMessage(remove.error) : undefined}
        onConfirm={() => remove.mutate()}
        onClose={() => {
          setDeleting(false)
          remove.reset()
        }}
      />
    </Container>
  )
}
