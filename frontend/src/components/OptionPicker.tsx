import { useState } from 'react'
import type { Ref } from 'react'
import { t } from '../i18n'
import { normalizeName } from '../lib/agentTree'
import { useLeadOptions } from '../lib/leadOptions'
import type { LeadOptionKind } from '../lib/types'
import { PickField } from './ui'
import type { PickOption } from './ui'

/**
 * OPT-13: one of the GA's shown values (a lead source, region or lost reason), or one typed in the
 * search. A typed source joins the catalogue when saved; a region or reason is only suggested, so a
 * typed one is simply kept (`joins` false). Built on the app's own picker rather than a browser `datalist`,
 * whose arrow and pop-up follow the operating system instead of the theme (26/11/2026).
 */
export function OptionPicker({
  kind,
  id,
  label,
  value,
  onChange,
  onBlur,
  invalid,
  placeholder,
  maxLength,
  joins = false,
  emptyLabel,
  ref,
}: {
  kind: LeadOptionKind
  id?: string
  label: string
  value: string
  onChange: (value: string) => void
  onBlur?: () => void
  invalid?: boolean
  placeholder: string
  maxLength: number
  /** Whether a typed value joins the GA's list ("Thêm mới") or is only used here ("Dùng"). */
  joins?: boolean
  /** A first option that clears an optional field. */
  emptyLabel?: string
  ref?: Ref<HTMLButtonElement>
}) {
  const catalogue = useLeadOptions()
  const [search, setSearch] = useState('')
  const typed = search.trim().slice(0, maxLength)
  const wanted = normalizeName(typed)
  const shown = catalogue.active(kind)
  const options: PickOption[] = shown.filter((option) => !wanted || normalizeName(option.label).includes(wanted)).map((option) => ({ value: option.label, label: option.label }))
  // A value the GA does not list yet is offered first, as it was typed
  if (typed && !shown.some((option) => normalizeName(option.label) === wanted)) options.unshift({ value: typed, label: t(joins ? 'options.addTyped' : 'options.useTyped', { label: typed }) })
  if (emptyLabel !== undefined && !search && value) options.unshift({ value: '', label: emptyLabel })
  return (
    <PickField
      ref={ref}
      id={id}
      label={label}
      value={value}
      valueLabel={value || undefined}
      placeholder={placeholder}
      options={options}
      search={search}
      onSearchChange={setSearch}
      searchPlaceholder={t('options.searchOrType')}
      empty={t('options.typeToAdd')}
      onChange={(next) => {
        setSearch('')
        onChange(next)
      }}
      onBlur={onBlur}
      invalid={invalid}
    />
  )
}
