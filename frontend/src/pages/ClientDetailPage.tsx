import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { useState } from 'react'
import { ArrowLeft, ArrowRight } from 'lucide-react'
import { Link, useParams } from 'react-router-dom'
import { ClientLeadSource, CommentsCard, CoverageCard, NotesCard, SignalsCard } from '../components/ClientCare'
import { ClientCareRecords } from '../components/ClientCareRecords'
import { FamilyTab } from '../components/ClientFamily'
import { ClientHistory } from '../components/ClientHistory'
import { ClientProgrammes } from '../components/ClientProgrammes'
import { EditClientForm, PolicyForm } from '../components/ClientForms'
import { PolicyDetail } from '../components/PolicyDetail'
import { TierBadge } from '../components/TierBadge'
import { Fact, PolicyBadges } from '../components/PolicyParts'
import { money, policySumAssured, yesNo } from '../lib/clientLabels'
import { Alert, Button, ConfirmDialog, Container, Dialog, EmptyState, Notice, Panel, RowMenu, Spinner, TabBar } from '../components/ui'
import { formatDateTime, formatVnd, t } from '../i18n'
import { ApiError, api, errorMessage } from '../lib/api'
import { showDate } from '../lib/leadLabels'
import { keys, queries } from '../lib/queries'
import { toast } from '../lib/toast'
import { useSelectedTabInView } from '../lib/useSelectedTabInView'
import { useUrlState } from '../lib/useUrlState'
import type { ClientDetail, ClientPolicy } from '../lib/types'
import { NotFoundPage } from './ForbiddenPage'

/**
 * CUS-15, reshaped 26/11/2026: "Thông tin cơ bản", the client in short. What Success adds (its
 * policy counts, D-Connect, eKYC, the ID-card flag, loyalty points) shows only when there is a value.
 */
function ClientInfo({ detail, onEdit }: { detail: ClientDetail; onEdit: () => void }) {
  const { client } = detail
  const active = detail.policies.filter((policy) => policy.active).length
  const dconnect = [yesNo(client.usesDconnect), client.dconnectLastLoginAt && t('clients.lastLogin', { at: formatDateTime(client.dconnectLastLoginAt) })].filter(Boolean).join(' · ')
  const ekyc = [yesNo(client.ekycRegistered), client.ekycRegisteredAt && formatDateTime(client.ekycRegisteredAt)].filter(Boolean).join(' · ')
  return (
    <section className="rounded-lg bg-chrome p-5">
      <div className="mb-2 flex items-center justify-between gap-2">
        <h2 className="text-subhead text-ink">{t('clients.info')}</h2>
        {detail.canEdit && (
          <Button variant="ghost" onClick={onEdit}>
            {t('clients.edit')}
          </Button>
        )}
      </div>
      {client.manual && <p className="mb-2 text-caption text-ink-meta">{t('clients.manualNote')}</p>}
      <dl className="grid gap-x-8 md:grid-cols-2 xl:grid-cols-3">
        <Fact narrow label={t('clients.phone')} value={client.phone ? `${client.phone} · ${t('clients.phoneKept')}` : null} />
        <Fact narrow label={t('clients.tier')}>{client.tier ? <TierBadge tier={client.tier} /> : '-'}</Fact>
        <Fact narrow label={t('clients.dobAndBand')} value={[showDate(client.dob) ?? client.birthDayMonth, client.ageBand].filter(Boolean).join(' · ') || null} />
        <Fact narrow label={t('clients.gender')} value={client.gender} />
        <Fact narrow label={t('clients.marital')} value={client.maritalStatus} />
        <Fact narrow label={t('clients.policyCount')} value={detail.policies.length > 0 ? t('clients.policyCountValue', { active, total: detail.policies.length }) : null} />
        <Fact narrow label={t('clients.agents')} value={client.agents.map((agent) => `${agent.name ?? agent.agentCode} (${agent.agentCode})`).join(', ') || null} />
        {(client.activePolicies !== null || client.lapsedPolicies !== null) && (
          <Fact narrow label={t('clients.successPolicies')} value={t('clients.successPoliciesValue', { active: client.activePolicies ?? 0, lapsed: client.lapsedPolicies ?? 0 })} />
        )}
        {dconnect && <Fact narrow label={t('clients.dconnect')} value={dconnect} />}
        {ekyc && <Fact narrow label={t('clients.ekyc')} value={ekyc} />}
        {/* PDP-1: only whether it was updated; the number is never stored */}
        {client.idUpdated !== null && <Fact narrow label={t('clients.idUpdated')} value={yesNo(client.idUpdated)} />}
        {client.loyaltyPoints !== null && <Fact narrow label={t('clients.loyalty')} value={client.loyaltyPoints} />}
      </dl>
    </section>
  )
}

/** CUS-15: one policy, in short; the policy page has every field (decided 25/11/2026). */
function PolicyCard({ policy, onOpen, onEdit, onDelete }: { policy: ClientPolicy; onOpen: () => void; onEdit?: () => void; onDelete?: () => void }) {
  return (
    <Panel as="article" className="p-5">
      <header className="mb-3 flex flex-wrap items-center gap-2">
        <h3 className="text-subhead tabular-nums">
          <button type="button" className="cursor-pointer text-primary hover:underline" onClick={onOpen}>
            {t('clients.policyNo', { no: policy.policyNo })}
          </button>
        </h3>
        <PolicyBadges policy={policy} />
        {(onEdit || onDelete) && (
          <span className="ml-auto flex items-center gap-1">
            {onEdit && (
              <Button variant="ghost" onClick={onEdit}>
                {t('clients.editPolicy')}
              </Button>
            )}
            {/* POL-7: only while the policy can still be deleted */}
            {onDelete && <RowMenu label={t('common.more')} items={[{ label: t('clients.deletePolicy'), danger: true, onSelect: onDelete }]} />}
          </span>
        )}
      </header>
      <dl className="grid gap-x-6 xl:grid-cols-2">
        <Fact narrow label={t('clients.holder')} value={policy.holderName} />
        <Fact narrow label={t('clients.insured')} value={policy.insuredName} />
        <Fact narrow label={t('clients.sumAssuredPolicy')} value={money(policySumAssured(policy))} />
        <Fact narrow label={t('clients.effective')} value={showDate(policy.effectiveDate)} />
        <Fact narrow label={t('clients.frequency')} value={policy.premiumFrequency} />
        <Fact narrow label={t('clients.premium')} value={money(policy.basePremiumVnd)} />
        <Fact narrow label={t('clients.dueDate')} value={showDate(policy.premiumDueDate)} />
        <Fact narrow label={t('clients.products')} value={policy.products.map((product) => product.catalogueName ?? product.productName ?? product.productCode).join(', ') || null} />
      </dl>
      <button type="button" className="mt-3 inline-flex cursor-pointer items-center gap-1 text-caption text-primary hover:underline" onClick={onOpen}>
        {t('clients.viewPolicy')}
        <ArrowRight size={14} aria-hidden />
      </button>
    </Panel>
  )
}

/** CUS-13 */
function Applications({ detail }: { detail: ClientDetail }) {
  if (detail.applications.length === 0) return null
  return (
    <section>
      <h2 className="mb-2 text-subhead text-ink">{t('clients.applications', { count: detail.applications.length })}</h2>
      <div className="overflow-x-auto">
        <table className="data-table min-w-[1000px] table-fixed">
          <colgroup>
            <col className="w-[130px]" />
            <col />
            <col className="w-[220px]" />
            <col className="w-[120px]" />
            <col className="w-[120px]" />
            <col className="w-[200px]" />
            <col className="w-[140px]" />
          </colgroup>
          <thead>
            <tr>
              <th>{t('clients.applicationNo')}</th>
              <th>{t('clients.agent')}</th>
              <th>{t('clients.applicationProduct')}</th>
              <th>{t('clients.created')}</th>
              <th>{t('clients.issued')}</th>
              <th>{t('clients.applicationStatus')}</th>
              <th className="text-right">{t('clients.ape')}</th>
            </tr>
          </thead>
          <tbody>
            {detail.applications.map((application) => (
              <tr key={application.applicationNo}>
                <td className="tabular-nums">{application.applicationNo}</td>
                <td className="truncate">{`${application.agentName ?? application.agentCode} (${application.agentCode})`}</td>
                <td className="truncate" title={application.productName ?? application.productCode ?? undefined}>
                  {application.productName ?? application.productCode ?? '-'}
                </td>
                <td>{showDate(application.createdDate)}</td>
                <td>{showDate(application.issuedDate) ?? '-'}</td>
                <td className="truncate" title={application.status}>
                  {application.status}
                </td>
                <td className="text-right tabular-nums">{formatVnd(application.apeVnd)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </section>
  )
}

// Decided 26/11/2026: care sits in a tab of its own, next to the client's information
const TABS = ['main', 'care', 'policies', 'family', 'history', 'lead'] as const

/** Section 16.7 + CUS-15: "Khách hàng & hợp đồng" and "Gia đình". */
export function ClientDetailPage() {
  const { clientId = '' } = useParams()
  const url = useUrlState()
  const client = useQuery(queries.client(clientId))
  const queryClient = useQueryClient()
  // A confirmation for a destructive action stays out of the URL
  const [deleting, setDeleting] = useState<ClientPolicy | null>(null)
  const removePolicy = useMutation({
    mutationFn: (policy: ClientPolicy) => api.delete(`/clients/${clientId}/policies/${policy.policyNo}`),
    onSuccess: async (_, policy) => {
      setDeleting(null)
      toast.success(t('toast.policyDeleted', { no: policy.policyNo }))
      await queryClient.invalidateQueries({ queryKey: keys.clients })
    },
  })
  const editing = url.get('edit') === '1'
  const policyKey = url.get('policy')
  const tab = url.oneOf('tab', ['care', 'policies', 'family', 'history', 'lead']) || 'main'
  // The policy open in the "Hợp đồng" tab, by its number
  const openNo = tab === 'policies' ? url.get('no') : null
  useSelectedTabInView(tab, !!client.data)

  if (client.isPending) return <Spinner />
  // An id that is not a uuid (an old link by client code) is a 400: as missing as a 404
  if (client.error instanceof ApiError && (client.error.status === 404 || client.error.status === 400)) return <NotFoundPage />
  if (client.isError) return <Alert className="m-4">{errorMessage(client.error)}</Alert>
  const detail = client.data
  const editedPolicy = policyKey && policyKey !== 'new' ? detail.policies.find((policy) => policy.policyNo === policyKey) : undefined
  const policyOpen = detail.canEdit && (policyKey === 'new' || !!editedPolicy)
  const openPolicy = openNo ? detail.policies.find((policy) => policy.policyNo === openNo) : undefined
  const editPolicy = (policy: ClientPolicy) => (detail.canEdit ? () => url.set({ policy: policy.policyNo }, { push: true }) : undefined)

  return (
    <Container className="min-h-0 flex-1 overflow-y-auto pb-8">
      <Link to="/clients" className="mt-2 inline-flex items-center gap-1 text-caption text-primary hover:underline">
        <ArrowLeft size={14} aria-hidden />
        {t('clients.back')}
      </Link>
      <header className="mt-2 mb-4">
        <h1 className="text-page-title text-ink">{detail.client.name}</h1>
        {detail.client.tier && <TierBadge tier={detail.client.tier} className="mt-1" />}
      </header>
      {/* Section 16: "Lead nguồn" only when the client came from a lead (LEAD-34) */}
      <TabBar
        className="mb-2"
        label={detail.client.name}
        value={tab}
        onValueChange={(key) => url.set({ tab: key === 'main' ? null : key, no: null })}
        items={TABS.filter((key) => key !== 'lead' || detail.linkedLead).map((key) => ({
          value: key,
          label: key === 'main' ? t('clients.tabMain') : key === 'care' ? t('care.title') : key === 'policies' ? t('clients.policies', { count: detail.policies.length }) : key === 'family' ? t('clients.tabFamily', { count: detail.family.length }) : key === 'lead' ? t('clients.tabLead') : t('clients.tabHistory'),
        }))}
      />
      {tab === 'lead' && detail.linkedLead ? (
        <ClientLeadSource detail={detail} />
      ) : tab === 'history' ? (
        <ClientHistory detail={detail} />
      ) : tab === 'care' ? (
        // "Thông tin chăm sóc": what the GA recorded, beside the signals, notes and comments
        <div className="space-y-4">
          {!detail.canEdit && <Notice>{t('clients.readOnly')}</Notice>}
          <p className="text-caption text-ink-meta">{t('care.help')}</p>
          <div className="grid gap-6 lg:grid-cols-2">
            <div className="min-w-0 space-y-6">
              <ClientCareRecords detail={detail} />
            </div>
            <div className="min-w-0 space-y-6">
              <SignalsCard detail={detail} />
              <NotesCard detail={detail} />
              <CommentsCard detail={detail} />
            </div>
          </div>
        </div>
      ) : tab === 'policies' ? (
        openPolicy ? (
          <div>
            <PolicyDetail
              clientId={detail.client.id}
              policy={openPolicy}
              onBack={() => url.set({ no: null }, { push: true })}
              onEdit={editPolicy(openPolicy)}
              onDelete={openPolicy.canDelete ? () => setDeleting(openPolicy) : undefined}
            />
          </div>
        ) : (
          <>
            <section className="space-y-4">
              <div className="flex items-center justify-between gap-2">
                <h2 className="text-subhead text-ink">{t('clients.policies', { count: detail.policies.length })}</h2>
                {detail.canEdit && (
                  <Button variant="secondary" onClick={() => url.set({ policy: 'new' }, { push: true })}>
                    {t('clients.addPolicy')}
                  </Button>
                )}
              </div>
              {detail.policies.length === 0 ? (
                <EmptyState>{t('clients.noPolicies')}</EmptyState>
              ) : (
                detail.policies.map((policy) => (
                  <PolicyCard
                    key={policy.policyNo}
                    policy={policy}
                    onOpen={() => url.set({ no: policy.policyNo }, { push: true })}
                    onEdit={editPolicy(policy)}
                    onDelete={policy.canDelete ? () => setDeleting(policy) : undefined}
                  />
                ))
              )}
            </section>
            <div className="mt-6">
              <Applications detail={detail} />
            </div>
          </>
        )
      ) : tab === 'family' ? (
        <FamilyTab detail={detail} />
      ) : (
        // Decided 26/11/2026: the client in short, then their programmes
        <div className="space-y-6">
          {!detail.canEdit && <Notice>{t('clients.readOnly')}</Notice>}
          <ClientInfo detail={detail} onEdit={() => url.set({ edit: 1 }, { push: true })} />
          <ClientProgrammes detail={detail} onOpenPolicy={(policyNo) => url.set({ tab: 'policies', no: policyNo }, { push: true })} />
          <CoverageCard detail={detail} />
        </div>
      )}
      <Dialog wide title={t('clients.editTitle', { name: detail.client.name })} open={editing && detail.canEdit} onClose={() => url.set({ edit: null })}>
        {editing && detail.canEdit && <EditClientForm detail={detail} onClose={() => url.set({ edit: null })} />}
      </Dialog>
      <Dialog wide title={editedPolicy ? t('clients.editPolicyTitle', { no: editedPolicy.policyNo }) : t('clients.addPolicyTitle')} open={policyOpen} onClose={() => url.set({ policy: null })}>
        {policyOpen && <PolicyForm key={policyKey} clientId={detail.client.id} policy={editedPolicy} onClose={() => url.set({ policy: null })} />}
      </Dialog>
      <ConfirmDialog
        message={deleting ? t('clients.deletePolicyConfirm', { no: deleting.policyNo }) : null}
        danger
        pending={removePolicy.isPending}
        error={removePolicy.isError ? errorMessage(removePolicy.error) : undefined}
        onConfirm={() => deleting && removePolicy.mutate(deleting)}
        onClose={() => {
          setDeleting(null)
          removePolicy.reset()
        }}
      />
    </Container>
  )
}
