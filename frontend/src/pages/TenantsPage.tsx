import { zodResolver } from '@hookform/resolvers/zod'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { useEffect, useState } from 'react'
import { useForm } from 'react-hook-form'
import { z } from 'zod'
import { Alert, Badge, Button, Card, ClearFilters, ConfirmDialog, CopyLink, Dialog, EmptyState, Field, FilterBand, FilterField, FormError, Input, MODAL_FOOTER, Notice, PageHeader, Pagination, SearchInput, Select, Spinner, TableScroll } from '../components/ui'
import { formatDateTime, t, tDynamic } from '../i18n'
import type { MessageKey } from '../i18n'
import { api, errorField, errorMessage } from '../lib/api'
import { keys, queries } from '../lib/queries'
import { useListSearch } from '../lib/useListSearch'
import { usePrefetchNextPage } from '../lib/usePrefetchNextPage'
import { toast } from '../lib/toast'
import type { Tenant, User } from '../lib/types'
import { useLeaveEmptyPage, useUrlState } from '../lib/useUrlState'


// Spec section 20 codes that belong to one field of the form
const TENANT_FIELD_ERRORS = { ga_code_taken: 'gaCode', email_taken: 'email', agent_code_taken: 'agentCode' } as const

// TENANT-1
const schema = z.object({
  gaCode: z
    .string()
    .trim()
    .toUpperCase()
    .regex(/^[A-Z0-9][A-Z0-9-]{1,30}[A-Z0-9]$/, t('validation.gaCode')),
  name: z.string().trim().min(1, t('validation.required')).max(200),
  email: z.string().trim().pipe(z.email(t('validation.email'))),
  headName: z.string().trim().min(1, t('validation.required')).max(100),
  agentCode: z
    .string()
    .trim()
    .regex(/^\d{0,20}$/, t('validation.agentCode')),
})
type FormValues = z.infer<typeof schema>

function CreateTenantForm({ onClose, onCreated }: { onClose: () => void; onCreated: (url: string) => void }) {
  const form = useForm<FormValues>({ resolver: zodResolver(schema) })
  const create = useMutation({
    mutationFn: ({ gaCode, name, email, headName, agentCode }: FormValues) =>
      api.post<{ inviteUrl: string }>('/platform/tenants', { gaCode, name, head: { email, name: headName, agentCode: agentCode || undefined } }),
    onSuccess: ({ inviteUrl }) => onCreated(inviteUrl),
    onError: (error) => {
      const field = errorField(error, TENANT_FIELD_ERRORS)
      if (field) form.setError(field, { message: errorMessage(error) })
    },
  })
  const { errors } = form.formState
  return (
    <form noValidate onSubmit={form.handleSubmit((values) => create.mutate(values))}>
      <Field label={t('tenants.gaCode')} htmlFor="ga-code" required error={errors.gaCode?.message}>
        <Input id="ga-code" placeholder={t('placeholder.gaCode')} aria-invalid={!!errors.gaCode} {...form.register('gaCode')} />
      </Field>
      <Field label={t('tenants.name')} htmlFor="ga-name" required error={errors.name?.message}>
        <Input id="ga-name" placeholder={t('placeholder.gaName')} aria-invalid={!!errors.name} {...form.register('name')} />
      </Field>
      <Field label={t('tenants.headEmail')} htmlFor="head-email" required error={errors.email?.message}>
        <Input id="head-email" placeholder={t('placeholder.email')} type="email" aria-invalid={!!errors.email} {...form.register('email')} />
      </Field>
      <Field label={t('tenants.headName')} htmlFor="head-name" required error={errors.headName?.message}>
        <Input id="head-name" placeholder={t('placeholder.name')} aria-invalid={!!errors.headName} {...form.register('headName')} />
      </Field>
      <Field label={t('tenants.headAgentCode')} htmlFor="head-agent" error={errors.agentCode?.message}>
        <Input id="head-agent" placeholder={t('placeholder.agentCodeOptional')} inputMode="numeric" aria-invalid={!!errors.agentCode} {...form.register('agentCode')} />
      </Field>
      <FormError message={create.isError && !errorField(create.error, TENANT_FIELD_ERRORS) ? errorMessage(create.error) : undefined} />
      <div className={MODAL_FOOTER}>
        <Button variant="secondary" onClick={onClose}>
          {t('common.cancel')}
        </Button>
        <Button type="submit" disabled={create.isPending}>
          {t('tenants.create')}
        </Button>
      </div>
    </form>
  )
}

/** TENANT-4: opening this list writes CROSS_TENANT_READ on the server. */
function TenantUsers({ tenant, onLink, onClose }: { tenant: Tenant; onLink: (url: string) => void; onClose: () => void }) {
  const queryClient = useQueryClient()
  const users = useQuery(queries.tenantUsers(tenant.id))
  const [resetting, setResetting] = useState<User | null>(null)
  const resetMfa = useMutation({
    mutationFn: (user: User) => api.post(`/platform/tenants/${tenant.id}/users/${user.id}/mfa/reset`),
    onSuccess: async (_, user) => {
      await queryClient.invalidateQueries({ queryKey: keys.tenants })
      toast.info(t('toast.mfaReset', { name: user.name }), t('toast.mfaResetDetail'))
      setResetting(null)
    },
  })
  const reinvite = useMutation({
    mutationFn: (user: User) => api.post<{ inviteUrl: string }>(`/platform/tenants/${tenant.id}/users/${user.id}/invite`),
    onSuccess: ({ inviteUrl }, user) => {
      onLink(inviteUrl)
      toast.info(t('toast.inviteRenewed', { name: user.name }), t('toast.inviteRenewedDetail'))
    },
  })
  return (
    <div>
      <Notice>{t('tenants.auditHint')}</Notice>
      <div className="mt-3 h-72 overflow-y-auto">
      {users.isPending && <Spinner />}
      <ul className="divide-y divide-band">
        {users.data?.items.map((user) => (
          <li key={user.id} className="flex items-center justify-between gap-2 py-2 text-caption">
            <span className="min-w-0">
              <span className="block font-medium text-ink">{user.name}</span>
              <span className="block truncate text-ink-meta">{user.email}</span>
            </span>
            {user.status === 'INVITED' ? (
              <Button variant="ghost" disabled={reinvite.isPending} onClick={() => reinvite.mutate(user)}>
                {t('users.newLink')}
              </Button>
            ) : (
              <span className="flex flex-none items-center gap-1">
                {user.mfaEnabled && (
                  <Button variant="ghost" onClick={() => setResetting(user)}>
                    {t('users.mfaReset')}
                  </Button>
                )}
                <Badge tone={user.status === 'DISABLED' ? 'muted' : 'info'}>{tDynamic(`status.${user.status}`, user.status)}</Badge>
              </span>
            )}
          </li>
        ))}
      </ul>
      </div>
      <FormError message={users.isError ? errorMessage(users.error) : reinvite.isError ? errorMessage(reinvite.error) : undefined} />
      <ConfirmDialog
        message={resetting ? t('users.confirmMfaReset', { name: resetting.name }) : null}
        pending={resetMfa.isPending}
        error={resetMfa.isError ? errorMessage(resetMfa.error) : undefined}
        onConfirm={() => resetting && resetMfa.mutate(resetting)}
        onClose={() => setResetting(null)}
      />
      <div className={MODAL_FOOTER}>
        <Button variant="secondary" onClick={onClose}>
          {t('common.close')}
        </Button>
      </div>
    </div>
  )
}

const LIMIT_FIELDS = ['maxUsers', 'aiTokensPerMonth', 'storageMb'] as const

/** Section 5.2 + 16.17: the plan's name and limits; an empty box means no limit. */
function PlanForm({ tenant, onClose }: { tenant: Tenant; onClose: () => void }) {
  const queryClient = useQueryClient()
  const [plan, setPlan] = useState(tenant.plan)
  const [values, setValues] = useState<Record<(typeof LIMIT_FIELDS)[number], string>>(() => ({
    maxUsers: tenant.limits.maxUsers?.toString() ?? '',
    aiTokensPerMonth: tenant.limits.aiTokensPerMonth?.toString() ?? '',
    storageMb: tenant.limits.storageMb?.toString() ?? '',
  }))
  const bad = (value: string) => value.trim() !== '' && !/^[1-9]\d*$/.test(value.trim())
  const save = useMutation({
    mutationFn: () =>
      api.patch(`/platform/tenants/${tenant.id}`, {
        plan: plan.trim(),
        limits: Object.fromEntries(LIMIT_FIELDS.map((field) => [field, values[field].trim() ? Number(values[field]) : null])),
      }),
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: keys.tenants })
      toast.success(t('toast.planSaved', { name: tenant.name }))
      onClose()
    },
  })
  const ready = plan.trim() !== '' && !LIMIT_FIELDS.some((field) => bad(values[field]))
  return (
    <form
      noValidate
      onSubmit={(event) => {
        event.preventDefault()
        if (ready) save.mutate()
      }}
    >
      <p className="mb-3 text-caption text-ink-meta">{t('tenants.planHelp', { users: tenant.users })}</p>
      <Field label={t('tenants.planName')} htmlFor="plan-name" required>
        <Input id="plan-name" maxLength={50} placeholder={t('placeholder.planName')} value={plan} onChange={(event) => setPlan(event.target.value)} />
      </Field>
      {LIMIT_FIELDS.map((field) => (
        <Field key={field} label={t(`tenants.limit.${field}` as MessageKey)} htmlFor={`limit-${field}`} error={bad(values[field]) ? t('tenants.limitInvalid') : undefined}>
          <Input id={`limit-${field}`} inputMode="numeric" placeholder={t('placeholder.noLimit')} value={values[field]} aria-invalid={bad(values[field])} onChange={(event) => setValues((current) => ({ ...current, [field]: event.target.value }))} />
        </Field>
      ))}
      <FormError message={save.isError ? errorMessage(save.error) : undefined} />
      <div className={MODAL_FOOTER}>
        <Button type="button" variant="ghost" onClick={onClose}>
          {t('common.cancel')}
        </Button>
        <Button type="submit" disabled={!ready || save.isPending}>
          {t('common.save')}
        </Button>
      </div>
    </form>
  )
}

const TENANT_STATUSES = ['active', 'suspended']

/** Section 16.17 */
export function TenantsPage() {
  const queryClient = useQueryClient()
  const url = useUrlState()
  const { page } = url
  const search = useListSearch(url)
  const q = search.committed
  const status = url.oneOf('status', TENANT_STATUSES)
  const creating = url.get('create') === '1'
  const viewingId = url.get('tenant')
  const [link, setLink] = useState<string | null>(null)
  const [toggling, setToggling] = useState<Tenant | null>(null)
  const planId = url.get('plan')

  const params = { page, pageSize: url.pageSize, q, status }
  const tenants = useQuery(queries.tenants(params))
  usePrefetchNextPage(queries.tenants, params, tenants.data)
  const refresh = () => queryClient.invalidateQueries({ queryKey: keys.tenants })
  useLeaveEmptyPage(url, tenants.data?.items.length)

  const viewing = tenants.data?.items.find((tenant) => tenant.id === viewingId) ?? null
  const planning = tenants.data?.items.find((tenant) => tenant.id === planId) ?? null
  // A saved id that is not on this page (or no longer exists) closes the dialog instead of leaving it stuck
  const staleViewing = !!viewingId && !!tenants.data && !viewing
  useEffect(() => {
    if (staleViewing) url.set({ tenant: null })
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [staleViewing])

  const toggle = useMutation({
    mutationFn: (tenant: Tenant) => api.patch(`/platform/tenants/${tenant.id}`, { status: tenant.status === 'active' ? 'suspended' : 'active' }),
    onSuccess: async (_, tenant) => {
      await refresh()
      if (tenant.status === 'active') toast.warning(t('toast.tenantSuspended', { name: tenant.name }), t('toast.tenantSuspendedDetail'))
      else toast.success(t('toast.tenantReactivated', { name: tenant.name }))
      setToggling(null)
    },
  })

  return (
    <>
      <PageHeader title={t('tenants.title')} action={<Button onClick={() => url.set({ create: 1 }, { push: true })}>{t('tenants.create')}</Button>} />
      <FilterBand className="flex flex-col gap-3 sm:flex-row sm:flex-wrap sm:items-end lg:flex-nowrap">
        <FilterField label={t('common.search')} className="lg:min-w-48 lg:flex-1">
          <SearchInput label={t('common.search')} placeholder={t('tenants.searchPlaceholder')} value={search.input} onValueChange={search.onChange} />
        </FilterField>
        <FilterField label={t('tenants.status')} className="sm:w-52 sm:flex-none">
          <Select value={status} onChange={(event) => url.set({ status: event.target.value, page: null })}>
            <option value="">{t('common.allStatuses')}</option>
            {TENANT_STATUSES.map((value) => (
              <option key={value} value={value}>
                {tDynamic(`status.${value}`, value)}
              </option>
            ))}
          </Select>
        </FilterField>
        <ClearFilters active={!!(search.input || status)} onClear={() => url.set({ q: null, status: null, page: null })} />
      </FilterBand>
      <Card>
        {tenants.isPending && <Spinner />}
        {tenants.isError && <Alert className="m-4">{errorMessage(tenants.error)}</Alert>}
        {tenants.data && tenants.data.items.length === 0 && <EmptyState>{t('tenants.empty')}</EmptyState>}
        {tenants.data && tenants.data.items.length > 0 && (
          <>
            <TableScroll loading={tenants.isPlaceholderData}>
              <table className="data-table min-w-[960px] table-fixed">
                <colgroup>
                  <col className="w-[140px]" />
                  <col />
                  <col className="w-[140px]" />
                  <col className="w-[110px]" />
                  <col className="w-[172px]" />
                  <col className="w-[300px]" />
                </colgroup>
                <thead>
                  <tr>
                    <th>{t('tenants.gaCode')}</th>
                    <th>{t('tenants.name')}</th>
                    <th>{t('tenants.status')}</th>
                    <th>{t('tenants.users')}</th>
                    <th>{t('tenants.lastActivity')}</th>
                    <th className="col-actions">{t('common.actions')}</th>
                  </tr>
                </thead>
                <tbody>
                  {tenants.data.items.map((tenant) => (
                    <tr key={tenant.id}>
                      <td title={tenant.gaCode} className="truncate font-medium text-ink">{tenant.gaCode}</td>
                      <td title={tenant.name} className="truncate">{tenant.name}</td>
                      <td>
                        <Badge tone={tenant.status === 'suspended' ? 'danger' : 'info'}>{tDynamic(`status.${tenant.status}`, tenant.status)}</Badge>
                      </td>
                      <td className="tabular-nums" title={tenant.plan}>
                        {tenant.limits.maxUsers ? t('tenants.usersOfMax', { users: tenant.users, max: tenant.limits.maxUsers }) : tenant.users}
                      </td>
                      <td className="whitespace-nowrap text-ink-meta">{formatDateTime(tenant.lastActivityAt)}</td>
                      <td className="col-actions">
                        <span className="flex gap-1 whitespace-nowrap">
                          <Button variant="ghost" onClick={() => url.set({ tenant: tenant.id }, { push: true })}>
                            {t('tenants.viewUsers')}
                          </Button>
                          <Button variant="ghost" onClick={() => url.set({ plan: tenant.id }, { push: true })}>
                            {t('tenants.plan')}
                          </Button>
                          <Button variant="ghost" onClick={() => setToggling(tenant)}>
                            {tenant.status === 'active' ? t('tenants.suspend') : t('tenants.reactivate')}
                          </Button>
                        </span>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </TableScroll>
            <Pagination page={tenants.data.page} pageSize={tenants.data.pageSize} total={tenants.data.total} onPage={url.setPage} onPageSize={url.setPageSize} />
          </>
        )}
      </Card>

      <Dialog title={t('tenants.createTitle')} open={creating} onClose={() => url.set({ create: null })}>
        <CreateTenantForm
          onClose={() => url.set({ create: null })}
          onCreated={(createdLink) => {
            url.set({ create: null })
            setLink(createdLink)
            toast.success(t('toast.tenantCreated'), t('toast.tenantCreatedDetail'))
            void refresh()
          }}
        />
      </Dialog>

      <Dialog title={planning ? t('tenants.planTitle', { name: planning.name }) : ''} open={!!planning} onClose={() => url.set({ plan: null })}>
        {planning && <PlanForm key={planning.id} tenant={planning} onClose={() => url.set({ plan: null })} />}
      </Dialog>

      <Dialog title={viewing ? t('tenants.usersOf', { name: viewing.name }) : ''} open={!!viewing} onClose={() => url.set({ tenant: null })}>
        {viewing && (
          <TenantUsers
            tenant={viewing}
            onClose={() => url.set({ tenant: null })}
            onLink={(createdLink) => {
              url.set({ tenant: null })
              setLink(createdLink)
            }}
          />
        )}
      </Dialog>

      <Dialog title={t('users.inviteLinkTitle')} open={!!link} onClose={() => setLink(null)}>
        {link && <CopyLink url={link} hint={t('users.inviteLinkHint')} onClose={() => setLink(null)} />}
      </Dialog>

      <ConfirmDialog
        message={toggling ? t(toggling.status === 'active' ? 'tenants.confirmSuspend' : 'tenants.confirmReactivate', { name: toggling.name }) : null}
        danger={toggling?.status === 'active'}
        pending={toggle.isPending}
        error={toggle.isError ? errorMessage(toggle.error) : undefined}
        onConfirm={() => toggling && toggle.mutate(toggling)}
        onClose={() => {
          setToggling(null)
          toggle.reset()
        }}
      />
    </>
  )
}
