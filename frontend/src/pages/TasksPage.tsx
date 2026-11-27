import { useQuery } from '@tanstack/react-query'
import { Plus } from 'lucide-react'
import { hasRole } from '../auth/access'
import { useMe } from '../auth/useMe'
import { TaskForm, TaskList } from '../components/Tasks'
import { Alert, Button, Card, Container, Dialog, FilterBand, FilterField, PageHeader, Select, Spinner, TabBar } from '../components/ui'
import { t } from '../i18n'
import type { MessageKey } from '../i18n'
import { errorMessage } from '../lib/api'
import { queries } from '../lib/queries'
import { useUrlState } from '../lib/useUrlState'

const STATUSES = ['OPEN', 'DONE', 'CANCELLED'] as const

/** Section 9.3: every task of the person (lead, client, personal), or of their line for a manager. */
export function TasksPage() {
  const { data: me } = useMe()
  const url = useUrlState()
  const status = url.oneOf('status', STATUSES) || 'OPEN'
  // Changed 27/11/2026: only the GA director sees everyone's tasks; a line manager sees their own
  const canSeeTeam = hasRole(me, 'GAD')
  const team = canSeeTeam && url.get('team') === '1'
  const adding = url.get('create') === '1'
  const tasks = useQuery(queries.tasks({ status, ...(team ? { team: '1' } : {}) }))

  return (
    <>
      <PageHeader
        title={t('tasks.title')}
        action={
          <Button onClick={() => url.set({ create: 1 }, { push: true })}>
            <Plus size={16} aria-hidden />
            {t('tasks.add')}
          </Button>
        }
      />
      <Container className="flex-none">
        <TabBar
          label={t('tasks.title')}
          value={status}
          onValueChange={(key) => url.set({ status: key === 'OPEN' ? null : key })}
          items={STATUSES.map((key) => ({ value: key, label: t(`tasks.status.${key}` as MessageKey) }))}
        />
      </Container>
      {canSeeTeam && (
        <FilterBand className="flex flex-col gap-2 sm:flex-row sm:items-center">
          <FilterField label={t('clients.ownedBy')} className="sm:w-56 sm:flex-none">
            <Select value={team ? '1' : ''} onChange={(event) => url.set({ team: event.target.value || null })}>
              <option value="">{t('tasks.mine')}</option>
              <option value="1">{t('tasks.team')}</option>
            </Select>
          </FilterField>
        </FilterBand>
      )}
      <Card>
        <div className="min-h-0 flex-1 overflow-y-auto px-4 pb-4">
          {tasks.isPending && <Spinner />}
          {tasks.isError && <Alert className="m-4">{errorMessage(tasks.error)}</Alert>}
          {tasks.data && <TaskList items={tasks.data.items} empty={t('tasks.empty')} showAgent={team} />}
        </div>
      </Card>
      <Dialog title={t('tasks.addTitle')} open={adding} onClose={() => url.set({ create: null })}>
        {adding && <TaskForm onClose={() => url.set({ create: null })} />}
      </Dialog>
    </>
  )
}
