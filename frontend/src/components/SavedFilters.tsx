import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { useState } from 'react'
import { useSearchParams } from 'react-router-dom'
import { t } from '../i18n'
import { api, errorMessage } from '../lib/api'
import { keys, queries } from '../lib/queries'
import { toast } from '../lib/toast'
import { Button, Dialog, Field, FormError, Input, MODAL_FOOTER, RowMenu, Select } from './ui'

/** What a filter keeps: everything in the URL except the page, the page size and open dialogs. */
const SKIP = new Set(['page', 'pageSize', 'create', 'dialog', 'move'])

/** LEAD-38 NEW: each person's named filters of the lead list. */
export function SavedFilters() {
  const queryClient = useQueryClient()
  const [params, setParams] = useSearchParams()
  const saved = useQuery(queries.savedFilters())
  const [naming, setNaming] = useState(false)
  const [name, setName] = useState('')
  const current = Object.fromEntries([...params.entries()].filter(([key]) => !SKIP.has(key)))
  const same = (query: Record<string, string>) => {
    const a = Object.entries(query).sort().join('&')
    const b = Object.entries(current).sort().join('&')
    return a === b
  }
  const active = saved.data?.items.find((item) => same(item.query))
  const refresh = () => queryClient.invalidateQueries({ queryKey: [...keys.leads, 'filters'] })

  const save = useMutation({
    mutationFn: () => api.post('/leads/filters', { name: name.trim(), query: current }),
    onSuccess: async () => {
      await refresh()
      toast.success(t('toast.filterSaved', { name: name.trim() }))
      setNaming(false)
      setName('')
    },
  })
  const remove = useMutation({
    mutationFn: (id: string) => api.delete(`/leads/filters/${id}`),
    onSuccess: async () => {
      await refresh()
      toast.info(t('toast.filterRemoved', { name: active?.name ?? '' }))
    },
    onError: (error) => toast.error(t('toast.filterRemoveFailed'), errorMessage(error)),
  })

  return (
    <div className="flex items-center gap-1">
      <Select
        aria-label={t('leads.savedFilters')}
        className="sm:w-52"
        value={active?.id ?? ''}
        onChange={(event) => {
          const picked = saved.data?.items.find((item) => item.id === event.target.value)
          if (picked) setParams(new URLSearchParams(picked.query))
        }}
      >
        <option value="">{saved.data?.items.length ? t('leads.savedFiltersPick') : t('leads.savedFiltersNone')}</option>
        {saved.data?.items.map((item) => (
          <option key={item.id} value={item.id}>
            {item.name}
          </option>
        ))}
      </Select>
      <RowMenu
        label={t('leads.savedFiltersMenu')}
        items={[
          { label: t('leads.saveFilter'), disabled: Object.keys(current).length === 0, onSelect: () => setNaming(true) },
          { label: t('leads.removeFilter'), danger: true, disabled: !active, onSelect: () => active && remove.mutate(active.id) },
        ]}
      />
      <Dialog title={t('leads.saveFilterTitle')} open={naming} onClose={() => setNaming(false)}>
        {naming && (
          <form
            noValidate
            onSubmit={(event) => {
              event.preventDefault()
              if (name.trim()) save.mutate()
            }}
          >
            <p className="mb-3 text-caption text-ink-meta">{t('leads.saveFilterHelp')}</p>
            <Field label={t('leads.filterName')} htmlFor="filter-name" required>
              <Input id="filter-name" maxLength={60} placeholder={t('placeholder.filterName')} value={name} onChange={(event) => setName(event.target.value)} />
            </Field>
            <FormError message={save.isError ? errorMessage(save.error) : undefined} />
            <div className={MODAL_FOOTER}>
              <Button type="button" variant="ghost" onClick={() => setNaming(false)}>
                {t('common.cancel')}
              </Button>
              <Button type="submit" disabled={!name.trim() || save.isPending}>
                {t('leads.saveFilter')}
              </Button>
            </div>
          </form>
        )}
      </Dialog>
    </div>
  )
}
