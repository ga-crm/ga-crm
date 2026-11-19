import type { ComponentType } from 'react'
import { createBrowserRouter } from 'react-router-dom'
import { hasPermission, hasRole } from './auth/access'
import { Allow, RequireAuth } from './auth/guards'
import { AppRoot } from './components/AppRoot'
import { AppShell } from './components/AppShell'
import { RouteError } from './components/RouteError'
import { Spinner } from './components/ui'
import { canImport, canImportLeads, canReadImports, canSeeCatalog, canSeeReports, canUseClients, canUseLeads, inTenant } from './lib/nav'
import { pages } from './lib/pages'
import type { Me } from './lib/types'
import { NotFoundPage } from './pages/ForbiddenPage'

/** Loads a screen's chunk on first visit. `when` is PERM-4: it hides the screen, the API still decides. */
const screen = (load: () => Promise<ComponentType>, when?: (me: Me) => boolean) => async () => {
  const Page = await load()
  return {
    element: when ? (
      <Allow when={when}>
        <Page />
      </Allow>
    ) : (
      <Page />
    ),
  }
}

export const router = createBrowserRouter([
  {
    element: <AppRoot />,
    hydrateFallbackElement: <Spinner fullPage />,
    errorElement: <RouteError />,
    children: [
      { path: '/login', lazy: screen(pages.login) },
      { path: '/invite/:token', lazy: screen(pages.invite) },
      { path: '/reset-password/:token', lazy: screen(pages.resetPassword) },
      // CMP-4: the public lead form, opened by customers from a link or QR code
      { path: '/f/:slug', lazy: screen(pages.publicForm) },
      {
        element: <RequireAuth />,
        children: [
          // USER-16: outside the shell, which would call APIs the account cannot use yet
          { path: '/mfa/setup', lazy: screen(pages.mfaSetup) },
          {
            element: <AppShell />,
            children: [
              {
                // Inside the shell, so a screen that fails to load keeps the sidebar
                errorElement: <RouteError />,
                children: [
                  { index: true, lazy: screen(pages.home) },
                  { path: 'leads', lazy: screen(pages.leads, canUseLeads) },
                  { path: 'leads/import', lazy: screen(pages.leadImport, canImportLeads) },
                  // LEAD-40: the bin, for whoever manages leads
                  { path: 'leads/deleted', lazy: screen(pages.deletedLeads, (me) => hasPermission(me, 'leads.manage')) },
                  { path: 'leads/:id', lazy: screen(pages.leadDetail, canUseLeads) },
                  // Section 16.9 + CMP-5: everyone who sees leads
                  // Section 9.3: everyone in a GA has tasks and a calendar
                  { path: 'tasks', lazy: screen(pages.tasks, inTenant) },
                  { path: 'calendar', lazy: screen(pages.calendar, inTenant) },
                  // Chapter 15: notifications of the person
                  { path: 'notifications', lazy: screen(pages.notifications, inTenant) },
                  { path: 'reports', lazy: screen(pages.reports, canSeeReports) },
                  { path: 'campaigns', lazy: screen(pages.campaigns, canUseLeads) },
                  { path: 'campaigns/:id', lazy: screen(pages.campaignDetail, canUseLeads) },
                  { path: 'clients', lazy: screen(pages.clients, canUseClients) },
                  { path: 'clients/:code', lazy: screen(pages.clientDetail, canUseClients) },
                  { path: 'agents', lazy: screen(pages.agents, inTenant) },
                  { path: 'imports', lazy: screen(pages.imports, canReadImports) },
                  { path: 'imports/new', lazy: screen(pages.importNew, canImport) },
                  { path: 'imports/:id', lazy: screen(pages.importDetail, canReadImports) },
                  { path: 'users', lazy: screen(pages.users, (me) => hasPermission(me, 'users.manage')) },
                  { path: 'chat', lazy: screen(pages.chat, (me) => !!me.tenant) },
                  { path: 'chat/review', lazy: screen(pages.chatReview, (me) => hasRole(me, 'GA_HEAD')) },
                  { path: 'users/activity', lazy: screen(pages.userActivity, (me) => !!me.tenant && hasPermission(me, 'users.manage')) },
                  { path: 'permissions', lazy: screen(pages.permissions, (me) => hasRole(me, 'GA_HEAD')) },
                  // Section 16.8: GA_HEAD edits, Admin reads (section 4.3)
                  { path: 'catalog', lazy: screen(pages.catalog, canSeeCatalog) },
                  // Section 5.2: GA_HEAD only
                  // Section 14.10: AI settings of the GA (ai.manage)
                  { path: 'ai', lazy: screen(pages.aiAdmin, (me) => !!me.tenant && hasPermission(me, 'ai.manage')) },
                  { path: 'ga-settings', lazy: screen(pages.gaSettings, (me) => hasRole(me, 'GA_HEAD')) },
                  { path: 'audit', lazy: screen(pages.audit, (me) => hasPermission(me, 'audit.view')) },
                  { path: 'platform/tenants', lazy: screen(pages.tenants, (me) => hasRole(me, 'PLATFORM_ADMIN')) },
                  // USER-16: the platform-wide MFA switch
                  { path: 'platform/settings', lazy: screen(pages.platformSettings, (me) => hasRole(me, 'PLATFORM_ADMIN')) },
                  { path: 'settings', lazy: screen(pages.settings) },
                  { path: 'settings/appearance', lazy: screen(pages.appearance) },
                  { path: 'settings/password', lazy: screen(pages.password) },
                  { path: 'settings/security', lazy: screen(pages.security) },
                  { path: 'settings/notifications', lazy: screen(pages.notificationSettings, inTenant) },
                  { path: '*', element: <NotFoundPage /> },
                ],
              },
            ],
          },
        ],
      },
    ],
  },
])
