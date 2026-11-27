import {
  DEFAULT_GRANTS,
  Permission,
  resolvePermissions,
  resolveReach,
  Role,
} from './rbac.js';

describe('rbac', () => {
  it('SCOPE-1: reach follows the widest role', () => {
    expect(resolveReach([Role.GAD, Role.BM])).toBe('TENANT');
    expect(resolveReach([Role.FC, Role.UM])).toBe('DOWNLINE');
    expect(resolveReach([Role.FC])).toBe('OWN');
    expect(resolveReach([Role.Admin])).toBe('NONE');
  });

  it('section 4.2: GA_HEAD always holds every permission, even with empty grants', () => {
    const empty = { ADMIN: [], GAD: [], BM: [], UM: [], FC: [] };
    expect(resolvePermissions([Role.GAD], empty)).toEqual(
      Object.values(Permission),
    );
  });

  it('ROLE-1: permissions are the union of all roles', () => {
    const permissions = resolvePermissions(
      [Role.FC, Role.Admin],
      DEFAULT_GRANTS,
    );
    expect(permissions).toContain(Permission.AiUse);
    expect(permissions).toContain(Permission.UsersManage);
  });

  it('PERM-2: default grants match the catalogue', () => {
    expect(DEFAULT_GRANTS.ADMIN).toContain(Permission.UsersManage);
    // Decided 26/11/2026: Admin took over Marketing's work
    expect(DEFAULT_GRANTS.ADMIN).toEqual(
      expect.arrayContaining([
        Permission.LeadsManage,
        Permission.CampaignsManage,
        Permission.ReportsViewAll,
        Permission.ImportsTenantWide,
      ]),
    );
    expect(Object.keys(DEFAULT_GRANTS)).not.toContain('MARKETING');
    expect(DEFAULT_GRANTS.FC).toEqual([
      Permission.ImportsUpload,
      Permission.AiUse,
    ]);
    for (const grants of Object.values(DEFAULT_GRANTS)) {
      expect(grants).not.toContain(Permission.AuditView);
      expect(grants).not.toContain(Permission.AiManage);
    }
  });
});
