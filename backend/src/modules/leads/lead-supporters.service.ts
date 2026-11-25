import { HttpStatus, Injectable } from '@nestjs/common';
import type { EntityManager } from 'typeorm';
import {
  ApiException,
  ErrorCode,
  forbidden,
  notFound,
} from '../../common/errors.js';
import { isId } from '../../common/pagination.js';
import type { Actor, Scope } from '../../common/rbac.js';
import { rowsOf } from '../../core/persistence/sql.js';
import { TenantDb } from '../../core/tenancy/tenant-db.js';
import { AuditAction, AuditService } from '../audit/audit.service.js';
import { NotificationsService } from '../notifications/notifications.service.js';
import { LeadHistory } from './infrastructure/lead.entities.js';
import type { Lead } from './infrastructure/lead.entities.js';
import { LeadsService } from './leads.service.js';

/** How many people the picker offers at once. */
const CANDIDATES = 10;

/**
 * Decided 26/11/2026: "Người hỗ trợ", users asked to help with a lead besides its assignee. A
 * supporter (a mentor, say) works on the lead beside its assignee, who stays: they see it through
 * LEAD-6, write notes, share its tasks and comment (CMT-1). They cannot work it in the sense of
 * LEAD-7 (its fields, status and contact record stay with the assignee), so the API masks its
 * phone everywhere (PDP-3).
 * Whoever works the lead, or a line manager of its line, adds and removes supporters; a supporter
 * may leave. Each change is audited and written to the lead's history.
 */
@Injectable()
export class LeadSupportersService {
  constructor(
    private readonly tenantDb: TenantDb,
    private readonly leads: LeadsService,
    private readonly notifications: NotificationsService,
    private readonly audit: AuditService,
  ) {}

  private scopeOf(actor: Actor): Scope {
    if (!actor.tenantId) throw forbidden();
    return { tenantId: actor.tenantId };
  }

  private rows(scope: Scope, leadId: string, db: EntityManager) {
    return rowsOf<{
      userId: string;
      name: string;
      agentCode: string | null;
      addedAt: Date;
      addedByName: string | null;
    }>(
      db,
      `SELECT s.user_id AS "userId", u.name, u.agent_code AS "agentCode", s.created_at AS "addedAt",
              a.name AS "addedByName"
         FROM lead_supporters s
         JOIN users u ON u.tenant_id = s.tenant_id AND u.id = s.user_id
         LEFT JOIN users a ON a.tenant_id = s.tenant_id AND a.id = s.added_by
        WHERE s.tenant_id = $1 AND s.lead_id = $2
        ORDER BY s.created_at, s.id`,
      [scope.tenantId, leadId],
    );
  }

  /** For the lead page: its supporters, whether the viewer is one, and whether they may change them. */
  async forLead(actor: Actor, id: string) {
    const scope = this.scopeOf(actor);
    return this.tenantDb.run(scope, async (db) => {
      const lead = await this.leads.visibleLead(actor, id, db);
      const supporters = await this.rows(scope, lead.id, db);
      return {
        supporters,
        supporting: supporters.some((item) => item.userId === actor.id),
        canSupport: await this.leads.managesSupport(actor, lead, db),
      };
    });
  }

  private async manageable(
    actor: Actor,
    id: string,
    db: EntityManager,
  ): Promise<Lead> {
    const lead = await this.leads.visibleLead(actor, id, db);
    if (!(await this.leads.managesSupport(actor, lead, db))) throw forbidden();
    return lead;
  }

  /** Active users of the GA who could support the lead: not its assignee, not already supporting. */
  async candidates(actor: Actor, id: string, q?: string) {
    const scope = this.scopeOf(actor);
    return this.tenantDb.run(scope, async (db) => {
      const lead = await this.manageable(actor, id, db);
      const taken = new Set(
        (await this.rows(scope, lead.id, db)).map((item) => item.userId),
      );
      const people = await this.notifications.activeActors(
        scope,
        { q, limit: 50 },
        db,
      );
      return {
        items: people
          .filter(
            (person) =>
              !taken.has(person.id) &&
              !(
                person.agentCode && person.agentCode === lead.assignedAgentCode
              ),
          )
          .slice(0, CANDIDATES)
          .map((person) => ({
            id: person.id,
            name: person.name,
            agentCode: person.agentCode ?? null,
          })),
      };
    });
  }

  /**
   * A supporter joins or leaves beside the assignee, so the history says "added" or "removed" with
   * the name, never an old value replaced by a new one.
   */
  private async history(
    lead: Lead,
    actor: Actor,
    field: 'supporterAdded' | 'supporterRemoved',
    name: string,
    db: EntityManager,
  ) {
    await db.getRepository(LeadHistory).insert({
      tenantId: lead.tenantId,
      leadId: lead.id,
      field,
      oldValue: null,
      newValue: name,
      changedBy: actor.id,
      changedAt: new Date(),
    });
  }

  async add(actor: Actor, id: string, userId: string): Promise<void> {
    const scope = this.scopeOf(actor);
    await this.tenantDb.run(scope, async (db) => {
      const lead = await this.manageable(actor, id, db);
      const [person] = await this.notifications.activeActors(
        scope,
        { ids: [userId] },
        db,
      );
      // An unknown or disabled user, or the assignee, who already works the lead
      if (
        !person ||
        (person.agentCode && person.agentCode === lead.assignedAgentCode)
      )
        throw new ApiException(HttpStatus.BAD_REQUEST, ErrorCode.InvalidInput, {
          issues: [{ path: 'userId', message: 'not_supporter' }],
        });
      const added = await rowsOf<{ id: string }>(
        db,
        `INSERT INTO lead_supporters (tenant_id, lead_id, user_id, added_by)
         VALUES ($1, $2, $3, $4)
         ON CONFLICT (tenant_id, lead_id, user_id) DO NOTHING RETURNING id`,
        [scope.tenantId, lead.id, person.id, actor.id],
      );
      // Adding someone twice changes nothing
      if (added.length === 0) return;
      await this.history(lead, actor, 'supporterAdded', person.name, db);
      await this.audit.record(
        {
          tenantId: scope.tenantId,
          userId: actor.id,
          action: AuditAction.Create,
          entity: 'lead_supporter',
          entityId: lead.id,
          meta: { userId: person.id },
        },
        db,
      );
      if (person.id !== actor.id)
        await this.notifications.notify(
          scope,
          [person.id],
          {
            type: 'LEAD_SUPPORT',
            data: { leadId: lead.id },
            link: `/leads/${lead.id}`,
          },
          db,
        );
    });
  }

  /** Whoever manages the lead's supporters removes one; a supporter may leave by themselves. */
  async remove(actor: Actor, id: string, userId: string): Promise<void> {
    const scope = this.scopeOf(actor);
    if (!isId(userId)) throw notFound();
    await this.tenantDb.run(scope, async (db) => {
      const lead =
        userId === actor.id
          ? await this.leads.visibleLead(actor, id, db)
          : await this.manageable(actor, id, db);
      const removed = await rowsOf<{ name: string }>(
        db,
        `WITH gone AS (
           DELETE FROM lead_supporters
            WHERE tenant_id = $1 AND lead_id = $2 AND user_id = $3 RETURNING user_id)
         SELECT u.name FROM gone JOIN users u ON u.tenant_id = $1 AND u.id = gone.user_id`,
        [scope.tenantId, lead.id, userId],
      );
      if (removed.length === 0) throw notFound();
      await this.history(lead, actor, 'supporterRemoved', removed[0].name, db);
      await this.audit.record(
        {
          tenantId: scope.tenantId,
          userId: actor.id,
          action: AuditAction.Delete,
          entity: 'lead_supporter',
          entityId: lead.id,
          meta: { userId },
        },
        db,
      );
    });
  }
}
