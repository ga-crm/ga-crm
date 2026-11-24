import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { useMemo, useState } from 'react'
import { t } from '../i18n'
import { normalizeName } from '../lib/agentTree'
import { api, errorMessage } from '../lib/api'
import { keys, queries } from '../lib/queries'
import { toast } from '../lib/toast'
import { Button, Dialog, FormError, MODAL_FOOTER, PickList } from './ui'

const NOBODY = ''

/**
 * ASG-1 to ASG-3: "Phân công cho" one agent the person may assign to, or "Bỏ phân công", which only
 * removes the hand-made link. The API checks the same rules (PERM-4).
 */
export function ClientAssignDialog({ clientIds, open, onClose, onDone }: { clientIds: string[]; open: boolean; onClose: () => void; onDone: () => void }) {
  const queryClient = useQueryClient()
  const [search, setSearch] = useState('')
  const [chosen, setChosen] = useState<string | null>(null)
  const tree = useQuery({ ...queries.agentTree(), enabled: open })

  const shown = useMemo(() => {
    const wanted = normalizeName(search)
    return (tree.data?.items ?? []).filter((agent) => !wanted || agent.agentCode.includes(search.trim()) || normalizeName(agent.name).includes(wanted))
  }, [tree.data, search])

  const assign = useMutation({
    mutationFn: () => api.post<{ assigned: number }>('/clients/assign', { clientIds, agentCode: chosen === NOBODY ? null : chosen }),
    onSuccess: async ({ assigned }) => {
      await queryClient.invalidateQueries({ queryKey: keys.clients })
      const agent = tree.data?.items.find((item) => item.agentCode === chosen)
      if (agent) toast.success(t('toast.clientsAssigned', { count: assigned, name: agent.name }))
      else toast.info(t('toast.clientsUnassigned', { count: assigned }), t('toast.clientsUnassignedDetail'))
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
    <Dialog title={t('clients.assignTitle', { count: clientIds.length })} open={open} onClose={close}>
      <p className="mb-3 text-caption text-ink-meta">{t('clients.assignHint')}</p>
      <PickList
        label={t('clients.assignee')}
        placeholder={t('clients.assignSearch')}
        search={search}
        onSearchChange={setSearch}
        loading={tree.isPending}
        note={tree.data && shown.length === 0 ? t('clients.noAgents') : undefined}
        options={[{ value: NOBODY, label: t('clients.unassign') }, ...shown.map((agent) => ({ value: agent.agentCode, label: agent.name, meta: agent.agentCode }))]}
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
          {t('clients.assign')}
        </Button>
      </div>
    </Dialog>
  )
}
