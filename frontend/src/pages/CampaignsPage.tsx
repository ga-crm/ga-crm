import { useQuery } from '@tanstack/react-query'
import { Plus } from 'lucide-react'
import { Link, useNavigate } from 'react-router-dom'
import { CampaignForm } from '../components/CampaignForm'
import { Alert, Badge, Button, Card, ClearFilters, Dialog, EmptyState, FilterBand, FilterField, PageHeader, Pagination, SearchInput, Select, Spinner, TableScroll } from '../components/ui'
import { formatVnd, t, tDynamic } from '../i18n'
import { errorMessage } from '../lib/api'
import { campaignStatusTone } from '../lib/campaignLabels'
import { showDate } from '../lib/leadLabels'
import { queries } from '../lib/queries'
import { CAMPAIGN_STATUSES, CAMPAIGN_TYPES } from '../lib/types'
import type { CampaignRow } from '../lib/types'
import { useListSearch } from '../lib/useListSearch'
import { usePrefetchNextPage } from '../lib/usePrefetchNextPage'
import { useLeaveEmptyPage, useUrlState } from '../lib/useUrlState'

/** Start and end, or the seminar's day, as far as they are known. */
function datesOf(campaign: CampaignRow): string {
  if (campaign.startDate || campaign.endDate) return `${showDate(campaign.startDate) ?? '…'} – ${showDate(campaign.endDate) ?? '…'}`
  return campaign.eventAt ? (showDate(campaign.eventAt.slice(0, 10)) ?? '-') : '-'
}

/** Section 16.9: campaigns, with leads, won leads and cost per lead (CMP-3). */
export function CampaignsPage() {
  const navigate = useNavigate()
  const url = useUrlState()
  const search = useListSearch(url)
  const type = url.oneOf('type', CAMPAIGN_TYPES)
  const status = url.oneOf('status', CAMPAIGN_STATUSES)
  const creating = url.get('create') === '1'
  const params = { page: url.page, pageSize: url.pageSize, q: search.committed, type: type || undefined, status: status || undefined }
  const campaigns = useQuery(queries.campaigns(params))
  usePrefetchNextPage(queries.campaigns, params, campaigns.data)
  useLeaveEmptyPage(url, campaigns.data?.items.length)
  const items = campaigns.data?.items ?? []
  const canManage = !!campaigns.data?.canManage
  const filtered = !!(search.input || type || status)

  return (
    <>
      <PageHeader
        title={t('campaigns.title')}
        action={
          // CMP-5: campaigns.manage; the API checks it again
          canManage && (
            <Button onClick={() => url.set({ create: 1 }, { push: true })}>
              <Plus size={16} aria-hidden />
              {t('campaigns.add')}
            </Button>
          )
        }
      />
      <FilterBand className="flex flex-col gap-2 sm:flex-row sm:flex-wrap sm:items-center">
        <FilterField label={t('common.search')} className="sm:w-64 sm:flex-none">
          <SearchInput label={t('common.search')} placeholder={t('campaigns.searchPlaceholder')} value={search.input} onValueChange={search.onChange} />
        </FilterField>
        <FilterField label={t('campaigns.type')} className="sm:w-48 sm:flex-none">
          <Select value={type} onChange={(event) => url.set({ type: event.target.value, page: null })}>
            <option value="">{t('campaigns.allTypes')}</option>
            {CAMPAIGN_TYPES.map((value) => (
              <option key={value} value={value}>
                {tDynamic(`campaignType.${value}`, value)}
              </option>
            ))}
          </Select>
        </FilterField>
        <FilterField label={t('campaigns.status')} className="sm:w-44 sm:flex-none">
          <Select value={status} onChange={(event) => url.set({ status: event.target.value, page: null })}>
            <option value="">{t('campaigns.allStatuses')}</option>
            {CAMPAIGN_STATUSES.map((value) => (
              <option key={value} value={value}>
                {tDynamic(`campaignStatus.${value}`, value)}
              </option>
            ))}
          </Select>
        </FilterField>
        <ClearFilters active={filtered} onClear={() => url.set({ q: null, type: null, status: null, page: null })} />
      </FilterBand>

      <Card>
        {campaigns.isPending && <Spinner />}
        {campaigns.isError && <Alert className="m-4">{errorMessage(campaigns.error)}</Alert>}
        {campaigns.data && items.length === 0 && <EmptyState>{filtered ? t('campaigns.noMatch') : t('campaigns.empty')}</EmptyState>}
        {campaigns.data && items.length > 0 && (
          <>
            <TableScroll loading={campaigns.isPlaceholderData}>
              <table className="data-table min-w-[960px] table-fixed">
                <colgroup>
                  <col />
                  <col className="w-[150px]" />
                  <col className="w-[190px]" />
                  <col className="w-[130px]" />
                  <col className="w-[80px]" />
                  <col className="w-[80px]" />
                  <col className="w-[130px]" />
                </colgroup>
                <thead>
                  <tr>
                    <th>{t('campaigns.name')}</th>
                    <th>{t('campaigns.type')}</th>
                    <th>{t('campaigns.dates')}</th>
                    <th className="text-right">{t('campaigns.budget')}</th>
                    <th className="text-right">{t('campaigns.leads')}</th>
                    <th className="text-right">{t('campaigns.won')}</th>
                    <th className="text-right">{t('campaigns.costPerLead')}</th>
                  </tr>
                </thead>
                <tbody>
                  {items.map((campaign) => (
                    <tr key={campaign.id}>
                      <td>
                        <Link to={`/campaigns/${campaign.id}`} title={campaign.name} className="block truncate font-medium text-primary hover:underline">
                          {campaign.name}
                        </Link>
                        <span className="mt-1 flex flex-wrap items-center gap-1">
                          <Badge tone={campaignStatusTone(campaign.status)}>{tDynamic(`campaignStatus.${campaign.status}`, campaign.status)}</Badge>
                          {campaign.channel && <span className="truncate text-ink-meta">{campaign.channel}</span>}
                        </span>
                      </td>
                      <td className="truncate">{tDynamic(`campaignType.${campaign.type}`, campaign.type)}</td>
                      <td className="whitespace-nowrap text-ink-meta">{datesOf(campaign)}</td>
                      <td className="text-right tabular-nums">{formatVnd(campaign.budgetVnd)}</td>
                      <td className="text-right tabular-nums">{campaign.leads}</td>
                      <td className="text-right tabular-nums">{campaign.won}</td>
                      <td className="text-right tabular-nums">{formatVnd(campaign.costPerLeadVnd)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </TableScroll>
            <Pagination page={campaigns.data.page} pageSize={campaigns.data.pageSize} total={campaigns.data.total} onPage={url.setPage} onPageSize={url.setPageSize} />
          </>
        )}
      </Card>
      <Dialog wide title={t('campaigns.addTitle')} open={creating && canManage} onClose={() => url.set({ create: null })}>
        {creating && canManage && <CampaignForm onClose={() => url.set({ create: null })} onSaved={(id) => navigate(`/campaigns/${id}`)} />}
      </Dialog>
    </>
  )
}
