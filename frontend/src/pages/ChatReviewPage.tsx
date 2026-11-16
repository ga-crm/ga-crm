import { useQuery } from '@tanstack/react-query'
import { useState } from 'react'
import { MessageList } from '../components/chat/MessageList'
import { Alert, Button, Card, Dialog, EmptyState, FilterBand, Notice, PageHeader, Pagination, SearchInput, Spinner, TableScroll } from '../components/ui'
import { formatDateTime, t } from '../i18n'
import { errorMessage } from '../lib/api'
import { queries } from '../lib/queries'
import type { ChatReviewItem } from '../lib/types'
import { useListSearch } from '../lib/useListSearch'
import { useUrlState } from '../lib/useUrlState'

/** K3: reading a conversation is audited on the server; the dialog says so before showing it. */
function ReviewDialog({ item, onClose }: { item: ChatReviewItem | null; onClose: () => void }) {
  const read = useQuery({ ...queries.chatReviewMessages(item?.id ?? ''), enabled: !!item })
  return (
    <Dialog title={item ? (item.title ?? item.memberNames.join(', ')) : ''} open={!!item} onClose={onClose} wide>
      <Notice>{t('chatReview.audited')}</Notice>
      <div className="mt-3 h-[min(60dvh,32rem)] overflow-y-auto rounded-md border border-band p-3">
        {read.isPending && <Spinner />}
        {read.isError && <Alert>{errorMessage(read.error)}</Alert>}
        {read.data && (
          <>
            {read.data.hasMore && <p className="mb-2 text-center text-caption text-ink-meta">{t('chatReview.latestOnly')}</p>}
            <MessageList messages={read.data.items} members={read.data.conversation.members} meId={null} group />
          </>
        )}
      </div>
      <div className="mt-4 flex justify-end">
        <Button variant="secondary" onClick={onClose}>
          {t('common.close')}
        </Button>
      </div>
    </Dialog>
  )
}

/** K3 (decided 14/11/2026): the GA head can list every conversation of the GA and read one, audited. */
export function ChatReviewPage() {
  const url = useUrlState()
  const search = useListSearch(url)
  const params = { page: url.page, pageSize: url.pageSize, q: search.committed }
  const list = useQuery(queries.chatReview(params))
  const [viewing, setViewing] = useState<ChatReviewItem | null>(null)

  return (
    <>
      <PageHeader title={t('chatReview.title')} subtitle={t('chatReview.subtitle')} />
      <FilterBand>
        <SearchInput value={search.input} onValueChange={search.onChange} label={t('chatReview.search')} placeholder={t('chatReview.search')} className="sm:max-w-md" />
      </FilterBand>
      <Card>
        {list.isPending && <Spinner />}
        {list.isError && <Alert>{errorMessage(list.error)}</Alert>}
        {list.data && list.data.items.length === 0 && <EmptyState>{search.committed ? t('chatReview.noMatch') : t('chatReview.empty')}</EmptyState>}
        {list.data && list.data.items.length > 0 && (
          <>
            <TableScroll loading={list.isPlaceholderData}>
              <table className="data-table min-w-[640px] table-fixed">
                <colgroup>
                  <col />
                  <col className="w-28" />
                  <col className="w-40" />
                  <col className="w-24" />
                </colgroup>
                <thead>
                  <tr>
                    <th scope="col">{t('chatReview.conversation')}</th>
                    <th scope="col">{t('chatReview.messages')}</th>
                    <th scope="col">{t('chatReview.last')}</th>
                    <th scope="col" className="col-actions">
                      <span className="sr-only">{t('common.actions')}</span>
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {list.data.items.map((item) => (
                    <tr key={item.id}>
                      <td>
                        <p className="truncate font-medium text-ink" title={item.title ?? undefined}>
                          {item.kind === 'GROUP' ? item.title : t('chatReview.direct')}
                        </p>
                        <p className="truncate text-ink-meta" title={item.memberNames.join(', ')}>
                          {item.memberNames.join(', ')}
                        </p>
                      </td>
                      <td className="tabular-nums">{item.messages}</td>
                      <td className="whitespace-nowrap text-ink-meta">{formatDateTime(item.lastMessageAt)}</td>
                      <td className="col-actions">
                        <Button variant="ghost" onClick={() => setViewing(item)}>
                          {t('chatReview.read')}
                        </Button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </TableScroll>
            <Pagination page={list.data.page} pageSize={list.data.pageSize} total={list.data.total} onPage={(page) => url.set({ page }, { push: true })} onPageSize={(pageSize) => url.set({ pageSize, page: null })} />
          </>
        )}
      </Card>
      <ReviewDialog item={viewing} onClose={() => setViewing(null)} />
    </>
  )
}
