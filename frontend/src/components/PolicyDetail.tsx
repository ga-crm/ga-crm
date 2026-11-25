import { useQuery } from '@tanstack/react-query'
import { useState } from 'react'
import { ArrowLeft, Eye, EyeOff } from 'lucide-react'
import { Link } from 'react-router-dom'
import { Fact, PolicyAgents, PolicyBadges, PolicyPeople, PolicyProducts } from './PolicyParts'
import { Button, IconButton, RowMenu, Spinner } from './ui'
import { t } from '../i18n'
import { errorMessage } from '../lib/api'
import { money, policySumAssured, yesNo } from '../lib/clientLabels'
import { showDate } from '../lib/leadLabels'
import { queries } from '../lib/queries'
import type { ClientPolicy } from '../lib/types'

/**
 * Decided 25/11/2026: the contact address is personal data, hidden until asked for; each reveal is
 * a request the API audits, and the value is not kept once hidden again.
 */
function ContactAddress({ clientId, policy }: { clientId: string; policy: ClientPolicy }) {
  const [shown, setShown] = useState(false)
  const address = useQuery({ ...queries.policyAddress(clientId, policy.policyNo), enabled: shown })
  if (!policy.hasContactAddress) return <>-</>
  return (
    <span className="flex items-center gap-2">
      <span className="min-w-0 flex-1 break-words">
        {!shown ? <span className="whitespace-nowrap">******</span> : address.isPending ? <Spinner /> : address.isError ? <span className="text-alert">{errorMessage(address.error)}</span> : (address.data.contactAddress ?? '-')}
      </span>
      <IconButton label={t(shown ? 'clients.hideAddress' : 'clients.showAddress')} aria-pressed={shown} className="-my-2 md:size-8" onClick={() => setShown(!shown)}>
        {shown ? <EyeOff size={16} aria-hidden /> : <Eye size={16} aria-hidden />}
      </IconButton>
    </span>
  )
}

function Band({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="rounded-lg bg-chrome p-5">
      <h2 className="mb-2 text-subhead text-ink">{title}</h2>
      <dl className="grid gap-x-8 lg:grid-cols-2">{children}</dl>
    </section>
  )
}

/**
 * "Chi tiết hợp đồng", inside the client's "Hợp đồng" tab: every field DLVN shows for a policy, its
 * products, people and agents (decided 25/11/2026).
 */
export function PolicyDetail({ clientId, policy, onBack, onEdit, onDelete }: { clientId: string; policy: ClientPolicy; onBack: () => void; onEdit?: () => void; onDelete?: () => void }) {
  // The holder opens as a client only when the viewer may open them (CUS-5)
  const holder = policy.people.find((person) => person.clientId && person.clientId === policy.holderClientId)
  return (
    <div className="space-y-6">
      <header className="flex flex-wrap items-center gap-2">
        <span className="flex min-w-0 items-center gap-1">
          <IconButton label={t('policyPage.backToList')} className="-ml-2" onClick={onBack}>
            <ArrowLeft size={18} aria-hidden />
          </IconButton>
          <h2 className="text-subhead text-ink tabular-nums">{t('policyPage.title', { no: policy.policyNo })}</h2>
        </span>
        <PolicyBadges policy={policy} />
        {(onEdit || onDelete) && (
          <span className="ml-auto flex items-center gap-1">
            {onEdit && (
              <Button variant="secondary" onClick={onEdit}>
                {t('clients.editPolicy')}
              </Button>
            )}
            {/* POL-7: only while the policy can still be deleted */}
            {onDelete && <RowMenu label={t('common.more')} items={[{ label: t('clients.deletePolicy'), danger: true, onSelect: onDelete }]} />}
          </span>
        )}
      </header>
      <Band title={t('policyPage.details')}>
        <Fact label={t('clients.policyNoLabel')} value={policy.policyNo} />
        <Fact label={t('clients.holder')}>
          {holder && !holder.self ? (
            <Link to={`/clients/${holder.clientId}`} className="text-primary hover:underline">
              {policy.holderName}
            </Link>
          ) : (
            (policy.holderName ?? '-')
          )}
        </Fact>
        <Fact label={t('clients.insured')} value={policy.insuredName} />
        <Fact label={t('clients.contactAddress')}>
          <ContactAddress clientId={clientId} policy={policy} />
        </Fact>
        <Fact label={t('clients.sumAssuredPolicy')} value={money(policySumAssured(policy))} />
        <Fact label={t('clients.policyStatus')} value={policy.status} />
        <Fact label={t('clients.effective')} value={showDate(policy.effectiveDate)} />
        <Fact label={t('clients.maturity')} value={showDate(policy.maturityDate)} />
        <Fact label={t('clients.frequency')} value={policy.premiumFrequency} />
        <Fact label={t('clients.dueDate')} value={showDate(policy.premiumDueDate)} />
        <Fact label={t('clients.graceEnd')} value={showDate(policy.graceEndDate)} />
        <Fact label={t('clients.beneficiary')} value={yesNo(policy.hasBeneficiary)} />
        <Fact label={t('clients.assignmentType')} value={policy.assignmentType} />
        <Fact label={t('clients.assignmentDate')} value={showDate(policy.assignmentDate)} />
      </Band>
      <Band title={t('policyPage.premiums')}>
        <Fact label={t('clients.plannedPremium')} value={money(policy.plannedPremiumVnd)} />
        <Fact label={t('clients.premium')} value={money(policy.basePremiumVnd)} />
        <Fact label={t('clients.advancePremium')} value={money(policy.advancePremiumVnd)} />
        <Fact label={t('clients.unpaid')} value={money(policy.unpaidPremiumVnd)} />
        <Fact label={t('clients.totalPaid')} value={money(policy.totalPaidPremiumVnd)} />
        <Fact label={t('clients.basicPremium')} value={money(policy.basicPremiumVnd)} />
        <Fact label={t('clients.topUp')} value={money(policy.topUpPremiumVnd)} />
        <Fact label={t('clients.apl')} value={money(policy.aplDebtVnd)} />
      </Band>
      <PolicyProducts policy={policy} />
      <div className="grid gap-6 lg:grid-cols-2">
        <PolicyPeople people={policy.people} />
        <PolicyAgents policy={policy} />
      </div>
    </div>
  )
}
