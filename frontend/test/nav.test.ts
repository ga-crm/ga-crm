import { describe, expect, it } from 'vitest'
import { NAV_ITEMS } from '../src/lib/nav'
import type { Me } from '../src/lib/types'

/** The sidebar as a person sees it: group label, then the rows under it, in order. */
const sidebar = (me: Me) => {
  const rows = NAV_ITEMS.filter((item) => item.visible(me) && !item.parent && !item.bottom)
  return [...new Set(rows.map((item) => item.group))].map((group) => [group ?? null, rows.filter((item) => item.group === group).map((item) => item.to)])
}

const person = (roles: string[], permissions: string[], extra: Partial<Me> = {}) =>
  ({ user: { id: 'u1', agentCode: null }, tenant: { id: 't1', name: 'GA', gaCode: 'GA-1' }, roles, permissions, reach: 'TENANT', ...extra }) as unknown as Me

describe('sidebar groups (decided 25/11/2026: one group per kind of work)', () => {
  it('a GA head sees every group, in the order of the working day', () => {
    const head = person(['GA_HEAD'], ['users.manage', 'imports.upload', 'imports.view_all', 'leads.manage', 'leads.import', 'audit.view', 'ai.manage', 'reports.view_all'])
    expect(sidebar(head)).toEqual([
      [null, ['/', '/reports']],
      ['nav.groupWork', ['/tasks', '/calendar']],
      ['nav.groupSales', ['/leads', '/campaigns', '/clients', '/products']],
      ['nav.groupComms', ['/chat', '/notifications']],
      ['nav.groupTeam', ['/agents', '/users', '/users/activity', '/permissions']],
      ['nav.groupData', ['/leads/import', '/imports']],
      ['nav.groupOversight', ['/audit', '/chat/review']],
      ['nav.groupSetup', ['/catalog', '/ai', '/ga-settings']],
    ])
  })

  it('an agent sees only the groups with something in them', () => {
    const fc = person(['FC'], [], { user: { id: 'u2', agentCode: '00100004' }, reach: 'SELF' } as unknown as Partial<Me>)
    expect(sidebar(fc)).toEqual([
      [null, ['/', '/reports']],
      ['nav.groupWork', ['/tasks', '/calendar']],
      ['nav.groupSales', ['/leads', '/campaigns', '/clients', '/products']],
      ['nav.groupComms', ['/chat', '/notifications']],
      ['nav.groupTeam', ['/agents']],
    ])
  })

  it('a Platform Admin sees the platform only', () => {
    const platform = person(['PLATFORM_ADMIN'], [], { tenant: null } as unknown as Partial<Me>)
    expect(sidebar(platform)).toEqual([
      [null, ['/']],
      ['nav.groupPlatform', ['/platform/tenants', '/platform/products', '/platform/settings']],
    ])
  })
})
