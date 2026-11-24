import { useQuery } from '@tanstack/react-query'
import { useState } from 'react'
import type { Ref } from 'react'
import { t } from '../i18n'
import { matchProducts } from '../lib/products'
import { queries } from '../lib/queries'
import { PickField } from './ui'
import type { PickOption } from './ui'

/**
 * TENANT-5: picks one shown product of the shared catalogue, searchable by name or code. `kept` is a
 * product the record already carries that the catalogue no longer shows, offered with its stored name
 * so an edit does not drop it. `emptyLabel` adds a first option for "none" (a filter's "all").
 */
export function ProductPicker({
  id,
  label,
  value,
  onChange,
  onBlur,
  invalid,
  kept,
  emptyLabel,
  placeholder = t('placeholder.product'),
  ref,
}: {
  id?: string
  label: string
  value: string
  onChange: (code: string) => void
  onBlur?: () => void
  invalid?: boolean
  kept?: { code: string; name: string } | null
  emptyLabel?: string
  placeholder?: string
  ref?: Ref<HTMLButtonElement>
}) {
  const products = useQuery(queries.products())
  const [search, setSearch] = useState('')
  const shown = products.data?.items ?? []
  const options: PickOption[] = matchProducts(shown, search).map((product) => ({
    value: product.productCode,
    label: product.productName,
    meta: product.productRole,
  }))
  const keptOption = kept && !shown.some((product) => product.productCode === kept.code) ? kept : null
  if (keptOption && !search) options.unshift({ value: keptOption.code, label: keptOption.name, meta: t('products.keptShort') })
  if (emptyLabel !== undefined && !search) options.unshift({ value: '', label: emptyLabel })
  const current = shown.find((product) => product.productCode === value)?.productName ?? (keptOption?.code === value ? keptOption.name : value)
  return (
    <PickField
      ref={ref}
      id={id}
      label={label}
      value={value}
      valueLabel={value ? current : undefined}
      placeholder={placeholder}
      options={options}
      search={search}
      onSearchChange={setSearch}
      searchPlaceholder={t('products.searchPlaceholder')}
      loading={products.isPending}
      empty={products.isError ? t('products.loadFailed') : t('products.noMatch')}
      onChange={(code) => {
        setSearch('')
        onChange(code)
      }}
      onBlur={onBlur}
      invalid={invalid}
    />
  )
}
