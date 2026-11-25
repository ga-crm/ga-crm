import { useQueryClient } from '@tanstack/react-query'
import { ChevronDown, ChevronLeft, PanelLeftClose, X } from 'lucide-react'
import { Link, useLocation } from 'react-router-dom'
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from '@/components/shadcn/collapsible'
import {
  Sidebar,
  SidebarContent,
  SidebarFooter,
  SidebarGroup,
  SidebarGroupContent,
  SidebarGroupLabel,
  SidebarHeader,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
  SidebarRail,
  useSidebar,
} from '@/components/shadcn/sidebar'
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/shadcn/tooltip'
import { t } from '../i18n'
import { activeNavItem, NAV_ITEMS } from '../lib/nav'
import type { NavItem } from '../lib/nav'
import type { Me } from '../lib/types'
import { useNavGroups } from '../lib/useNavGroups'
import { Logo, TOOLTIP_CLASS } from './ui'

/**
 * The app's rows on shadcn/ui SidebarMenuButton: 44 px touch rows on phones and 36 px from 1024 px
 * (design system), blue only on the current row, and a 40 px square when collapsed to icons.
 */
const ROW =
  'h-11 gap-3 pl-[11px] text-caption text-ink-nav hover:bg-band hover:text-ink lg:h-9 [&>svg]:size-[18px] ' +
  'data-[active=true]:bg-band-blue data-[active=true]:text-primary-deep data-[active=true]:hover:bg-band-blue ' +
  'group-data-[collapsible=icon]:size-10! group-data-[collapsible=icon]:p-[11px]!'

/** The row's name while the sidebar shows only icons, in the app's tooltip style. */
const tip = (label: string) => ({ children: label, className: TOOLTIP_CLASS, sideOffset: 8 })

/**
 * The navigation (shadcn/ui Sidebar): fixed beside the content from 1024 px up, collapsible to icons
 * with a tooltip per row (Ctrl/⌘ + B, the round button or the rail on its edge, or "Thu gọn"); below 1024 px it opens as
 * a drawer from the menu button. Groups fold and remember it; Settings sits at the bottom.
 */
export function AppSidebar({ me }: { me: Me }) {
  const queryClient = useQueryClient()
  const { pathname } = useLocation()
  const { isMobile, setOpenMobile, state, toggleSidebar } = useSidebar()
  const collapsed = state === 'collapsed' && !isMobile
  const toggleLabel = collapsed ? t('nav.expand') : t('nav.collapse')

  const items = NAV_ITEMS.filter((item) => item.visible(me) && !item.parent)
  const groups = [...new Set(items.filter((item) => !item.bottom).map((item) => item.group))]
  const current = activeNavItem(me, pathname)
  // A screen opened from a button lights the row it belongs to
  const active = current?.parent ? (items.find((item) => item.to === current.parent) ?? current) : current
  const { isOpen, toggle } = useNavGroups(active?.group)

  const row = ({ to, label, icon: Icon, chunk, prefetch }: NavItem) => (
    <SidebarMenuItem key={to}>
      <SidebarMenuButton asChild isActive={active?.to === to} tooltip={tip(t(label))} className={ROW}>
        <Link
          to={to}
          aria-current={active?.to === to ? 'page' : undefined}
          onClick={() => isMobile && setOpenMobile(false)}
          onPointerEnter={() => {
            void chunk?.()
            if (prefetch) void queryClient.prefetchQuery(prefetch())
          }}
        >
          <Icon aria-hidden />
          <span>{t(label)}</span>
        </Link>
      </SidebarMenuButton>
    </SidebarMenuItem>
  )
  const menu = (list: NavItem[]) => <SidebarMenu className="gap-0.5">{list.map(row)}</SidebarMenu>

  return (
    // Bands separate the chrome from the content (design system), so no border on the edge
    // z-20 keeps the edge button above sticky table cells in the content
    <Sidebar collapsible="icon" className="z-20 group-data-[side=left]:border-r-0">
      <SidebarHeader className="h-15 flex-none flex-row items-center justify-between overflow-hidden px-3 py-0 group-data-[collapsible=icon]:px-3">
        <Logo compact={collapsed} />
        {isMobile && (
          <button
            type="button"
            aria-label={t('common.close')}
            onClick={() => setOpenMobile(false)}
            className="flex size-11 cursor-pointer items-center justify-center rounded-md text-ink-nav hover:bg-band"
          >
            <X aria-hidden size={20} />
          </button>
        )}
      </SidebarHeader>

      {/* Collapsed to icons the list can still be taller than the window, so it keeps scrolling.
          It scrolls without showing a bar (`scrollbar-none` in index.css) */}
      <SidebarContent className="scrollbar-none gap-0 overflow-x-hidden group-data-[collapsible=icon]:overflow-y-auto">
        <nav aria-label={t('nav.main')}>
          {groups.map((group) =>
            !group ? (
              <SidebarGroup key="main" className="py-1">
                {menu(items.filter((item) => !item.group && !item.bottom))}
              </SidebarGroup>
            ) : (
              // Collapsed to icons there is nowhere to show a group name, so every row stays reachable
              <Collapsible key={group} open={collapsed || isOpen(group)} onOpenChange={() => toggle(group)} asChild>
                <SidebarGroup className="group/collapsible py-1">
                  <SidebarGroupLabel asChild className="cursor-pointer pr-2 pl-[11px] text-ink-meta hover:text-ink">
                    <CollapsibleTrigger disabled={collapsed}>
                      {t(group)}
                      <ChevronDown
                        aria-hidden
                        className="ml-auto size-3.5! transition-transform duration-200 ease-out group-data-[state=closed]/collapsible:-rotate-90 motion-reduce:transition-none"
                      />
                    </CollapsibleTrigger>
                  </SidebarGroupLabel>
                  <CollapsibleContent className="overflow-hidden data-[state=closed]:animate-collapsible-up data-[state=open]:animate-collapsible-down">
                    <SidebarGroupContent>{menu(items.filter((item) => item.group === group))}</SidebarGroupContent>
                  </CollapsibleContent>
                </SidebarGroup>
              </Collapsible>
            ),
          )}
        </nav>
      </SidebarContent>

      <SidebarFooter className="gap-0.5">
        {/* Settings: one entry at the bottom, opening the Settings page */}
        {menu(items.filter((item) => item.bottom))}
        {!isMobile && (
          <SidebarMenu>
            <SidebarMenuItem>
              <SidebarMenuButton onClick={toggleSidebar} aria-expanded={!collapsed} tooltip={tip(t('nav.expand'))} className={`${ROW} cursor-pointer`}>
                <PanelLeftClose aria-hidden className={`transition-transform duration-200 ease-out motion-reduce:transition-none ${collapsed ? 'rotate-180' : ''}`} />
                <span>{collapsed ? t('nav.expand') : t('nav.collapse')}</span>
              </SidebarMenuButton>
            </SidebarMenuItem>
          </SidebarMenu>
        )}
      </SidebarFooter>
      <SidebarRail />
      {/* The round button on the edge, at mid-height: it never moves when groups open or close.
          Round by the project owner's request (docs/decisions.md), unlike the rest of the kit */}
      {!isMobile && (
        <Tooltip>
          <TooltipTrigger asChild>
            <button
              type="button"
              aria-label={toggleLabel}
              aria-expanded={!collapsed}
              onClick={toggleSidebar}
              className="absolute top-1/2 -right-3.5 z-30 flex size-7 -translate-y-1/2 cursor-pointer items-center justify-center rounded-full border border-band bg-canvas text-ink-meta transition-colors hover:border-primary hover:text-primary"
            >
              <ChevronLeft aria-hidden size={14} className={`transition-transform duration-200 ease-out motion-reduce:transition-none ${collapsed ? 'rotate-180' : ''}`} />
            </button>
          </TooltipTrigger>
          <TooltipContent side="right" sideOffset={8} className={TOOLTIP_CLASS}>
            {toggleLabel}
          </TooltipContent>
        </Tooltip>
      )}
    </Sidebar>
  )
}
