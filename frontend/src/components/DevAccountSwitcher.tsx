import { useMutation, useQuery } from '@tanstack/react-query'
import { Check, UsersRound } from 'lucide-react'
import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { CommandDialog, CommandEmpty, CommandGroup, CommandInput, CommandItem, CommandList } from '@/components/shadcn/command'
import { t, tDynamic } from '../i18n'
import { api, errorMessage } from '../lib/api'
import { queries } from '../lib/queries'
import { setSessionUser } from '../lib/queryClient'
import { toast } from '../lib/toast'
import type { DevAccount, Me } from '../lib/types'
import { buttonClass } from './buttonStyles'
import { Badge } from './ui'

function initials(name: string): string {
  const words = name.trim().split(/\s+/).filter((word) => /\p{L}/u.test(word))
  const letters = words.length > 1 ? [words[0], words[words.length - 1]] : words
  return letters.map((word) => word[0].toUpperCase()).join('') || '?'
}

/** Accounts grouped by GA, the platform first, as the API orders them. */
function byGa(items: DevAccount[]) {
  const groups = new Map<string, { heading: string; items: DevAccount[] }>()
  for (const item of items) {
    const key = item.gaCode ?? ''
    const heading = item.gaCode ? `${item.gaCode} · ${item.gaName ?? ''}` : t('devSwitch.platform')
    const group = groups.get(key) ?? { heading, items: [] }
    group.items.push(item)
    groups.set(key, group)
  }
  return [...groups.values()]
}

/**
 * Testing aid: sign in as any account of any GA in one step, to try roles and line scopes quickly.
 * Shown only when the API has DEV_ACCOUNT_SWITCHER=true and the frontend runs in development; the API
 * refuses that setting in production, and production builds never ask for the list.
 */
export function DevAccountSwitcher({ me, variant = 'header' }: { me?: Me | null; variant?: 'header' | 'login' }) {
  const [open, setOpen] = useState(false)
  const navigate = useNavigate()
  const accounts = useQuery(queries.devAccounts())

  const switchTo = useMutation({
    mutationFn: (account: DevAccount) => api.post<Me>('/dev/switch', { userId: account.id }),
    onSuccess: (next) => {
      setOpen(false)
      setSessionUser(next)
      toast.success(t('toast.accountSwitched', { name: next.user.name }))
      navigate('/', { replace: true })
    },
    onError: (error) => toast.error(t('toast.accountSwitchFailed'), errorMessage(error)),
  })

  if (!import.meta.env.DEV || !accounts.data) return null

  return (
    <>
      <button
        type="button"
        aria-label={variant === 'login' ? undefined : t('devSwitch.button')}
        title={variant === 'login' ? undefined : t('devSwitch.button')}
        onClick={() => setOpen(true)}
        className={
          variant === 'login'
            ? buttonClass('secondary', 'w-full')
            : 'flex min-h-11 cursor-pointer items-center gap-2 rounded-md px-2 text-caption text-ink-nav hover:bg-band hover:text-ink'
        }
      >
        <UsersRound aria-hidden size={18} className="flex-none" />
        <span className={variant === 'login' ? '' : 'hidden md:inline'}>{variant === 'login' ? t('devSwitch.loginButton') : t('devSwitch.button')}</span>
      </button>

      <CommandDialog
        open={open}
        onOpenChange={setOpen}
        title={t('devSwitch.title')}
        description={t('devSwitch.description')}
        // Pinned near the top, so the box does not move while the list is filtered
        className="top-[10dvh] w-[calc(100%-2rem)] translate-y-0 border-hairline bg-canvas text-ink-body sm:max-w-xl"
      >
        {/* The dialog is named by its hidden title; this repeats it on screen */}
        <div aria-hidden className="flex items-center justify-between gap-3 border-b border-band px-4 py-3">
          <div className="min-w-0">
            <p className="text-subhead font-medium text-ink">{t('devSwitch.title')}</p>
            <p className="mt-1 text-caption text-ink-meta">{t('devSwitch.description')}</p>
          </div>
        </div>
        <CommandInput placeholder={t('devSwitch.search')} className="text-link md:text-caption" />
        <CommandList className="max-h-[min(28rem,60dvh)]">
          <CommandEmpty className="py-6 text-center text-caption text-ink-meta">{t('devSwitch.empty')}</CommandEmpty>
          {byGa(accounts.data.items).map((group) => (
            <CommandGroup key={group.heading} heading={group.heading} className="text-ink-body [&_[cmdk-group-heading]]:text-caption">
              {group.items.map((account) => {
                const active = account.status === 'ACTIVE' && account.tenantStatus !== 'suspended'
                const current = me?.user.id === account.id
                const roles = account.roles.map((role) => tDynamic(`role.${role}`, role)).join(', ')
                return (
                  <CommandItem
                    key={account.id}
                    // cmdk filters on this text, so name, email, roles and GA all find the account
                    value={`${account.name} ${account.email} ${roles} ${account.gaCode ?? t('devSwitch.platform')} ${account.agentCode ?? ''}`}
                    disabled={!active || current || switchTo.isPending}
                    onSelect={() => switchTo.mutate(account)}
                    className="cursor-pointer gap-3 rounded-md px-2 py-2 data-[selected=true]:bg-chrome"
                  >
                    <span aria-hidden className="flex size-8 flex-none items-center justify-center rounded-md bg-primary text-caption font-medium text-on-primary">
                      {initials(account.name)}
                    </span>
                    <span className="min-w-0 flex-1">
                      <span className="block truncate text-caption font-medium text-ink">{account.name}</span>
                      <span className="block truncate text-caption text-ink-meta">
                        {account.email} · {roles}
                      </span>
                    </span>
                    {current && (
                      <span className="flex flex-none items-center gap-1 text-caption text-primary-deep">
                        <Check aria-hidden size={14} />
                        {t('devSwitch.current')}
                      </span>
                    )}
                    {!active && (
                      <span className="flex-none">
                        <Badge tone="muted">{tDynamic(`status.${account.status}`, account.status)}</Badge>
                      </span>
                    )}
                  </CommandItem>
                )
              })}
            </CommandGroup>
          ))}
        </CommandList>
      </CommandDialog>
    </>
  )
}
