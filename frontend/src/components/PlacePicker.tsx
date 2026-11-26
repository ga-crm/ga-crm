import { useQuery } from '@tanstack/react-query'
import { useState } from 'react'
import type { Ref } from 'react'
import { t } from '../i18n'
import { normalizeName } from '../lib/agentTree'
import { queries } from '../lib/queries'
import type { Place } from '../lib/types'
import { PickField } from './ui'
import type { PickOption } from './ui'

interface PickerProps {
  id?: string
  label: string
  value: string
  onChange: (code: string) => void
  onBlur?: () => void
  invalid?: boolean
  /** A first option for "none": a filter's "all", or clearing a form field. */
  emptyLabel?: string
  placeholder?: string
  ref?: Ref<HTMLButtonElement>
}

function PlacePicker({ places, loading, failed, unit, id, label, value, onChange, onBlur, invalid, emptyLabel, placeholder, ref, disabled }: PickerProps & { places: readonly Place[]; loading: boolean; failed: boolean; unit: 'province' | 'ward'; disabled?: boolean }) {
  const [search, setSearch] = useState('')
  const wanted = normalizeName(search)
  // One name per option, as written officially: "Tỉnh An Giang", "Phường Ba Đình"
  const options: PickOption[] = places.filter((place) => !wanted || normalizeName(place.fullName).includes(wanted)).map((place) => ({ value: place.code, label: place.fullName }))
  if (emptyLabel !== undefined && !search) options.unshift({ value: '', label: emptyLabel })
  const current = places.find((place) => place.code === value)?.fullName ?? value
  return (
    <PickField
      ref={ref}
      id={id}
      label={label}
      value={value}
      valueLabel={value ? current : undefined}
      placeholder={placeholder ?? t(unit === 'province' ? 'place.pickProvince' : 'place.pickWard')}
      options={options}
      search={search}
      onSearchChange={setSearch}
      searchPlaceholder={t(unit === 'province' ? 'place.searchProvince' : 'place.searchWard')}
      loading={loading}
      empty={failed ? t('place.loadFailed') : t('place.noMatch')}
      onChange={(code) => {
        setSearch('')
        onChange(code)
      }}
      onBlur={onBlur}
      invalid={invalid}
      disabled={disabled}
    />
  )
}

/** Decided 26/11/2026: one of the 34 provinces after 1/7/2025, searchable without marks. */
export function ProvincePicker(props: PickerProps) {
  const provinces = useQuery(queries.provinces())
  return <PlacePicker {...props} unit="province" places={provinces.data?.items ?? []} loading={provinces.isPending} failed={provinces.isError} />
}

/** A commune, ward or special zone of `provinceCode`; disabled until a province is chosen. */
export function WardPicker({ provinceCode, ...props }: PickerProps & { provinceCode: string }) {
  const wards = useQuery({ ...queries.wards(provinceCode), enabled: !!provinceCode })
  return (
    <PlacePicker
      {...props}
      unit="ward"
      places={wards.data?.items ?? []}
      loading={!!provinceCode && wards.isPending}
      failed={wards.isError}
      disabled={!provinceCode}
      placeholder={provinceCode ? props.placeholder : t('place.provinceFirst')}
    />
  )
}
