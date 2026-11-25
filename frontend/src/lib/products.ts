import { t } from '../i18n'
import { normalizeName } from './agentTree'
import type { ProductView } from './types'

/** TENANT-5: products whose name or code holds the search, without case or Vietnamese marks; order kept. */
export function filterProducts<T extends Pick<ProductView, 'productCode' | 'productName'>>(products: readonly T[], search: string): T[] {
  const wanted = normalizeName(search)
  if (!wanted) return [...products]
  return products.filter((product) => normalizeName(product.productName).includes(wanted) || normalizeName(product.productCode).includes(wanted))
}

/** For a picker: the matches, main products first (PRD-6), each group in the API's order by name. */
export function matchProducts(products: readonly ProductView[], search: string): ProductView[] {
  // Array.prototype.sort is stable, so the order by name holds within each role
  return filterProducts(products, search).sort((a, b) => Number(a.productRole !== 'Chính') - Number(b.productRole !== 'Chính'))
}

/** "18 - 65 tuổi", "Từ 18 tuổi", "Đến 65 tuổi", or null when the catalogue says nothing. */
export function entryAgeLabel(product: Pick<ProductView, 'minEntryAge' | 'maxEntryAge'>): string | null {
  const { minEntryAge: min, maxEntryAge: max } = product
  if (min !== null && max !== null) return t('products.ageRange', { min, max })
  if (min !== null) return t('products.ageFrom', { min })
  if (max !== null) return t('products.ageTo', { max })
  return null
}

/** The secondary line under a product name: its role and benefit group. */
export const productMeta = (product: Pick<ProductView, 'productRole' | 'category'>) => [product.productRole, product.category ?? t('products.noCategory')].join(' · ')
