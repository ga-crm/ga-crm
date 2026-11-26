import { HttpStatus, Injectable, Logger } from '@nestjs/common';
import type { OnModuleInit } from '@nestjs/common';
import type { EntityManager } from 'typeorm';
import { ApiException, ErrorCode, notFound } from '../../common/errors.js';
import { escapeLike } from '../../common/pagination.js';
import { DEFAULT_GRANTS, Permission } from '../../common/rbac.js';
import type { Grants, Scope } from '../../common/rbac.js';
import { rowsOf } from '../../core/persistence/sql.js';
import { PlatformDb } from '../../core/tenancy/platform-db.js';
import { TenantDb } from '../../core/tenancy/tenant-db.js';
import { AuditAction, AuditService } from '../audit/audit.service.js';
import { quietHoursOf } from '../notifications/notification-rules.js';
import {
  DEFAULT_LEAD_RULES,
  DEFAULT_NOTIFICATIONS,
  TenantSettings,
  type LeadRules,
} from './infrastructure/tenant-settings.entity.js';
import {
  limitsOf,
  Tenant,
  TenantStatus,
  type TenantLimits,
} from './infrastructure/tenant.entity.js';
import type { UpdateSettingsDto } from './settings.dto.js';

export { TenantStatus };

/** Users that take a seat of the plan: every account that is not archived (USER-9). */
const SEATS_SQL = `SELECT count(*)::int AS seats FROM users WHERE tenant_id = $1 AND status <> 'ARCHIVED'`;

/**
 * Test 11 + PERM-2: each permission added after GAs exist, with the roles it reaches by default.
 * Every GA below a step's version gets that step once; its own choices afterwards stand.
 */
const PERMISSION_STEPS: { version: number; permission: Permission; roles: string[] }[] = [
  { version: 1, permission: Permission.CatalogManage, roles: ['ADMIN'] },
  { version: 2, permission: Permission.LeadsAssignLine, roles: ['BM', 'UM'] },
];

/** Raised each time a permission joins DEFAULT_GRANTS; see onModuleInit. */
export const PERMISSIONS_VERSION = PERMISSION_STEPS.at(-1)!.version;

@Injectable()
export class TenantsService implements OnModuleInit {
  private readonly logger = new Logger(TenantsService.name);

  constructor(
    private readonly tenantDb: TenantDb,
    private readonly platformDb: PlatformDb,
    private readonly audit: AuditService,
  ) {}

  /**
   * Test 11 + PERM-2: permissions added after a GA was created reach their default roles once,
   * without undoing a GA's own choices afterwards (PERMISSION_STEPS).
   */
  async onModuleInit(): Promise<void> {
    // A start-up step over every GA, not a request, so it runs as the platform role
    const changed = await this.platformDb.run(
      'platform-console',
      async (db) => {
        // AUD-1: a grant made without a person is still a permission change of that GA
        const added = new Map<string, string[]>();
        for (const step of PERMISSION_STEPS)
          for (const role of step.roles) {
            const rows = await rowsOf<{ tenant_id: string }>(
              db,
              `UPDATE tenant_settings
                  SET grants = jsonb_set(grants, ARRAY[$3::text], coalesce(grants -> $3, '[]') || to_jsonb($2::text))
                WHERE permissions_version < $1 AND NOT coalesce(grants -> $3, '[]') ? $2
                RETURNING tenant_id`,
              [step.version, step.permission, role],
            );
            for (const { tenant_id } of rows)
              added.set(tenant_id, [
                ...(added.get(tenant_id) ?? []),
                `${role}:${step.permission}`,
              ]);
          }
        const rows = await rowsOf<{ tenant_id: string }>(
          db,
          `UPDATE tenant_settings SET permissions_version = $1
            WHERE permissions_version < $1 RETURNING tenant_id`,
          [PERMISSIONS_VERSION],
        );
        for (const [tenantId, grants] of added)
          await this.audit.record(
            {
              tenantId,
              userId: null,
              action: AuditAction.PermissionChange,
              entity: 'permissions',
              meta: { added: grants, permissionsVersion: PERMISSIONS_VERSION },
            },
            db,
          );
        return rows.length;
      },
    );
    if (changed > 0)
      this.logger.log(`Granted new permissions in ${changed} GA(s)`);
  }

  /** The tenant of a scope, from inside it (row-level security shows a tenant only itself). */
  getById(scope: Scope, db?: EntityManager): Promise<Tenant> {
    return this.tenantDb.run(
      scope,
      async (tx) => {
        const tenant = await tx
          .getRepository(Tenant)
          .findOneBy({ id: scope.tenantId });
        if (!tenant) throw notFound();
        return tenant;
      },
      db,
    );
  }

  /** TEN-6: any tenant, for the platform console. */
  findForPlatform(id: string, db?: EntityManager): Promise<Tenant | null> {
    return this.platformDb.run(
      'platform-console',
      (tx) => tx.getRepository(Tenant).findOneBy({ id }),
      db,
    );
  }

  async getForPlatform(id: string, db?: EntityManager): Promise<Tenant> {
    const tenant = await this.findForPlatform(id, db);
    if (!tenant) throw notFound();
    return tenant;
  }

  /** Section 5.2: the plan's limits, none when unset. */
  async limits(scope: Scope, db?: EntityManager): Promise<TenantLimits> {
    return limitsOf(await this.getById(scope, db));
  }

  async countSeats(scope: Scope, db?: EntityManager): Promise<number> {
    return this.tenantDb.run(
      scope,
      async (tx) => {
        const [row] = (await tx.query(SEATS_SQL, [scope.tenantId])) as {
          seats: number;
        }[];
        return row.seats;
      },
      db,
    );
  }

  /** Section 5.2: refuses a new seat once the plan's users are all taken (`409 plan_user_limit`). */
  async assertSeat(scope: Scope, db?: EntityManager): Promise<void> {
    const { maxUsers } = await this.limits(scope, db);
    if (maxUsers === null) return;
    if ((await this.countSeats(scope, db)) >= maxUsers)
      throw new ApiException(HttpStatus.CONFLICT, ErrorCode.PlanUserLimit);
  }

  /** TASK-7: the GAs the reminder rounds visit. */
  async activeIds(): Promise<string[]> {
    const tenants = await this.platformDb.run('scheduler', (db) =>
      db
        .getRepository(Tenant)
        .find({ select: { id: true }, where: { status: TenantStatus.Active } }),
    );
    return tenants.map((tenant) => tenant.id);
  }

  getSettings(scope: Scope, db?: EntityManager): Promise<TenantSettings> {
    return this.tenantDb.run(
      scope,
      async (tx) => {
        const settings = await tx
          .getRepository(TenantSettings)
          .findOneBy({ tenantId: scope.tenantId });
        if (!settings) throw notFound();
        return settings;
      },
      db,
    );
  }

  /** TENANT-4 */
  list(query: {
    page: number;
    pageSize: number;
    q?: string;
    status?: TenantStatus;
  }): Promise<{ items: Tenant[]; total: number }> {
    return this.platformDb.run('platform-console', async (db) => {
      const builder = db.getRepository(Tenant).createQueryBuilder('tenant');
      if (query.status)
        builder.andWhere('tenant.status = :status', { status: query.status });
      if (query.q)
        builder.andWhere(
          '(tenant.gaCode ILIKE :pattern OR tenant.name ILIKE :pattern)',
          { pattern: `%${escapeLike(query.q)}%` },
        );
      const [items, total] = await builder
        .orderBy('tenant.createdAt', 'DESC')
        .addOrderBy('tenant.id', 'DESC')
        .skip((query.page - 1) * query.pageSize)
        .take(query.pageSize)
        .getManyAndCount();
      return { items, total };
    });
  }

  /**
   * PERM-2: a new tenant starts with the default grants. Runs in the platform's transaction.
   * DEFAULT_GRANTS already hold every step, so the version is the latest: otherwise the next
   * start would grant again what the GA head has since removed.
   */
  async create(
    input: { gaCode: string; name: string },
    db: EntityManager,
  ): Promise<Tenant> {
    const tenant = await db
      .getRepository(Tenant)
      .save(db.getRepository(Tenant).create(input));
    await db.getRepository(TenantSettings).insert({
      tenantId: tenant.id,
      permissionsVersion: PERMISSIONS_VERSION,
      grants: structuredClone(DEFAULT_GRANTS),
      leadRules: { ...DEFAULT_LEAD_RULES },
      notifications: structuredClone(DEFAULT_NOTIFICATIONS),
    });
    return tenant;
  }

  async update(
    id: string,
    patch: {
      name?: string;
      status?: TenantStatus;
      plan?: string;
      limits?: TenantLimits;
    },
    db: EntityManager,
  ): Promise<void> {
    const { limits, ...rest } = patch;
    const result = await db
      .getRepository(Tenant)
      .update({ id }, { ...rest, ...limits });
    if (!result.affected) throw notFound();
  }

  /** Section 5.2: the GA settings screen, with what the GA may only look at (plan, usage). */
  settingsView(scope: Scope) {
    return this.tenantDb.run(scope, async (db) => {
      const tenant = await this.getById(scope, db);
      const settings = await this.getSettings(scope, db);
      const users = await this.countSeats(scope, db);
      return {
        version: settings.version,
        gaCode: tenant.gaCode,
        gaName: tenant.name,
        profile: {
          displayName: settings.profile?.displayName ?? '',
          address: settings.profile?.address ?? '',
        },
        leadRules: { ...DEFAULT_LEAD_RULES, ...settings.leadRules },
        notifications: {
          quietHours: quietHoursOf(
            (settings.notifications as { quietHours?: unknown })?.quietHours,
          ),
        },
        security: { mfaForAll: !!settings.security?.mfaForAll },
        plan: { name: tenant.plan, users, limits: limitsOf(tenant) },
      };
    });
  }

  /** LEAD-29: the hours a GA gives its agents for the first contact. */
  async leadRules(scope: Scope, db?: EntityManager): Promise<LeadRules> {
    const settings = await this.getSettings(scope, db);
    return { ...DEFAULT_LEAD_RULES, ...settings.leadRules };
  }

  /**
   * Section 5.2: GA_HEAD saves the form. The write only matches the version the form was opened
   * with, so a form left open cannot silently overwrite a newer save (`409 stale_settings`).
   */
  async updateSettings(
    scope: Scope,
    actorId: string,
    dto: UpdateSettingsDto,
  ): Promise<void> {
    await this.tenantDb.run(scope, async (db) => {
      const current = await this.getSettings(scope, db);
      const notifications = (current.notifications ?? {}) as {
        quietHours?: unknown;
      };
      const before = {
        profile: { ...current.profile },
        leadRules: { ...DEFAULT_LEAD_RULES, ...current.leadRules },
        notifications: {
          ...notifications,
          quietHours: quietHoursOf(notifications.quietHours),
        },
        security: { mfaForAll: !!current.security?.mfaForAll },
      };
      // Plain objects: DTO class instances would carry their prototype into the JSON
      const defined = <T extends object>(value?: T) =>
        Object.fromEntries(
          Object.entries(value ?? {}).filter(([, item]) => item !== undefined),
        ) as Partial<T>;
      const after = {
        profile: { ...before.profile, ...defined(dto.profile) },
        leadRules: { ...before.leadRules, ...defined(dto.leadRules) },
        // NTF-3: quiet hours of the GA's notifications
        notifications: dto.notifications
          ? {
              ...before.notifications,
              quietHours: {
                from: dto.notifications.quietHours.from,
                to: dto.notifications.quietHours.to,
              },
            }
          : before.notifications,
        // USER-16
        security: dto.security
          ? { mfaForAll: dto.security.mfaForAll }
          : before.security,
      };
      const written = await db
        .createQueryBuilder()
        .update(TenantSettings)
        .set({ ...after, version: () => 'version + 1' })
        .where('tenant_id = :tenantId AND version = :version', {
          tenantId: scope.tenantId,
          version: dto.version,
        })
        .execute();
      if (!written.affected)
        throw new ApiException(HttpStatus.CONFLICT, ErrorCode.StaleSettings);
      await this.audit.record(
        {
          tenantId: scope.tenantId,
          userId: actorId,
          action: AuditAction.SettingsChange,
          entity: 'settings',
          meta: { before, after },
        },
        db,
      );
    });
  }

  /** ROLE-5: concurrent "last GA_HEAD" checks of one tenant wait for each other. */
  async lockHeads(scope: Scope, db: EntityManager): Promise<void> {
    await db.query(
      `SELECT 1 FROM tenant_settings WHERE tenant_id = $1 FOR UPDATE`,
      [scope.tenantId],
    );
  }

  /** Section 4.2: changes apply on the next request because the Actor is rebuilt every time. */
  async updateGrants(
    scope: Scope,
    actorId: string,
    grants: Grants,
  ): Promise<void> {
    await this.tenantDb.run(scope, async (db) => {
      const current = await this.getSettings(scope, db);
      await db
        .getRepository(TenantSettings)
        .update({ tenantId: scope.tenantId }, { grants });
      await this.audit.record(
        {
          tenantId: scope.tenantId,
          userId: actorId,
          action: AuditAction.PermissionChange,
          entity: 'permissions',
          meta: { before: current.grants, after: grants },
        },
        db,
      );
    });
  }
}
