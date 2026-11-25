import { describe, expect, it } from 'vitest'
import { breadcrumbTrail } from '../src/lib/nav'
import type { Me } from '../src/lib/types'

const head = {
  user: { id: 'u1', agentCode: null },
  tenant: { id: 't1', name: 'GA', gaCode: 'GA-1' },
  roles: ['GA_HEAD'],
  permissions: ['users.manage', 'imports.upload', 'imports.view_all', 'leads.manage', 'leads.import'],
  reach: 'TENANT',
} as unknown as Me

const trail = (path: string) => breadcrumbTrail(head, path).map((crumb) => [crumb.label, crumb.to ?? null])

describe('breadcrumb', () => {
  it('shows the group, then the page; a group is not a link', () => {
    expect(trail('/agents')).toEqual([
      ['nav.groupTeam', null],
      ['nav.agents', null],
    ])
    // A row without a group stands alone
    expect(trail('/reports')).toEqual([['nav.reports', null]])
  })

  it('a screen opened from another goes under it: Dữ liệu › Lịch sử nhập › Nhập dữ liệu', () => {
    expect(trail('/imports/new')).toEqual([
      ['nav.groupData', null],
      ['nav.imports', '/imports'],
      ['nav.importNew', null],
    ])
  })

  it('a detail goes under its list, which links back', () => {
    expect(trail('/imports/01a1da14-b150-72ce-b3a1-423117eae06b')).toEqual([
      ['nav.groupData', null],
      ['nav.imports', '/imports'],
      ['breadcrumb.importDetail', null],
    ])
    expect(trail('/leads/deleted').at(-1)).toEqual(['leads.deletedTitle', null])
    expect(trail('/leads/abc').slice(1)).toEqual([
      ['nav.leads', '/leads'],
      ['breadcrumb.leadDetail', null],
    ])
    // TENANT-5: a product code keeps its own shape in the path
    expect(trail('/products/DEMO-ULP-01')).toEqual([
      ['nav.groupSales', null],
      ['nav.products', '/products'],
      ['breadcrumb.productDetail', null],
    ])
    // Its own sidebar entry wins over "a detail of the lead list"
    expect(trail('/leads/import').at(-1)).toEqual(['nav.leadImport', null])
  })

  it('settings screens go under Cài đặt; the home page has none', () => {
    expect(trail('/settings/security')).toEqual([
      ['nav.settings', '/settings'],
      ['settings.security', null],
    ])
    expect(trail('/settings')).toEqual([['nav.settings', null]])
    expect(trail('/')).toEqual([])
  })
})
