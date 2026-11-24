import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { useMemo, useState } from 'react'
import { ArrowLeft } from 'lucide-react'
import { Link, useParams } from 'react-router-dom'
import { ClientLeadSource, CommentsCard, CoverageCard, NotesCard, SignalsCard } from '../components/ClientCare'
import { FamilyTab } from '../components/ClientFamily'
import { ClientHistory } from '../components/ClientHistory'
import { EditClientForm, PolicyForm } from '../components/ClientForms'
import { Alert, Badge, Button, ConfirmDialog, Container, Dialog, EmptyState, Notice, Panel, RowMenu, Spinner, TabBar } from '../components/ui'
import { formatDateTime, formatVnd, t } from '../i18n'
import { ApiError, api, errorMessage } from '../lib/api'
import { groupLabel, rolesLabel } from '../lib/clientLabels'
import { showDate } from '../lib/leadLabels'
import { keys, queries } from '../lib/queries'
import { toast } from '../lib/toast'
import { useSelectedTabInView } from '../lib/useSelectedTabInView'
import { useUrlState } from '../lib/useUrlState'
import type { ClientDetail, ClientPolicy } from '../lib/types'
import { NotFoundPage } from './ForbiddenPage'

const yesNo = (value: boolean | null) => (value === null ? null : t(value ? 'common.yes' : 'common.no'))

function Fact({ label, value, narrow = false }: { label: string; value?: string | number | null; narrow?: boolean }) {
  return (
    <div className={`grid ${narrow ? 'grid-cols-[8.5rem_1fr]' : 'grid-cols-[11rem_1fr]'} gap-2 border-b border-band py-2 text-caption`}>
      <dt className="text-ink-meta">{label}</dt>
      <dd className="min-w-0 break-words text-ink-body">{value ?? '-'}</dd>
    </div>
  )
}

/** CUS-15: "Thông tin khách hàng". */
function ClientInfo({ detail, onEdit }: { detail: ClientDetail; onEdit: () => void }) {
  const { client } = detail
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
      <dl>
        <Fact label={t('clients.phone')} value={client.phone ? `${client.phone} · ${t('clients.phoneKept')}` : null} />
        <Fact label={t('clients.tier')} value={client.tier} />
        <Fact label={t('clients.dob')} value={showDate(client.dob) ?? client.birthDayMonth} />
        <Fact label={t('clients.ageBand')} value={client.ageBand} />
        <Fact label={t('clients.gender')} value={client.gender} />
        <Fact label={t('clients.marital')} value={client.maritalStatus} />
        <Fact label={t('clients.loyalty')} value={client.loyaltyPoints} />
        <Fact label={t('clients.successPolicies')} value={client.activePolicies === null && client.lapsedPolicies === null ? null : t('clients.successPoliciesValue', { active: client.activePolicies ?? 0, lapsed: client.lapsedPolicies ?? 0 })} />
        <Fact label={t('clients.dconnect')} value={[yesNo(client.usesDconnect), client.dconnectLastLoginAt && t('clients.lastLogin', { at: formatDateTime(client.dconnectLastLoginAt) })].filter(Boolean).join(' · ') || null} />
        <Fact label={t('clients.ekyc')} value={[yesNo(client.ekycRegistered), client.ekycRegisteredAt && formatDateTime(client.ekycRegisteredAt)].filter(Boolean).join(' · ') || null} />
        {/* PDP-1: only whether it was updated; the number is never stored */}
        <Fact label={t('clients.idUpdated')} value={yesNo(client.idUpdated)} />
        <Fact label={t('clients.agents')} value={client.agents.map((agent) => `${agent.name ?? agent.agentCode} (${agent.agentCode})`).join(', ') || null} />
      </dl>
    </section>
  )
}

/** CUS-11: everyone on the policy with their roles; a person this viewer may open is a link (CUS-5). */
function PolicyPeople({ people }: { people: ClientPolicy['people'] }) {
  if (people.length === 0) return null
  return (
    <>
      <h4 className="mt-4 mb-2 text-caption font-medium text-ink">{t('clients.people')}</h4>
      <ul className="space-y-1 text-caption text-ink-body">
        {people.map((person, index) => (
          <li key={person.clientId ?? `${person.name}-${index}`} className="flex flex-wrap items-center gap-x-2">
            {person.clientId && !person.self ? (
              <Link to={`/clients/${person.clientId}`} className="text-primary hover:underline">
                {person.name || '-'}
              </Link>
            ) : (
              <span>{person.name || '-'}</span>
            )}
            {person.self && <span className="text-ink-meta">{t('clients.selfMark')}</span>}
            <span className="text-ink-meta">{rolesLabel(person.roles)}</span>
          </li>
        ))}
      </ul>
    </>
  )
}

/** CUS-15: one policy card, with every agent and share (CUS-8) and its programmes. */
function PolicyCard({ policy, onEdit, onDelete }: { policy: ClientPolicy; onEdit?: () => void; onDelete?: () => void }) {
  return (
    <Panel as="article" className="p-5">
      <header className="mb-3 flex flex-wrap items-center gap-2">
        <h3 className="text-subhead text-ink tabular-nums">{t('clients.policyNo', { no: policy.policyNo })}</h3>
        {/* A policy known only by its number has no status yet */}
        {policy.status ? <Badge tone={policy.active ? 'success' : 'warning'}>{policy.status}</Badge> : <Badge tone="muted">{t('clients.noStatus')}</Badge>}
        {policy.roles.map((role) => (
          <Badge key={role} tone="muted">
            {rolesLabel([role])}
          </Badge>
        ))}
        {policy.manual && <Badge tone="muted">{t('clients.badgeManual')}</Badge>}
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
        <Fact narrow label={t('clients.effective')} value={showDate(policy.effectiveDate)} />
        <Fact narrow label={t('clients.maturity')} value={showDate(policy.maturityDate)} />
        <Fact narrow label={t('clients.frequency')} value={policy.premiumFrequency} />
        <Fact narrow label={t('clients.premium')} value={policy.basePremiumVnd === null ? null : formatVnd(policy.basePremiumVnd)} />
        <Fact narrow label={t('clients.dueDate')} value={showDate(policy.premiumDueDate)} />
        <Fact narrow label={t('clients.plannedPremium')} value={policy.plannedPremiumVnd === null ? null : formatVnd(policy.plannedPremiumVnd)} />
        <Fact narrow label={t('clients.unpaid')} value={policy.unpaidPremiumVnd === null ? null : formatVnd(policy.unpaidPremiumVnd)} />
        <Fact narrow label={t('clients.apl')} value={policy.aplDebtVnd === null ? null : formatVnd(policy.aplDebtVnd)} />
        <Fact narrow label={t('clients.beneficiary')} value={yesNo(policy.hasBeneficiary)} />
      </dl>
      <PolicyPeople people={policy.people} />
      <h4 className="mt-4 mb-2 text-caption font-medium text-ink">{t('clients.policyAgents')}</h4>
      <ul className="space-y-1 text-caption text-ink-body">
        {policy.agents.map((agent) => (
          <li key={agent.agentCode} className="flex flex-wrap items-center gap-2">
            <span>{`${agent.name ?? agent.agentCode} (${agent.agentCode})`}</span>
            {agent.splitPercent !== null && <span className="tabular-nums text-ink-meta">{agent.splitPercent}%</span>}
            {agent.isServicing && <Badge tone="info">{t('clients.servicing')}</Badge>}
          </li>
        ))}
      </ul>
      <h4 className="mt-4 mb-2 text-caption font-medium text-ink">{t('clients.products')}</h4>
      {policy.products.length === 0 ? (
        // COV-4: without product detail only the policy count is known
        <p className="text-caption text-ink-meta">{t('clients.noProducts')}</p>
      ) : (
        <div className="overflow-x-auto">
          <table className="data-table min-w-[740px] table-fixed">
            <colgroup>
              <col />
              <col className="w-[140px]" />
              <col className="w-[120px]" />
              <col className="w-[72px]" />
              <col className="w-[120px]" />
              <col className="w-[104px]" />
              <col className="w-[104px]" />
            </colgroup>
            <thead>
              <tr>
                <th>{t('clients.product')}</th>
                <th>{t('clients.productInsured')}</th>
                <th>{t('clients.productGroup')}</th>
                <th>{t('clients.productRole')}</th>
                <th className="text-right">{t('clients.sumAssured')}</th>
                <th className="text-right">{t('clients.annualPremium')}</th>
                <th>{t('clients.productStatus')}</th>
              </tr>
            </thead>
            <tbody>
              {policy.products.map((product) => (
                <tr key={`${product.productCode}-${product.insuredClientId ?? product.insuredName ?? ''}`}>
                  <td className="truncate" title={product.productName ?? product.productCode}>
                    {product.productName ?? product.productCode}
                    <span className="ml-1 text-ink-meta">{product.productCode}</span>
                  </td>
                  <td className="truncate">{product.insuredName ?? '-'}</td>
                  <td className="truncate">{groupLabel(product.group)}</td>
                  <td>{product.productRole}</td>
                  <td className="text-right tabular-nums">{formatVnd(product.sumAssuredVnd)}</td>
                  <td className="text-right tabular-nums">{formatVnd(product.annualPremiumVnd)}</td>
                  <td className="truncate">{product.status ?? '-'}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
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
        <table className="data-table min-w-[820px] table-fixed">
          <colgroup>
            <col className="w-[130px]" />
            <col />
            <col className="w-[120px]" />
            <col className="w-[120px]" />
            <col className="w-[200px]" />
            <col className="w-[140px]" />
          </colgroup>
          <thead>
            <tr>
              <th>{t('clients.applicationNo')}</th>
              <th>{t('clients.agent')}</th>
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

const TABS = ['main', 'family', 'history', 'lead'] as const

/** Section 16.7 + CUS-15: "Khách hàng & hợp đồng" and "Gia đình". */
export function ClientDetailPage() {
  const { clientId = '' } = useParams()
  const url = useUrlState()
  const client = useQuery(queries.client(clientId))
  const programs = useQuery(queries.programs())
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
  // POL-4: a stored line's product code back to the catalogue programme that made it
  const programOf = useMemo(
    () => new Map((programs.data?.items ?? []).flatMap((program) => [[program.productCode ?? program.code, program.code] as const, [program.code, program.code] as const])),
    [programs.data],
  )
  const editing = url.get('edit') === '1'
  const policyKey = url.get('policy')
  const tab = url.oneOf('tab', ['family', 'history', 'lead']) || 'main'
  useSelectedTabInView(tab, !!client.data)

  if (client.isPending) return <Spinner />
  // An id that is not a uuid (an old link by client code) is a 400: as missing as a 404
  if (client.error instanceof ApiError && (client.error.status === 404 || client.error.status === 400)) return <NotFoundPage />
  if (client.isError) return <Alert className="m-4">{errorMessage(client.error)}</Alert>
  const detail = client.data
  const editedPolicy = policyKey && policyKey !== 'new' ? detail.policies.find((policy) => policy.policyNo === policyKey) : undefined
  const policyOpen = detail.canEdit && (policyKey === 'new' || !!editedPolicy)

  return (
    <Container className="min-h-0 flex-1 overflow-y-auto pb-8">
      <Link to="/clients" className="mt-2 inline-flex items-center gap-1 text-caption text-primary hover:underline">
        <ArrowLeft size={14} aria-hidden />
        {t('clients.back')}
      </Link>
      <header className="mt-2 mb-3">
        <h1 className="text-page-title text-ink">{detail.client.name}</h1>
        {detail.client.tier && <p className="text-caption text-ink-meta">{detail.client.tier}</p>}
      </header>
      {/* Section 16: "Lead nguồn" only when the client came from a lead (LEAD-34) */}
      <TabBar
        variant="line"
        label={detail.client.name}
        value={tab}
        onValueChange={(key) => url.set({ tab: key === 'main' ? null : key })}
        items={TABS.filter((key) => key !== 'lead' || detail.linkedLead).map((key) => ({
          value: key,
          label: key === 'main' ? t('clients.tabMain') : key === 'family' ? t('clients.tabFamily', { count: detail.family.length }) : key === 'lead' ? t('clients.tabLead') : t('clients.tabHistory'),
        }))}
      />
      {tab === 'lead' && detail.linkedLead ? (
        <ClientLeadSource detail={detail} />
      ) : tab === 'history' ? (
        <ClientHistory detail={detail} />
      ) : tab === 'family' ? (
        <FamilyTab detail={detail} />
      ) : (
        <>
          {!detail.canEdit && <Notice>{t('clients.readOnly')}</Notice>}
          <div className="mt-4 grid gap-6 lg:grid-cols-2">
            <div className="min-w-0 space-y-6">
              <ClientInfo detail={detail} onEdit={() => url.set({ edit: 1 }, { push: true })} />
              <CoverageCard detail={detail} />
            </div>
            <div className="min-w-0 space-y-6">
              <SignalsCard detail={detail} />
              <NotesCard detail={detail} />
              <CommentsCard detail={detail} />
            </div>
          </div>
          <section className="mt-6 space-y-4">
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
                  onEdit={detail.canEdit ? () => url.set({ policy: policy.policyNo }, { push: true }) : undefined}
                  onDelete={policy.canDelete ? () => setDeleting(policy) : undefined}
                />
              ))
            )}
          </section>
          <div className="mt-6">
            <Applications detail={detail} />
          </div>
        </>
      )}
      <Dialog wide title={t('clients.editTitle', { name: detail.client.name })} open={editing && detail.canEdit} onClose={() => url.set({ edit: null })}>
        {editing && detail.canEdit && <EditClientForm detail={detail} onClose={() => url.set({ edit: null })} />}
      </Dialog>
      <Dialog wide title={editedPolicy ? t('clients.editPolicyTitle', { no: editedPolicy.policyNo }) : t('clients.addPolicyTitle')} open={policyOpen} onClose={() => url.set({ policy: null })}>
        {policyOpen && <PolicyForm key={policyKey} clientId={detail.client.id} policy={editedPolicy} programs={programOf} onClose={() => url.set({ policy: null })} />}
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
