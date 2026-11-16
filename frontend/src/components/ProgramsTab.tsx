import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { useState } from 'react'
import { hasPermission, hasRole } from '../auth/access'
import { useMe } from '../auth/useMe'
import { t } from '../i18n'
import { api, errorMessage } from '../lib/api'
import { keys, queries } from '../lib/queries'
import { toast } from '../lib/toast'
import { PRODUCT_ROLES } from '../lib/types'
import type { InsuranceProgram } from '../lib/types'
import { Alert, Badge, Button, Card, ConfirmDialog, Container, EmptyState, Input, Notice, Select, Spinner, TableScroll, Checkbox } from './ui'

type Patch = Partial<Pick<InsuranceProgram, 'label' | 'productRole' | 'productCode' | 'active'>>

/** A text cell saved when it is left or Enter is pressed. */
function InlineText({ value, label, placeholder, maxLength, disabled, onSave }: { value: string; label: string; placeholder: string; maxLength: number; disabled: boolean; onSave: (next: string) => void }) {
  const [draft, setDraft] = useState(value)
  return (
    <Input
      aria-label={label}
      placeholder={placeholder}
      value={draft}
      maxLength={maxLength}
      disabled={disabled}
      onChange={(event) => setDraft(event.target.value)}
      onBlur={() => {
        if (draft.trim() !== value) onSave(draft.trim())
      }}
      onKeyDown={(event) => {
        if (event.key === 'Enter') event.currentTarget.blur()
        if (event.key === 'Escape') setDraft(value)
      }}
    />
  )
}

/** Section 5.4 + 16.8: "Chương trình bảo hiểm". GA_HEAD and catalog.manage edit (PRG-3). */
export function ProgramsTab() {
  const { data: me } = useMe()
  const queryClient = useQueryClient()
  const canEdit = hasRole(me, 'GA_HEAD') || hasPermission(me, 'catalog.manage')
  const [newLabel, setNewLabel] = useState('')
  const [newRole, setNewRole] = useState<string>(PRODUCT_ROLES[0])
  const [deleting, setDeleting] = useState<InsuranceProgram | null>(null)
  const programs = useQuery(queries.programs())
  const rows = programs.data?.items ?? []
  const refresh = () => queryClient.invalidateQueries({ queryKey: keys.programs })

  const add = useMutation({
    mutationFn: () => api.post<InsuranceProgram>('/programs', { label: newLabel.trim(), productRole: newRole }),
    onSuccess: async (program) => {
      await refresh()
      setNewLabel('')
      toast.success(t('toast.programAdded', { label: program.label }))
    },
  })
  const update = useMutation({
    mutationFn: ({ program, patch }: { program: InsuranceProgram; patch: Patch }) => api.patch<InsuranceProgram>(`/programs/${program.id}`, patch),
    onSuccess: (saved, { patch }) =>
      patch.active === false ? toast.info(t('toast.programHidden', { label: saved.label }), t('toast.programHiddenDetail')) : toast.success(t('toast.programSaved', { label: saved.label })),
    onError: (error) => toast.error(t('toast.optionFailed'), errorMessage(error)),
    onSettled: () => refresh(),
  })
  const remove = useMutation({
    mutationFn: (program: InsuranceProgram) => api.delete(`/programs/${program.id}`),
    onSuccess: async (_, program) => {
      await refresh()
      setDeleting(null)
      toast.success(t('toast.optionDeleted', { label: program.label }))
    },
  })

  return (
    <>
      <Container className="flex-none">
        <p className="pb-3 text-caption text-ink-meta">{t('catalog.help.programs')}</p>
        {!canEdit && (
          <div className="pb-3">
            <Notice>{t('catalog.programsReadOnly')}</Notice>
          </div>
        )}
        {canEdit && (
          <form
            className="flex flex-col gap-2 pb-3 sm:flex-row sm:items-start"
            noValidate
            onSubmit={(event) => {
              event.preventDefault()
              if (newLabel.trim()) add.mutate()
            }}
          >
            <div className="sm:w-80">
              <Input
                aria-label={t('catalog.newProgram')}
                placeholder={t('catalog.newProgram')}
                value={newLabel}
                maxLength={200}
                aria-invalid={add.isError}
                onChange={(event) => {
                  setNewLabel(event.target.value)
                  if (add.isError) add.reset()
                }}
              />
              <p role={add.isError ? 'alert' : undefined} className="mt-0.5 min-h-[21px] text-caption text-alert">
                {add.isError ? errorMessage(add.error) : ''}
              </p>
            </div>
            <div className="sm:w-36">
              <Select aria-label={t('catalog.programRole')} value={newRole} onChange={(event) => setNewRole(event.target.value)}>
                {PRODUCT_ROLES.map((role) => (
                  <option key={role} value={role}>
                    {role}
                  </option>
                ))}
              </Select>
            </div>
            <Button type="submit" disabled={add.isPending || !newLabel.trim()}>
              {t('catalog.add')}
            </Button>
          </form>
        )}
      </Container>
      <Card>
        {programs.isPending && <Spinner />}
        {programs.isError && <Alert className="m-4">{errorMessage(programs.error)}</Alert>}
        {programs.data && rows.length === 0 && <EmptyState>{t('catalog.noPrograms')}</EmptyState>}
        {rows.length > 0 && (
          <TableScroll>
            <table className="data-table min-w-[820px] table-fixed">
              <colgroup>
                <col />
                <col className="w-[140px]" />
                <col className="w-[200px]" />
                <col className="w-[150px]" />
                <col className="w-[90px]" />
              </colgroup>
              <thead>
                <tr>
                  <th>{t('catalog.programName')}</th>
                  <th>{t('catalog.programRole')}</th>
                  <th>{t('catalog.programCode')}</th>
                  <th className="text-center">{t('catalog.active')}</th>
                  <th className="col-actions">{t('common.actions')}</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((program) => (
                  <tr key={program.id}>
                    <td>
                      <InlineText key={program.label} value={program.label} label={t('catalog.renameLabel', { label: program.label })} placeholder={t('catalog.newProgram')} maxLength={200} disabled={!canEdit} onSave={(label) => label && update.mutate({ program, patch: { label } })} />
                    </td>
                    <td>
                      <Select aria-label={t('catalog.programRole')} value={program.productRole} disabled={!canEdit} onChange={(event) => update.mutate({ program, patch: { productRole: event.target.value } })}>
                        {PRODUCT_ROLES.map((role) => (
                          <option key={role} value={role}>
                            {role}
                          </option>
                        ))}
                      </Select>
                    </td>
                    <td title={t('catalog.programCodeHint')}>
                      <InlineText key={program.productCode ?? ''} value={program.productCode ?? ''} label={t('catalog.programCode')} placeholder={t('placeholder.productCode')} maxLength={30} disabled={!canEdit} onSave={(productCode) => update.mutate({ program, patch: { productCode: productCode || null } })} />
                    </td>
                    <td className="text-center">
                      <Checkbox aria-label={`${t('catalog.active')}: ${program.label}`} checked={program.active} disabled={!canEdit || update.isPending} onChange={(checked) => update.mutate({ program, patch: { active: checked } })} />
                    </td>
                    <td className="col-actions">
                      {/* PRG-5: the API refuses a programme a policy uses */}
                      {canEdit ? (
                        <Button variant="ghost" onClick={() => setDeleting(program)}>
                          {t('catalog.delete')}
                        </Button>
                      ) : (
                        !program.active && <Badge tone="muted">{t('catalog.hidden')}</Badge>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </TableScroll>
        )}
        {canEdit && <p className="px-4 py-3 text-caption text-ink-meta">{t('catalog.programCodeHint')}</p>}
      </Card>
      <ConfirmDialog
        message={deleting ? t('catalog.confirmDeleteProgram', { label: deleting.label }) : null}
        danger
        pending={remove.isPending}
        error={remove.isError ? errorMessage(remove.error) : undefined}
        onConfirm={() => deleting && remove.mutate(deleting)}
        onClose={() => {
          setDeleting(null)
          remove.reset()
        }}
      />
    </>
  )
}
