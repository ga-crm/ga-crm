import { useQuery } from '@tanstack/react-query'
import { Alert, Badge, Card, ClearFilters, EmptyState, FilterBand, FilterField, PageHeader, Pagination, SearchInput, Select, SortButton, Spinner, TableScroll } from '../components/ui'
import { formatDateTime, t, tDynamic } from '../i18n'
import type { BadgeTone } from '../components/ui'
import { errorMessage } from '../lib/api'
import { queries } from '../lib/queries'
import { TENANT_ROLES } from '../lib/types'
import { useListSearch } from '../lib/useListSearch'
import { usePrefetchNextPage } from '../lib/usePrefetchNextPage'
import { useLeaveEmptyPage, useUrlState } from '../lib/useUrlState'

const OTHER_ACTORS = { platform: 'audit.actorPlatform', deleted: 'audit.actorDeleted', system: 'audit.actorSystem' } as const

/** UI-3: a person is shown by name, with their email as the quieter second line. */
function Person({ name, email }: { name: string; email: string }) {
  return (
    <>
      <span title={name} className="block truncate text-ink">{name}</span>
      <span title={email} className="block truncate text-ink-meta">{email}</span>
    </>
  )
}

/** The label says what happened; the colour only helps scanning: routine, risky or privileged. */
const ACTION_TONES: Record<string, BadgeTone> = {
  LOGIN: 'success',
  LOGOUT: 'muted',
  LOGIN_FAILED: 'warning',
  CREATE: 'success',
  UPDATE: 'info',
  DELETE: 'danger',
  ARCHIVE: 'warning',
  CROSS_TENANT_READ: 'notable',
  CHAT_READ: 'notable',
  PERMISSION_CHANGE: 'notable',
  SETTINGS_CHANGE: 'notable',
  IMPORT: 'info',
  ASSIGN: 'info',
}

const ACTIONS = ['LOGIN', 'LOGOUT', 'LOGIN_FAILED', 'CREATE', 'UPDATE', 'DELETE', 'ARCHIVE', 'CROSS_TENANT_READ', 'PERMISSION_CHANGE', 'SETTINGS_CHANGE', 'IMPORT', 'ASSIGN', 'LINK', 'UNLINK', 'EXPORT', 'CHAT_READ']

/** AUD-5 */
export function AuditPage() {
  const url = useUrlState()
  const { page } = url
  const action = url.oneOf('action', ACTIONS)
  const search = useListSearch(url, 'email')
  const ipSearch = useListSearch(url, 'ip')
  const role = url.oneOf('role', TENANT_ROLES)
  // Newest first is the default, so it stays out of the URL
  const ascending = url.oneOf('order', ['asc']) === 'asc'
  const params = { page, pageSize: url.pageSize, action, role, email: search.committed, ip: ipSearch.committed, order: ascending ? 'asc' : 'desc' }
  const events = useQuery(queries.audit(params))
  usePrefetchNextPage(queries.audit, params, events.data)
  useLeaveEmptyPage(url, events.data?.items.length)

  return (
    <>
      <PageHeader title={t('audit.title')} />
      <FilterBand className="flex flex-col gap-3 sm:flex-row sm:flex-wrap sm:items-end lg:flex-nowrap">
        <FilterField label={t('audit.email')} className="lg:min-w-48 lg:flex-1">
          <SearchInput label={t('audit.email')} placeholder={t('audit.emailPlaceholder')} value={search.input} onValueChange={search.onChange} />
        </FilterField>
        <FilterField label={t('audit.ip')} className="sm:w-44 sm:flex-none">
          <SearchInput label={t('audit.ip')} placeholder={t('audit.ipPlaceholder')} value={ipSearch.input} onValueChange={ipSearch.onChange} />
        </FilterField>
        <FilterField label={t('audit.role')} className="sm:w-44 sm:flex-none">
          <Select value={role} onChange={(event) => url.set({ role: event.target.value, page: null })}>
            <option value="">{t('audit.allRoles')}</option>
            {TENANT_ROLES.map((value) => (
              <option key={value} value={value}>
                {tDynamic(`role.${value}`, value)}
              </option>
            ))}
          </Select>
        </FilterField>
        <FilterField label={t('audit.action')} className="sm:w-52 sm:flex-none">
          <Select value={action} onChange={(event) => url.set({ action: event.target.value, page: null })}>
            <option value="">{t('audit.allActions')}</option>
            {ACTIONS.map((value) => (
              <option key={value} value={value}>
                {tDynamic(`auditAction.${value}`, value)}
              </option>
            ))}
          </Select>
        </FilterField>
        <ClearFilters active={!!(search.input || ipSearch.input || role || action)} onClear={() => url.set({ email: null, ip: null, role: null, action: null, page: null })} />
      </FilterBand>
      <Card>
        {events.isPending && <Spinner />}
        {events.isError && <Alert className="m-4">{errorMessage(events.error)}</Alert>}
        {events.data && events.data.items.length === 0 && <EmptyState>{t('audit.empty')}</EmptyState>}
        {events.data && events.data.items.length > 0 && (
          <>
            <TableScroll loading={events.isPlaceholderData}>
              <table className="data-table min-w-[1000px] table-fixed">
                <colgroup>
                  <col className="w-[152px]" />
                  <col />
                  <col className="w-[240px]" />
                  <col className="w-[220px]" />
                  <col className="w-[160px]" />
                </colgroup>
                <thead>
                  <tr>
                    <th aria-sort={ascending ? 'ascending' : 'descending'}>
                      <SortButton label={t('audit.at')} direction={ascending ? 'asc' : 'desc'} onToggle={() => url.set({ order: ascending ? null : 'asc', page: null })} />
                    </th>
                    <th>{t('audit.actor')}</th>
                    <th>{t('audit.action')}</th>
                    <th>{t('audit.entity')}</th>
                    <th>{t('audit.ip')}</th>
                  </tr>
                </thead>
                <tbody>
                  {events.data.items.map((event) => (
                    <tr key={event.id} className="h-[59px]">
                      <td className="whitespace-nowrap text-ink-meta">{formatDateTime(event.at)}</td>
                      <td>{event.actor.kind === 'user' ? <Person name={event.actor.name} email={event.actor.email} /> : t(OTHER_ACTORS[event.actor.kind])}</td>
                      <td>
                        <Badge tone={ACTION_TONES[event.action] ?? 'muted'}>{tDynamic(`auditAction.${event.action}`, event.action)}</Badge>
                      </td>
                      <td>
                        <span className="block truncate text-ink-meta">{tDynamic(`auditEntity.${event.entity}`, event.entity)}</span>
                        {event.target?.kind === 'user' && <span title={event.target.name} className="block truncate text-ink">{event.target.name}</span>}
                        {event.target?.kind === 'deleted' && <span className="block truncate text-ink-meta">{t('audit.targetDeleted')}</span>}
                      </td>
                      <td title={event.ip ?? undefined} className="truncate text-ink-meta">{event.ip ?? '-'}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </TableScroll>
            <Pagination page={events.data.page} pageSize={events.data.pageSize} total={events.data.total} onPage={url.setPage} onPageSize={url.setPageSize} />
          </>
        )}
      </Card>
    </>
  )
}
