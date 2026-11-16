import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { t } from '../i18n'
import { api, errorMessage } from '../lib/api'
import { keys, queries } from '../lib/queries'
import { toast } from '../lib/toast'
import type { LeadDetail, LeadRow } from '../lib/types'
import { Button, Checkbox, Field, FormError, Input, MODAL_FOOTER, PickList, Radio, RadioGroup, Textarea } from './ui'

type Lead = LeadDetail['lead']

/** LEAD-40 + PDP-6: to the bin (30 days) or, on the customer's request, erased for good. */
export function DeleteLeadForm({ lead, onClose }: { lead: Lead; onClose: () => void }) {
  const queryClient = useQueryClient()
  const navigate = useNavigate()
  const [mode, setMode] = useState<'SOFT' | 'PDP'>('SOFT')
  const [reason, setReason] = useState('')
  const [understood, setUnderstood] = useState(false)
  const remove = useMutation({
    mutationFn: () => api.delete(`/leads/${lead.id}`, { reason: reason.trim(), mode }),
    onSuccess: async () => {
      queryClient.removeQueries({ queryKey: [...keys.leads, 'detail', lead.id] })
      await queryClient.invalidateQueries({ queryKey: keys.leads })
      if (mode === 'SOFT') toast.info(t('toast.leadDeleted', { name: lead.fullName }), t('toast.leadDeletedDetail'))
      else toast.info(t('toast.leadErased', { name: lead.fullName }))
      navigate('/leads', { replace: true })
    },
  })
  const ready = reason.trim().length > 0 && (mode === 'SOFT' || understood)
  return (
    <form
      noValidate
      onSubmit={(event) => {
        event.preventDefault()
        if (ready) remove.mutate()
      }}
    >
      <p id="delete-mode-label" className="mb-1 text-caption font-medium text-ink">
        {t('leads.deleteMode')}
      </p>
      <RadioGroup aria-labelledby="delete-mode-label" value={mode} onValueChange={setMode} className="mb-3">
        {(['SOFT', 'PDP'] as const).map((value) => (
          <label key={value} className="flex cursor-pointer items-start gap-3 rounded-md border border-band p-3 has-[[data-state=checked]]:border-primary">
            <Radio value={value} className="mt-1" />
            <span>
              <span className="block text-link text-ink">{t(value === 'SOFT' ? 'leads.deleteSoft' : 'leads.deletePdp')}</span>
              <span className="block text-caption text-ink-meta">{t(value === 'SOFT' ? 'leads.deleteSoftHint' : 'leads.deletePdpHint')}</span>
            </span>
          </label>
        ))}
      </RadioGroup>
      <Field label={t('leads.deleteReason')} htmlFor="delete-reason" required>
        <Textarea id="delete-reason" rows={2} maxLength={500} placeholder={t('placeholder.deleteReason')} value={reason} onChange={(event) => setReason(event.target.value)} />
      </Field>
      <label className={`flex items-start gap-2 text-caption ${mode === 'PDP' ? 'text-ink' : 'text-ink-meta'}`}>
        <Checkbox className="mt-0.5" disabled={mode !== 'PDP'} checked={mode === 'PDP' && understood} onChange={(checked) => setUnderstood(checked)} />
        {t('leads.deletePdpConfirm')}
      </label>
      <FormError message={remove.isError ? errorMessage(remove.error) : undefined} />
      <div className={MODAL_FOOTER}>
        <Button type="button" variant="ghost" onClick={onClose}>
          {t('common.cancel')}
        </Button>
        <Button type="submit" variant="danger" disabled={!ready || remove.isPending}>
          {t(mode === 'SOFT' ? 'leads.deleteSubmit' : 'leads.erasePdpSubmit')}
        </Button>
      </div>
    </form>
  )
}

/** LEAD-41: another lead of the same customer (an old number) folds into this one. */
export function MergeLeadForm({ lead, onClose }: { lead: Lead; onClose: () => void }) {
  const queryClient = useQueryClient()
  const [q, setQ] = useState('')
  const [picked, setPicked] = useState<LeadRow | null>(null)
  const term = q.trim()
  const found = useQuery({ ...queries.leads({ page: 1, pageSize: 8, q: term }), enabled: term.length >= 2 })
  const options = (found.data?.items ?? []).filter((item) => item.id !== lead.id)
  const merge = useMutation({
    mutationFn: (other: LeadRow) => api.post('/leads/merge', { keepId: lead.id, mergeId: other.id }),
    onSuccess: async (_, other) => {
      await queryClient.invalidateQueries({ queryKey: keys.leads })
      toast.success(t('toast.leadsMerged', { other: other.fullName, name: lead.fullName }), t('toast.leadsMergedDetail'))
      onClose()
    },
  })
  return (
    <div>
      <p className="mb-3 text-caption text-ink-meta">{t('leads.mergeHelp', { name: lead.fullName })}</p>
      <Field label={t('leads.mergeSearch')} htmlFor="merge-search">
        <Input
          id="merge-search"
          placeholder={t('placeholder.mergeSearch')}
          value={q}
          onChange={(event) => {
            setQ(event.target.value)
            setPicked(null)
          }}
        />
      </Field>
      <PickList
        label={t('leads.mergeSearch')}
        className="h-56"
        empty={term.length < 2 ? t('leads.mergeTypeMore') : found.data ? t('leads.mergeNone') : undefined}
        options={options.map((item) => ({
          value: item.id,
          label: item.fullName,
          meta: `${item.phone} · ${item.agentName ?? item.assignedAgentCode ?? t('leads.unassigned')}`,
        }))}
        value={picked?.id ?? null}
        onChange={(id) => setPicked(options.find((item) => item.id === id) ?? null)}
      />
      <p className="mt-2 min-h-10 text-caption text-ink-body">{picked ? t('leads.mergeSummary', { other: picked.fullName, phone: picked.phone, name: lead.fullName }) : ''}</p>
      <FormError message={merge.isError ? errorMessage(merge.error) : undefined} />
      <div className={MODAL_FOOTER}>
        <Button type="button" variant="ghost" onClick={onClose}>
          {t('common.cancel')}
        </Button>
        <Button disabled={!picked || merge.isPending} onClick={() => picked && merge.mutate(picked)}>
          {t('leads.mergeSubmit')}
        </Button>
      </div>
    </div>
  )
}
