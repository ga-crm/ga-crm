import { useQuery } from '@tanstack/react-query'
import { ArrowLeft, ContactRound } from 'lucide-react'
import { Link, useParams } from 'react-router-dom'
import { useMe } from '../auth/useMe'
import { buttonClass } from '../components/buttonStyles'
import { Alert, Badge, Container, EmptyState, Notice, Spinner } from '../components/ui'
import { formatVnd, t } from '../i18n'
import { ApiError, errorMessage } from '../lib/api'
import { rolesLabel } from '../lib/clientLabels'
import { canUseLeads } from '../lib/nav'
import { entryAgeLabel } from '../lib/products'
import { queries } from '../lib/queries'
import type { ProductPolicy, ProductView } from '../lib/types'
import { NotFoundPage } from './ForbiddenPage'

/** The API returns at most this many policies (TENANT-5). */
const MAX_POLICIES = 200

function Fact({ label, value, multiline = false }: { label: string; value?: string | number | null; multiline?: boolean }) {
  return (
    <div className="grid grid-cols-[9.5rem_1fr] gap-2 border-b border-band py-2 text-caption">
      <dt className="text-ink-meta">{label}</dt>
      <dd className={`min-w-0 break-words text-ink-body ${multiline ? 'whitespace-pre-line' : ''}`}>{value ?? '-'}</dd>
    </div>
  )
}

/** TENANT-5: what the catalogue says about the product. */
function ProductInfo({ product }: { product: ProductView }) {
  return (
    <section className="rounded-lg bg-chrome p-5">
      <h2 className="mb-2 text-subhead text-ink">{t('products.info')}</h2>
      <dl>
        <Fact label={t('products.code')} value={product.productCode} />
        <Fact label={t('products.role')} value={product.productRole} />
        <Fact label={t('products.category')} value={product.category} />
        <Fact label={t('products.entryAge')} value={entryAgeLabel(product)} />
        <Fact label={t('products.coverAge')} value={product.maxCoverAge === null ? null : t('products.years', { age: product.maxCoverAge })} />
        <Fact label={t('products.gender')} value={product.gender} />
        <Fact label={t('products.waitingPeriod')} value={product.waitingPeriod} />
        <Fact label={t('products.keyBenefits')} value={product.keyBenefits} multiline />
      </dl>
    </section>
  )
}

/** CUS-11: everyone on the policy with their roles; a person this viewer may open is a link (CUS-5). */
function People({ people }: { people: ProductPolicy['people'] }) {
  if (people.length === 0) return <span className="text-ink-meta">-</span>
  return (
    <ul className="space-y-0.5">
      {people.map((person, index) => (
        <li key={person.clientId ?? `${person.name}-${index}`} className="truncate">
          {person.clientId ? (
            <Link to={`/clients/${person.clientId}`} title={person.name} className="text-primary hover:underline">
              {person.name || '-'}
            </Link>
          ) : (
            <span title={person.name}>{person.name || '-'}</span>
          )}
          <span className="ml-1 text-ink-meta">{rolesLabel(person.roles)}</span>
        </li>
      ))}
    </ul>
  )
}

/** TENANT-5: the policies in the viewer's scope that carry this product, with its lines on each. */
function ProductPolicies({ policies }: { policies: ProductPolicy[] }) {
  return (
    <section className="mt-6">
      <h2 className="mb-2 text-subhead text-ink">{t('products.policies', { count: policies.length })}</h2>
      {policies.length === 0 ? (
        <EmptyState>{t('products.noPolicies')}</EmptyState>
      ) : (
        <>
          <div className="overflow-x-auto">
            <table className="data-table min-w-[860px] table-fixed">
              <colgroup>
                <col className="w-[130px]" />
                <col className="w-[150px]" />
                <col />
                <col className="w-[200px]" />
                <col className="w-[160px]" />
              </colgroup>
              <thead>
                <tr>
                  <th>{t('products.policyNo')}</th>
                  <th>{t('products.policyStatus')}</th>
                  <th>{t('products.people')}</th>
                  <th>{t('products.insured')}</th>
                  <th className="text-right">{t('products.sumAssured')}</th>
                </tr>
              </thead>
              <tbody>
                {policies.map((policy) => (
                  <tr key={policy.policyNo} className="align-top">
                    <td className="tabular-nums">{policy.policyNo}</td>
                    <td>{policy.status ? <Badge tone={policy.active ? 'success' : 'warning'}>{policy.status}</Badge> : <Badge tone="muted">{t('products.noStatus')}</Badge>}</td>
                    <td>
                      <People people={policy.people} />
                    </td>
                    {/* One line per insured person carrying this product */}
                    <td>
                      {policy.lines.map((line, index) => (
                        <span key={index} className="block truncate" title={line.insuredName ?? undefined}>
                          {line.insuredName ?? '-'}
                        </span>
                      ))}
                    </td>
                    <td className="text-right tabular-nums">
                      {policy.lines.map((line, index) => (
                        <span key={index} className="block">
                          {formatVnd(line.sumAssuredVnd)}
                        </span>
                      ))}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          {policies.length >= MAX_POLICIES && <p className="mt-2 text-caption text-ink-meta">{t('products.policiesCapped')}</p>}
        </>
      )}
    </section>
  )
}

/** TENANT-5: one product of the shared catalogue, and where it is in the viewer's book. */
export function ProductDetailPage() {
  const { code = '' } = useParams()
  const { data: me } = useMe()
  const detail = useQuery(queries.product(code))

  if (detail.isPending) return <Spinner />
  if (detail.error instanceof ApiError && (detail.error.status === 404 || detail.error.status === 400)) return <NotFoundPage />
  if (detail.isError) return <Alert className="m-4">{errorMessage(detail.error)}</Alert>
  const { product, policies } = detail.data

  return (
    <Container className="min-h-0 flex-1 overflow-y-auto pb-8">
      <Link to="/products" className="mt-2 inline-flex items-center gap-1 text-caption text-primary hover:underline">
        <ArrowLeft size={14} aria-hidden />
        {t('products.back')}
      </Link>
      <header className="mt-2 mb-4 flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <h1 className="text-page-title break-words text-ink">{product.productName}</h1>
          <p className="mt-1 flex flex-wrap items-center gap-2 text-caption text-ink-meta">
            <span>{[product.productCode, product.productRole, product.category].filter(Boolean).join(' · ')}</span>
            {!product.active && <Badge tone="muted">{t('products.hidden')}</Badge>}
          </p>
        </div>
        {me && canUseLeads(me) && (
          <Link to={`/leads?product=${encodeURIComponent(product.productCode)}`} className={buttonClass('secondary')}>
            <ContactRound aria-hidden size={16} />
            {t('products.leads')}
          </Link>
        )}
      </header>
      {!product.active && (
        <div className="mb-4">
          <Notice>{t('products.hiddenNote')}</Notice>
        </div>
      )}
      <div className="max-w-3xl">
        <ProductInfo product={product} />
      </div>
      {/* CUS-5: Admin has no client book, so the API sends no policies */}
      {policies && <ProductPolicies policies={policies} />}
    </Container>
  )
}
