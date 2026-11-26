/** Section 4.1. Marketing was dropped on 26/11/2026: Admin does its work (docs/decisions.md). */
export enum Role {
  FC = 'FC',
  UM = 'UM',
  BM = 'BM',
  /** The GA director. Since 27/11/2026 also the former GA head (GA_HEAD): every permission. */
  GAD = 'GAD',
  Admin = 'ADMIN',
  PlatformAdmin = 'PLATFORM_ADMIN',
}

/** ROLE-3: PLATFORM_ADMIN can never be granted from inside a GA. */
export const TENANT_ROLES = [
  Role.GAD,
  Role.Admin,
  Role.BM,
  Role.UM,
  Role.FC,
] as const;

/**
 * ROLE-2: these roles must carry an agent code. Decided 27/11/2026: the GA director may have one
 * (then they sit on the tree as SUM) but need not, as the former GA heads had none.
 */
export const AGENT_ROLES: readonly Role[] = [Role.FC, Role.UM, Role.BM];

/** PERM-1: roles editable in the permission matrix. The GA director is fixed and holds everything. */
const CONFIGURABLE_ROLES = [
  Role.Admin,
  Role.BM,
  Role.UM,
  Role.FC,
] as const;
type ConfigurableRole = (typeof CONFIGURABLE_ROLES)[number];

/** Section 4.2 */
export enum Permission {
  UsersManage = 'users.manage',
  AgentsViewAll = 'agents.view_all',
  AgentsEditTree = 'agents.edit_tree',
  ImportsUpload = 'imports.upload',
  ImportsAgentTree = 'imports.agent_tree',
  ImportsTenantWide = 'imports.tenant_wide',
  ImportsViewAll = 'imports.view_all',
  LeadsManage = 'leads.manage',
  LeadsImport = 'leads.import',
  /**
   * Open question 4 (decided 14/11/2026): line managers reassign leads among the agents of their own
   * line. Granted to GAD, BM and UM by default.
   */
  LeadsAssignLine = 'leads.assign_line',
  CampaignsManage = 'campaigns.manage',
  ReportsViewAll = 'reports.view_all',
  ExportsData = 'exports.data',
  AuditView = 'audit.view',
  AiUse = 'ai.use',
  AiManage = 'ai.manage',
  /** Section 4.2: the GA's insurance programme catalogue (PRG-3). */
  CatalogManage = 'catalog.manage',
  /** Section 4.2 + ASG-1: assign clients; granted to nobody by default. */
  ClientsAssign = 'clients.assign',
}

export type Grants = Record<ConfigurableRole, Permission[]>;

/** PERM-2: grants of a newly created tenant. */
export const DEFAULT_GRANTS: Grants = {
  // Decided 26/11/2026: Admin also holds what Marketing held (leads, campaigns, reports)
  [Role.Admin]: [
    Permission.UsersManage,
    Permission.AgentsViewAll,
    Permission.AgentsEditTree,
    Permission.ImportsUpload,
    Permission.ImportsAgentTree,
    Permission.ImportsTenantWide,
    Permission.ImportsViewAll,
    Permission.LeadsManage,
    Permission.LeadsImport,
    Permission.CampaignsManage,
    Permission.ReportsViewAll,
    Permission.CatalogManage,
  ],
  [Role.BM]: [Permission.ImportsUpload, Permission.AiUse, Permission.LeadsAssignLine],
  [Role.UM]: [Permission.ImportsUpload, Permission.AiUse, Permission.LeadsAssignLine],
  [Role.FC]: [Permission.ImportsUpload, Permission.AiUse],
};

export type Reach = 'TENANT' | 'DOWNLINE' | 'OWN' | 'NONE';

/** SCOPE-1 + ROLE-1: the widest role wins. */
export function resolveReach(roles: readonly Role[]): Reach {
  if (roles.includes(Role.GAD)) return 'TENANT';
  if (roles.some((role) => role === Role.UM || role === Role.BM))
    return 'DOWNLINE';
  if (roles.includes(Role.FC)) return 'OWN';
  return 'NONE';
}

/** ROLE-1 + section 4.2: union of all role grants; the GA director always holds every permission. */
export function resolvePermissions(
  roles: readonly Role[],
  grants: Grants,
): Permission[] {
  if (roles.includes(Role.GAD)) return Object.values(Permission);
  const permissions = new Set<Permission>();
  for (const role of roles) {
    for (const permission of grants[role as ConfigurableRole] ?? [])
      permissions.add(permission);
  }
  return [...permissions];
}

/**
 * Another user as the API would see them, for checks made on their behalf (who may be mentioned,
 * who gets a manager's summary). The caller has already checked the user is ACTIVE.
 */
export function actorOf(
  user: {
    id: string;
    email: string;
    name: string;
    tenantId: string | null;
    roles: readonly string[];
    agentCode?: string | null;
  },
  grants: Grants,
): Actor {
  return {
    id: user.id,
    email: user.email,
    name: user.name,
    tenantId: user.tenantId,
    roles: user.roles as Role[],
    agentCode: user.agentCode ?? undefined,
    permissions: resolvePermissions(user.roles as Role[], grants),
    reach: resolveReach(user.roles as Role[]),
    appearance: DEFAULT_APPEARANCE,
  };
}

/** The authenticated user, reloaded from the database on every request (section 2.5, step 2). */
/** Per-user colour personalisation. Shape (radius, borders, layout) is not configurable. */
export const UI_THEMES = [
  'light',
  'dark',
  'midnight',
  'soft',
  'contrast',
  'system',
] as const;
export type UiTheme = (typeof UI_THEMES)[number];

export interface Appearance {
  theme: UiTheme;
  accent: string;
}

export const DEFAULT_APPEARANCE: Appearance = {
  theme: 'light',
  accent: '#0057d2',
};

export interface Actor {
  /** USER-16: whether MFA is on, and whether the person's roles or GA require it. */
  mfa?: { enabled: boolean; required: boolean };
  id: string;
  email: string;
  name: string;
  tenantId: string | null;
  roles: Role[];
  agentCode?: string;
  /** The user's bit in the GA's presence and activity bitmaps (users.member_no); none for platform staff. */
  memberNo?: number;
  permissions: Permission[];
  reach: Reach;
  appearance: Appearance;
}

/** TEN-2 + SCOPE-2: defined with the database access that enforces it. */
export type { Scope } from '../core/tenancy/scope.js';
