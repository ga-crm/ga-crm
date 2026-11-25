import { useQuery } from '@tanstack/react-query'
import { ChevronRight } from 'lucide-react'
import { Link } from 'react-router-dom'
import { Alert, Card, ClearFilters, EmptyState, FilterBand, FilterField, PageHeader, Pagination, SearchInput, Spinner } from '../components/ui'
import { t } from '../i18n'
import { errorMessage } from '../lib/api'
import { filterProducts, productMeta } from '../lib/products'
import { queries } from '../lib/queries'
import { useListSearch } from '../lib/useListSearch'
import { useLeaveEmptyPage, useUrlState } from '../lib/useUrlState'

/** TENANT-5: the shared product catalogue as a GA reads it, shown products only, by name. */
export function ProductsPage() {
  const url = useUrlState()
  const search = useListSearch(url)
  const products = useQuery(queries.products())
  const all = products.data?.items ?? []
  // The list is small enough to filter here, so it follows every keystroke
  const found = filterProducts(all, search.input)
  const rows = found.slice((url.page - 1) * url.pageSize, url.page * url.pageSize)
  useLeaveEmptyPage(url, products.data ? rows.length : undefined)

  return (
    <>
      <PageHeader title={t('products.title')} subtitle={t('products.subtitle')} />
      <FilterBand className="flex flex-col gap-2 sm:flex-row sm:items-center">
        <FilterField label={t('common.search')} className="sm:w-96 sm:flex-none">
          <SearchInput label={t('common.search')} placeholder={t('products.searchPlaceholder')} value={search.input} onValueChange={search.onChange} />
        </FilterField>
        <ClearFilters active={!!search.input} onClear={() => search.onChange('')} />
      </FilterBand>
      <Card>
        {products.isPending && <Spinner />}
        {products.isError && <Alert className="m-4">{errorMessage(products.error)}</Alert>}
        {products.data && found.length === 0 && <EmptyState>{all.length === 0 ? t('products.empty') : t('products.noMatchList')}</EmptyState>}
        {products.data && found.length > 0 && (
          <>
            <div className="min-h-0 md:flex-1 md:overflow-y-auto">
              <ul className="divide-y divide-band">
                {rows.map((product) => (
                  <li key={product.productCode}>
                    <Link to={`/products/${encodeURIComponent(product.productCode)}`} className="group flex items-center gap-3 py-3 hover:bg-chrome md:px-2">
                      <span className="min-w-0 flex-1">
                        <span className="block text-link font-medium text-primary group-hover:underline">{product.productName}</span>
                        <span className="mt-0.5 block text-caption text-ink-meta">{productMeta(product)}</span>
                      </span>
                      <ChevronRight aria-hidden size={16} className="flex-none text-ink-meta" />
                    </Link>
                  </li>
                ))}
              </ul>
            </div>
            <Pagination page={url.page} pageSize={url.pageSize} total={found.length} onPage={url.setPage} onPageSize={url.setPageSize} />
          </>
        )}
      </Card>
    </>
  )
}
