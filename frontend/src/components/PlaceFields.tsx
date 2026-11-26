import { Controller, useWatch } from 'react-hook-form'
import type { Control, FieldErrors, FieldValues, Path, PathValue, UseFormSetValue } from 'react-hook-form'
import { t } from '../i18n'
import { ProvincePicker, WardPicker } from './PlacePicker'
import { Field, Input } from './ui'

interface PlaceValues extends FieldValues {
  provinceCode: string
  wardCode: string
  addressLine?: string
}

/**
 * Decided 26/11/2026: a lead's province, commune (both after 1/7/2025, no district) and street
 * address. The commune field stays in place, disabled until a province is chosen, and empties when
 * the province changes, so the modal never changes height.
 */
export function PlaceFields<T extends PlaceValues>({ control, setValue, errors, idPrefix }: { control: Control<T>; setValue: UseFormSetValue<T>; errors: FieldErrors<T>; idPrefix: string }) {
  const name = (field: keyof PlaceValues) => field as Path<T>
  const message = (field: keyof PlaceValues) => (errors[field] as { message?: string } | undefined)?.message
  const provinceCode = useWatch({ control, name: name('provinceCode') }) as string
  return (
    <>
      <Field label={t('leads.province')} htmlFor={`${idPrefix}-province`} error={message('provinceCode')}>
        <Controller
          control={control}
          name={name('provinceCode')}
          render={({ field, fieldState }) => (
            <ProvincePicker
              ref={field.ref}
              id={`${idPrefix}-province`}
              label={t('leads.province')}
              emptyLabel={t('leads.noPlace')}
              value={field.value as string}
              onChange={(code) => {
                if (code !== field.value) setValue(name('wardCode'), '' as PathValue<T, Path<T>>, { shouldDirty: true })
                field.onChange(code)
              }}
              onBlur={field.onBlur}
              invalid={fieldState.invalid}
            />
          )}
        />
      </Field>
      <Field label={t('leads.ward')} htmlFor={`${idPrefix}-ward`} error={message('wardCode')}>
        <Controller
          control={control}
          name={name('wardCode')}
          render={({ field, fieldState }) => (
            <WardPicker
              ref={field.ref}
              id={`${idPrefix}-ward`}
              label={t('leads.ward')}
              provinceCode={provinceCode ?? ''}
              emptyLabel={t('leads.noPlace')}
              value={field.value as string}
              onChange={field.onChange}
              onBlur={field.onBlur}
              invalid={fieldState.invalid}
            />
          )}
        />
      </Field>
      <Field label={t('leads.addressLine')} htmlFor={`${idPrefix}-address`} error={message('addressLine')}>
        <Controller
          control={control}
          name={name('addressLine')}
          render={({ field, fieldState }) => (
            <Input id={`${idPrefix}-address`} maxLength={300} placeholder={t('leads.addressPlaceholder')} aria-invalid={fieldState.invalid} {...field} value={(field.value as string | undefined) ?? ''} />
          )}
        />
      </Field>
    </>
  )
}
