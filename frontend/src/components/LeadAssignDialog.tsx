import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { useMemo, useState } from 'react'
import { hasRole } from '../auth/access'
import { useContactDeadlineHours, useMe } from '../auth/useMe'
import { t } from '../i18n'
import { normalizeName } from '../lib/agentTree'
import { api, errorMessage } from '../lib/api'
import { keys, queries } from '../lib/queries'
import { toast } from '../lib/toast'
import { Button, Dialog, FormError, MODAL_FOOTER, PickList } from './ui'

const NOBODY = ''

/** LEAD-21 and LEAD-23: name and code, with how many open leads each agent already holds. */
export function LeadAssignDialog({
  leadIds,
  open,
  onClose,
  onDone,
  allowUnassign = true,
}: {
  leadIds: string[]
  open: boolean
  onClose: () => void
  onDone: () => void
  /** Lead managers only: a line manager cannot send leads back to the GA pool (open question 4). */
  allowUnassign?: boolean
}) {
  const queryClient = useQueryClient()
  const deadlineHours = useContactDeadlineHours()
  const [search, setSearch] = useState('')
  const [chosen, setChosen] = useState<string | null>(null)
  const director = hasRole(useMe().data, 'GAD')
  const assignees = useQuery({ ...queries.leadAssignees(), enabled: open })

  const shown = useMemo(() => {
    const wanted = normalizeName(search)
    return (assignees.data?.items ?? []).filter((agent) => !wanted || agent.agentCode.includes(search.trim()) || normalizeName(agent.name).includes(wanted))
  }, [assignees.data, search])

  const assign = useMutation({
    mutationFn: () => api.post<{ assigned: number; requested: number }>('/leads/assign', { leadIds, agentCode: chosen === NOBODY ? null : chosen }),
    onSuccess: async ({ assigned, requested }) => {
      await Promise.all([queryClient.invalidateQueries({ queryKey: keys.leads }), queryClient.invalidateQueries({ queryKey: keys.assignments })])
      const agent = assignees.data?.items.find((item) => item.agentCode === chosen)
      // Decided 27/11/2026: anyone but the GA director asks them first
      if (requested > 0) toast.info(t('toast.assignRequested', { count: requested }), t('toast.assignRequestedDetail'))
      else if (assigned === 0) toast.warning(t('toast.assignNothing'))
      else if (agent) toast.success(t('toast.assigned', { count: assigned, name: agent.name }), t('toast.assignedDetail', { hours: deadlineHours }))
      else toast.info(t('toast.unassigned', { count: assigned }))
      setChosen(null)
      setSearch('')
      onDone()
    },
  })

  const close = () => {
    assign.reset()
    onClose()
  }

  return (
    <Dialog title={t('leads.assignTitle', { count: leadIds.length })} open={open} onClose={close}>
      <PickList
        label={t('leads.assignee')}
        placeholder={t('leads.assignSearch')}
        search={search}
        onSearchChange={setSearch}
        loading={assignees.isPending}
        note={allowUnassign ? undefined : t('leads.assignLineHint')}
        options={[
          ...(allowUnassign ? [{ value: NOBODY, label: t('leads.unassign') }] : []),
          ...shown.map((agent) => ({
            value: agent.agentCode,
            label: agent.name,
            meta: (
              <>
                {agent.agentCode}
                <span className="ml-2 inline-block w-20 text-right">{t('leads.openLeads', { count: agent.openLeads })}</span>
              </>
            ),
          })),
        ]}
        value={chosen}
        onChange={setChosen}
      />
      <div className="mt-3">
        <FormError message={assign.isError ? errorMessage(assign.error) : undefined} />
      </div>
      <div className={MODAL_FOOTER}>
        <Button variant="secondary" onClick={close}>
          {t('common.cancel')}
        </Button>
        <Button disabled={chosen === null || assign.isPending} onClick={() => assign.mutate()}>
          {t(director ? 'leads.assign' : 'assignments.send')}
        </Button>
      </div>
    </Dialog>
  )
}
