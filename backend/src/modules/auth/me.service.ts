import { Injectable } from '@nestjs/common';
import type { Actor } from '../../common/rbac.js';
import { ActorDb } from '../../core/tenancy/actor-db.js';
import { AuditAction, AuditService } from '../audit/audit.service.js';
import { DEFAULT_LEAD_RULES } from '../tenants/infrastructure/tenant-settings.entity.js';
import { TenantsService } from '../tenants/tenants.service.js';
import { User } from '../users/infrastructure/user.entity.js';
import type { MeDto, UpdateMeDto } from '../users/users.dto.js';

@Injectable()
export class MeService {
  constructor(
    private readonly actorDb: ActorDb,
    private readonly tenants: TenantsService,
    private readonly audit: AuditService,
  ) {}

  async get(actor: Actor): Promise<MeDto> {
    const {
      id,
      email,
      name,
      agentCode,
      roles,
      permissions,
      reach,
      appearance,
    } = actor;
    const base = {
      // USER-16
      mfa: {
        enabled: !!actor.mfa?.enabled,
        required: !!actor.mfa?.required,
        setupRequired: !!actor.mfa?.required && !actor.mfa.enabled,
      },
      user: { id, email, name, agentCode },
      roles,
      permissions,
      reach,
      appearance,
    };
    if (!actor.tenantId) return { ...base, tenant: null, settings: {} };
    const scope = { tenantId: actor.tenantId };
    const [tenant, settings] = await Promise.all([
      this.tenants.getById(scope),
      this.tenants.getSettings(scope),
    ]);
    return {
      ...base,
      tenant: {
        id: tenant.id,
        gaCode: tenant.gaCode,
        // TENANT-1 + section 5.2: the GA's own display name wins over the platform's
        name: settings.profile?.displayName || tenant.name,
      },
      settings: {
        leadRules: { ...DEFAULT_LEAD_RULES, ...settings.leadRules },
        notifications: settings.notifications,
      },
    };
  }

  async update(actor: Actor, dto: UpdateMeDto): Promise<void> {
    const fields = {
      ...(dto.name !== undefined && { name: dto.name }),
      // A plain object: a DTO class instance would carry its prototype into the JSON
      ...(dto.appearance && { appearance: { ...dto.appearance } }),
    };
    if (Object.keys(fields).length === 0) return;
    await this.actorDb.run(actor, async (db) => {
      await db.getRepository(User).update({ id: actor.id }, fields);
      await this.audit.record(
        {
          tenantId: actor.tenantId,
          userId: actor.id,
          action: AuditAction.Update,
          entity: 'user',
          entityId: actor.id,
          meta: { fields: Object.keys(fields) },
        },
        db,
      );
    });
  }
}
