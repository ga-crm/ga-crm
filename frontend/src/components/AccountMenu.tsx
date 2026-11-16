import { useMutation } from '@tanstack/react-query'
import { ChevronDown, ChevronRight, LogOut, Settings } from 'lucide-react'
import { useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { t, tDynamic } from '../i18n'
import { api } from '../lib/api'
import { setSessionUser } from '../lib/queryClient'
import { toast } from '../lib/toast'
import type { Me } from '../lib/types'
import { SidePanel } from './SidePanel'

function initials(name: string): string {
  const words = name.trim().split(/\s+/).filter((word) => /\p{L}/u.test(word))
  const letters = words.length > 1 ? [words[0], words[words.length - 1]] : words
  return letters.map((word) => word[0].toUpperCase()).join('') || '?'
}

/**
 * The avatar in the global bar opens a panel on the right (shadcn/ui Drawer): who is signed in,
 * where, a way to Settings, and sign-out.
 */
export function AccountMenu({ me }: { me: Me }) {
  const navigate = useNavigate()
  const [open, setOpen] = useState(false)

  const signOut = useMutation({
    mutationFn: () => api.post('/auth/sign-out'),
    onSettled: () => {
      setSessionUser(null)
      toast.info(t('toast.signedOut'))
      navigate('/login', { replace: true })
    },
  })

  const avatar = (size: 'sm' | 'lg') => (
    <span
      aria-hidden
      className={`flex shrink-0 items-center justify-center rounded-md bg-primary font-medium text-on-primary ${size === 'lg' ? 'size-12 text-link' : 'size-8 text-caption'}`}
    >
      {initials(me.user.name)}
    </span>
  )
  const facts = [
    { label: t('invite.ga'), value: me.tenant?.name ?? t('home.platform') },
    { label: t('home.roles'), value: me.roles.map((role) => tDynamic(`role.${role}`, role)).join(', ') },
    ...(me.user.agentCode ? [{ label: t('home.agentCode'), value: me.user.agentCode }] : []),
    { label: t('home.reach'), value: tDynamic(`reach.${me.reach}`, me.reach) },
  ]

  return (
    <SidePanel
      open={open}
      onOpenChange={setOpen}
      title={t('account.menu')}
      trigger={
        <button
          type="button"
          aria-label={t('account.menu')}
          className="group flex min-h-11 cursor-pointer items-center gap-2 rounded-md text-nav text-ink-nav hover:text-ink"
        >
          {avatar('sm')}
          <span className="hidden max-w-48 truncate sm:inline">{me.user.name}</span>
          <ChevronDown aria-hidden size={16} className="shrink-0 transition-transform group-data-[state=open]:rotate-180 motion-reduce:transition-none" />
        </button>
      }
      footer={
        <button
          type="button"
          disabled={signOut.isPending}
          onClick={() => signOut.mutate()}
          className="flex min-h-11 w-full cursor-pointer items-center gap-3 rounded-md px-3 text-nav text-ink-nav hover:bg-band hover:text-ink disabled:cursor-default disabled:opacity-60"
        >
          <LogOut aria-hidden size={18} className="shrink-0" />
          {t('nav.signOut')}
        </button>
      }
    >
      <div className="flex items-center gap-4 px-5 pt-5 pb-4">
        {avatar('lg')}
        <div className="min-w-0">
          <p className="truncate text-subhead text-ink">{me.user.name}</p>
          <p className="mt-1 truncate text-caption text-ink-meta">{me.user.email}</p>
        </div>
      </div>
      <dl className="mx-5 divide-y divide-band rounded-md border border-band px-4 text-caption">
        {facts.map((fact) => (
          <div key={fact.label} className="flex justify-between gap-4 py-3">
            <dt className="flex-none text-ink-meta">{fact.label}</dt>
            <dd className="min-w-0 truncate text-right text-ink-body" title={fact.value}>
              {fact.value}
            </dd>
          </div>
        ))}
      </dl>
      <Link
        to="/settings"
        onClick={() => setOpen(false)}
        className="mx-2 mt-3 mb-2 flex min-h-11 items-center gap-3 rounded-md px-3 text-nav text-ink-nav hover:bg-chrome hover:text-ink"
      >
        <Settings aria-hidden size={18} className="shrink-0" />
        <span className="flex-1">{t('nav.settings')}</span>
        <ChevronRight aria-hidden size={16} className="shrink-0 text-ink-meta" />
      </Link>
    </SidePanel>
  )
}
