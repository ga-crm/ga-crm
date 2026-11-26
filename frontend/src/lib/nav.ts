import { Activity, BarChart3, ClipboardCheck, MessageCircle, MessagesSquare, Bell, BellRing, Bot, Building2, CalendarDays, ListTodo, ContactRound, Megaphone, IdCard, ListChecks, Package, Settings2, FileInput, FileUp, History, House, KeyRound, Network, Palette, ScrollText, Settings, ShieldCheck, Users } from 'lucide-react'
import type { LucideIcon } from 'lucide-react'
import { hasPermission, hasRole } from '../auth/access'
import type { MessageKey } from '../i18n'
import { pages } from './pages'
import { queries } from './queries'
import type { Me } from './types'

export interface NavItem {
  to: string
  label: MessageKey
  icon: LucideIcon
  group?: MessageKey
  visible: (me: Me) => boolean
  /** The screen's code, downloaded on hover so opening it feels instant. */
  chunk?: () => Promise<unknown>
  /** Its data, using the default list the screen opens with. */
  prefetch?: () => { queryKey: readonly unknown[] }
  /** Pinned to the bottom of the sidebar (Settings). */
  bottom?: boolean
  /**
   * Not a sidebar row: the screen is opened from a button on another screen. It still names the
   * breadcrumb, and the sidebar highlights `parent` while it is open.
   */
  parent?: string
}

// Must equal the params each screen builds when its URL has no filters, or the prefetch goes unused
const FIRST_PAGE_WITH_FILTERS = {
  users: { page: 1, pageSize: 25, q: '', status: '', role: '', order: '' },
  tenants: { page: 1, pageSize: 25, q: '', status: '' },
  imports: { page: 1, pageSize: 25 },
}

/** AGT-6: every account inside a GA has a branch to look at, even if it is only their own row. */
export const inTenant = (me: Me) => !!me.tenant
export const canImport = (me: Me) => hasPermission(me, 'imports.upload')
export const canReadImports = (me: Me) => canImport(me) || hasPermission(me, 'imports.view_all') || hasPermission(me, 'leads.import')
/** LEAD-2 and LEAD-6: lead managers, and anyone with an agent code. */
export const canUseLeads = (me: Me) => hasPermission(me, 'leads.manage') || !!me.user.agentCode
/** RPT-3: agents see their line; GAD, reports.view_all and lead managers see the GA. */
export const canSeeReports = (me: Me) => !!me.tenant && (!!me.user.agentCode || hasRole(me, 'GAD') || hasPermission(me, 'reports.view_all') || hasPermission(me, 'leads.manage'))
export const canImportLeads = (me: Me) => hasPermission(me, 'leads.import')
/** LEAD-21 for lead managers; open question 4: line managers within their line (`leads.assign_line`). */
export const canAssignLeads = (me: Me) => hasPermission(me, 'leads.manage') || hasRole(me, 'GAD')
/** CUS-5, changed 27/11/2026: the director and Admin see every client, everyone else their own. */
export const canUseClients = (me: Me) => !!me.tenant && (hasRole(me, 'GAD') || hasRole(me, 'ADMIN') || !!me.user.agentCode)
/**
 * Section 16.8 + 4.3: GAD edits the lead catalogue, Admin reads it. `catalog.manage` alone no
 * longer opens it: its only tab, the GA's programmes, gave way to the shared products (TENANT-5).
 */
export const canSeeCatalog = (me: Me) => hasRole(me, 'GAD') || hasRole(me, 'ADMIN')
/** Decided 27/11/2026: the director decides assignments; whoever may assign follows their requests. */
export const canSeeAssignments = (me: Me) =>
  !!me.tenant && (hasRole(me, 'GAD') || hasPermission(me, 'leads.manage') || hasPermission(me, 'leads.assign_line') || hasPermission(me, 'clients.assign'))
/** TENANT-5: the shared product catalogue is read by everyone in a GA and kept by the Platform Admin. */
export const canManageProducts = (me: Me) => hasRole(me, 'PLATFORM_ADMIN')

/**
 * PERM-4: hides entries the user cannot open. The API still checks every permission.
 * The order is the sidebar's: rows without a group first, then one group per kind of work
 * (docs/decisions.md, 25/11/2026). A group shows only when the person has a row in it.
 */
export const NAV_ITEMS: NavItem[] = [
  // Overview: what is happening, and the numbers behind it
  { to: '/', label: 'nav.home', icon: House, visible: () => true, chunk: pages.home },
  { to: '/reports', label: 'nav.reports', icon: BarChart3, visible: canSeeReports, chunk: pages.reports },
  // The person's own day
  { to: '/tasks', label: 'nav.tasks', icon: ListTodo, group: 'nav.groupWork', visible: inTenant, chunk: pages.tasks },
  { to: '/calendar', label: 'nav.calendar', icon: CalendarDays, group: 'nav.groupWork', visible: inTenant, chunk: pages.calendar },
  // The sales cycle: the lead, the campaign it came from, the client it becomes
  { to: '/leads', label: 'nav.leads', icon: ContactRound, group: 'nav.groupSales', visible: canUseLeads, chunk: pages.leads },
  { to: '/campaigns', label: 'nav.campaigns', icon: Megaphone, group: 'nav.groupSales', visible: canUseLeads, chunk: pages.campaigns },
  { to: '/clients', label: 'nav.clients', icon: IdCard, group: 'nav.groupSales', visible: canUseClients, chunk: pages.clients },
  { to: '/products', label: 'nav.products', icon: Package, group: 'nav.groupSales', visible: inTenant, chunk: pages.products, prefetch: queries.products },
  // Talking to colleagues, and what the system tells you
  { to: '/chat', label: 'nav.chat', icon: MessageCircle, group: 'nav.groupComms', visible: inTenant, chunk: pages.chat, prefetch: queries.chatConversations },
  { to: '/notifications', label: 'nav.notifications', icon: Bell, group: 'nav.groupComms', visible: inTenant, chunk: pages.notifications },
  // People: the agent tree, the accounts and what they may do
  { to: '/agents', label: 'nav.agents', icon: Network, group: 'nav.groupTeam', visible: inTenant, chunk: pages.agents, prefetch: () => queries.agentTree() },
  { to: '/users', label: 'nav.users', icon: Users, group: 'nav.groupTeam', visible: (me) => hasPermission(me, 'users.manage'), chunk: pages.users, prefetch: () => queries.users(FIRST_PAGE_WITH_FILTERS.users) },
  { to: '/users/activity', label: 'nav.userActivity', icon: Activity, group: 'nav.groupTeam', visible: (me) => !!me.tenant && hasPermission(me, 'users.manage'), chunk: pages.userActivity, prefetch: queries.activeUsers },
  { to: '/assignment-requests', label: 'nav.assignments', icon: ClipboardCheck, group: 'nav.groupTeam', visible: canSeeAssignments, chunk: pages.assignmentRequests },
  { to: '/permissions', label: 'nav.permissions', icon: ShieldCheck, group: 'nav.groupTeam', visible: (me) => hasRole(me, 'GAD'), chunk: pages.permissions, prefetch: () => queries.permissions() },
  // Files coming in, one row per kind of data (decided 27/11/2026). The full Success file
  // ("Nhập dữ liệu") opens from the import history: not a row
  { to: '/leads/import', label: 'nav.leadImport', icon: FileInput, group: 'nav.groupData', visible: canImportLeads, chunk: pages.leadImport },
  { to: '/clients/import', label: 'nav.clientImport', icon: FileInput, group: 'nav.groupData', visible: canImport, chunk: pages.clientImport },
  { to: '/agents/import', label: 'nav.agentImport', icon: FileInput, group: 'nav.groupData', visible: canImport, chunk: pages.agentImport },
  { to: '/imports/new', label: 'nav.importNew', icon: FileUp, group: 'nav.groupData', visible: canImport, chunk: pages.importNew, parent: '/imports' },
  { to: '/imports', label: 'nav.imports', icon: History, group: 'nav.groupData', visible: canReadImports, chunk: pages.imports, prefetch: () => queries.imports(FIRST_PAGE_WITH_FILTERS.imports) },
  // Looking back at what was done
  { to: '/audit', label: 'nav.audit', icon: ScrollText, group: 'nav.groupOversight', visible: (me) => hasPermission(me, 'audit.view'), chunk: pages.audit },
  { to: '/chat/review', label: 'nav.chatReview', icon: MessagesSquare, group: 'nav.groupOversight', visible: (me) => hasRole(me, 'GAD'), chunk: pages.chatReview },
  // How the GA is set up
  { to: '/catalog', label: 'nav.catalog', icon: ListChecks, group: 'nav.groupSetup', visible: canSeeCatalog, chunk: pages.catalog, prefetch: () => queries.leadOptions() },
  { to: '/ai', label: 'nav.ai', icon: Bot, group: 'nav.groupSetup', visible: (me) => !!me.tenant && hasPermission(me, 'ai.manage'), chunk: pages.aiAdmin, prefetch: () => queries.aiSettings() },
  { to: '/ga-settings', label: 'nav.settingsGa', icon: Settings2, group: 'nav.groupSetup', visible: (me) => hasRole(me, 'GAD'), chunk: pages.gaSettings, prefetch: () => queries.gaSettings() },
  { to: '/platform/tenants', label: 'nav.tenants', icon: Building2, group: 'nav.groupPlatform', visible: (me) => hasRole(me, 'PLATFORM_ADMIN'), chunk: pages.tenants, prefetch: () => queries.tenants(FIRST_PAGE_WITH_FILTERS.tenants) },
  { to: '/platform/products', label: 'nav.platformProducts', icon: Package, group: 'nav.groupPlatform', visible: canManageProducts, chunk: pages.platformProducts, prefetch: queries.platformProducts },
  { to: '/platform/settings', label: 'nav.platformSettings', icon: Settings2, group: 'nav.groupPlatform', visible: (me) => hasRole(me, 'PLATFORM_ADMIN'), chunk: pages.platformSettings, prefetch: () => queries.platformSettings() },
  { to: '/settings', label: 'nav.settings', icon: Settings, bottom: true, visible: () => true, chunk: pages.settings },
]

/** A card on the Settings page; each opens one of the person's own settings screens. */
export interface SettingsItem {
  to: string
  label: MessageKey
  description: MessageKey
  icon: LucideIcon
  visible: (me: Me) => boolean
  chunk: () => Promise<unknown>
}

export const SETTINGS_ITEMS: SettingsItem[] = [
  { to: '/settings/appearance', label: 'settings.appearance', description: 'settings.cardAppearance', icon: Palette, visible: () => true, chunk: pages.appearance },
  { to: '/settings/password', label: 'settings.password', description: 'settings.cardPassword', icon: KeyRound, visible: () => true, chunk: pages.password },
  { to: '/settings/security', label: 'settings.security', description: 'settings.cardSecurity', icon: ShieldCheck, visible: () => true, chunk: pages.security },
  // NTF-1: notifications belong to a GA's users
  { to: '/settings/notifications', label: 'settings.notifications', description: 'settings.cardNotifications', icon: BellRing, visible: inTenant, chunk: pages.notificationSettings },
]

/** The settings screen the path is on, for the breadcrumb under "Cài đặt". */
const activeSettingsItem = (pathname: string) => SETTINGS_ITEMS.find((item) => pathname === item.to || pathname.startsWith(`${item.to}/`))

/** The most specific entry wins, so /imports/new is not also "history", yet /imports/123 is. */
export function activeNavItem(me: Me, pathname: string): NavItem | undefined {
  return NAV_ITEMS.filter((item) => item.visible(me))
    .filter(({ to }) => (to === '/' ? pathname === '/' : pathname === to || pathname.startsWith(`${to}/`)))
    .sort((a, b) => b.to.length - a.to.length)[0]
}

/**
 * Section 4.2: where each permission leads. A permission whose feature belongs to a later release
 * slice has no entry yet, and the home page says so rather than offering a dead link.
 */
export const PERMISSION_FEATURES: Partial<Record<string, string>> = {
  'users.manage': '/users',
  'agents.view_all': '/agents',
  'agents.edit_tree': '/agents',
  'imports.upload': '/clients/import',
  'imports.agent_tree': '/agents/import',
  'imports.view_all': '/imports',
  'leads.manage': '/leads',
  'leads.assign_line': '/leads',
  'leads.import': '/leads/import',
  'campaigns.manage': '/campaigns',
  'reports.view_all': '/reports',
  'ai.manage': '/ai',
  'exports.data': '/reports',
  'audit.view': '/audit',
}

/** Screens below a sidebar entry that are not entries themselves, and how the breadcrumb names them. */
const CHILD_SCREENS: { under: string; match: RegExp; label: MessageKey }[] = [
  { under: '/leads', match: /^\/leads\/deleted$/, label: 'leads.deletedTitle' },
  { under: '/leads', match: /^\/leads\/[^/]+$/, label: 'breadcrumb.leadDetail' },
  { under: '/campaigns', match: /^\/campaigns\/[^/]+$/, label: 'breadcrumb.campaignDetail' },
  { under: '/clients', match: /^\/clients\/[^/]+$/, label: 'breadcrumb.clientDetail' },
  { under: '/products', match: /^\/products\/[^/]+$/, label: 'breadcrumb.productDetail' },
  { under: '/imports', match: /^\/imports\/[^/]+$/, label: 'breadcrumb.importDetail' },
]

export interface Crumb {
  label: MessageKey
  /** A screen to go back to; a sidebar group has none. The last crumb is the current page. */
  to?: string
}

/**
 * The breadcrumb of a path: the sidebar group, the screen it was opened from (`parent`), the
 * sidebar entry, then the screen below it (a detail, a settings screen). Only screens link.
 */
export function breadcrumbTrail(me: Me, pathname: string): Crumb[] {
  const current = activeNavItem(me, pathname)
  // The home page has nowhere to come back from, so it shows no breadcrumb
  if (!current || current.to === '/') return []
  const trail: Crumb[] = []
  if (current.group) trail.push({ label: current.group })
  const parent = current.parent ? NAV_ITEMS.find((item) => item.to === current.parent && item.visible(me)) : undefined
  if (parent) trail.push({ label: parent.label, to: parent.to })
  const below =
    current.to === '/settings'
      ? activeSettingsItem(pathname)?.label
      : CHILD_SCREENS.find((child) => child.under === current.to && child.match.test(pathname))?.label
  if (below) trail.push({ label: current.label, to: current.to }, { label: below })
  else trail.push({ label: current.label })
  return trail
}
