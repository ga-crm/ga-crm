import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { useState } from 'react'
import { Alert, Button, Card, PageHeader, Spinner, TableScroll, Checkbox } from '../components/ui'
import { t, tDynamic } from '../i18n'
import { api, errorMessage } from '../lib/api'
import { keys, queries } from '../lib/queries'
import { toast } from '../lib/toast'
import { CONFIGURABLE_ROLES } from '../lib/types'
import type { Grants } from '../lib/types'

/** Section 16.14 */
export function PermissionsPage() {
  const queryClient = useQueryClient()
  const [draft, setDraft] = useState<Grants | null>(null)

  const matrix = useQuery(queries.permissions())
  const grants = draft ?? matrix.data?.grants

  const save = useMutation({
    mutationFn: (next: Grants) => api.put('/permissions', { grants: next }),
    onSuccess: async () => {
      await Promise.all([queryClient.invalidateQueries({ queryKey: keys.permissions }), queryClient.invalidateQueries({ queryKey: keys.me })])
      setDraft(null)
      toast.success(t('toast.permissionsSaved'), t('toast.permissionsSavedDetail'))
    },
    onError: (error) => toast.error(t('toast.permissionsFailed'), errorMessage(error)),
  })

  const toggle = (role: keyof Grants, permission: string) => {
    if (!grants) return
    const current = grants[role]
    setDraft({
      ...grants,
      [role]: current.includes(permission) ? current.filter((item) => item !== permission) : [...current, permission],
    })
  }

  return (
    <>
      <PageHeader
        title={t('permissions.title')}
        subtitle={t('permissions.subtitle')}
        action={
          <Button disabled={!draft || save.isPending} onClick={() => draft && save.mutate(draft)}>
            {t('common.save')}
          </Button>
        }
      />
      <Card className="pb-3">
        {matrix.isPending && <Spinner />}
        {matrix.isError && <Alert className="m-4">{errorMessage(matrix.error)}</Alert>}
        {matrix.data && grants && (
          <TableScroll>
          <table className="data-table">
            <thead>
              <tr>
                <th scope="col" className="col-first">
                  {t('permissions.column')}
                </th>
                {CONFIGURABLE_ROLES.map((role) => (
                  <th key={role} scope="col" className="min-w-24 text-center">
                    {tDynamic(`role.${role}`, role)}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {matrix.data.catalog.map((permission) => {
                const label = tDynamic(`permission.${permission}`, permission)
                return (
                  <tr key={permission}>
                    <th scope="row" className="col-first font-normal">
                      {label}
                    </th>
                    {CONFIGURABLE_ROLES.map((role) => (
                      <td key={role} className="text-center">
                        <Checkbox
                          aria-label={`${tDynamic(`role.${role}`, role)}: ${label}`}
                          checked={grants[role].includes(permission)}
                          onChange={() => toggle(role, permission)}
                        />
                      </td>
                    ))}
                  </tr>
                )
              })}
            </tbody>
          </table>
          </TableScroll>
        )}
      </Card>
    </>
  )
}
