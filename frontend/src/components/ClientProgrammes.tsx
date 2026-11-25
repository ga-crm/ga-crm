import { Link } from 'react-router-dom'
import { formatVnd, t } from '../i18n'
import { programmeRows } from '../lib/clientCare'
import { groupLabel } from '../lib/clientLabels'
import { showDate } from '../lib/leadLabels'
import type { ClientDetail } from '../lib/types'
import { Badge } from './ui'

/**
 * Decided 26/11/2026: "Chi tiết chương trình" on the client page: every programme (product line) on
 * the client's policies in one table. The policy number opens the policy in the "Hợp đồng" tab; a
 * product of the shared catalogue opens its page (TENANT-5).
 */
export function ClientProgrammes({ detail, onOpenPolicy }: { detail: ClientDetail; onOpenPolicy: (policyNo: string) => void }) {
  const rows = programmeRows(detail.policies)
  return (
    <section className="rounded-lg bg-chrome p-5">
      <h2 className="text-subhead text-ink">{t('clients.programmes')}</h2>
      <p className="mt-1 mb-3 text-caption text-ink-meta">{t('clients.programmesHelp')}</p>
      {rows.length === 0 ? (
        <p className="text-caption text-ink-meta">{t('clients.programmesEmpty')}</p>
      ) : (
        <div className="overflow-x-auto">
          {/* The name column takes what is left: at least 230 px of the table's minimum width */}
          <table className="data-table min-w-[1100px] table-fixed">
            <colgroup>
              <col />
              <col className="w-[108px]" />
              <col className="w-[150px]" />
              <col className="w-[116px]" />
              <col className="w-[136px]" />
              <col className="w-[124px]" />
              <col className="w-[104px]" />
              <col className="w-[132px]" />
            </colgroup>
            <thead>
              <tr>
                <th>{t('clients.programme')}</th>
                <th>{t('clients.programmePolicy')}</th>
                <th>{t('clients.productInsured')}</th>
                <th>{t('clients.productGroup')}</th>
                <th className="text-right">{t('clients.sumAssured')}</th>
                <th className="text-right">{t('clients.annualPremium')}</th>
                <th>{t('clients.programmeStart')}</th>
                <th>{t('clients.productStatus')}</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((row) => (
                <tr key={row.key}>
                  <td className="truncate" title={row.name ?? undefined}>
                    {row.productCode === null ? (
                      // COV-4: the policy is known, its products are not yet
                      <span className="text-ink-meta">{t('clients.programmeNoDetail')}</span>
                    ) : row.inCatalogue ? (
                      <Link to={`/products/${encodeURIComponent(row.productCode)}`} className="text-primary hover:underline">
                        {row.name}
                      </Link>
                    ) : (
                      row.name
                    )}
                    {row.role && <span className="ml-1 text-ink-meta">{row.role}</span>}
                  </td>
                  <td>
                    <button type="button" className="cursor-pointer text-primary tabular-nums hover:underline" onClick={() => onOpenPolicy(row.policyNo)}>
                      {row.policyNo}
                    </button>
                  </td>
                  <td className="truncate" title={row.insuredName ?? undefined}>
                    {row.insuredName ?? '-'}
                  </td>
                  <td className="truncate">{row.group ? groupLabel(row.group) : '-'}</td>
                  <td className="text-right whitespace-nowrap tabular-nums">{row.sumAssuredVnd === null ? '-' : formatVnd(row.sumAssuredVnd)}</td>
                  <td className="text-right whitespace-nowrap tabular-nums">{row.annualPremiumVnd === null ? '-' : formatVnd(row.annualPremiumVnd)}</td>
                  <td className="tabular-nums">{showDate(row.startDate) ?? '-'}</td>
                  <td>{row.status ? <Badge tone={row.policyActive ? 'success' : 'warning'}>{row.status}</Badge> : <span className="text-ink-meta">-</span>}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </section>
  )
}
