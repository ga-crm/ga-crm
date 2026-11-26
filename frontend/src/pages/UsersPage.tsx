import { zodResolver } from '@hookform/resolvers/zod'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import type { QueryClient } from '@tanstack/react-query'
import { useEffect, useState } from 'react'
import { Controller, useForm } from 'react-hook-form'
import { z } from 'zod'
import { hasPermission, hasRole } from '../auth/access'
import { useMe } from '../auth/useMe'
import { Alert, Badge, Button, Card, Container, ChipGroup, ClearFilters, ConfirmDialog, CopyLink, Dialog, EmptyState, Field, FilterBand, FilterField, FormError, Input, MODAL_FOOTER, PageHeader, Pagination, PresenceDot, RowMenu, SearchInput, Select, SortButton, Spinner, TableScroll } from '../components/ui'
import type { RowMenuItem } from '../components/ui'
import { formatDateTime, t, tDynamic } from '../i18n'
import { api, ApiError, errorField, errorMessage } from '../lib/api'
import { DepartedWorkNotice } from '../components/DepartedWorkNotice'
import { presenceText, usePresenceInfo, useNow } from '../lib/presence'
import { keys, queries } from '../lib/queries'
import { useListSearch } from '../lib/useListSearch'
import { usePrefetchNextPage } from '../lib/usePrefetchNextPage'
import { AGENT_RANKS, AGENT_ROLES, TENANT_ROLES } from '../lib/types'
import type { AgentRank } from '../lib/types'
import { toast } from '../lib/toast'
import type { User, UserStatus } from '../lib/types'
import { useLeaveEmptyPage, useUrlState } from '../lib/useUrlState'
import { pickerLabel, pickerRows } from '../lib/agentTree'

// Spec section 20 codes that belong to one field of the user forms
const USER_FIELD_ERRORS = { email_taken: 'email', agent_code_taken: 'agentCode', agent_code_required: 'agentCode', manager_not_found: 'managerCode', manager_rank_too_low: 'managerCode' } as const

// USER-7: archived users only show when this filter asks for them
const STATUSES: UserStatus[] = ['ACTIVE', 'INVITED', 'DISABLED', 'ARCHIVED']

const baseSchema = z.object({
  name: z.string().trim().min(1, t('validation.required')).max(100),
  roles: z.array(z.string()).min(1, t('validation.roles')),
  agentCode: z
    .string()
    .trim()
    .regex(/^\d{0,20}$/, t('validation.agentCode')),
  // Decided 26/11/2026: where a new agent code joins the tree
  managerCode: z.string(),
})

// ROLE-2
const needsAgentCode = (values: { roles: string[]; agentCode: string }) =>
  !values.roles.some((role) => AGENT_ROLES.includes(role)) || values.agentCode.length > 0
const agentCodeRule = { path: ['agentCode'], message: t('errors.agent_code_required') }

// USER-6: the email can be changed on edit too
const inviteSchema = baseSchema
  .extend({ email: z.string().trim().pipe(z.email(t('validation.email'))) })
  .refine(needsAgentCode, agentCodeRule)

type InviteValues = z.infer<typeof inviteSchema>

const statusBadge = (status: UserStatus) => (
  <Badge tone={status === 'ACTIVE' ? 'info' : status === 'DISABLED' ? 'danger' : 'muted'}>
    {tDynamic(`status.${status}`, status)}
  </Badge>
)

/** ROLE-4: only a GAD is offered the GAD role. The API enforces the same rule. */
function useRoleOptions() {
  const { data: me } = useMe()
  return TENANT_ROLES.filter((role) => role !== 'GAD' || hasRole(me, 'GAD')).map((role) => ({
    value: role,
    label: tDynamic(`role.${role}`, role),
  }))
}

/** The tree rank an account added by hand takes, from its highest agent role (as the API does). */
const RANK_OF_ROLE: [string, AgentRank][] = [
  ['GAD', 'SUM'],
  ['BM', 'BM'],
  ['UM', 'UM'],
  ['FC', 'FC'],
]

/**
 * Decided 26/11/2026: an account with an agent role whose code is not on the tree joins it on save,
 * under the manager picked here. The field always shows, so the dialog keeps its height; it is
 * off when the code is already on the tree (moving an agent belongs to the tree screen), when the
 * account has no agent role, or when the person may not edit the tree. Only agents of a higher rank
 * than the account's are offered (SUM > BM > UM > SA > FC), as the API requires.
 */
function ManagerField({ form }: { form: ReturnType<typeof useForm<InviteValues>> }) {
  const { data: me } = useMe()
  const canEditTree = hasPermission(me, 'agents.edit_tree')
  const tree = useQuery({ ...queries.agentTree(), enabled: canEditTree })
  const roles = form.watch('roles') ?? []
  const code = (form.watch('agentCode') ?? '').trim()
  const rank = RANK_OF_ROLE.find(([role]) => roles.includes(role))?.[1]
  const agents = tree.data?.items ?? []
  const onTree = code ? agents.find((agent) => agent.agentCode === code) : undefined
  const joins = canEditTree && !!rank && /^\d+$/.test(code) && !onTree
  // In tree order, so each choice still shows where it sits; then only those above the new rank
  const above = (agent: { rank: AgentRank }) => !!rank && AGENT_RANKS.indexOf(agent.rank) < AGENT_RANKS.indexOf(rank)
  const choices = pickerRows(agents).filter((row) => row.agent.agentCode !== code && (onTree || above(row.agent)))
  const picked = form.watch('managerCode')
  // A role change can leave a manager who is no longer above the account
  useEffect(() => {
    if (picked && !onTree && !choices.some((row) => row.agent.agentCode === picked)) form.setValue('managerCode', '')
  }, [picked, onTree, choices, form])
  const hint = !canEditTree
    ? t('users.managerNoRight')
    : onTree
      ? t('users.managerOnTree', { name: onTree.name })
      : joins
        ? t('users.managerJoins', { rank: rank! })
        : t('users.managerHint')
  const { errors } = form.formState
  return (
    <Field label={t('users.manager')} htmlFor="user-manager" error={errors.managerCode?.message} hint={hint}>
      <Select
        id="user-manager"
        disabled={!joins}
        aria-invalid={!!errors.managerCode}
        {...form.register('managerCode')}
        value={onTree ? (onTree.managerCode ?? '') : picked}
      >
        <option value="">{t('users.managerNone')}</option>
        {choices.map((row) => (
          <option key={row.agent.agentCode} value={row.agent.agentCode}>
            {pickerLabel(row)}
          </option>
        ))}
      </Select>
    </Field>
  )
}

function UserFormFields({ form, emailHint }: { form: ReturnType<typeof useForm<InviteValues>>; emailHint?: string }) {
  const roleOptions = useRoleOptions()
  const { errors } = form.formState
  const roles = form.watch('roles') ?? []
  return (
    <>
      <Field label={t('users.email')} htmlFor="user-email" required error={errors.email?.message} hint={emailHint}>
        <Input id="user-email" placeholder={t('placeholder.email')} type="email" aria-invalid={!!errors.email} {...form.register('email')} />
      </Field>
      <Field label={t('users.name')} htmlFor="user-name" required error={errors.name?.message}>
        <Input id="user-name" placeholder={t('placeholder.name')} aria-invalid={!!errors.name} {...form.register('name')} />
      </Field>
      <Field label={t('users.roles')} required error={errors.roles?.message}>
        <Controller
          control={form.control}
          name="roles"
          render={({ field }) => <ChipGroup label={t('users.roles')} options={roleOptions} value={field.value ?? []} onChange={field.onChange} />}
        />
      </Field>
      <Field label={t('users.agentCode')} htmlFor="user-agent" required={roles.some((role) => AGENT_ROLES.includes(role))} error={errors.agentCode?.message}>
          <Input id="user-agent" placeholder={t('placeholder.agentCode')} inputMode="numeric" aria-invalid={!!errors.agentCode} {...form.register('agentCode')} />
      </Field>
      <ManagerField form={form} />
    </>
  )
}

function InviteDialog({ onClose, onInvited }: { onClose: () => void; onInvited: (url: string, addedToTree: boolean, name: string) => void }) {
  const form = useForm<InviteValues>({ resolver: zodResolver(inviteSchema), defaultValues: { email: '', name: '', roles: [], agentCode: '', managerCode: '' } })
  const invite = useMutation({
    mutationFn: ({ agentCode, managerCode, ...values }: InviteValues) =>
      api.post<{ inviteUrl: string; addedToTree: boolean }>('/users/invite', { ...values, agentCode: agentCode || undefined, managerCode: managerCode || undefined }),
    onSuccess: ({ inviteUrl, addedToTree }, values) => onInvited(inviteUrl, addedToTree, values.name),
    onError: (error) => {
      const field = errorField(error, USER_FIELD_ERRORS)
      if (field) form.setError(field, { message: errorMessage(error) })
    },
  })
  return (
    <form noValidate onSubmit={form.handleSubmit((values) => invite.mutate(values))}>
      <UserFormFields form={form} />
      <FormError message={invite.isError && !errorField(invite.error, USER_FIELD_ERRORS) ? errorMessage(invite.error) : undefined} />
      <div className={MODAL_FOOTER}>
        <Button variant="secondary" onClick={onClose}>
          {t('common.cancel')}
        </Button>
        <Button type="submit" disabled={invite.isPending}>
          {t('users.invite')}
        </Button>
      </div>
    </form>
  )
}

function EditDialog({ user, onClose }: { user: User; onClose: () => void }) {
  const queryClient = useQueryClient()
  const form = useForm<InviteValues>({
    resolver: zodResolver(inviteSchema),
    defaultValues: { name: user.name, roles: user.roles, agentCode: user.agentCode ?? '', email: user.email, managerCode: '' },
  })
  const update = useMutation({
    mutationFn: ({ email, name, roles, agentCode, managerCode }: InviteValues) =>
      api.patch<{ addedToTree: boolean }>(`/users/${user.id}`, { ...(email !== user.email && { email }), name, roles, agentCode: agentCode || null, managerCode: managerCode || null }),
    onSuccess: async ({ addedToTree }, values) => {
      await Promise.all([queryClient.invalidateQueries({ queryKey: keys.users }), queryClient.invalidateQueries({ queryKey: keys.agents })])
      if (addedToTree) toast.success(t('toast.userAddedToTree', { name: values.name }), t('toast.userAddedToTreeDetail'))
      else toast.success(t('toast.userUpdated', { name: user.name }))
      onClose()
    },
    onError: (error) => {
      const field = errorField(error, USER_FIELD_ERRORS)
      if (field) form.setError(field, { message: errorMessage(error) })
    },
  })
  return (
    <form noValidate onSubmit={form.handleSubmit((values) => update.mutate(values))}>
      <UserFormFields form={form} emailHint={t('users.emailHint')} />
      <FormError message={update.isError && !errorField(update.error, USER_FIELD_ERRORS) ? errorMessage(update.error) : undefined} />
      <div className={MODAL_FOOTER}>
        <Button variant="secondary" onClick={onClose}>
          {t('common.cancel')}
        </Button>
        <Button type="submit" disabled={update.isPending}>
          {t('common.save')}
        </Button>
      </div>
    </form>
  )
}

const passwordSchema = z
  .object({
    password: z.string().min(8, t('validation.password')).max(128, t('validation.password')),
    confirm: z.string(),
  })
  .refine((values) => values.password === values.confirm, { path: ['confirm'], message: t('validation.passwordMatch') })
type PasswordValues = z.infer<typeof passwordSchema>

function SetPasswordDialog({ user, onClose }: { user: User; onClose: () => void }) {
  const form = useForm<PasswordValues>({ resolver: zodResolver(passwordSchema), defaultValues: { password: '', confirm: '' } })
  const change = useMutation({
    mutationFn: ({ password }: PasswordValues) => api.post(`/users/${user.id}/password`, { password }),
    onSuccess: () => {
      toast.success(t('toast.userPasswordChanged', { name: user.name }), t('toast.userPasswordDetail'))
      onClose()
    },
  })
  const { errors } = form.formState
  return (
    <form noValidate onSubmit={form.handleSubmit((values) => change.mutate(values))}>
      <p className="mb-3 text-caption text-ink-meta">{t('users.setPasswordHint')}</p>
      <Field label={t('users.newPassword')} htmlFor="admin-new-password" error={errors.password?.message}>
        <Input id="admin-new-password" placeholder={t('placeholder.newPassword')} type="password" autoComplete="new-password" aria-invalid={!!errors.password} {...form.register('password')} />
      </Field>
      <Field label={t('users.confirmPassword')} htmlFor="admin-confirm-password" error={errors.confirm?.message}>
        <Input id="admin-confirm-password" placeholder={t('placeholder.confirmPassword')} type="password" autoComplete="new-password" aria-invalid={!!errors.confirm} {...form.register('confirm')} />
      </Field>
      <FormError message={change.isError ? errorMessage(change.error) : undefined} />
      <div className={MODAL_FOOTER}>
        <Button variant="secondary" onClick={onClose}>
          {t('common.cancel')}
        </Button>
        <Button type="submit" disabled={change.isPending}>
          {t('users.setPassword')}
        </Button>
      </div>
    </form>
  )
}

/**
 * Open question 12e: after someone leaves, what is still in their name, as the toast's second line.
 * Lead managers only; anyone else gets the usual line.
 */
async function leftWork(queryClient: QueryClient, agentCode: string | null | undefined): Promise<string> {
  if (!agentCode) return t('toast.userDisabledDetail')
  const work = await queryClient.fetchQuery({ ...queries.departedWork(), staleTime: 0 }).catch(() => null)
  const item = work?.items.find((entry) => entry.agentCode === agentCode)
  return item ? t('departed.toastDetail', { leads: item.openLeads, clients: item.clients }) : t('toast.userDisabledDetail')
}

const archiveSchema = z.object({ reason: z.string().trim().max(200) })
type ArchiveValues = z.infer<typeof archiveSchema>

/** USER-9, USER-10: archiving is for people who left; it says plainly what goes and what stays. */
function ArchiveDialog({ user, onClose, onArchived }: { user: User; onClose: () => void; onArchived: () => Promise<void> }) {
  const queryClient = useQueryClient()
  const form = useForm<ArchiveValues>({ resolver: zodResolver(archiveSchema), defaultValues: { reason: '' } })
  const archive = useMutation({
    mutationFn: ({ reason }: ArchiveValues) => api.post(`/users/${user.id}/archive`, { reason: reason || undefined }),
    onSuccess: async () => {
      await onArchived()
      toast.warning(t('toast.userArchived', { name: user.name }), await leftWork(queryClient, user.agentCode))
      onClose()
    },
  })
  const { errors } = form.formState
  return (
    <form noValidate onSubmit={form.handleSubmit((values) => archive.mutate(values))}>
      <p className="mb-3 text-link">{t('users.archiveHint')}</p>
      <Field label={t('users.archiveReason')} htmlFor="archive-reason" error={errors.reason?.message}>
        <Input id="archive-reason" placeholder={t('placeholder.archiveReason')} maxLength={200} {...form.register('reason')} />
      </Field>
      <FormError message={archive.isError ? errorMessage(archive.error) : undefined} />
      <div className={MODAL_FOOTER}>
        <Button variant="secondary" onClick={onClose}>
          {t('common.cancel')}
        </Button>
        <Button type="submit" variant="danger" disabled={archive.isPending}>
          {t('users.archive')}
        </Button>
      </div>
    </form>
  )
}

type PendingAction = { kind: 'disable' | 'reactivate' | 'revoke' | 'mfaReset'; user: User }

export function UsersPage() {
  const { data: me } = useMe()
  const queryClient = useQueryClient()
  const url = useUrlState()
  const { page } = url
  const search = useListSearch(url)
  const q = search.committed
  const status = url.oneOf('status', STATUSES)
  const role = url.oneOf('role', TENANT_ROLES)
  const order = url.oneOf('order', ['asc', 'desc']) as 'asc' | 'desc' | ''
  const inviting = url.get('invite') === '1'
  const editId = url.get('edit')
  const passwordId = url.get('passwordFor')
  const [link, setLink] = useState<string | null>(null)
  const [pending, setPending] = useState<PendingAction | null>(null)
  const [resetting, setResetting] = useState<User | null>(null)
  const [resetLink, setResetLink] = useState<string | null>(null)
  const [reactivateLink, setReactivateLink] = useState<string | null>(null)
  const [archiving, setArchiving] = useState<User | null>(null)

  const params = { page, pageSize: url.pageSize, q, status, role, order }
  const users = useQuery(queries.users(params))
  const now = useNow()
  const presenceOf = usePresenceInfo((users.data?.items ?? []).filter((user) => user.status === 'ACTIVE').map((user) => user.id))
  /** K5: "Trực tuyến từ 08:15" / "Hoạt động 12 phút trước", for accounts that can sign in. */
  const activity = (user: User) => (user.status === 'ACTIVE' ? presenceText(presenceOf(user.id), now) : null)
  usePrefetchNextPage(queries.users, params, users.data)
  const refresh = () => queryClient.invalidateQueries({ queryKey: keys.users })
  useLeaveEmptyPage(url, users.data?.items.length)

  // The dialog state is only an id in the URL, so after a reload the user may not be on the current page
  const targetId = editId || passwordId
  const target = useQuery({ ...queries.user(targetId ?? ''), enabled: !!targetId })
  const targetFailed = target.isError
  useEffect(() => {
    if (targetFailed) url.set({ edit: null, passwordFor: null })
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [targetFailed])

  const newLink = useMutation({
    mutationFn: (user: User) => api.post<{ inviteUrl: string }>(`/users/${user.id}/invite`),
    onSuccess: ({ inviteUrl }, user) => {
      setLink(inviteUrl)
      toast.info(t('toast.inviteRenewed', { name: user.name }), t('toast.inviteRenewedDetail'))
    },
    onError: (error) => toast.error(t('toast.inviteRenewFailed'), errorMessage(error)),
  })
  const createReset = useMutation({
    mutationFn: (user: User) => api.post<{ resetUrl: string }>(`/users/${user.id}/password-reset`),
    onSuccess: ({ resetUrl }, user) => {
      setResetting(null)
      setResetLink(resetUrl)
      toast.info(t('toast.resetLinkCreated', { name: user.name }))
    },
  })
  const act = useMutation({
    mutationFn: async ({ kind, user }: PendingAction): Promise<string | null> => {
      if (kind === 'revoke') await api.delete(`/users/${user.id}`)
      else if (kind === 'disable') await api.post(`/users/${user.id}/disable`)
      // USER-16: a lost phone
      else if (kind === 'mfaReset') await api.post(`/users/${user.id}/mfa/reset`)
      // USER-11: the old password is gone, so coming back means a new invite
      else return (await api.post<{ inviteUrl: string }>(`/users/${user.id}/reactivate`)).inviteUrl
      return null
    },
    onSuccess: async (inviteUrl, { kind, user }) => {
      await refresh()
      if (kind === 'reactivate') {
        setReactivateLink(inviteUrl)
        toast.success(t('toast.userReactivated', { name: user.name }), t('toast.userReactivatedDetail'))
      } else if (kind === 'mfaReset') toast.info(t('toast.mfaReset', { name: user.name }), t('toast.mfaResetDetail'))
      else if (kind === 'disable') toast.warning(t('toast.userDisabled', { name: user.name }), await leftWork(queryClient, user.agentCode))
      else toast.warning(t('toast.inviteRevoked', { name: user.name }))
      setPending(null)
    },
  })

  const confirmMessage: Record<PendingAction['kind'], 'users.confirmDisable' | 'users.confirmReactivate' | 'users.confirmRevoke' | 'users.confirmMfaReset'> = {
    mfaReset: 'users.confirmMfaReset',
    disable: 'users.confirmDisable',
    reactivate: 'users.confirmReactivate',
    revoke: 'users.confirmRevoke',
  }
  // ROLE-4: only a GAD can act on a GAD account
  const canManage = (user: User) => !user.roles.includes('GAD') || hasRole(me, 'GAD')

  const manageable = target.data && canManage(target.data) ? target.data : null
  const editing = editId ? manageable : null
  const settingPassword = passwordId && passwordId !== me?.user.id ? manageable : null

  const rowMenu = (user: User): RowMenuItem[] => {
    const archive = { label: t('users.archive'), danger: true, onSelect: () => setArchiving(user) }
    if (user.status === 'INVITED') {
      return [
        { label: t('users.newLink'), disabled: newLink.isPending, onSelect: () => newLink.mutate(user) },
        // USER-14: someone who once signed in has history, so they are archived rather than deleted
        user.lastLoginAt ? archive : { label: t('users.revoke'), danger: true, onSelect: () => setPending({ kind: 'revoke', user }) },
      ]
    }
    if (user.id === me?.user.id) return []
    const reactivate = { label: t('users.reactivate'), onSelect: () => setPending({ kind: 'reactivate', user }) }
    if (user.status === 'ARCHIVED') return [reactivate]
    if (user.status === 'DISABLED') return [reactivate, archive]
    return [
      { label: t('users.setPassword'), onSelect: () => url.set({ passwordFor: user.id }, { push: true }) },
      { label: t('users.resetPassword'), onSelect: () => setResetting(user) },
      ...(user.mfaEnabled ? [{ label: t('users.mfaReset'), onSelect: () => setPending({ kind: 'mfaReset', user }) }] : []),
      { label: t('users.disable'), danger: true, onSelect: () => setPending({ kind: 'disable', user }) },
      archive,
    ]
  }

  const actions = (user: User) => {
    if (!canManage(user)) return null
    const items = rowMenu(user)
    return (
      <span className="flex items-center gap-1">
        <Button variant="ghost" onClick={() => url.set({ edit: user.id }, { push: true })}>
          {t('users.edit')}
        </Button>
        {items.length > 0 && <RowMenu label={t('common.more')} items={items} />}
      </span>
    )
  }

  const roleBadges = (user: User) => (
    <span className="flex flex-wrap gap-1">
      {user.roles.map((role) => (
        <Badge key={role}>{tDynamic(`role.${role}`, role)}</Badge>
      ))}
    </span>
  )

  return (
    <>
      <PageHeader title={t('users.title')} action={<Button onClick={() => url.set({ invite: 1 }, { push: true })}>{t('users.invite')}</Button>} />
      {/* Open question 12e: who left with leads or clients still in their name */}
      {hasPermission(me, 'leads.manage') && (
        <Container className="flex-none pb-3">
          <DepartedWorkNotice variant="users" />
        </Container>
      )}

      <FilterBand className="flex flex-col gap-3 sm:flex-row sm:flex-wrap sm:items-end lg:flex-nowrap">
        <FilterField label={t('common.search')} className="lg:min-w-48 lg:flex-1">
          <SearchInput label={t('common.search')} placeholder={t('users.searchPlaceholder')} value={search.input} onValueChange={search.onChange} />
        </FilterField>
        <FilterField label={t('users.roles')} className="sm:w-52 sm:flex-none">
          <Select value={role} onChange={(event) => url.set({ role: event.target.value, page: null })}>
            <option value="">{t('audit.allRoles')}</option>
            {TENANT_ROLES.map((value) => (
              <option key={value} value={value}>
                {tDynamic(`role.${value}`, value)}
              </option>
            ))}
          </Select>
        </FilterField>
        <FilterField label={t('users.status')} className="sm:w-52 sm:flex-none">
          <Select value={status} onChange={(event) => url.set({ status: event.target.value, page: null })}>
            <option value="">{t('common.allStatuses')}</option>
            {STATUSES.map((value) => (
              <option key={value} value={value}>
                {tDynamic(`status.${value}`, value)}
              </option>
            ))}
          </Select>
        </FilterField>
        <ClearFilters active={!!(search.input || role || status)} onClear={() => url.set({ q: null, role: null, status: null, page: null })} />
      </FilterBand>

      <Card>
        {users.isPending && <Spinner />}
        {users.isError && <Alert className="m-4">{errorMessage(users.error)}</Alert>}
        {users.data && users.data.items.length === 0 && <EmptyState>{t('users.empty')}</EmptyState>}
        {users.data && users.data.items.length > 0 && (
          <>
            <TableScroll loading={users.isPlaceholderData}>
            {/* Section 21.2: stacked cards on phones, a table on larger screens */}
            <ul className="divide-y divide-band md:hidden">
              {users.data.items.map((user) => (
                <li key={user.id} className="space-y-2 py-4">
                  <div className="flex items-start justify-between gap-2">
                    <div className="min-w-0">
                      <p className="flex items-center gap-1.5 font-medium text-ink">
                        <PresenceDot status={presenceOf(user.id).status} label={activity(user) ?? undefined} />
                        {user.name}
                      </p>
                      <p className="truncate text-caption text-ink-meta">{user.email}</p>
                      {activity(user) && <p className="text-caption text-ink-meta">{activity(user)}</p>}
                    </div>
                    {statusBadge(user.status)}
                  </div>
                  {roleBadges(user)}
                  {user.agentCode && (
                    <p className="text-caption text-ink-meta">
                      {t('users.agentCode')}: {user.agentCode}
                    </p>
                  )}
                  {actions(user)}
                </li>
              ))}
            </ul>
            <div className="hidden md:block">
              <table className="data-table min-w-[960px] table-fixed">
                <colgroup>
                  <col />
                  <col className="w-[230px]" />
                  <col className="w-[110px]" />
                  <col className="w-[140px]" />
                  <col className="w-[172px]" />
                  <col className="w-[160px]" />
                </colgroup>
                <thead>
                  <tr>
                    <th>{t('users.name')}</th>
                    <th>{t('users.roles')}</th>
                    <th>{t('users.agentCode')}</th>
                    <th>{t('users.status')}</th>
                    <th aria-sort={order === 'asc' ? 'ascending' : order === 'desc' ? 'descending' : 'none'}>
                      <SortButton label={t('users.lastLogin')} direction={order || null} onToggle={() => url.set({ order: order === '' ? 'desc' : order === 'desc' ? 'asc' : null, page: null })} />
                    </th>
                    <th className="col-actions">{t('common.actions')}</th>
                  </tr>
                </thead>
                <tbody>
                  {users.data.items.map((user) => (
                    <tr key={user.id}>
                      <td>
                        <p className="flex min-w-0 items-center gap-1.5 font-medium text-ink">
                          <PresenceDot status={presenceOf(user.id).status} label={activity(user) ?? undefined} />
                          <span title={user.name} className="truncate">
                            {user.name}
                          </span>
                        </p>
                        <p title={user.email} className="truncate text-ink-meta">{user.email}</p>
                        {activity(user) && <p className="truncate text-xs text-ink-meta">{activity(user)}</p>}
                      </td>
                      <td>{roleBadges(user)}</td>
                      <td title={user.agentName === null ? t('users.agentNotOnTree') : (user.agentName ?? undefined)} className="truncate">
                        {user.agentCode ?? '-'}
                        {user.agentName === null && <span className="ml-1 text-warning">{t('users.agentNotOnTreeMark')}</span>}
                      </td>
                      <td>{statusBadge(user.status)}</td>
                      <td className="whitespace-nowrap text-ink-meta">{formatDateTime(user.lastLoginAt)}</td>
                      <td className="col-actions">{actions(user)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            </TableScroll>
            <Pagination page={users.data.page} pageSize={users.data.pageSize} total={users.data.total} onPage={url.setPage} onPageSize={url.setPageSize} />
          </>
        )}
      </Card>

      <Dialog title={t('users.inviteTitle')} open={inviting} onClose={() => url.set({ invite: null })}>
        <InviteDialog
          onClose={() => url.set({ invite: null })}
          onInvited={(createdLink, addedToTree, name) => {
            url.set({ invite: null })
            setLink(createdLink)
            toast.success(t('toast.userInvited'), addedToTree ? t('toast.userInvitedTreeDetail', { name }) : t('toast.userInvitedDetail'))
            void refresh()
            if (addedToTree) void queryClient.invalidateQueries({ queryKey: keys.agents })
          }}
        />
      </Dialog>

      <Dialog title={t('users.editTitle')} open={!!editing} onClose={() => url.set({ edit: null })}>
        {editing && <EditDialog user={editing} onClose={() => url.set({ edit: null })} />}
      </Dialog>

      <Dialog title={t('users.inviteLinkTitle')} open={!!link} onClose={() => setLink(null)}>
        {link && <CopyLink url={link} hint={t('users.inviteLinkHint')} onClose={() => setLink(null)} />}
      </Dialog>

      <Dialog title={settingPassword ? t('users.setPasswordTitle', { name: settingPassword.name }) : ''} open={!!settingPassword} onClose={() => url.set({ passwordFor: null })}>
        {settingPassword && <SetPasswordDialog user={settingPassword} onClose={() => url.set({ passwordFor: null })} />}
      </Dialog>

      <Dialog title={t('users.reactivateLinkTitle')} open={!!reactivateLink} onClose={() => setReactivateLink(null)}>
        {reactivateLink && <CopyLink url={reactivateLink} hint={t('users.reactivateLinkHint')} onClose={() => setReactivateLink(null)} />}
      </Dialog>

      <Dialog title={archiving ? t('users.archiveTitle', { name: archiving.name }) : ''} open={!!archiving} onClose={() => setArchiving(null)}>
        {archiving && <ArchiveDialog user={archiving} onClose={() => setArchiving(null)} onArchived={refresh} />}
      </Dialog>

      <Dialog title={t('users.resetLinkTitle')} open={!!resetLink} onClose={() => setResetLink(null)}>
        {resetLink && <CopyLink url={resetLink} hint={t('users.resetLinkHint')} onClose={() => setResetLink(null)} />}
      </Dialog>

      <ConfirmDialog
        message={resetting ? t('users.confirmReset', { name: resetting.name }) : null}
        pending={createReset.isPending}
        error={createReset.isError ? errorMessage(createReset.error) : undefined}
        onConfirm={() => resetting && createReset.mutate(resetting)}
        onClose={() => {
          setResetting(null)
          createReset.reset()
        }}
      />

      <ConfirmDialog
        message={pending ? t(confirmMessage[pending.kind], { name: pending.user.name }) : null}
        danger={pending?.kind !== 'reactivate'}
        pending={act.isPending}
        error={act.error instanceof ApiError ? errorMessage(act.error) : undefined}
        onConfirm={() => pending && act.mutate(pending)}
        onClose={() => {
          setPending(null)
          act.reset()
        }}
      />
    </>
  )
}
