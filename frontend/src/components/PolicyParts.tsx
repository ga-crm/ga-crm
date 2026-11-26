import { Link } from 'react-router-dom'
import { Badge } from './ui'
import { formatVnd, t } from '../i18n'
import { groupLabel, rolesLabel } from '../lib/clientLabels'
import type { ClientPolicy } from '../lib/types'

export function Fact({ label, value, narrow = false, children }: { label: string; value?: string | number | null; narrow?: boolean; children?: React.ReactNode }) {
  return (
    <div className={`grid ${narrow ? 'grid-cols-[8.5rem_1fr]' : 'grid-cols-[11rem_1fr]'} gap-2 border-b border-band py-2 text-caption`}>
      <dt className="text-ink-meta">{label}</dt>
      <dd className="min-w-0 break-words text-ink-body">{children ?? value ?? '-'}</dd>
    </div>
  )
}

/** Status, the client's roles on it and whether it was entered by hand. */
export function PolicyBadges({ policy }: { policy: ClientPolicy }) {
  return (
    <>
      {/* A policy known only by its number has no status yet */}
      {policy.status ? <Badge tone={policy.active ? 'success' : 'warning'}>{policy.status}</Badge> : <Badge tone="muted">{t('clients.noStatus')}</Badge>}
      {policy.roles.map((role) => (
        <Badge key={role} tone="muted">
          {rolesLabel([role])}
        </Badge>
      ))}
      {policy.manual && <Badge tone="muted">{t('clients.badgeManual')}</Badge>}
    </>
  )
}

/** CUS-11: everyone on the policy with their roles; a person this viewer may open is a link (CUS-5). */
export function PolicyPeople({ people }: { people: ClientPolicy['people'] }) {
  if (people.length === 0) return null
  return (
    <section>
      <h2 className="mb-2 text-subhead text-ink">{t('clients.people')}</h2>
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
    </section>
  )
}

/** CUS-8: every current agent and share. */
export function PolicyAgents({ policy }: { policy: ClientPolicy }) {
  return (
    <section>
      <h2 className="mb-2 text-subhead text-ink">{t('clients.policyAgents')}</h2>
      <ul className="space-y-1 text-caption text-ink-body">
        {policy.agents.map((agent) => (
          <li key={agent.agentCode} className="flex flex-wrap items-center gap-2">
            <span>{`${agent.name ?? agent.agentCode} (${agent.agentCode})`}</span>
            {agent.splitPercent !== null && <span className="tabular-nums text-ink-meta">{agent.splitPercent}%</span>}
            {agent.isServicing && <Badge tone="info">{t('clients.servicing')}</Badge>}
          </li>
        ))}
      </ul>
    </section>
  )
}

/** PRD-1 + TENANT-5: the policy's product lines, each linked to the catalogue when it knows the product. */
export function PolicyProducts({ policy }: { policy: ClientPolicy }) {
  return (
    <section>
      <h2 className="mb-2 text-subhead text-ink">{t('clients.products')}</h2>
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
                  <td className="truncate" title={product.catalogueName ?? product.productName ?? product.productCode}>
                    {/* TENANT-5: a product of the catalogue opens its page */}
                    {product.catalogueName ? (
                      <Link to={`/products/${encodeURIComponent(product.productCode)}`} className="text-primary hover:underline">
                        {product.catalogueName}
                      </Link>
                    ) : (
                      (product.productName ?? product.productCode)
                    )}
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
    </section>
  )
}
