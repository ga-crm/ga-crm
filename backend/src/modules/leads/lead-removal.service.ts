import { HttpStatus, Injectable } from '@nestjs/common';
import type { EntityManager } from 'typeorm';
import {
  ApiException,
  ErrorCode,
  forbidden,
  notFound,
} from '../../common/errors.js';
import { isId } from '../../common/pagination.js';
import type { PageQueryDto } from '../../common/pagination.js';
import { Permission } from '../../common/rbac.js';
import type { Actor, Scope } from '../../common/rbac.js';
import { rowsOf } from '../../core/persistence/sql.js';
import { TenantDb } from '../../core/tenancy/tenant-db.js';
import { AuditAction, AuditService } from '../audit/audit.service.js';
import { Lead, LeadHistory } from './infrastructure/lead.entities.js';
import type { DeleteLeadDto } from './leads.dto.js';
import { LeadsService } from './leads.service.js';

const DAY_MS = 86_400_000;
/** LEAD-40: how long a deleted lead can come back. */
export const RESTORE_DAYS = 30;

/**
 * PDP-6: what counts as personal on a lead, its history and its notes. The application and policy
 * numbers go too: like the client code, they point straight back at the person in Success data.
 */
const PERSONAL_COLUMNS = [
  'email',
  'dob',
  'age',
  'extra_info',
  'progress_note',
  'ref_link',
  'application_no',
  'policy_no',
] as const;
const PERSONAL_HISTORY = [
  'fullName',
  'phone',
  'email',
  'dob',
  'age',
  'extraInfo',
  'progressNote',
  'refLink',
  'applicationNo',
  'policyNo',
  // LEAD-32: the linked client, named in the history (decided 25/11/2026)
  'client',
  // The merged lead's number and name (LEAD-41), and note texts before an edit or delete (NOTE-4)
  'merge',
  'noteEdited',
  'noteDeleted',
];

/** LEAD-40, LEAD-41, PDP-6: deleting, restoring, merging and erasing leads (leads.manage). */
@Injectable()
export class LeadRemovalService {
  constructor(
    private readonly tenantDb: TenantDb,
    private readonly reader: LeadsService,
    private readonly audit: AuditService,
  ) {}

  private scopeOf(actor: Actor): Scope {
    if (!actor.tenantId) throw forbidden();
    // PERM-4: the API checks it even though the controller does too
    if (!actor.permissions.includes(Permission.LeadsManage)) throw forbidden();
    return { tenantId: actor.tenantId };
  }

  /** LEAD-40 + PDP-6 */
  async remove(actor: Actor, id: string, dto: DeleteLeadDto): Promise<void> {
    const scope = this.scopeOf(actor);
    const now = new Date();
    await this.tenantDb.run(scope, async (db) => {
      const lead = await this.reader.visibleLead(actor, id, db);
      // The lead's open tasks stop with it; a restore reopens them
      await db.query(
        `UPDATE tasks SET status = 'CANCELLED', suspended_by_delete = true
          WHERE tenant_id = $1 AND lead_id = $2 AND status = 'OPEN'`,
        [scope.tenantId, lead.id],
      );
      if (dto.mode === 'SOFT')
        await this.softDelete(lead, actor, dto.reason, now, db);
      else await this.erase(lead, now, db);
      await this.reader.relinked(scope, [lead.id], now, db);
      await this.audit.record(
        {
          tenantId: scope.tenantId,
          userId: actor.id,
          action: AuditAction.Delete,
          entity: 'lead',
          entityId: lead.id,
          meta: { mode: dto.mode, reason: dto.reason },
        },
        db,
      );
    });
  }

  private async softDelete(
    lead: Lead,
    actor: Actor,
    reason: string,
    now: Date,
    db: EntityManager,
    mergedInto?: string,
  ): Promise<void> {
    await db.getRepository(Lead).update(
      { id: lead.id, tenantId: lead.tenantId },
      {
        deletedAt: now,
        deletedBy: actor.id,
        deleteReason: reason,
        deletedPhone: lead.phone,
        // Frees the number for a new lead while this one waits in the bin
        phone: `deleted:${lead.id}`,
        ...(mergedInto && { mergedInto }),
      },
    );
  }

  /**
   * PDP-6: personal fields, note and comment texts are erased for good; stage, dates, source,
   * campaign and agent stay so the statistics still add up. The lead leaves every list.
   */
  private async erase(lead: Lead, now: Date, db: EntityManager): Promise<void> {
    const owned = [lead.tenantId, lead.id];
    await db.query(
      `UPDATE leads SET full_name = '', name_norm = '', phone = $3, erased_at = $4, updated_at = $4,
         ${PERSONAL_COLUMNS.map((column) => `${column} = NULL`).join(', ')},
         client_id = NULL, link_status = NULL, linked_by = NULL, linked_at = NULL
       WHERE tenant_id = $1 AND id = $2`,
      [...owned, `erased:${lead.id}`, now],
    );
    await db.query(
      `UPDATE interactions SET note = '', outcome = NULL WHERE tenant_id = $1 AND lead_id = $2`,
      owned,
    );
    await db.query(
      `UPDATE comments SET body = '', mentions = NULL WHERE tenant_id = $1 AND lead_id = $2`,
      owned,
    );
    await db.query(
      `UPDATE lead_history SET old_value = NULL, new_value = NULL, note = NULL
        WHERE tenant_id = $1 AND lead_id = $2 AND field = ANY($3::text[])`,
      [...owned, PERSONAL_HISTORY],
    );
    // Notes written while changing stage are free text too; the change itself stays for statistics
    await db.query(
      `UPDATE lead_history SET note = NULL WHERE tenant_id = $1 AND lead_id = $2`,
      owned,
    );
    // Task titles are written by people ("Gọi chị Lan"); the tasks were cancelled above
    await db.query(
      `UPDATE tasks SET title = '' WHERE tenant_id = $1 AND lead_id = $2`,
      owned,
    );
    // A lead merged into another left its number and name on that lead's merge row
    if (lead.mergedInto)
      await db.query(
        `UPDATE lead_history SET old_value = NULL, note = NULL
          WHERE tenant_id = $1 AND lead_id = $2 AND field = 'merge' AND old_value = $3`,
        [lead.tenantId, lead.mergedInto, lead.deletedPhone ?? lead.phone],
      );
  }

  /** LEAD-40: within 30 days, unless it was merged into another lead. */
  async restore(actor: Actor, id: string): Promise<void> {
    const scope = this.scopeOf(actor);
    const now = new Date();
    await this.tenantDb.run(scope, async (db) => {
      if (!isId(id)) throw notFound();
      const lead = await db
        .getRepository(Lead)
        .createQueryBuilder('lead')
        .where(
          'lead.tenantId = :tenantId AND lead.id = :id AND lead.deletedAt IS NOT NULL',
          { tenantId: scope.tenantId, id },
        )
        .setLock('pessimistic_write')
        .getOne();
      if (!lead) throw notFound();
      if (
        lead.mergedInto ||
        now.getTime() - lead.deletedAt!.getTime() > RESTORE_DAYS * DAY_MS
      )
        throw new ApiException(
          HttpStatus.CONFLICT,
          ErrorCode.LeadNotRestorable,
        );
      // Someone may have taken the number since
      const [taken] = await rowsOf<{ n: number }>(
        db,
        `SELECT count(*)::int AS n FROM leads WHERE tenant_id = $1 AND phone = $2`,
        [scope.tenantId, lead.deletedPhone],
      );
      if (taken.n > 0)
        throw new ApiException(HttpStatus.CONFLICT, ErrorCode.PhoneExists);
      await db.getRepository(Lead).update(
        { id: lead.id, tenantId: scope.tenantId },
        {
          phone: lead.deletedPhone!,
          deletedAt: null,
          deletedBy: null,
          deleteReason: null,
          deletedPhone: null,
        },
      );
      await db.query(
        `UPDATE tasks SET status = 'OPEN', suspended_by_delete = NULL
          WHERE tenant_id = $1 AND lead_id = $2 AND suspended_by_delete`,
        [scope.tenantId, lead.id],
      );
      await this.reader.relinked(scope, [lead.id], now, db);
      await this.audit.record(
        {
          tenantId: scope.tenantId,
          userId: actor.id,
          action: AuditAction.Update,
          entity: 'lead',
          entityId: lead.id,
          meta: { restored: true },
        },
        db,
      );
    });
  }

  /** LEAD-40: the bin, newest first, for the last 30 days. */
  async deleted(actor: Actor, query: PageQueryDto) {
    const scope = this.scopeOf(actor);
    const since = new Date(Date.now() - RESTORE_DAYS * DAY_MS);
    return this.tenantDb.run(scope, async (db) => {
      const [items, total] = await db
        .getRepository(Lead)
        .createQueryBuilder('lead')
        .where('lead.tenantId = :tenantId AND lead.deletedAt >= :since', {
          tenantId: scope.tenantId,
          since,
        })
        .orderBy('lead.deletedAt', 'DESC')
        .addOrderBy('lead.id', 'DESC')
        .skip((query.page - 1) * query.pageSize)
        .take(query.pageSize)
        .getManyAndCount();
      const people = await rowsOf<{ id: string; name: string }>(
        db,
        `SELECT id, name FROM users WHERE tenant_id = $1 AND id = ANY($2::uuid[])`,
        [scope.tenantId, items.flatMap((item) => item.deletedBy ?? [])],
      );
      const nameOf = new Map(people.map((user) => [user.id, user.name]));
      return {
        items: items.map((item) => ({
          id: item.id,
          fullName: item.fullName,
          phone: item.deletedPhone,
          assignedAgentCode: item.assignedAgentCode,
          stage: item.stage,
          deletedAt: item.deletedAt,
          deletedBy: item.deletedBy
            ? (nameOf.get(item.deletedBy) ?? null)
            : null,
          reason: item.deleteReason,
          mergedInto: item.mergedInto,
          restorableUntil: new Date(
            item.deletedAt!.getTime() + RESTORE_DAYS * DAY_MS,
          ),
        })),
        page: query.page,
        pageSize: query.pageSize,
        total,
      };
    });
  }

  /**
   * LEAD-41: the customer changed number. `mergeId` folds into `keepId`: notes, contacts, tasks,
   * comments, history and campaign memberships move; the kept lead fills its blanks from the other;
   * the other goes to the bin for good. Both are audited.
   */
  async merge(actor: Actor, keepId: string, mergeId: string): Promise<void> {
    const scope = this.scopeOf(actor);
    if (keepId === mergeId)
      throw new ApiException(HttpStatus.BAD_REQUEST, ErrorCode.InvalidInput);
    const now = new Date();
    await this.tenantDb.run(scope, async (db) => {
      const keep = await this.reader.visibleLead(actor, keepId, db);
      const gone = await this.reader.visibleLead(actor, mergeId, db);
      if (
        keep.clientId &&
        gone.clientId &&
        keep.clientId !== gone.clientId
      )
        throw new ApiException(
          HttpStatus.CONFLICT,
          ErrorCode.LeadMergeConflict,
        );

      const move = [scope.tenantId, gone.id, keep.id];
      for (const table of ['interactions', 'comments', 'lead_history'])
        await db.query(
          `UPDATE ${table} SET lead_id = $3 WHERE tenant_id = $1 AND lead_id = $2`,
          move,
        );
      // LEAD-22: the other lead's automatic contact task has no purpose now
      await db.query(
        `UPDATE tasks SET status = 'CANCELLED'
          WHERE tenant_id = $1 AND lead_id = $2 AND source = 'AUTO_ASSIGN' AND status = 'OPEN'`,
        [scope.tenantId, gone.id],
      );
      await db.query(
        `UPDATE tasks SET lead_id = $3, agent_code = coalesce($4, agent_code)
          WHERE tenant_id = $1 AND lead_id = $2`,
        [...move, keep.assignedAgentCode],
      );
      // A campaign the kept lead is already in keeps one membership
      await db.query(
        `DELETE FROM campaign_members gone
          WHERE gone.tenant_id = $1 AND gone.lead_id = $2
            AND EXISTS (SELECT 1 FROM campaign_members kept
                         WHERE kept.tenant_id = $1 AND kept.lead_id = $3
                           AND kept.campaign_id = gone.campaign_id)`,
        move,
      );
      await db.query(
        `UPDATE campaign_members SET lead_id = $3 WHERE tenant_id = $1 AND lead_id = $2`,
        move,
      );

      const earliest = (a: Date | null, b: Date | null) =>
        a && b ? (a < b ? a : b) : (a ?? b);
      const latest = (a: Date | null, b: Date | null) =>
        a && b ? (a > b ? a : b) : (a ?? b);
      const fill = Object.fromEntries(
        (
          [
            'email',
            'dob',
            'age',
            'region',
            'province',
            'extraInfo',
            'productInterest',
            'productSecondary',
          ] as const
        )
          .filter((field) => keep[field] === null && gone[field] !== null)
          .map((field) => [field, gone[field]]),
      );
      const lastComment = latest(keep.lastCommentAt, gone.lastCommentAt);
      // The other lead's link moves to the kept one; the unique index allows one at a time
      if (gone.clientId)
        await db.getRepository(Lead).update(
          { id: gone.id, tenantId: scope.tenantId },
          {
            clientId: null,
            linkStatus: null,
            linkedBy: null,
            linkedAt: null,
          },
        );
      await db.getRepository(Lead).update(
        { id: keep.id, tenantId: scope.tenantId },
        {
          ...fill,
          firstContactAt: earliest(keep.firstContactAt, gone.firstContactAt),
          lastContactAt: latest(keep.lastContactAt, gone.lastContactAt),
          ...(lastComment && {
            lastCommentAt: lastComment,
            lastCommentBy:
              lastComment === gone.lastCommentAt
                ? gone.lastCommentBy
                : keep.lastCommentBy,
          }),
          ...(!keep.clientId &&
            gone.clientId && {
              clientId: gone.clientId,
              linkStatus: gone.linkStatus,
              linkedBy: gone.linkedBy,
              linkedAt: gone.linkedAt,
            }),
          updatedAt: now,
        },
      );
      await db.getRepository(LeadHistory).insert({
        tenantId: scope.tenantId,
        leadId: keep.id,
        field: 'merge',
        oldValue: gone.phone,
        note: gone.fullName,
        changedBy: actor.id,
        changedAt: now,
      });
      await this.softDelete(
        gone,
        actor,
        `Gộp vào lead ${keep.fullName}`,
        now,
        db,
        keep.id,
      );
      await this.reader.relinked(scope, [keep.id, gone.id], now, db);
      for (const [lead, action, meta] of [
        [keep, AuditAction.Update, { mergedFrom: gone.id }],
        [gone, AuditAction.Delete, { mergedInto: keep.id }],
      ] as const)
        await this.audit.record(
          {
            tenantId: scope.tenantId,
            userId: actor.id,
            action,
            entity: 'lead',
            entityId: lead.id,
            meta,
          },
          db,
        );
    });
  }

  /**
   * LEAD-40: after 30 days a deleted lead and everything on it go for good. Notes, comments,
   * history, tasks and memberships follow through ON DELETE CASCADE.
   */
  async purge(scope: Scope, now = new Date()): Promise<number> {
    return this.tenantDb.run(scope, async (db) => {
      const removed = await rowsOf<{ id: string }>(
        db,
        `DELETE FROM leads WHERE tenant_id = $1 AND deleted_at < $2 RETURNING id`,
        [scope.tenantId, new Date(now.getTime() - RESTORE_DAYS * DAY_MS)],
      );
      if (removed.length > 0)
        await this.audit.record(
          {
            tenantId: scope.tenantId,
            userId: null,
            action: AuditAction.Delete,
            entity: 'lead',
            meta: { purged: removed.length, afterDays: RESTORE_DAYS },
          },
          db,
        );
      return removed.length;
    });
  }
}
