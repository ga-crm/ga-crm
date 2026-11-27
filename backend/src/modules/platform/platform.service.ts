import { Injectable } from '@nestjs/common';
import { mapDuplicateKey } from '../../common/errors.js';
import { Role } from '../../common/rbac.js';
import type { Actor, Scope } from '../../common/rbac.js';
import { PlatformDb } from '../../core/tenancy/platform-db.js';
import { AuditAction, AuditService } from '../audit/audit.service.js';
import { MfaService } from '../auth/mfa.service.js';
import {
  limitsOf,
  NO_LIMITS,
} from '../tenants/infrastructure/tenant.entity.js';
import { TenantsService } from '../tenants/tenants.service.js';
import { toUserDto } from '../users/users.dto.js';
import type { ListUsersQueryDto } from '../users/users.dto.js';
import { UsersService } from '../users/users.service.js';
import type {
  CreateTenantDto,
  ListTenantsQueryDto,
  PlatformSettingsDto,
  UpdateTenantDto,
} from './platform.dto.js';
import { afterCommit } from '../../core/persistence/after-commit.js';
import { RealtimeService } from '../realtime/realtime.service.js';

@Injectable()
export class PlatformService {
  constructor(
    private readonly platformDb: PlatformDb,
    private readonly tenants: TenantsService,
    private readonly usersService: UsersService,
    private readonly audit: AuditService,
    private readonly mfa: MfaService,
    private readonly realtime: RealtimeService,
  ) {}

  /** TENANT-4 */
  async listTenants(query: ListTenantsQueryDto) {
    const { items, total } = await this.tenants.list(query);
    const stats = (await this.platformDb.run('platform-console', (db) =>
      db.query(
        // Section 5.2: an archived account no longer takes a seat
        `SELECT tenant_id, count(*)::int AS users, max(last_login_at) AS last_activity_at
           FROM users WHERE tenant_id = ANY($1::uuid[]) AND status <> 'ARCHIVED'
          GROUP BY tenant_id`,
        [items.map((tenant) => tenant.id)],
      ),
    )) as { tenant_id: string; users: number; last_activity_at: Date | null }[];
    const byTenant = new Map(stats.map((stat) => [stat.tenant_id, stat]));
    return {
      items: items.map((tenant) => ({
        id: tenant.id,
        gaCode: tenant.gaCode,
        name: tenant.name,
        status: tenant.status,
        plan: tenant.plan,
        limits: limitsOf(tenant),
        users: byTenant.get(tenant.id)?.users ?? 0,
        // Section 17.3: counted from AI messages once assistants answer (slice 7b)
        aiTokensThisMonth: 0,
        lastActivityAt: byTenant.get(tenant.id)?.last_activity_at ?? null,
      })),
      page: query.page,
      pageSize: query.pageSize,
      total,
    };
  }

  /** TENANT-2: the tenant and its first GA_HEAD (INVITED) are created together. */
  async createTenant(actor: Actor, dto: CreateTenantDto) {
    try {
      return await this.platformDb.run('platform-console', async (db) => {
        const tenant = await this.tenants.create(
          { gaCode: dto.gaCode, name: dto.name },
          db,
        );
        const scope: Scope = { tenantId: tenant.id };
        const { user, inviteUrl } = await this.usersService.createInvited(
          scope,
          actor.id,
          { ...dto.head, roles: [Role.GAD] },
          db,
        );
        await this.audit.record(
          {
            tenantId: null,
            userId: actor.id,
            action: AuditAction.Create,
            entity: 'tenant',
            entityId: tenant.id,
            meta: { gaCode: tenant.gaCode },
          },
          db,
        );
        return {
          tenant: {
            id: tenant.id,
            gaCode: tenant.gaCode,
            name: tenant.name,
            status: tenant.status,
            plan: tenant.plan,
          },
          head: toUserDto(user),
          inviteUrl,
        };
      });
    } catch (error) {
      return mapDuplicateKey(error);
    }
  }

  /** TENANT-3: a suspended tenant's users get 401 on their next request; the data stays. */
  async updateTenant(
    actor: Actor,
    id: string,
    dto: UpdateTenantDto,
  ): Promise<void> {
    await this.platformDb.run('platform-console', async (db) => {
      const current = await this.tenants.getForPlatform(id, db);
      const limits = dto.limits
        ? {
            ...NO_LIMITS,
            ...limitsOf(current),
            ...Object.fromEntries(
              Object.entries(dto.limits).filter(
                ([, value]) => value !== undefined,
              ),
            ),
          }
        : undefined;
      await this.tenants.update(
        id,
        {
          ...(dto.name !== undefined && { name: dto.name }),
          ...(dto.status !== undefined && { status: dto.status }),
          ...(dto.plan !== undefined && { plan: dto.plan }),
          ...(limits && { limits }),
        },
        db,
      );
      // TENANT-3: a suspended GA's sockets end now
      if (dto.status !== undefined)
        afterCommit(db, () => this.realtime.recheckTenant(id));
      await this.audit.record(
        {
          tenantId: null,
          userId: actor.id,
          action: AuditAction.Update,
          entity: 'tenant',
          entityId: id,
          meta: {
            ...(dto.name !== undefined && { name: dto.name }),
            ...(dto.status !== undefined && { status: dto.status }),
            ...(dto.plan !== undefined && { plan: dto.plan }),
            ...(limits && { limits }),
          },
        },
        db,
      );
    });
  }

  async listTenantUsers(actor: Actor, id: string, query: ListUsersQueryDto) {
    const { items, total } = await this.usersService.list(
      await this.crossTenantScope(actor, id),
      query,
    );
    return {
      items: items.map(toUserDto),
      page: query.page,
      pageSize: query.pageSize,
      total,
    };
  }

  async resendInvite(
    actor: Actor,
    id: string,
    userId: string,
  ): Promise<string> {
    return this.usersService.resendInvite(
      await this.crossTenantScope(actor, id),
      null,
      userId,
    );
  }

  /** USER-16: a GA user (often the only GA_HEAD) lost their phone; audited as a cross-tenant act. */
  async resetMfa(actor: Actor, id: string, userId: string): Promise<void> {
    await this.mfa.reset(await this.crossTenantScope(actor, id), actor, userId);
  }

  /** TEN-6: the only way a Platform Admin reaches tenant data; always audited first. */
  private async crossTenantScope(
    actor: Actor,
    tenantId: string,
  ): Promise<Scope> {
    await this.platformDb.run('platform-console', async (db) => {
      await this.tenants.getForPlatform(tenantId, db);
      await this.audit.record(
        {
          tenantId,
          userId: actor.id,
          action: AuditAction.CrossTenantRead,
          entity: 'tenant',
          entityId: tenantId,
        },
        db,
      );
    });
    return { tenantId };
  }

  /** USER-16: the platform-wide switches (docs/decisions.md, 20/11/2026). */
  async settings(): Promise<PlatformSettingsDto> {
    const [row] = (await this.platformDb.run('platform-console', (db) =>
      db.query(`SELECT mfa_enforced FROM platform_settings`),
    )) as { mfa_enforced: boolean }[];
    return { mfaEnforced: row.mfa_enforced };
  }

  /**
   * USER-16: with `mfaEnforced` off nobody is held at MFA set-up, in any GA. It takes effect on the
   * next request of every session, because the actor is rebuilt from this row each time.
   */
  async updateSettings(actor: Actor, dto: PlatformSettingsDto): Promise<void> {
    await this.platformDb.run('platform-console', async (db) => {
      const [before] = (await db.query(
        `SELECT mfa_enforced FROM platform_settings FOR UPDATE`,
      )) as { mfa_enforced: boolean }[];
      if (before.mfa_enforced === dto.mfaEnforced) return;
      await db.query(
        `UPDATE platform_settings SET mfa_enforced = $1, updated_at = now(), updated_by = $2`,
        [dto.mfaEnforced, actor.id],
      );
      // AUD-3: in the platform's own chain, with the change
      await this.audit.record(
        {
          tenantId: null,
          userId: actor.id,
          action: AuditAction.SettingsChange,
          entity: 'platform_settings',
          meta: {
            before: { mfaEnforced: before.mfa_enforced },
            after: { mfaEnforced: dto.mfaEnforced },
          },
        },
        db,
      );
    });
  }

  /** Bootstrap helper for the first Platform Admin. */
  async hasPlatformAdmin(): Promise<boolean> {
    const [row] = (await this.platformDb.run('platform-console', (db) =>
      db.query(
        `SELECT EXISTS (SELECT 1 FROM users WHERE $1 = ANY(roles)) AS found`,
        [Role.PlatformAdmin],
      ),
    )) as { found: boolean }[];
    return row.found;
  }
}
