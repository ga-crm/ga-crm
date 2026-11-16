import { Menu } from 'lucide-react'
import { Fragment } from 'react'
import type { CSSProperties } from 'react'
import { Link, Outlet, useLocation } from 'react-router-dom'
import { Breadcrumb, BreadcrumbItem, BreadcrumbLink, BreadcrumbList, BreadcrumbPage, BreadcrumbSeparator } from '@/components/shadcn/breadcrumb'
import { SidebarInset, SidebarProvider, useSidebar } from '@/components/shadcn/sidebar'
import { useMe } from '../auth/useMe'
import { t } from '../i18n'
import { breadcrumbTrail } from '../lib/nav'
import { useRealtime } from '../lib/realtime'
import { useSidebarCollapsed } from '../lib/useSidebarCollapsed'
import { AccountMenu } from './AccountMenu'
import { ChatButton } from './chat/ChatButton'
import { DevAccountSwitcher } from './DevAccountSwitcher'
import { NotificationBell } from './NotificationBell'
import { AppSidebar } from './Sidebar'
import { CONTAINER, IconButton, Logo } from './ui'

/** The sidebar is 224 px wide, or 56 px when collapsed to icons (the widths the app always had). */
const SIDEBAR_WIDTHS = { '--sidebar-width': '14rem', '--sidebar-width-icon': '3.5rem' } as CSSProperties

/** Below 1024 px the sidebar is a drawer; this opens it. */
function MenuButton() {
  const { openMobile, toggleSidebar } = useSidebar()
  return (
    <IconButton tone="neutral" label={t('nav.openMenu')} aria-expanded={openMobile} onClick={toggleSidebar} className="-ml-2 md:size-11 lg:hidden">
      <Menu aria-hidden size={20} />
    </IconButton>
  )
}

/**
 * Application frame sized to the viewport: the page never scrolls, only the content pane does.
 * shadcn/ui SidebarProvider holds the sidebar's state; the app remembers "collapsed" on this browser.
 */
export function AppShell() {
  const { data: me } = useMe()
  const { pathname } = useLocation()
  const [collapsed, setCollapsed] = useSidebarCollapsed()
  useRealtime(me?.user.id)

  if (!me) return null

  const trail = breadcrumbTrail(me, pathname)

  return (
    <SidebarProvider open={!collapsed} onOpenChange={(open) => setCollapsed(!open)} style={SIDEBAR_WIDTHS} className="h-dvh min-h-0 overflow-hidden">
      <AppSidebar me={me} />
      <SidebarInset className="min-h-0 min-w-0 overflow-hidden">
        <header className="z-30 flex h-15 flex-none items-center justify-between gap-4 bg-chrome px-4">
          <div className="flex min-w-0 items-center gap-2">
            <MenuButton />
            {/* From 1024 px the logo sits at the top of the sidebar */}
            <div className="flex-none lg:hidden">
              <Logo />
            </div>
            <p className="min-w-0 truncate pl-2 text-nav font-medium text-ink lg:pl-2">{me.tenant?.name ?? t('home.platform')}</p>
          </div>
          <div className="flex flex-none items-center gap-1 sm:gap-2">
            {/* NTF-1: notifications belong to a GA's users */}
            {me.tenant && <ChatButton />}
            {me.tenant && <NotificationBell />}
            {/* Testing only: hidden unless DEV_ACCOUNT_SWITCHER is on and this is a development build */}
            {import.meta.env.DEV && <DevAccountSwitcher me={me} />}
            <AccountMenu me={me} />
          </div>
        </header>

        {trail.length > 0 && (
          <Breadcrumb aria-label={t('nav.breadcrumb')} className={`${CONTAINER} flex-none pt-3`}>
            <BreadcrumbList className="flex-nowrap gap-1 text-caption text-ink-nav sm:gap-1.5">
              {trail.map((crumb, index) => {
                const last = index === trail.length - 1
                return (
                  <Fragment key={`${crumb.label}-${index}`}>
                    <BreadcrumbItem className={`min-w-0 ${last ? '' : 'flex-none'}`}>
                      {last ? (
                        <BreadcrumbPage className="truncate font-medium text-ink">{t(crumb.label)}</BreadcrumbPage>
                      ) : crumb.to ? (
                        <BreadcrumbLink asChild className="hover:text-ink">
                          <Link to={crumb.to}>{t(crumb.label)}</Link>
                        </BreadcrumbLink>
                      ) : (
                        <span>{t(crumb.label)}</span>
                      )}
                    </BreadcrumbItem>
                    {!last && <BreadcrumbSeparator className="flex-none" />}
                  </Fragment>
                )
              })}
            </BreadcrumbList>
          </Breadcrumb>
        )}

        <main className="flex min-h-0 flex-1 flex-col overflow-y-auto">
          <Outlet />
        </main>
      </SidebarInset>
    </SidebarProvider>
  )
}
