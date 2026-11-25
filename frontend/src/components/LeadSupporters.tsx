import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { formatDateTime, t } from '../i18n'
import { api, errorMessage } from '../lib/api'
import { keys, queries } from '../lib/queries'
import { toast } from '../lib/toast'
import type { LeadDetail, LeadSupporter } from '../lib/types'
import { useMe } from '../auth/useMe'
import { Button, ConfirmDialog, Container, Notice, Panel, PickField } from './ui'

/**
 * Decided 26/11/2026: "Người hỗ trợ" of a lead. Whoever works the lead, or a manager of its line,
 * adds and removes supporters; a supporter may leave. A supporter sees the lead with its phone
 * masked by the API (PDP-3), comments, and changes nothing else.
 */
export function SupportTab({ detail }: { detail: LeadDetail }) {
  const { lead, supporters, canSupport } = detail
  const { data: me } = useMe()
  const navigate = useNavigate()
  const queryClient = useQueryClient()
  const refresh = () => queryClient.invalidateQueries({ queryKey: keys.leads })

  const [picked, setPicked] = useState<{ id: string; name: string } | null>(null)
  const [search, setSearch] = useState('')
  const candidates = useQuery({ ...queries.leadSupporterCandidates(lead.id, search.trim()), enabled: canSupport })
  const add = useMutation({
    mutationFn: (person: { id: string; name: string }) => api.post(`/leads/${lead.id}/supporters`, { userId: person.id }),
    onSuccess: async (_, person) => {
      setPicked(null)
      await refresh()
      toast.success(t('toast.supporterAdded', { person: person.name, name: lead.fullName }), t('toast.supporterAddedDetail'))
    },
  })

  // A confirmation for a removal stays out of the URL
  const [removing, setRemoving] = useState<LeadSupporter | null>(null)
  const leaving = !!removing && removing.userId === me?.user.id
  const remove = useMutation({
    mutationFn: (person: LeadSupporter) => api.delete(`/leads/${lead.id}/supporters/${person.userId}`),
    onSuccess: async (_, person) => {
      setRemoving(null)
      if (person.userId === me?.user.id && !detail.canWork && !canSupport) {
        // The lead is out of sight once a supporter has left
        toast.info(t('toast.supporterLeft', { name: lead.fullName }))
        await refresh()
        void navigate('/leads')
        return
      }
      await refresh()
      toast.success(t('toast.supporterRemoved', { person: person.name, name: lead.fullName }))
    },
  })

  return (
    <Container className="space-y-4 pb-8">
      <p className="text-caption text-ink-meta">{t('support.help')}</p>
      {canSupport ? (
        <Panel className="p-5">
          <div className="flex flex-col gap-2 sm:flex-row sm:items-start">
            <div className="min-w-0 sm:w-80">
              <PickField
                id="support-pick"
                label={t('support.pick')}
                value={picked?.id ?? ''}
                valueLabel={picked?.name}
                placeholder={t('support.pickPlaceholder')}
                options={(candidates.data?.items ?? []).map((person) => ({ value: person.id, label: person.name, meta: person.agentCode ?? undefined }))}
                search={search}
                onSearchChange={setSearch}
                searchPlaceholder={t('support.search')}
                loading={candidates.isPending}
                empty={candidates.isError ? errorMessage(candidates.error) : t('support.noMatch')}
                onChange={(id) => {
                  const person = candidates.data?.items.find((item) => item.id === id)
                  setPicked(person ? { id: person.id, name: person.name } : null)
                  setSearch('')
                }}
              />
            </div>
            <Button className="flex-none" disabled={!picked || add.isPending} onClick={() => picked && add.mutate(picked)}>
              {t('support.add')}
            </Button>
          </div>
          {/* The line is always there, so adding does not move the list below */}
          <p role={add.isError ? 'alert' : undefined} className="mt-1 min-h-[21px] text-caption text-alert">
            {add.isError ? errorMessage(add.error) : ''}
          </p>
        </Panel>
      ) : (
        <Notice>{t('support.readOnly')}</Notice>
      )}
      {supporters.length === 0 ? (
        <p className="text-caption text-ink-meta">{t('support.empty')}</p>
      ) : (
        <ul className="divide-y divide-band border-y border-band">
          {supporters.map((person) => {
            const self = person.userId === me?.user.id
            return (
              <li key={person.userId} className="flex flex-wrap items-center gap-x-3 gap-y-1 py-3 text-caption">
                <span className="min-w-0 flex-1">
                  <span className="block font-medium text-ink-body">
                    {person.name}
                    {person.agentCode && <span className="ml-1 font-normal text-ink-meta tabular-nums">({person.agentCode})</span>}
                    {self && <span className="ml-1 font-normal text-ink-meta">{t('support.you')}</span>}
                  </span>
                  <span className="block text-ink-meta">
                    {person.addedByName ? t('support.addedBy', { name: person.addedByName, at: formatDateTime(person.addedAt) }) : t('support.addedAt', { at: formatDateTime(person.addedAt) })}
                  </span>
                </span>
                {(canSupport || self) && (
                  <Button variant="ghost" className="flex-none" onClick={() => setRemoving(person)}>
                    {t(self ? 'support.leave' : 'support.remove')}
                  </Button>
                )}
              </li>
            )
          })}
        </ul>
      )}
      <ConfirmDialog
        message={removing ? (leaving ? t('support.leaveConfirm') : t('support.removeConfirm', { name: removing.name })) : null}
        danger
        pending={remove.isPending}
        error={remove.isError ? errorMessage(remove.error) : undefined}
        onConfirm={() => removing && remove.mutate(removing)}
        onClose={() => {
          setRemoving(null)
          remove.reset()
        }}
      />
    </Container>
  )
}
