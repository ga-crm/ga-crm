import { useQuery } from '@tanstack/react-query'
import { useState } from 'react'
import { Link } from 'react-router-dom'
import { Alert, Button, Card, Container, EmptyState, PageHeader, Pagination, Spinner, TabBar } from '../components/ui'
import { t } from '../i18n'
import type { MessageKey } from '../i18n'
import { errorMessage } from '../lib/api'
import { notificationAge, notificationText } from '../lib/notificationLabels'
import { queries } from '../lib/queries'
import { useNotificationActions } from '../lib/useNotificationOpen'
import { usePrefetchNextPage } from '../lib/usePrefetchNextPage'
import { useUrlState } from '../lib/useUrlState'

const VIEWS = ['all', 'unread'] as const

/** Section 17.12 + NTF-1: every notification of the person, newest first. */
export function NotificationsPage() {
  const url = useUrlState()
  const view = url.oneOf('view', VIEWS) || 'all'
  const params = { page: url.page, pageSize: url.pageSize, ...(view === 'unread' && { unreadOnly: 'true' }) }
  const list = useQuery(queries.notifications(params))
  usePrefetchNextPage(queries.notifications, params, list.data)
  const actions = useNotificationActions()
  const [now] = useState(() => Date.now())

  return (
    <>
      <PageHeader
        title={t('notification.title')}
        action={
          <Button variant="secondary" disabled={!list.data || list.data.unread === 0 || actions.pending} onClick={actions.readAll}>
            {t('notification.readAll')}
          </Button>
        }
      />
      <Container className="flex-none">
        <div className="flex items-start gap-2">
          <TabBar
            label={t('notification.title')}
            value={view}
            onValueChange={(key) => url.set({ view: key === 'all' ? null : key, page: null })}
            items={VIEWS.map((key) => ({
              value: key,
              label: `${t(`notification.view.${key}` as MessageKey)}${key === 'unread' && list.data ? ` (${list.data.unread})` : ''}`,
            }))}
          />
          <Link to="/settings/notifications" className="ml-auto flex-none pt-1.5 text-caption text-primary hover:underline">
            {t('notification.settingsLink')}
          </Link>
        </div>
      </Container>
      <Card>
        <div className="min-h-0 flex-1 overflow-y-auto px-4">
          {list.isPending && <Spinner />}
          {list.isError && <Alert className="m-4">{errorMessage(list.error)}</Alert>}
          {list.data && list.data.items.length === 0 && <EmptyState>{view === 'unread' ? t('notification.emptyUnread') : t('notification.emptyAll')}</EmptyState>}
          <ul className="divide-y divide-band">
            {list.data?.items.map((item) => (
              <li key={item.id}>
                <button type="button" onClick={() => actions.open(item)} className="relative flex w-full cursor-pointer items-start gap-3 py-3 text-left hover:bg-chrome">
                  <span aria-hidden className={`mt-1.5 size-2 flex-none rounded-sm ${item.read ? 'bg-transparent' : 'bg-primary'}`} />
                  <span className="min-w-0 flex-1">
                    <span className={`block text-list ${item.read ? 'text-ink-meta' : 'font-medium text-ink'}`}>{notificationText(item)}</span>
                    <span className="block text-caption text-ink-meta">{notificationAge(item.createdAt, now)}</span>
                  </span>
                  {!item.read && <span className="sr-only">{t('notification.unreadLabel')}</span>}
                </button>
              </li>
            ))}
          </ul>
        </div>
        {list.data && list.data.total > 0 && <Pagination page={list.data.page} pageSize={list.data.pageSize} total={list.data.total} onPage={url.setPage} onPageSize={url.setPageSize} />}
      </Card>
    </>
  )
}
