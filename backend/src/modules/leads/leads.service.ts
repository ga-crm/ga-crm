import { HttpStatus, Injectable } from '@nestjs/common';
import { In } from 'typeorm';
import type { EntityManager, SelectQueryBuilder } from 'typeorm';
import {
  ApiException,
  ErrorCode,
  forbidden,
  notFound,
  pgError,
} from '../../common/errors.js';
import { normalizeName, parsePhone } from '../../common/normalize.js';
import { escapeLike, isId } from '../../common/pagination.js';
import type { Actor, Scope } from '../../common/rbac.js';
import { Permission, Role, seesPhoneOf } from '../../common/rbac.js';
import { newId, withoutNulls } from '../../core/persistence/ids.js';
import { rowsOf } from '../../core/persistence/sql.js';
import { insertRows, updateRows } from '../../core/persistence/upsert.js';
import { TenantDb } from '../../core/tenancy/tenant-db.js';
import { AccessService } from '../access/access.service.js';
import { AgentsService } from '../agents/agents.service.js';
import { AuditAction, AuditService } from '../audit/audit.service.js';
import type { NotificationInput } from '../notifications/notifications.service.js';
import { NotificationsService } from '../notifications/notifications.service.js';
import { GeoService } from '../geo/geo.service.js';
import { ProductsService } from '../products/products.service.js';
import { TenantsService } from '../tenants/tenants.service.js';
import {
  Campaign,
  Comment,
  CONTACT_TYPES,
  Interaction,
  Lead,
  LeadHistory,
  type LeadReleaseReason,
  LeadSupporter,
  Task,
} from './infrastructure/lead.entities.js';
import type { ExistingLead, LeadPlan } from '../imports/lead-plan.js';
import { rowInstant } from '../imports/lead-plan.js';
import { LeadOptionsService } from './lead-options.service.js';
import {
  APPLICATION_NO,
  canLinkLead,
  contactTaskTitle,
  deadlineMs,
  handoverHistory,
  isOverdue,
  isSystemCare,
  LEAD_STAGES,
  maskPhone,
  NEXT_ACTION_TASK_TITLE,
  POLICY_NO,
  stageFor,
} from './lead-rules.js';
import type {
  AddActivityDto,
  AddCommentDto,
  AddTaskDto,
  CreateLeadDto,
  EditNoteDto,
  ListLeadsQueryDto,
  UpdateLeadDto,
  UpdateTaskDto,
} from './leads.dto.js';
import { MAX_ASSIGN } from './leads.dto.js';
import {
  CLOSED_CARE,
  departedCodesSql,
  STOPPED_AGENT_STATUS,
} from '../access/departed.js';

const FAR_FUTURE = '2999-01-01T00:00:00Z';
/**
 * Decided 26/11/2026: the viewer (`:supporterId`) is one of the lead's supporters. Part of LEAD-6,
 * so every list, board and count that asks `visible` includes the leads a person supports.
 */
const SUPPORTED_BY_VIEWER = `EXISTS (SELECT 1 FROM lead_supporters supporter
  WHERE supporter.tenant_id = lead.tenantId AND supporter.lead_id = lead.id
    AND supporter.user_id = :supporterId)`;
/** Section 16 kanban: cards per column; the count says how many more there are. */
const BOARD_CARDS = 50;
/** NOTE-8 */
const NOTE_EDIT_MS = 24 * 3_600_000;
const INFO_FIELDS = ['dob', 'province', 'email'] as const;

/** History values are text (LEAD-20). */
const text = (
  value: string | number | boolean | Date | null | undefined,
): string | null =>
  value === undefined || value === null
    ? null
    : value instanceof Date
      ? value.toISOString()
      : String(value);

const today = (now: Date) =>
  new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Ho_Chi_Minh' }).format(
    now,
  );

/** bigint columns come back as strings; the API sends numbers. */
const numberOf = (value: string | null): number | null =>
  value === null ? null : Number(value);

type ReassignListener = (
  scope: Scope,
  leadIds: string[],
  now: Date,
  db: EntityManager,
) => Promise<void>;

@Injectable()
export class LeadsService {
  constructor(
    private readonly tenantDb: TenantDb,
    private readonly access: AccessService,
    private readonly agents: AgentsService,
    private readonly audit: AuditService,
    private readonly leadOptions: LeadOptionsService,
    private readonly tenants: TenantsService,
    private readonly notifications: NotificationsService,
    private readonly products: ProductsService,
    private readonly geo: GeoService,
  ) {}

  private scopeOf(actor: Actor): Scope {
    if (!actor.tenantId) throw forbidden();
    return { tenantId: actor.tenantId };
  }

  private manages(actor: Actor): boolean {
    return actor.permissions.includes(Permission.LeadsManage);
  }

  /**
   * Open question 4 (decided 14/11/2026): a line manager (GAD, BM, UM with `leads.assign_line`)
   * reassigns leads among the agents of their own line. Returns that line, or null for a lead
   * manager, who reaches the whole GA (LEAD-21). Anyone else may not assign.
   */
  private async assignLine(
    actor: Actor,
    db: EntityManager,
  ): Promise<string[] | null> {
    if (this.manages(actor)) return null;
    if (!this.assignsInLine(actor)) throw forbidden();
    return this.agents.scopeCodes(actor, db);
  }

  private assignsInLine(actor: Actor): boolean {
    return (
      actor.permissions.includes(Permission.LeadsAssignLine) &&
      actor.reach === 'DOWNLINE' &&
      !!actor.agentCode
    );
  }

  /** LEAD-7, for other modules that change a lead (CMP-2). */
  mayWork(actor: Actor, lead: Pick<Lead, 'assignedAgentCode'>): boolean {
    return this.canWork(actor, lead);
  }

  /** LEAD-6: limits a lead query to what this person sees. */
  private async visible(
    builder: SelectQueryBuilder<Lead>,
    actor: Actor,
    db: EntityManager,
    options: { reachOnly?: boolean } = {},
  ): Promise<SelectQueryBuilder<Lead>> {
    const codes = await this.access.leadAgentCodes(actor, db);
    if (codes === null) return builder;
    // "Select all" is for assigning, and a lead one only supports is not theirs to move
    if (options.reachOnly)
      return builder.andWhere('lead.assignedAgentCode = ANY(:visibleCodes)', {
        visibleCodes: codes,
      });
    // Decided 26/11/2026: a supporter also sees the lead, with its phone masked (`phoneFor`)
    return codes === null
      ? builder
      : builder.andWhere(
          `(lead.assignedAgentCode = ANY(:visibleCodes) OR ${SUPPORTED_BY_VIEWER})`,
          { visibleCodes: codes, supporterId: actor.id },
        );
  }

  /** LEAD-6: whether the lead is in the person's own reach, not only theirs to support. */
  private async inReach(
    actor: Actor,
    lead: Pick<Lead, 'assignedAgentCode'>,
    db: EntityManager,
  ): Promise<boolean> {
    const codes = await this.access.leadAgentCodes(actor, db);
    return (
      codes === null ||
      (!!lead.assignedAgentCode && codes.includes(lead.assignedAgentCode))
    );
  }

  /** Decided 26/11/2026: the leads among these that this user supports. */
  private async supportedBy(
    userId: string,
    leadIds: string[],
    db: EntityManager,
  ): Promise<Set<string>> {
    if (leadIds.length === 0) return new Set();
    const rows = await db.getRepository(LeadSupporter).find({
      where: { userId, leadId: In(leadIds) },
      select: { leadId: true },
    });
    return new Set(rows.map((row) => row.leadId));
  }

  /**
   * Decided 26/11/2026: who adds and removes a lead's supporters: whoever works the lead (LEAD-7),
   * or a line manager for a lead of their own line.
   */
  async managesSupport(
    actor: Actor,
    lead: Pick<Lead, 'assignedAgentCode'>,
    db: EntityManager,
  ): Promise<boolean> {
    if (this.canWork(actor, lead)) return true;
    return this.assignsInLine(actor) && (await this.inReach(actor, lead, db));
  }

  /** Live leads of the tenant: not in the bin (LEAD-40) and not erased (PDP-6). */
  private live(db: EntityManager, scope: Scope): SelectQueryBuilder<Lead> {
    return db
      .getRepository(Lead)
      .createQueryBuilder('lead')
      .where(
        'lead.tenantId = :tenantId AND lead.deletedAt IS NULL AND lead.erasedAt IS NULL',
        { tenantId: scope.tenantId },
      );
  }

  /** LEAD-7 */
  private canWork(
    actor: Actor,
    lead: Pick<Lead, 'assignedAgentCode'>,
  ): boolean {
    return (
      this.manages(actor) ||
      (!!actor.agentCode && lead.assignedAgentCode === actor.agentCode)
    );
  }

  /**
   * PDP-3, changed 27/11/2026: only whoever the lead is assigned to, and the GA director, see its
   * phone. A lead manager (Admin), a line manager and a supporter get it masked.
   */
  private seesPhone(
    actor: Actor,
    lead: Pick<Lead, 'assignedAgentCode'>,
  ): boolean {
    return seesPhoneOf(actor, [lead.assignedAgentCode]);
  }

  private phoneFor(
    actor: Actor,
    lead: Pick<Lead, 'assignedAgentCode' | 'phone'>,
  ): string {
    return this.seesPhone(actor, lead) ? lead.phone : maskPhone(lead.phone);
  }

  /** LEAD-40, LEAD-41: the lead this person sees, for the removal service. */
  visibleLead(actor: Actor, id: string, db: EntityManager): Promise<Lead> {
    return this.requireVisible(actor, id, db);
  }

  /** CUS-4: lets the client links follow leads that were deleted, restored or merged. */
  relinked(
    scope: Scope,
    leadIds: string[],
    now: Date,
    db: EntityManager,
  ): Promise<void> {
    return this.reassigned(scope, leadIds, now, db);
  }

  /** FAM-6: whether a lead exists and this person may see it (404 otherwise). */
  async assertVisible(actor: Actor, id: string): Promise<void> {
    await this.tenantDb.run(this.scopeOf(actor), (db) =>
      this.requireVisible(actor, id, db),
    );
  }

  /** LEAD-32: the lead this person may work on (404 unseen, 403 lead_not_yours). */
  workable(actor: Actor, id: string, db: EntityManager): Promise<Lead> {
    return this.requireWorkable(actor, id, db);
  }

  /**
   * CUS-4 + LEAD-32: the client module keeps a linked client with the lead's assignee. It listens
   * here rather than being imported, since it depends on this module.
   */
  private readonly reassignListeners: ReassignListener[] = [];

  onReassign(listener: ReassignListener): void {
    this.reassignListeners.push(listener);
  }

  private async reassigned(
    scope: Scope,
    leadIds: string[],
    now: Date,
    db: EntityManager,
  ): Promise<void> {
    if (leadIds.length === 0) return;
    for (const listener of this.reassignListeners)
      await listener(scope, leadIds, now, db);
  }

  private async requireVisible(
    actor: Actor,
    id: string,
    db: EntityManager,
  ): Promise<Lead> {
    const scope = this.scopeOf(actor);
    if (!isId(id)) throw notFound();
    const lead = await (
      await this.visible(this.live(db, scope), actor, db)
    )
      .andWhere('lead.id = :id', { id })
      .getOne();
    // TEN-3: another GA's lead, and one outside the actor's branch, both look missing
    if (!lead) throw notFound();
    return lead;
  }

  private async requireWorkable(
    actor: Actor,
    id: string,
    db: EntityManager,
  ): Promise<Lead> {
    const lead = await this.requireVisible(actor, id, db);
    if (!this.canWork(actor, lead))
      throw new ApiException(HttpStatus.FORBIDDEN, ErrorCode.LeadNotYours);
    return lead;
  }

  /**
   * Decided 26/11/2026: the assignee and the lead's supporters work on it together. A supporter
   * (a mentor, say) writes notes and shares its tasks; the lead's own fields, its status and the
   * record of contacts stay with whoever works it (LEAD-7), and its phone stays masked (PDP-3).
   */
  private async requireContributor(
    actor: Actor,
    id: string,
    db: EntityManager,
  ): Promise<Lead> {
    const lead = await this.requireVisible(actor, id, db);
    if (
      !this.canWork(actor, lead) &&
      !(await this.supportedBy(actor.id, [lead.id], db)).has(lead.id)
    )
      throw new ApiException(HttpStatus.FORBIDDEN, ErrorCode.LeadNotYours);
    return lead;
  }

  private async phoneConflict(
    actor: Actor,
    scope: Scope,
    phone: string,
    db: EntityManager,
  ): Promise<ApiException | null> {
    const [existing] = await rowsOf<{
      id: string;
      assigned_agent_code: string | null;
    }>(
      db,
      `SELECT id, assigned_agent_code FROM leads WHERE tenant_id = $1 AND phone = $2`,
      [scope.tenantId, phone],
    );
    if (!existing) return null;
    // LEAD-1: the id is only for someone who may open that lead
    const codes = await this.access.leadAgentCodes(actor, db);
    const visible =
      codes === null ||
      (!!existing.assigned_agent_code &&
        codes.includes(existing.assigned_agent_code));
    return new ApiException(
      HttpStatus.CONFLICT,
      ErrorCode.PhoneExists,
      visible ? { leadId: existing.id } : undefined,
    );
  }

  private static duplicatePhone(error: unknown): boolean {
    const driver = pgError(error);
    return driver?.code === '23505' && driver.constraint === 'leads_phone_key';
  }

  private async requireCampaign(
    scope: Scope,
    id: string,
    db: EntityManager,
  ): Promise<void> {
    const [found] = await rowsOf<{ id: string }>(
      db,
      `SELECT id FROM campaigns WHERE tenant_id = $1 AND id = $2`,
      [scope.tenantId, id],
    );
    if (!found)
      throw new ApiException(
        HttpStatus.BAD_REQUEST,
        ErrorCode.CampaignNotFound,
      );
  }

  /**
   * LEAD-3 and LEAD-2. `ownerAgentCode` is for internal callers (FAM-6): a manager's lead goes to
   * that agent rather than staying unassigned. An agent's own lead is always theirs (LEAD-2).
   */
  async create(
    actor: Actor,
    dto: CreateLeadDto,
    options: { ownerAgentCode?: string } = {},
  ) {
    const scope = this.scopeOf(actor);
    const manages = this.manages(actor);
    if (!manages && !actor.agentCode) throw forbidden();
    if (!manages && (dto.campaignId || dto.assignedAgentCode))
      throw forbidden();

    const phone = parsePhone(dto.phone);
    if (!phone)
      throw new ApiException(HttpStatus.BAD_REQUEST, ErrorCode.InvalidPhone);

    // LEAD-2: an agent's own lead is always theirs
    const agentCode = manages
      ? (dto.assignedAgentCode ?? options.ownerAgentCode)
      : actor.agentCode;
    try {
      return await this.tenantDb.run(scope, async (db) => {
        const conflict = await this.phoneConflict(actor, scope, phone, db);
        if (conflict) throw conflict;
        if (dto.campaignId)
          await this.requireCampaign(scope, dto.campaignId, db);
        if (manages && agentCode) {
          const known = await this.agents.namesByCode(scope, [agentCode], db);
          if (known.size === 0)
            throw new ApiException(
              HttpStatus.BAD_REQUEST,
              ErrorCode.AgentNotFound,
            );
        }
        const now = new Date();
        // OPT-13: the source as the catalogue knows it
        const source = await this.leadOptions.resolveSource(
          scope,
          actor,
          dto.source,
          db,
        );
        // TENANT-5: a shown product of the shared catalogue
        if (dto.productCode)
          await this.products.usable(db, [
            { code: dto.productCode, path: 'productCode' },
          ]);
        // Decided 26/11/2026: a province (or one a typed name gives) and a commune of it
        const place = this.geo.place(
          dto.provinceCode ?? this.geo.matchProvince(dto.province),
          dto.wardCode ?? null,
        );
        const leads = db.getRepository(Lead);
        const lead = await leads.save(
          leads.create({
            tenantId: scope.tenantId,
            fullName: dto.fullName,
            nameNorm: normalizeName(dto.fullName),
            phone,
            source,
            email: dto.email ?? null,
            province: place.province?.name ?? dto.province ?? null,
            provinceCode: place.province?.code ?? null,
            wardCode: place.ward?.code ?? null,
            addressLine: dto.addressLine ?? null,
            gender: dto.gender ?? null,
            dob: dto.dob ?? null,
            campaignId: dto.campaignId ?? null,
            productCode: dto.productCode ?? null,
            leadDate: today(now),
            stage: 'NEW',
            origin: manages ? 'GA' : 'FC_OWN',
            // LEAD-3 (26/11/2026): no answer yet is no consent
            consentMarketing: dto.consent ?? false,
            consentAt: dto.consent ? now : null,
            consentSource: dto.consent ? 'CRM_FORM' : null,
            createdBy: actor.id,
            createdAt: now,
            updatedAt: now,
            // Their own lead is not news to them
            ...(!manages && { assigneeSeenAt: now, assigneeViewedAt: now }),
          }),
        );
        if (dto.note)
          await db.getRepository(Interaction).insert({
            tenantId: scope.tenantId,
            leadId: lead.id,
            agentCode: actor.agentCode ?? agentCode ?? null,
            type: 'NOTE',
            note: dto.note,
            occurredAt: now,
            initial: true,
            createdBy: actor.id,
            createdAt: now,
          });
        await this.audit.record(
          {
            tenantId: scope.tenantId,
            userId: actor.id,
            action: AuditAction.Create,
            entity: 'lead',
            entityId: lead.id,
            meta: { origin: lead.origin, source: dto.source },
          },
          db,
        );
        if (agentCode)
          await this.assignMany([lead], agentCode, actor, scope, now, db, {
            keepSeen: !manages,
          });
        return { id: lead.id };
      });
    } catch (error) {
      if (LeadsService.duplicatePhone(error))
        throw new ApiException(HttpStatus.CONFLICT, ErrorCode.PhoneExists);
      throw error;
    }
  }

  /** LEAD-22, for one lead or two hundred, in as few round trips as the rules allow. */
  private async assignMany(
    leads: Lead[],
    agentCode: string | null,
    actor: Actor,
    scope: Scope,
    now: Date,
    db: EntityManager,
    options: { keepSeen?: boolean } = {},
  ): Promise<void> {
    if (leads.length === 0) return;
    const ids = leads.map((lead) => lead.id);

    await db
      .createQueryBuilder()
      .update(Lead)
      .set({
        updatedAt: now,
        assignedAgentCode: agentCode,
        assignedBy: agentCode ? actor.id : null,
        assignedAt: agentCode ? now : null,
        // Decided 27/11/2026: an assignee takes the lead out of the pool
        ...(agentCode && {
          releasedAt: null,
          releasedFrom: null,
          releaseReason: null,
        }),
        ...(!options.keepSeen && {
          assigneeSeenAt: null,
          assigneeViewedAt: null,
        }),
      })
      .where('tenant_id = :tenantId AND id = ANY(:ids)', {
        tenantId: scope.tenantId,
        ids,
      })
      .execute();

    await this.reassigned(scope, ids, now, db);
    await db.getRepository(LeadHistory).insert(
      leads.map((lead) => ({
        tenantId: scope.tenantId,
        leadId: lead.id,
        field: 'assignee',
        oldValue: lead.assignedAgentCode,
        newValue: agentCode,
        changedBy: actor.id,
        changedAt: now,
      })),
    );

    await db.query(
      `UPDATE tasks SET status = 'CANCELLED'
        WHERE tenant_id = $1 AND lead_id = ANY($2::uuid[]) AND source = 'AUTO_ASSIGN' AND status = 'OPEN'`,
      [scope.tenantId, ids],
    );
    // A lead imported with a care status has already been contacted
    const needingContact = leads.filter(
      (lead) => !(lead.origin === 'IMPORT' && lead.careStatus),
    );
    if (agentCode && needingContact.length > 0) {
      const deadline = await this.deadline(scope, db);
      await db.getRepository(Task).insert(
        needingContact.map((lead) => ({
          tenantId: scope.tenantId,
          leadId: lead.id,
          agentCode,
          title: contactTaskTitle(deadline.hours),
          dueAt: new Date(now.getTime() + deadline.ms),
          status: 'OPEN' as const,
          source: 'AUTO_ASSIGN' as const,
          createdBy: actor.id,
          createdAt: now,
        })),
      );
    }

    for (const lead of leads)
      await this.audit.record(
        {
          tenantId: scope.tenantId,
          userId: actor.id,
          action: AuditAction.Assign,
          entity: 'lead',
          entityId: lead.id,
          meta: { from: lead.assignedAgentCode, to: agentCode },
        },
        db,
      );

    // NTF-2: the new assignee hears about it, unless they took the lead themselves
    if (agentCode && !options.keepSeen)
      await this.notifications.notifyAgent(
        scope,
        agentCode,
        assignedNotice(ids),
        { except: actor.id, db },
      );
  }

  /**
   * Decided 27/11/2026: leads their agent dropped or left without care go back to the GA's pool,
   * where the GA director and Admin see them and give them to someone else. The agent's open tasks
   * on them are cancelled. A self-sourced lead whose creator still works here stays (LEAD-9).
   * `actor` is null for the daily round. Returns the leads that went back.
   */
  async release(
    scope: Scope,
    leads: Lead[],
    reason: LeadReleaseReason,
    actor: Actor | null,
    now: Date,
    db: EntityManager,
  ): Promise<string[]> {
    const locked = await this.lockedOwnLeads(scope, leads, db);
    const going = leads.filter(
      (lead) => lead.assignedAgentCode && !locked.has(lead.id),
    );
    if (going.length === 0) return [];
    const ids = going.map((lead) => lead.id);
    for (const lead of going)
      await db.getRepository(Lead).update(
        { id: lead.id, tenantId: scope.tenantId },
        {
          updatedAt: now,
          assignedAgentCode: null,
          assignedBy: null,
          assignedAt: null,
          assigneeSeenAt: null,
          assigneeViewedAt: null,
          releasedAt: now,
          releasedFrom: lead.assignedAgentCode,
          releaseReason: reason,
        },
      );
    await this.reassigned(scope, ids, now, db);
    await db.query(
      `UPDATE tasks SET status = 'CANCELLED'
        WHERE tenant_id = $1 AND lead_id = ANY($2::uuid[]) AND status = 'OPEN'`,
      [scope.tenantId, ids],
    );
    await db.getRepository(LeadHistory).insert(
      going.flatMap((lead) => [
        {
          tenantId: scope.tenantId,
          leadId: lead.id,
          field: 'assignee',
          oldValue: lead.assignedAgentCode,
          newValue: null,
          changedBy: actor?.id ?? null,
          changedAt: now,
        },
        {
          tenantId: scope.tenantId,
          leadId: lead.id,
          field: 'released',
          oldValue: null,
          newValue: reason,
          changedBy: actor?.id ?? null,
          changedAt: now,
        },
      ]),
    );
    for (const lead of going)
      await this.audit.record(
        {
          tenantId: scope.tenantId,
          userId: actor?.id,
          action: AuditAction.Assign,
          entity: 'lead',
          entityId: lead.id,
          meta: { from: lead.assignedAgentCode, to: null, released: reason },
        },
        db,
      );
    return ids;
  }

  /**
   * Decided 27/11/2026: the daily round. An assigned lead still open (no care status, or "Đang
   * chăm sóc") with no contact for the GA's number of days (since its last contact, or since it
   * was assigned when nobody called yet) goes back to the pool.
   */
  async releaseIdle(scope: Scope, now: Date): Promise<string[]> {
    const { abandonDays } = await this.tenants.leadRules(scope);
    const before = new Date(now.getTime() - abandonDays * 86_400_000);
    return this.tenantDb.run(scope, async (db) => {
      const idle = await this.live(db, scope)
        .andWhere('lead.assignedAgentCode IS NOT NULL')
        .andWhere(
          "(lead.careStatus IS NULL OR lead.careStatus NOT IN ('WON', 'DROPPED', 'NOT_INTERESTED'))",
        )
        .andWhere('coalesce(lead.lastContactAt, lead.assignedAt) < :before', {
          before,
        })
        .setLock('pessimistic_write')
        .getMany();
      return this.release(scope, idle, 'IDLE', null, now, db);
    });
  }

  /** AGT-7 + LEAD-9: self-sourced leads whose creator still works here cannot move. */
  async lockedOwnLeads(
    scope: Scope,
    leads: Pick<Lead, 'id' | 'origin' | 'createdBy'>[],
    db?: EntityManager,
  ): Promise<Set<string>> {
    const own = leads.filter(
      (lead) => lead.origin === 'FC_OWN' && lead.createdBy,
    );
    if (own.length === 0) return new Set();
    const working = await this.agents.workingUsers(
      scope,
      own.map((lead) => lead.createdBy!),
      db,
    );
    return new Set(
      own.filter((lead) => working.has(lead.createdBy!)).map((lead) => lead.id),
    );
  }

  /** LEAD-21, and within a line for line managers (open question 4). */
  async assign(actor: Actor, leadIds: string[], agentCode: string | null) {
    const scope = this.scopeOf(actor);
    const unique = [...new Set(leadIds)];
    return this.tenantDb.run(scope, async (db) => {
      const line = await this.assignLine(actor, db);
      // Taking a lead off everyone returns it to the GA's pool, which only lead managers handle
      if (line && !agentCode) throw forbidden();
      if (agentCode) {
        const known = await this.agents.namesByCode(scope, [agentCode], db);
        if (known.size === 0)
          throw new ApiException(
            HttpStatus.BAD_REQUEST,
            ErrorCode.AgentNotFound,
          );
        if (line && !line.includes(agentCode))
          throw new ApiException(
            HttpStatus.FORBIDDEN,
            ErrorCode.AgentOutOfLine,
          );
      }
      // Locked, so two managers assigning the same leads cannot interleave
      const found = await this.live(db, scope)
        .andWhere('lead.id = ANY(:ids)', { ids: unique })
        .setLock('pessimistic_write')
        .getMany();
      if (found.length !== unique.length) throw notFound();
      // LEAD-6: a lead outside the line (or in the GA's pool) is not visible, so it looks missing
      if (
        line &&
        found.some(
          (lead) =>
            !lead.assignedAgentCode || !line.includes(lead.assignedAgentCode),
        )
      )
        throw notFound();

      const moving = found.filter(
        (lead) => (lead.assignedAgentCode ?? null) !== agentCode,
      );
      const locked = await this.lockedOwnLeads(scope, moving, db);
      if (locked.size > 0)
        throw new ApiException(HttpStatus.CONFLICT, ErrorCode.OwnLeadLocked);
      await this.assignMany(moving, agentCode, actor, scope, new Date(), db);
      return { assigned: moving.length };
    });
  }

  async assignees(actor: Actor, q?: string) {
    const scope = this.scopeOf(actor);
    const line = await this.tenantDb.run(scope, (db) =>
      this.assignLine(actor, db),
    );
    const agents = await this.agents.listForPicker(scope, q, line ?? undefined);
    const counts = await this.tenantDb.run(scope, (db) =>
      rowsOf<{ code: string; open: number }>(
        db,
        `SELECT assigned_agent_code AS code, count(*)::int AS open FROM leads
          WHERE tenant_id = $1 AND deleted_at IS NULL
            AND assigned_agent_code = ANY($2::text[])
            AND (care_status IS NULL OR care_status NOT IN ('WON', 'DROPPED', 'NOT_INTERESTED'))
          GROUP BY assigned_agent_code`,
        [scope.tenantId, agents.map((agent) => agent.agentCode)],
      ),
    );
    const byCode = new Map(counts.map((row) => [row.code, row.open]));
    return {
      items: agents.map((agent) => ({
        agentCode: agent.agentCode,
        name: agent.name,
        openLeads: byCode.get(agent.agentCode) ?? 0,
      })),
    };
  }

  /**
   * Open question 12e (decided 14/11/2026): who has left with work still in their name, for the
   * reminder "còn N lead / khách của người đã nghỉ". Open leads as in LEAD-23; clients they own.
   */
  async departedWork(actor: Actor) {
    const scope = this.scopeOf(actor);
    if (!this.manages(actor)) throw forbidden();
    const rows = await this.tenantDb.run(scope, (db) =>
      rowsOf<{
        agent_code: string;
        name: string | null;
        status: string;
        leads: number;
        clients: number;
      }>(
        db,
        `WITH departed AS ${departedCodesSql('$1', '$2')}
         SELECT d.agent_code,
                coalesce(
                  (SELECT g.name FROM agents g WHERE g.tenant_id = $1 AND g.agent_code = d.agent_code),
                  (SELECT u.name FROM users u WHERE u.tenant_id = $1 AND u.agent_code = d.agent_code
                    ORDER BY u.archived_at DESC NULLS FIRST LIMIT 1)) AS name,
                CASE WHEN EXISTS (SELECT 1 FROM users u WHERE u.tenant_id = $1 AND u.agent_code = d.agent_code
                                    AND u.status = 'ARCHIVED') THEN 'ARCHIVED'
                     WHEN EXISTS (SELECT 1 FROM users u WHERE u.tenant_id = $1 AND u.agent_code = d.agent_code
                                    AND u.status = 'DISABLED') THEN 'DISABLED'
                     ELSE 'STOPPED' END AS status,
                (SELECT count(*)::int FROM leads l
                  WHERE l.tenant_id = $1 AND l.assigned_agent_code = d.agent_code
                    AND l.deleted_at IS NULL AND l.erased_at IS NULL
                    AND (l.care_status IS NULL OR l.care_status NOT IN ${CLOSED_CARE})) AS leads,
                (SELECT count(*)::int FROM clients c
                  WHERE c.tenant_id = $1 AND d.agent_code = ANY(c.owner_agent_codes)) AS clients
           FROM departed d`,
        [scope.tenantId, STOPPED_AGENT_STATUS],
      ),
    );
    const items = rows
      .filter((row) => row.leads > 0 || row.clients > 0)
      .sort((a, b) => b.leads - a.leads || b.clients - a.clients)
      .map((row) => ({
        agentCode: row.agent_code,
        name: row.name,
        status: row.status,
        openLeads: row.leads,
        clients: row.clients,
      }));
    return {
      items,
      openLeads: items.reduce((sum, item) => sum + item.openLeads, 0),
      clients: items.reduce((sum, item) => sum + item.clients, 0),
    };
  }

  /** LEAD-29: the GA's contact deadline (section 5.2), as hours and milliseconds. */
  private async deadline(scope: Scope, db?: EntityManager) {
    const { contactDeadlineHours: hours } = await this.tenants.leadRules(
      scope,
      db,
    );
    return { hours, ms: deadlineMs(hours) };
  }

  /** LEAD-29 */
  private overdue(
    builder: SelectQueryBuilder<Lead>,
    now: Date,
    deadline: number,
  ) {
    return builder.andWhere(
      `lead.assignedAgentCode IS NOT NULL AND lead.assignedAt < :overdueAfter
        AND lead.firstContactAt IS NULL AND lead.interest IS NULL AND lead.careStatus IS NULL`,
      { overdueAfter: new Date(now.getTime() - deadline) },
    );
  }

  /** CMT-3 */
  private newComment(builder: SelectQueryBuilder<Lead>, actor: Actor) {
    return builder.andWhere(
      `lead.assignedAgentCode = :ownCode AND lead.lastCommentAt IS NOT NULL
        AND lead.lastCommentBy IS DISTINCT FROM :me
        AND (lead.assigneeViewedAt IS NULL OR lead.lastCommentAt > lead.assigneeViewedAt)`,
      { ownCode: actor.agentCode ?? '-', me: actor.id },
    );
  }

  private newlyAssigned(builder: SelectQueryBuilder<Lead>, actor: Actor) {
    return builder.andWhere(
      actor.agentCode
        ? 'lead.assignedAgentCode = :ownCode AND lead.assigneeSeenAt IS NULL'
        : 'lead.assignedAgentCode IS NOT NULL AND lead.assigneeSeenAt IS NULL',
      { ownCode: actor.agentCode },
    );
  }

  /** LEAD-35 + LEAD-38: the filter and the order shared by the list, the board and "select all". */
  private async listPlan(
    actor: Actor,
    query: ListLeadsQueryDto,
    db: EntityManager,
    options: { allStages?: boolean; reachOnly?: boolean } = {},
  ) {
    const scope = this.scopeOf(actor);
    const now = new Date();
    const deadline = (await this.deadline(scope, db)).ms;
    const filtered = async () => {
      const builder = await this.visible(this.live(db, scope), actor, db, {
        reachOnly: options.reachOnly,
      });
      if (query.q) {
        const name = `%${escapeLike(normalizeName(query.q))}%`;
        const digits = query.q.replace(/\D/g, '');
        // PDP-3: searching by phone would let others confirm a number they only see masked, so a
        // number finds only the leads whose phone the person sees (decided 27/11/2026)
        if (digits.length >= 3 && actor.roles.includes(Role.GAD))
          builder.andWhere(
            '(lead.nameNorm LIKE :name OR lead.phone LIKE :digits)',
            { name, digits: `%${digits}%` },
          );
        else if (digits.length >= 3 && actor.agentCode)
          builder.andWhere(
            '(lead.nameNorm LIKE :name OR (lead.phone LIKE :digits AND lead.assignedAgentCode = :ownCode))',
            { name, digits: `%${digits}%`, ownCode: actor.agentCode },
          );
        else builder.andWhere('lead.nameNorm LIKE :name', { name });
      }
      if (query.interest)
        builder.andWhere(
          query.interest === 'NONE'
            ? 'lead.interest IS NULL'
            : 'lead.interest = :interest',
          { interest: query.interest },
        );
      if (query.care)
        builder.andWhere(
          query.care === 'NONE'
            ? 'lead.careStatus IS NULL'
            : 'lead.careStatus = :care',
          { care: query.care },
        );
      if (query.stage && !options.allStages)
        builder.andWhere('lead.stage = :stage', { stage: query.stage });
      if (query.source)
        builder.andWhere('lead.source = :source', { source: query.source });
      if (query.product)
        builder.andWhere('lead.productCode = :product', {
          product: query.product,
        });
      if (query.province)
        builder.andWhere('lead.provinceCode = :province', {
          province: query.province,
        });
      if (query.ward)
        builder.andWhere('lead.wardCode = :ward', { ward: query.ward });
      if (query.campaignId)
        builder.andWhere('lead.campaignId = :campaignId', {
          campaignId: query.campaignId,
        });
      if (query.assignee === 'DEPARTED')
        // Open question 12e: leads still held by people who have left
        builder.andWhere(
          `lead.assignedAgentCode IN ${departedCodesSql(':tenantId', ':stoppedStatus')}`,
          { stoppedStatus: STOPPED_AGENT_STATUS },
        );
      else if (query.assignee)
        builder.andWhere(
          query.assignee === 'NONE'
            ? 'lead.assignedAgentCode IS NULL'
            : 'lead.assignedAgentCode = :assignee',
          { assignee: query.assignee },
        );
      if (query.from)
        builder.andWhere('lead.leadDate >= :from', { from: query.from });
      if (query.to) builder.andWhere('lead.leadDate <= :to', { to: query.to });
      // Decided 27/11/2026: the pool of leads their agent dropped or left without care
      if (query.released)
        builder.andWhere(
          'lead.releasedAt IS NOT NULL AND lead.assignedAgentCode IS NULL',
        );
      if (query.overdue) this.overdue(builder, now, deadline);
      if (query.isNew) this.newlyAssigned(builder, actor);
      if (query.newComment) this.newComment(builder, actor);
      if (query.mine)
        builder.andWhere('lead.assignedAgentCode = :mine', {
          mine: actor.agentCode ?? '-',
        });
      return builder;
    };
    const ordered = (builder: SelectQueryBuilder<Lead>) => {
      if (query.order) {
        const direction = query.order === 'asc' ? 'ASC' : 'DESC';
        return builder
          .orderBy('lead.leadDate', direction)
          .addOrderBy('lead.id', direction);
      }
      // LEAD-38: overdue first, then the next thing due, then the most recently assigned
      return builder
        .orderBy(
          `CASE WHEN lead.assignedAgentCode IS NOT NULL AND lead.assignedAt < :overdueAfter
             AND lead.firstContactAt IS NULL AND lead.interest IS NULL AND lead.careStatus IS NULL
             THEN 1 ELSE 0 END`,
          'DESC',
        )
        .addOrderBy(
          `COALESCE(lead.nextActionAt, '${FAR_FUTURE}'::timestamptz)`,
          'ASC',
        )
        .addOrderBy('lead.assignedAt', 'DESC', 'NULLS LAST')
        .addOrderBy('lead.id', 'DESC')
        .setParameter('overdueAfter', new Date(now.getTime() - deadline));
    };
    return { scope, filtered, ordered, now, deadline };
  }

  /**
   * LEAD-24: "Chọn tất cả theo bộ lọc". The ids of the leads the current filter shows, in list order,
   * up to the 200 one assignment takes. Lead managers only, since only they assign.
   */
  async selectIds(actor: Actor, query: ListLeadsQueryDto) {
    // LEAD-24 for whoever assigns; the list itself is already limited to what they see (LEAD-6)
    if (!this.manages(actor) && !this.assignsInLine(actor)) throw forbidden();
    return this.tenantDb.run(this.scopeOf(actor), async (db) => {
      const { filtered, ordered } = await this.listPlan(actor, query, db, {
        reachOnly: true,
      });
      const rows = await ordered(await filtered())
        .select('lead.id')
        .limit(MAX_ASSIGN)
        .getMany();
      const total = await (await filtered()).getCount();
      return { ids: rows.map((row) => row.id), total };
    });
  }

  /**
   * Section 16 "kanban" + LEAD-19: the leads of the current filter by stage, each column in list
   * order (LEAD-38) with its total and up to 50 cards. `canWork` says which cards may move.
   */
  async board(actor: Actor, query: ListLeadsQueryDto) {
    return this.tenantDb.run(this.scopeOf(actor), async (db) => {
      const { scope, filtered, ordered, now, deadline } = await this.listPlan(
        actor,
        query,
        db,
        { allStages: true },
      );
      const columns = [];
      for (const stage of LEAD_STAGES) {
        const inStage = async () =>
          (await filtered()).andWhere('lead.stage = :column', {
            column: stage,
          });
        const items = await ordered(await inStage())
          .limit(BOARD_CARDS)
          .getMany();
        const total = await (await inStage()).getCount();
        columns.push({ stage, total, items });
      }
      const rows = await this.rows(
        actor,
        scope,
        columns.flatMap((column) => column.items),
        now,
        deadline,
        db,
      );
      const byId = new Map(rows.map((row) => [row.id, row]));
      return {
        columns: columns.map((column) => ({
          stage: column.stage,
          total: column.total,
          items: column.items.map((lead) => ({
            ...byId.get(lead.id)!,
            canWork: this.canWork(actor, lead),
          })),
        })),
      };
    });
  }

  async list(actor: Actor, query: ListLeadsQueryDto) {
    return this.tenantDb.run(this.scopeOf(actor), async (db) => {
      const { scope, filtered, ordered, now, deadline } = await this.listPlan(
        actor,
        query,
        db,
      );
      const items = await ordered(await filtered())
        .offset((query.page - 1) * query.pageSize)
        .limit(query.pageSize)
        .getMany();
      const total = await (await filtered()).getCount();
      return {
        items: await this.rows(actor, scope, items, now, deadline, db),
        page: query.page,
        pageSize: query.pageSize,
        total,
      };
    });
  }

  /** LEAD-37: one row of the list (or card of the board). */
  private async rows(
    actor: Actor,
    scope: Scope,
    items: Lead[],
    now: Date,
    deadline: number,
    db: EntityManager,
  ) {
    const agentNames = await this.agents.namesByCode(
      scope,
      items.flatMap((lead) => lead.assignedAgentCode ?? []),
      db,
    );
    const campaignNames = await this.campaignNames(
      scope,
      items.flatMap((lead) => lead.campaignId ?? []),
      db,
    );
    // Decided 26/11/2026: leads the viewer sees only because they support them
    const codes = await this.access.leadAgentCodes(actor, db);
    const supported =
      codes === null
        ? new Set<string>()
        : await this.supportedBy(
            actor.id,
            items
              .filter(
                (lead) =>
                  !lead.assignedAgentCode ||
                  !codes.includes(lead.assignedAgentCode),
              )
              .map((lead) => lead.id),
            db,
          );
    return items.map((lead) => ({
      id: lead.id,
      fullName: lead.fullName,
      // PDP-3: masked for whoever cannot work on the lead, a supporter included
      phone: this.phoneFor(actor, lead),
      supporting: supported.has(lead.id),
      source: lead.source,
      phoneSource: lead.phoneSource,
      leadDate: lead.leadDate,
      stage: lead.stage,
      interest: lead.interest,
      careStatus: lead.careStatus,
      assignedAgentCode: lead.assignedAgentCode,
      releaseReason: lead.releaseReason,
      agentName: lead.assignedAgentCode
        ? (agentNames.get(lead.assignedAgentCode) ?? null)
        : null,
      campaignId: lead.campaignId,
      campaignName: lead.campaignId
        ? (campaignNames.get(lead.campaignId) ?? null)
        : null,
      assignedAt: lead.assignedAt,
      firstContactAt: lead.firstContactAt,
      lastContactAt: lead.lastContactAt,
      nextActionAt: lead.nextActionAt,
      consentMarketing: lead.consentMarketing,
      origin: lead.origin,
      isNew: !!lead.assignedAgentCode && !lead.assigneeSeenAt,
      newComment: this.hasNewComment(actor, lead),
      overdue: isOverdue(lead, now.getTime(), deadline),
    }));
  }

  private hasNewComment(actor: Actor, lead: Lead): boolean {
    return (
      !!actor.agentCode &&
      lead.assignedAgentCode === actor.agentCode &&
      !!lead.lastCommentAt &&
      lead.lastCommentBy !== actor.id &&
      (!lead.assigneeViewedAt || lead.lastCommentAt > lead.assigneeViewedAt)
    );
  }

  private async campaignNames(
    scope: Scope,
    ids: string[],
    db: EntityManager,
  ): Promise<Map<string, string>> {
    if (ids.length === 0) return new Map();
    const found = await rowsOf<{ id: string; name: string }>(
      db,
      `SELECT id, name FROM campaigns WHERE tenant_id = $1 AND id = ANY($2::uuid[])`,
      [scope.tenantId, [...new Set(ids)]],
    );
    return new Map(found.map((item) => [item.id, item.name]));
  }

  /** NTF-2: the overdue leads someone sees, for a manager's morning summary. */
  async overdueCount(actor: Actor, now = new Date()): Promise<number> {
    const scope = this.scopeOf(actor);
    return this.tenantDb.run(scope, async (db) => {
      const { ms } = await this.deadline(scope, db);
      return this.overdue(
        await this.visible(this.live(db, scope), actor, db),
        now,
        ms,
      ).getCount();
    });
  }

  /** LEAD-29, for the reminder rounds. */
  async contactDeadlineMs(scope: Scope): Promise<number> {
    return (await this.deadline(scope)).ms;
  }

  async counts(actor: Actor) {
    const scope = this.scopeOf(actor);
    return this.tenantDb.run(scope, async (db) => {
      const base = () => this.visible(this.live(db, scope), actor, db);
      const manages = this.manages(actor);
      const { ms } = await this.deadline(scope, db);
      const all = await (await base()).getCount();
      const mine = await (
        await base()
      )
        .andWhere('lead.assignedAgentCode = :mine', {
          mine: actor.agentCode ?? '-',
        })
        .getCount();
      const unassigned = manages
        ? await (
            await base()
          )
            .andWhere('lead.assignedAgentCode IS NULL')
            .getCount()
        : 0;
      const overdue = await this.overdue(
        await base(),
        new Date(),
        ms,
      ).getCount();
      const isNew = await this.newlyAssigned(await base(), actor).getCount();
      const newComment = await this.newComment(await base(), actor).getCount();
      // Decided 27/11/2026: the pool, for those who see unassigned leads
      const released = manages || actor.roles.includes(Role.GAD)
        ? await (
            await base()
          )
            .andWhere(
              'lead.releasedAt IS NOT NULL AND lead.assignedAgentCode IS NULL',
            )
            .getCount()
        : 0;
      return { all, mine, unassigned, overdue, isNew, newComment, released };
    });
  }

  async facets(actor: Actor) {
    const scope = this.scopeOf(actor);
    return this.tenantDb.run(scope, async (db) => {
      const distinct = async (column: string) =>
        (
          await (
            await this.visible(this.live(db, scope), actor, db)
          )
            .select(`DISTINCT lead.${column}`, 'value')
            .andWhere(`lead.${column} IS NOT NULL`)
            .getRawMany<{ value: string }>()
        ).map((row) => row.value);
      const sources = await distinct('source');
      const campaignIds = await distinct('campaignId');
      const agentCodes = await distinct('assignedAgentCode');
      const campaignNames = await this.campaignNames(scope, campaignIds, db);
      const agentNames = await this.agents.namesByCode(scope, agentCodes, db);
      return {
        sources: sources.sort((a, b) => a.localeCompare(b)),
        campaigns: [...campaignNames].map(([id, name]) => ({ id, name })),
        agents: [...agentNames].map(([code, name]) => ({ code, name })),
      };
    });
  }

  /** Section 17.7. Opening a lead also marks it seen for its agent (LEAD-25), without moving updatedAt. */
  async detail(actor: Actor, id: string) {
    const scope = this.scopeOf(actor);
    return this.tenantDb.run(scope, async (db) => {
      const lead = await this.requireVisible(actor, id, db);
      const newComment = this.hasNewComment(actor, lead);
      const wasNew = !!lead.assignedAgentCode && !lead.assigneeSeenAt;
      if (actor.agentCode && lead.assignedAgentCode === actor.agentCode)
        await db.query(
          `UPDATE leads SET assignee_viewed_at = now(),
              assignee_seen_at = coalesce(assignee_seen_at, now())
            WHERE id = $1 AND tenant_id = $2`,
          [lead.id, scope.tenantId],
        );

      const owned = { tenantId: scope.tenantId, leadId: lead.id };
      const interactions = await db.getRepository(Interaction).find({
        where: owned,
        order: { occurredAt: 'ASC', id: 'ASC' },
      });
      const comments = await db.getRepository(Comment).find({
        where: owned,
        order: { createdAt: 'ASC', id: 'ASC' },
      });
      const tasks = await db
        .getRepository(Task)
        .createQueryBuilder('task')
        .where('task.tenantId = :tenantId AND task.leadId = :leadId', owned)
        .andWhere(`task.status <> 'CANCELLED'`)
        .orderBy('task.dueAt', 'ASC')
        .addOrderBy('task.id', 'ASC')
        .getMany();
      const history = await db.getRepository(LeadHistory).find({
        where: owned,
        order: { changedAt: 'DESC', id: 'DESC' },
      });

      const canWork = this.canWork(actor, lead);
      const manages = this.manages(actor);
      const userIds = [
        ...interactions.flatMap((item) => item.createdBy ?? []),
        ...comments.flatMap((item) => [
          item.authorUserId,
          ...(item.mentions ?? []),
        ]),
        ...tasks.flatMap((item) => item.doneBy ?? []),
        ...history.map((item) => item.changedBy),
        ...(lead.assignedBy ? [lead.assignedBy] : []),
      ];
      const users = await rowsOf<{ id: string; name: string }>(
        db,
        `SELECT id, name FROM users WHERE tenant_id = $1 AND id = ANY($2::uuid[])`,
        [scope.tenantId, [...new Set(userIds)]],
      );
      const agentCodes = history
        .filter((item) => item.field === 'assignee')
        .flatMap((item) => [item.oldValue, item.newValue])
        .filter((code): code is string => !!code);
      if (lead.assignedAgentCode) agentCodes.push(lead.assignedAgentCode);
      const agentNames = await this.agents.namesByCode(scope, agentCodes, db);
      const campaign = lead.campaignId
        ? (await this.campaignNames(scope, [lead.campaignId], db)).get(
            lead.campaignId,
          )
        : undefined;
      const { ms } = await this.deadline(scope, db);
      // CUS-5 + PDP-4: Marketing and Admin (no agent reach) do not see client pages, so the client
      // a lead became stays a fact without its id or name
      const seesClients = actor.reach !== 'NONE';
      // LEAD-32: the client this lead became; the clients module owns that table
      const [linkedClient] =
        seesClients && lead.linkStatus === 'CONFIRMED' && lead.clientId
          ? await rowsOf<{ name: string }>(
              db,
              `SELECT name FROM clients WHERE tenant_id = $1 AND id = $2`,
              [scope.tenantId, lead.clientId],
            )
          : [];

      return {
        lead: {
          id: lead.id,
          fullName: lead.fullName,
          phone: this.phoneFor(actor, lead),
          email: lead.email,
          gender: lead.gender,
          dob: lead.dob,
          age: lead.age,
          province: lead.province,
          source: lead.source,
          phoneSource: lead.phoneSource,
          leadDate: lead.leadDate,
          registeredAt: lead.registeredAt,
          productInterest: lead.productInterest,
          // TENANT-5: the catalogue product, by code and name
          productCode: lead.productCode,
          productName: lead.productCode
            ? ((await this.products.byCode(db, [lead.productCode])).get(
                lead.productCode,
              )?.productName ?? null)
            : null,
          productSecondary: lead.productSecondary,
          valueVnd: numberOf(lead.valueVnd),
          refLink: lead.refLink,
          extraInfo: lead.extraInfo,
          // Decided 26/11/2026: the place after 1/7/2025, with its names
          provinceCode: lead.provinceCode,
          provinceName: this.geo.province(lead.provinceCode)?.name ?? null,
          wardCode: lead.wardCode,
          wardName: this.geo.ward(lead.wardCode)?.name ?? null,
          addressLine: lead.addressLine,
          followUp10d: lead.followUp10d,
          followUp15d: lead.followUp15d,
          followUp20d: lead.followUp20d,
          handlingNote: lead.handlingNote,
          cdytStats: lead.cdytStats,
          cdytProfile: lead.cdytProfile,
          stage: lead.stage,
          interest: lead.interest,
          careStatus: lead.careStatus,
          lostReason: lead.lostReason,
          progressNote: lead.progressNote,
          origin: lead.origin,
          assignedAgentCode: lead.assignedAgentCode,
          assignedAt: lead.assignedAt,
          releasedAt: lead.releasedAt,
          releasedFrom: lead.releasedFrom,
          releaseReason: lead.releaseReason,
          firstContactAt: lead.firstContactAt,
          lastContactAt: lead.lastContactAt,
          nextActionAt: lead.nextActionAt,
          consentMarketing: lead.consentMarketing,
          applicationNo: lead.applicationNo,
          policyNo: lead.policyNo,
          campaignId: lead.campaignId,
          updatedAt: lead.updatedAt,
          isNew: wasNew,
          newComment,
          overdue: isOverdue(lead, Date.now(), ms),
        },
        assignee: lead.assignedAgentCode
          ? {
              agentCode: lead.assignedAgentCode,
              name: agentNames.get(lead.assignedAgentCode) ?? null,
            }
          : null,
        campaign:
          lead.campaignId && campaign !== undefined
            ? { id: lead.campaignId, name: campaign }
            : null,
        interactions: interactions.map((item) => ({
          id: item.id,
          type: item.type,
          note: item.note,
          outcome: item.outcome,
          occurredAt: item.occurredAt,
          source: item.source,
          initial: item.initial,
          createdBy: item.createdBy,
          editedAt: item.editedAt,
        })),
        comments: comments.map((item) => ({
          id: item.id,
          body: item.body,
          authorUserId: item.authorUserId,
          mentions: item.mentions ?? [],
          createdAt: item.createdAt,
        })),
        tasks: tasks.map((item) => ({
          id: item.id,
          title: item.title,
          dueAt: item.dueAt,
          status: item.status,
          source: item.source,
          agentCode: item.agentCode,
          doneAt: item.doneAt,
          doneBy: item.doneBy,
        })),
        history: history.map((item) => {
          // LEAD-20 + PDP-3: a merge row keeps the merged lead's number, so it is masked too.
          // CUS-5 + PDP-4: the linked client's name only for someone who sees client pages
          const mask = (value: string | null) =>
            !value
              ? value
              : (item.field === 'phone' || item.field === 'merge') &&
                  !this.seesPhone(actor, lead)
                ? maskPhone(value)
                : item.field === 'client' && !seesClients
                  ? null
                  : value;
          return {
            id: item.id,
            field: item.field,
            oldValue: mask(item.oldValue),
            newValue: mask(item.newValue),
            note: item.note,
            imported: !!item.importId,
            changedBy: item.changedBy,
            changedAt: item.changedAt,
          };
        }),
        userNames: Object.fromEntries(
          users.map((user) => [user.id, user.name]),
        ),
        agentNames: Object.fromEntries(agentNames),
        // LEAD-28
        handovers: handoverHistory({
          rows: history.filter((item) => item.field === 'assignee'),
          contacts: interactions.filter((item) =>
            (CONTACT_TYPES as readonly string[]).includes(item.type),
          ),
          currentAgent: lead.assignedAgentCode,
          createdAt: lead.createdAt,
          assignedAt: lead.assignedAt,
          now: new Date(),
        }).map((item) => ({
          ...item,
          name: agentNames.get(item.agentCode) ?? null,
        })),
        link:
          lead.linkStatus === 'CONFIRMED' && lead.clientId
            ? {
                clientId: seesClients ? lead.clientId : null,
                clientName: linkedClient?.name ?? null,
                linkedAt: lead.linkedAt,
              }
            : null,
        // LEAD-32: from PROPOSAL on, or once won
        canLink: canWork && canLinkLead(lead),
        canWork,
        // Decided 26/11/2026: notes and tasks are shared with the lead's supporters
        canContribute:
          canWork ||
          (await this.supportedBy(actor.id, [lead.id], db)).has(lead.id),
        canManage: manages,
        // Open question 4: a line manager moves the leads of their line; one they only support is
        // not theirs to move (26/11/2026)
        canAssign:
          manages ||
          (this.assignsInLine(actor) && (await this.inReach(actor, lead, db))),
        // LEAD-14: the lock follows the flag of the value in the GA's catalogue
        interestLocked:
          !manages &&
          (await this.leadOptions.isFinalInterest(scope, lead.interest, db)),
      };
    });
  }

  /** Section 17.7 PATCH, with LEAD-8, LEAD-11, LEAD-13, LEAD-14, LEAD-17, LEAD-19 and LEAD-31. */
  async update(actor: Actor, id: string, dto: UpdateLeadDto) {
    const scope = this.scopeOf(actor);
    const manages = this.manages(actor);
    try {
      return await this.tenantDb.run(scope, async (db) => {
        const lead = await this.requireWorkable(actor, id, db);
        if (
          !manages &&
          (dto.source !== undefined || dto.campaignId !== undefined)
        )
          throw forbidden();
        const now = new Date();
        const rows: Partial<LeadHistory>[] = [];
        const dirty = new Set<keyof Lead>();
        const set = <K extends keyof Lead>(field: K, value: Lead[K]) => {
          lead[field] = value;
          dirty.add(field);
        };
        const log = (
          field: string,
          oldValue: Parameters<typeof text>[0],
          newValue: Parameters<typeof text>[0],
        ) => {
          rows.push({
            tenantId: scope.tenantId,
            leadId: lead.id,
            field,
            oldValue: text(oldValue),
            newValue: text(newValue),
            changedBy: actor.id,
            changedAt: now,
          });
        };
        const change = <K extends keyof Lead>(
          field: K,
          value: Lead[K] | undefined,
          historyField: string = field,
        ) => {
          const next = (
            value === '' || value === undefined ? null : value
          ) as Lead[K];
          if (next === lead[field]) return;
          log(
            historyField,
            lead[field] as Parameters<typeof text>[0],
            next as Parameters<typeof text>[0],
          );
          set(field, next);
        };

        if (dto.fullName !== undefined) {
          change('fullName', dto.fullName);
          set('nameNorm', normalizeName(dto.fullName));
        }
        if (dto.phone !== undefined) {
          const phone = parsePhone(dto.phone);
          if (!phone)
            throw new ApiException(
              HttpStatus.BAD_REQUEST,
              ErrorCode.InvalidPhone,
            );
          if (phone !== lead.phone) {
            const conflict = await this.phoneConflict(actor, scope, phone, db);
            if (conflict) throw conflict;
            change('phone', phone);
          }
        }
        for (const field of INFO_FIELDS)
          if (dto[field] !== undefined) change(field, dto[field]);
        // Decided 26/11/2026: a new province drops a commune of the old one; the history names them
        if (dto.provinceCode !== undefined || dto.wardCode !== undefined) {
          const provinceCode =
            dto.provinceCode !== undefined
              ? dto.provinceCode
              : lead.provinceCode;
          const wardCode =
            dto.wardCode !== undefined
              ? dto.wardCode
              : provinceCode === lead.provinceCode
                ? lead.wardCode
                : null;
          const place = this.geo.place(provinceCode, wardCode);
          if ((place.province?.code ?? null) !== lead.provinceCode) {
            change('province', place.province?.name ?? null);
            set('provinceCode', place.province?.code ?? null);
          }
          if ((place.ward?.code ?? null) !== lead.wardCode) {
            log(
              'ward',
              this.geo.ward(lead.wardCode)?.name ?? null,
              place.ward?.name ?? null,
            );
            set('wardCode', place.ward?.code ?? null);
          }
        }
        if (dto.addressLine !== undefined)
          change('addressLine', dto.addressLine);
        // TENANT-5: the product of interest; the one already set may stay even if hidden since
        if (dto.productCode !== undefined) {
          if (dto.productCode)
            await this.products.usable(
              db,
              [{ code: dto.productCode, path: 'productCode' }],
              new Set(lead.productCode ? [lead.productCode] : []),
            );
          change('productCode', dto.productCode || null);
        }
        if (
          dto.consent !== undefined &&
          dto.consent !== lead.consentMarketing
        ) {
          log('consent', lead.consentMarketing, dto.consent);
          set('consentMarketing', dto.consent);
          // PDP-5: when and how it was given
          set('consentAt', dto.consent ? now : null);
          set('consentSource', dto.consent ? 'CRM_FORM' : null);
        }
        if (dto.source !== undefined)
          change(
            'source',
            await this.leadOptions.resolveSource(scope, actor, dto.source, db),
          );
        if (dto.campaignId !== undefined) {
          if (dto.campaignId)
            await this.requireCampaign(scope, dto.campaignId, db);
          const next = dto.campaignId || null;
          if (next !== lead.campaignId) {
            log('campaign', lead.campaignId, next);
            set('campaignId', next);
          }
        }

        // LEAD-19: an explicit stage. LOST and SUBMITTED imply a care status with its requirements
        const target = dto.stage;
        if (target !== undefined && target !== lead.stage) {
          if (target === 'NEW')
            throw new ApiException(
              HttpStatus.BAD_REQUEST,
              ErrorCode.InvalidInput,
            );
          if (!manages && (target === 'ISSUED' || lead.stage === 'ISSUED'))
            throw forbidden();
        }

        const interestBefore = lead.interest;
        if (dto.interest !== undefined && dto.interest !== lead.interest) {
          // LEAD-14
          if (
            !manages &&
            (await this.leadOptions.isFinalInterest(scope, lead.interest, db))
          )
            throw new ApiException(
              HttpStatus.CONFLICT,
              ErrorCode.InterestLocked,
            );
          // LEAD-15
          await this.leadOptions.assertUsable(
            scope,
            'interest',
            dto.interest,
            lead.interest,
            db,
          );
          change('interest', dto.interest);
        }

        const careBefore = lead.careStatus;
        const impliedCare =
          target === 'LOST'
            ? 'DROPPED'
            : target === 'SUBMITTED'
              ? 'WON'
              : undefined;
        if (dto.careStatus !== undefined && dto.careStatus !== null)
          await this.leadOptions.assertUsable(
            scope,
            'care_status',
            dto.careStatus,
            lead.careStatus,
            db,
          );
        const nextCare = dto.careStatus ?? impliedCare;
        if (nextCare !== undefined) change('careStatus', nextCare);
        if (dto.lostReason !== undefined) change('lostReason', dto.lostReason);
        if (dto.applicationNo !== undefined) {
          if (dto.applicationNo && !APPLICATION_NO.test(dto.applicationNo))
            throw new ApiException(
              HttpStatus.BAD_REQUEST,
              ErrorCode.InvalidApplicationNo,
            );
          change('applicationNo', dto.applicationNo);
        }
        if (dto.policyNo !== undefined) {
          if (dto.policyNo && !POLICY_NO.test(dto.policyNo))
            throw new ApiException(
              HttpStatus.BAD_REQUEST,
              ErrorCode.InvalidPolicyNo,
            );
          change('policyNo', dto.policyNo);
        }
        // LEAD-11: checked on the final values, so numbers can arrive with the status or before it
        if (lead.careStatus === 'WON' && !lead.applicationNo && !lead.policyNo)
          throw new ApiException(
            HttpStatus.BAD_REQUEST,
            ErrorCode.WonNeedsNumbers,
          );
        if (lead.careStatus === 'DROPPED' && !lead.lostReason)
          throw new ApiException(
            HttpStatus.BAD_REQUEST,
            ErrorCode.LostReasonRequired,
          );

        const classified =
          lead.interest !== interestBefore || lead.careStatus !== careBefore;
        // LEAD-13
        if (classified && !lead.firstContactAt) set('firstContactAt', now);

        // OPT-7: moving to a care status the GA added is a label change, not a stage change
        const drivesStage =
          lead.interest !== interestBefore ||
          (lead.careStatus !== careBefore && isSystemCare(lead.careStatus));
        const stage =
          target !== undefined && target !== 'LOST' && target !== 'SUBMITTED'
            ? target
            : drivesStage
              ? stageFor(lead.careStatus, lead.interest, lead.stage)
              : lead.stage;
        if (stage !== lead.stage) {
          change('stage', stage);
          // LEAD-19: the note given with a manual move
          if (target !== undefined && dto.stageNote)
            rows[rows.length - 1].note = dto.stageNote;
        }

        // LEAD-31
        if (dto.nextActionAt !== undefined) {
          const before = lead.nextActionAt?.getTime() ?? null;
          const after = dto.nextActionAt?.getTime() ?? null;
          if (before !== after) {
            log('nextAction', lead.nextActionAt, dto.nextActionAt);
            set('nextActionAt', dto.nextActionAt ?? null);
            await db.query(
              `UPDATE tasks SET status = 'CANCELLED'
                WHERE tenant_id = $1 AND lead_id = $2 AND source = 'NEXT_ACTION' AND status = 'OPEN'`,
              [scope.tenantId, lead.id],
            );
            if (dto.nextActionAt)
              await db.getRepository(Task).insert({
                tenantId: scope.tenantId,
                leadId: lead.id,
                agentCode: lead.assignedAgentCode,
                title: NEXT_ACTION_TASK_TITLE,
                dueAt: dto.nextActionAt,
                status: 'OPEN',
                source: 'NEXT_ACTION',
                createdBy: actor.id,
                createdAt: now,
              });
          }
        }

        if (rows.length > 0) {
          set('updatedAt', now);
          await db
            .getRepository(Lead)
            .update(
              { id: lead.id, tenantId: scope.tenantId },
              Object.fromEntries(
                [...dirty].map((field) => [field, lead[field]]),
              ),
            );
          await db.getRepository(LeadHistory).insert(rows);
          await this.audit.record(
            {
              tenantId: scope.tenantId,
              userId: actor.id,
              action: AuditAction.Update,
              entity: 'lead',
              entityId: id,
              // AUD-4: field names only, because the values are personal data
              meta: { fields: [...new Set(rows.map((row) => row.field))] },
            },
            db,
          );
        }
        // Decided 27/11/2026: a lead marked "Chốt xịt" or "Không quan tâm" goes back to the pool
        const reason: LeadReleaseReason | null =
          lead.careStatus !== careBefore && lead.careStatus === 'DROPPED'
            ? 'DROPPED'
            : (lead.careStatus !== careBefore &&
                  lead.careStatus === 'NOT_INTERESTED') ||
                (lead.interest !== interestBefore &&
                  lead.interest === 'NOT_INTERESTED')
              ? 'NOT_INTERESTED'
              : null;
        const released = reason
          ? (await this.release(scope, [lead], reason, actor, now, db))
              .length > 0
          : false;
        return {
          id,
          stage: lead.stage,
          interest: lead.interest,
          careStatus: lead.careStatus,
          released,
        };
      });
    } catch (error) {
      if (LeadsService.duplicatePhone(error))
        throw new ApiException(HttpStatus.CONFLICT, ErrorCode.PhoneExists);
      throw error;
    }
  }

  /**
   * NOTE-8: the author changes their own entry within 24 hours. The text before goes to the lead's
   * history; a contact (CALL, ZALO, MEETING) keeps its type and time, so only its text changes.
   */
  private async ownRecentNote(
    actor: Actor,
    id: string,
    noteId: string,
    db: EntityManager,
  ) {
    const lead = await this.requireVisible(actor, id, db);
    const note = await db.getRepository(Interaction).findOneBy({
      id: noteId,
      tenantId: lead.tenantId,
      leadId: lead.id,
    });
    if (!note) throw notFound();
    if (
      note.createdBy !== actor.id ||
      (note.source ?? 'APP') !== 'APP' ||
      Date.now() - note.createdAt.getTime() > NOTE_EDIT_MS
    )
      throw new ApiException(HttpStatus.FORBIDDEN, ErrorCode.NoteNotEditable);
    return { lead, note };
  }

  async editNote(
    actor: Actor,
    id: string,
    noteId: string,
    dto: EditNoteDto,
  ): Promise<void> {
    await this.tenantDb.run(this.scopeOf(actor), async (db) => {
      const { lead, note } = await this.ownRecentNote(actor, id, noteId, db);
      const now = new Date();
      const outcome =
        dto.outcome === undefined ? note.outcome : dto.outcome || null;
      if (dto.body === note.note && outcome === note.outcome) return;
      await db.getRepository(LeadHistory).insert({
        tenantId: lead.tenantId,
        leadId: lead.id,
        field: 'noteEdited',
        oldValue: note.note,
        newValue: dto.body,
        note: note.outcome,
        changedBy: actor.id,
        changedAt: now,
      });
      await db
        .getRepository(Interaction)
        .update(
          { id: note.id, tenantId: lead.tenantId },
          { note: dto.body, editedAt: now, outcome },
        );
      await this.audit.record(
        {
          tenantId: lead.tenantId,
          userId: actor.id,
          action: AuditAction.Update,
          entity: 'lead_note',
          entityId: note.id,
          meta: { leadId: lead.id },
        },
        db,
      );
    });
  }

  /** NOTE-8: only a plain note is deleted; a recorded contact counts in reports (NOTE-4). */
  async deleteNote(actor: Actor, id: string, noteId: string): Promise<void> {
    await this.tenantDb.run(this.scopeOf(actor), async (db) => {
      const { lead, note } = await this.ownRecentNote(actor, id, noteId, db);
      if (note.type !== 'NOTE')
        throw new ApiException(HttpStatus.FORBIDDEN, ErrorCode.NoteNotEditable);
      await db.getRepository(LeadHistory).insert({
        tenantId: lead.tenantId,
        leadId: lead.id,
        field: 'noteDeleted',
        oldValue: note.note,
        changedBy: actor.id,
        changedAt: new Date(),
      });
      await db
        .getRepository(Interaction)
        .delete({ id: note.id, tenantId: lead.tenantId });
      await this.audit.record(
        {
          tenantId: lead.tenantId,
          userId: actor.id,
          action: AuditAction.Delete,
          entity: 'lead_note',
          entityId: note.id,
          meta: { leadId: lead.id },
        },
        db,
      );
    });
  }

  async addNote(actor: Actor, id: string, body: string) {
    return this.tenantDb.run(this.scopeOf(actor), async (db) => {
      const lead = await this.requireContributor(actor, id, db);
      const now = new Date();
      const note = await db.getRepository(Interaction).save(
        db.getRepository(Interaction).create({
          tenantId: lead.tenantId,
          leadId: lead.id,
          agentCode: actor.agentCode ?? lead.assignedAgentCode,
          type: 'NOTE',
          note: body,
          occurredAt: now,
          createdBy: actor.id,
          createdAt: now,
        }),
      );
      await db
        .getRepository(Lead)
        .update({ id: lead.id, tenantId: lead.tenantId }, { updatedAt: now });
      await this.audit.record(
        {
          tenantId: lead.tenantId,
          userId: actor.id,
          action: AuditAction.Create,
          entity: 'lead_note',
          entityId: lead.id,
        },
        db,
      );
      return { id: note.id };
    });
  }

  /** NOTE-4 */
  async addActivity(actor: Actor, id: string, dto: AddActivityDto) {
    const now = new Date();
    const occurredAt = dto.occurredAt ?? now;
    // NOTE-2: may be in the past, never in the future
    if (occurredAt.getTime() > now.getTime() + 60_000)
      throw new ApiException(HttpStatus.BAD_REQUEST, ErrorCode.InvalidInput);
    return this.tenantDb.run(this.scopeOf(actor), async (db) => {
      const lead = await this.requireWorkable(actor, id, db);
      const { tenantId } = lead;
      const activity = await db.getRepository(Interaction).save(
        db.getRepository(Interaction).create({
          tenantId,
          leadId: lead.id,
          agentCode: actor.agentCode ?? lead.assignedAgentCode,
          type: dto.type,
          note: dto.note,
          outcome: dto.outcome ?? null,
          occurredAt,
          createdBy: actor.id,
          createdAt: now,
        }),
      );
      const patch: Partial<Lead> = { updatedAt: now };
      if (!lead.firstContactAt) patch.firstContactAt = occurredAt;
      if (!lead.lastContactAt || occurredAt > lead.lastContactAt)
        patch.lastContactAt = occurredAt;
      // LEAD-18
      if (lead.stage === 'NEW') {
        await db.getRepository(LeadHistory).insert({
          tenantId,
          leadId: lead.id,
          field: 'stage',
          oldValue: 'NEW',
          newValue: 'CONTACTED',
          changedBy: actor.id,
          changedAt: now,
        });
        patch.stage = 'CONTACTED';
      }
      await db.getRepository(Lead).update({ id: lead.id, tenantId }, patch);
      await db.query(
        `UPDATE tasks SET status = 'DONE', done_at = $3, done_by = $4
          WHERE tenant_id = $1 AND lead_id = $2 AND source = 'AUTO_ASSIGN' AND status = 'OPEN'`,
        [tenantId, lead.id, now, actor.id],
      );
      await this.audit.record(
        {
          tenantId,
          userId: actor.id,
          action: AuditAction.Create,
          entity: 'lead_contact',
          entityId: lead.id,
          meta: { type: dto.type },
        },
        db,
      );
      return { id: activity.id };
    });
  }

  /** CMT-5: whether another user would see this lead (LEAD-6). */
  private async seesLead(
    other: Actor,
    lead: Lead,
    db: EntityManager,
  ): Promise<boolean> {
    if (await this.inReach(other, lead, db)) return true;
    // A supporter sees the lead too (decided 26/11/2026)
    return (await this.supportedBy(other.id, [lead.id], db)).has(lead.id);
  }

  /** CMT-5: up to 8 people who see the lead, for the @ picker. */
  async mentionable(actor: Actor, id: string, q?: string) {
    const scope = this.scopeOf(actor);
    return this.tenantDb.run(scope, async (db) => {
      const lead = await this.requireVisible(actor, id, db);
      const people = await this.notifications.activeActors(
        scope,
        { q, except: actor.id, limit: 50 },
        db,
      );
      const items: { id: string; name: string; agentCode: string | null }[] =
        [];
      for (const person of people) {
        if (items.length === 8) break;
        if (await this.seesLead(person, lead, db))
          items.push({
            id: person.id,
            name: person.name,
            agentCode: person.agentCode ?? null,
          });
      }
      return { items };
    });
  }

  /** CMT-5: everyone mentioned must be an active user of the GA who sees the lead. */
  private async checkMentions(
    actor: Actor,
    scope: Scope,
    lead: Lead,
    mentions: string[] | undefined,
    db: EntityManager,
  ): Promise<string[]> {
    const ids = [...new Set(mentions ?? [])].filter((id) => id !== actor.id);
    if (ids.length === 0) return [];
    const people = await this.notifications.activeActors(scope, { ids }, db);
    // One at a time: the transaction's connection runs one query at a time
    const visible: boolean[] = [];
    for (const person of people)
      visible.push(await this.seesLead(person, lead, db));
    if (people.length !== ids.length || visible.includes(false))
      throw new ApiException(
        HttpStatus.BAD_REQUEST,
        ErrorCode.MentionNotVisible,
      );
    return ids;
  }

  /** CMT-1, CMT-2 and CMT-5: anyone who can see the lead, without touching updatedAt. */
  async addComment(actor: Actor, id: string, dto: AddCommentDto) {
    const scope = this.scopeOf(actor);
    return this.tenantDb.run(scope, async (db) => {
      const lead = await this.requireVisible(actor, id, db);
      const mentions = await this.checkMentions(
        actor,
        scope,
        lead,
        dto.mentions,
        db,
      );
      const now = new Date();
      const comment = await db.getRepository(Comment).save(
        db.getRepository(Comment).create({
          tenantId: lead.tenantId,
          leadId: lead.id,
          authorUserId: actor.id,
          body: dto.body,
          mentions: mentions.length > 0 ? mentions : null,
          createdAt: now,
        }),
      );
      await db
        .getRepository(Lead)
        .update(
          { id: lead.id, tenantId: lead.tenantId },
          { lastCommentAt: now, lastCommentBy: actor.id },
        );
      await this.audit.record(
        {
          tenantId: lead.tenantId,
          userId: actor.id,
          action: AuditAction.Create,
          entity: 'lead_comment',
          entityId: lead.id,
          meta: { mentions: mentions.length },
        },
        db,
      );
      const notice = (type: 'MENTION' | 'LEAD_COMMENT'): NotificationInput => ({
        type,
        data: { leadId: lead.id },
        link: `/leads/${lead.id}`,
      });
      // CMT-5: the people mentioned hear it first-hand
      if (mentions.length > 0)
        await this.notifications.notify(scope, mentions, notice('MENTION'), db);
      // CMT-5 + NTF-2: the assignee hears about a comment by someone else
      if (lead.assignedAgentCode)
        await this.notifications.notifyAgent(
          scope,
          lead.assignedAgentCode,
          notice('LEAD_COMMENT'),
          { except: [actor.id, ...mentions], db },
        );
      return { id: comment.id };
    });
  }

  /** TASK-2 */
  async addTask(actor: Actor, id: string, dto: AddTaskDto) {
    return this.tenantDb.run(this.scopeOf(actor), async (db) => {
      // A supporter's task is the lead's task: it goes to the assignee's list, like any other
      const lead = await this.requireContributor(actor, id, db);
      const task = await db.getRepository(Task).save(
        db.getRepository(Task).create({
          tenantId: lead.tenantId,
          leadId: lead.id,
          agentCode: lead.assignedAgentCode,
          title: dto.title,
          dueAt: dto.dueAt,
          status: 'OPEN',
          source: 'APP',
          createdBy: actor.id,
          createdAt: new Date(),
        }),
      );
      await this.audit.record(
        {
          tenantId: lead.tenantId,
          userId: actor.id,
          action: AuditAction.Create,
          entity: 'lead_task',
          entityId: lead.id,
        },
        db,
      );
      return { id: task.id };
    });
  }

  async updateTask(
    actor: Actor,
    id: string,
    taskId: string,
    dto: UpdateTaskDto,
  ) {
    return this.tenantDb.run(this.scopeOf(actor), async (db) => {
      const lead = await this.requireContributor(actor, id, db);
      const task = await db.getRepository(Task).findOneBy({
        id: taskId,
        tenantId: lead.tenantId,
        leadId: lead.id,
      });
      if (!task) throw notFound();
      const patch: Partial<Task> = {};
      if (dto.title !== undefined) patch.title = dto.title;
      if (dto.dueAt !== undefined) patch.dueAt = dto.dueAt;
      if (dto.done === true && task.status !== 'DONE')
        Object.assign(patch, {
          status: 'DONE',
          doneAt: new Date(),
          doneBy: actor.id,
        });
      if (dto.done === false && task.status !== 'OPEN')
        Object.assign(patch, { status: 'OPEN', doneAt: null, doneBy: null });
      if (Object.keys(patch).length > 0)
        await db.getRepository(Task).update({ id: task.id }, patch);
      await this.audit.record(
        {
          tenantId: lead.tenantId,
          userId: actor.id,
          action: AuditAction.Update,
          entity: 'lead_task',
          entityId: lead.id,
          meta: { fields: Object.keys(dto) },
        },
        db,
      );
      return { id: taskId };
    });
  }
  /**
   * CMP-4: what the public form writes. A new number becomes a lead (PUBLIC_FORM, unassigned,
   * consent with time and IP hash); a known number gets a note on its lead and the assignee is told.
   * The caller answers the same either way, so the form never reveals that a number exists.
   */
  async createFromForm(
    campaign: Pick<Campaign, 'id' | 'tenantId' | 'name' | 'channel' | 'type'>,
    input: {
      fullName: string;
      phone: string;
      email?: string;
      province?: string;
      need?: string;
    },
    ipHash: string,
  ): Promise<void> {
    const scope: Scope = { tenantId: campaign.tenantId };
    const now = new Date();
    await this.tenantDb.run(scope, async (db) => {
      const known = await db
        .getRepository(Lead)
        .findOneBy({ tenantId: scope.tenantId, phone: input.phone });
      let leadId: string;
      if (known) {
        leadId = known.id;
        await db.getRepository(Interaction).insert({
          tenantId: scope.tenantId,
          leadId,
          agentCode: known.assignedAgentCode,
          type: 'NOTE',
          note: `Đăng ký lại qua form ${campaign.name}${input.need ? `: ${input.need}` : ''}`,
          occurredAt: now,
          source: 'FORM',
          createdAt: now,
        });
        if (known.assignedAgentCode)
          await this.notifications.notifyAgent(
            scope,
            known.assignedAgentCode,
            {
              type: 'FORM_REREGISTERED',
              data: { leadId },
              link: `/leads/${leadId}`,
            },
            { db },
          );
      } else {
        leadId = newId();
        // CMP-4: the source is the campaign's channel, as the GA's catalogue knows it (OPT-13)
        const [source] = await this.leadOptions.registerSources(
          scope,
          null,
          [campaign.channel?.trim() || 'Form công khai'],
          db,
        );
        await db.getRepository(Lead).insert({
          id: leadId,
          tenantId: scope.tenantId,
          fullName: input.fullName,
          nameNorm: normalizeName(input.fullName),
          phone: input.phone,
          source,
          email: input.email ?? null,
          province: input.province ?? null,
          provinceCode: this.geo.matchProvince(input.province),
          productInterest: input.need ?? null,
          campaignId: campaign.id,
          leadDate: today(now),
          stage: 'NEW',
          origin: 'PUBLIC_FORM',
          consentMarketing: true,
          consentAt: now,
          consentSource: 'PUBLIC_FORM',
          consentIpHash: ipHash,
          createdAt: now,
          updatedAt: now,
        });
        await this.audit.record(
          {
            tenantId: scope.tenantId,
            userId: null,
            action: AuditAction.Create,
            entity: 'lead',
            entityId: leadId,
            meta: { origin: 'PUBLIC_FORM', campaignId: campaign.id },
          },
          db,
        );
      }
      // CMP-2: registering on a seminar's form makes the person a registered member
      if (campaign.type === 'SEMINAR')
        await db.query(
          `INSERT INTO campaign_members (tenant_id, campaign_id, lead_id, status, updated_at)
           VALUES ($1, $2, $3, 'REGISTERED', $4)
           ON CONFLICT (tenant_id, campaign_id, lead_id)
           DO UPDATE SET status = 'REGISTERED', updated_at = EXCLUDED.updated_at`,
          [scope.tenantId, campaign.id, leadId, now],
        );
    });
  }

  /** Section 12.4: everything one import does to leads, inside the commit transaction. */
  async applyImportPlan(
    plan: LeadPlan,
    scope: Scope,
    importId: string,
    userId: string,
    now: Date,
    db: EntityManager,
  ): Promise<void> {
    const { tenantId } = scope;
    const deadline = await this.deadline(scope, db);
    // IMP-25: a file's sources map onto the catalogue, and new ones join it
    const labels = [
      ...new Set(plan.writes.flatMap((write) => write.values.source || [])),
    ];
    const codes = await this.leadOptions.registerSources(
      scope,
      userId,
      labels,
      db,
    );
    const sourceCode = new Map(labels.map((label, i) => [label, codes[i]]));
    for (const write of plan.writes)
      if (write.values.source)
        write.values.source = sourceCode.get(write.values.source)!;
    // TENANT-5: a "SẢN PHẨM" cell naming a catalogue product (code or name) links the lead to it;
    // the text stays as written either way
    const productOf = await this.products.matchText(
      db,
      plan.writes.flatMap((write) => write.values.productInterest || []),
    );
    for (const write of plan.writes) {
      const code =
        write.values.productInterest &&
        productOf.get(write.values.productInterest);
      if (code) (write.values as Record<string, unknown>).productCode = code;
    }
    // Decided 26/11/2026: a "TỈNH/TP" cell naming a current province links the lead to it
    for (const write of plan.writes) {
      const provinceCode = this.geo.matchProvince(write.values.province);
      if (provinceCode)
        (write.values as Record<string, unknown>).provinceCode = provinceCode;
    }

    // IMP-28: campaigns named in the file are created when missing
    const campaigns = db.getRepository(Campaign);
    const known = await campaigns
      .createQueryBuilder('campaign')
      .where('campaign.tenantId = :tenantId AND campaign.name = ANY(:names)', {
        tenantId,
        names: plan.campaignNames,
      })
      .getMany();
    const campaignIds = new Map(known.map((item) => [item.name, item.id]));
    for (const name of plan.campaignNames.filter(
      (item) => !campaignIds.has(item),
    )) {
      const created = await campaigns.save(
        campaigns.create({ tenantId, name }),
      );
      campaignIds.set(name, created.id);
    }

    const inserts: Record<string, unknown>[] = [];
    const updates: Record<string, unknown>[] = [];
    const historyRows: Partial<LeadHistory>[] = [];
    const notes: Partial<Interaction>[] = [];
    const taskRows: Partial<Task>[] = [];
    const movedIds: string[] = [];
    const handedTo = new Map<string, string[]>();

    for (const write of plan.writes) {
      const leadId = write.leadId ?? newId();
      if (write.assignTo)
        handedTo.set(write.assignTo, [
          ...(handedTo.get(write.assignTo) ?? []),
          leadId,
        ]);
      const stamp = write.rowDate ? rowInstant(write.rowDate) : now;
      const campaignId = write.campaignName
        ? campaignIds.get(write.campaignName)
        : undefined;
      const consent = write.values.consentMarketing
        ? { consentAt: now, consentSource: 'IMPORT' }
        : {};
      const assignment = write.assignTo
        ? {
            assignedAgentCode: write.assignTo,
            assignedBy: userId,
            assignedAt: now,
          }
        : {};
      if (write.leadId)
        updates.push({
          ...write.values,
          id: leadId,
          ...(write.values.fullName && {
            nameNorm: normalizeName(write.values.fullName),
          }),
          ...(campaignId && { campaignId }),
          ...consent,
          ...assignment,
          // NTF-2 + LEAD-25: a lead the file hands over is news to its new agent
          ...(write.assignTo && {
            assigneeSeenAt: null,
            assigneeViewedAt: null,
          }),
          updatedAt: stamp,
          lastImportId: importId,
        });
      else
        inserts.push({
          ...write.values,
          id: leadId,
          tenantId,
          nameNorm: normalizeName(write.values.fullName),
          // LEAD-5
          leadDate: write.rowDate ?? today(now),
          origin: 'IMPORT',
          consentMarketing: !!write.values.consentMarketing,
          ...(campaignId && { campaignId }),
          ...consent,
          ...assignment,
          createdBy: userId,
          createdAt: now,
          updatedAt: stamp,
          lastImportId: importId,
        });

      // IMP-29: history carries the date of the file row
      for (const row of write.history)
        historyRows.push({
          field: row.field,
          oldValue: row.oldValue ?? null,
          newValue: row.newValue ?? null,
          tenantId,
          leadId,
          importId,
          changedBy: userId,
          changedAt: stamp,
        });
      if (write.assignTo) {
        historyRows.push({
          tenantId,
          leadId,
          field: 'assignee',
          oldValue: write.previousAgent ?? null,
          newValue: write.assignTo,
          importId,
          changedBy: userId,
          changedAt: stamp,
        });
        if (write.leadId) movedIds.push(leadId);
      }
      // NOTE-7
      if (write.note)
        notes.push({
          tenantId,
          leadId,
          agentCode: write.assignTo ?? null,
          type: 'NOTE',
          note: write.note,
          occurredAt: stamp,
          source: 'IMPORT',
          initial: !write.leadId,
          createdBy: userId,
          createdAt: now,
        });
      if (write.createTask)
        taskRows.push({
          tenantId,
          leadId,
          agentCode: write.assignTo ?? null,
          title: contactTaskTitle(deadline.hours),
          dueAt: new Date(now.getTime() + deadline.ms),
          status: 'OPEN',
          source: 'AUTO_ASSIGN',
          createdBy: userId,
          createdAt: now,
        });
    }

    await insertRows(db, Lead, inserts);
    await updateRows(db, Lead, tenantId, 'id', updates);
    // CUS-4: a linked client follows a lead the file hands to someone else
    await this.reassigned(
      scope,
      plan.writes.flatMap((write) =>
        write.leadId && write.assignTo ? [write.leadId] : [],
      ),
      now,
      db,
    );
    // LEAD-22: the previous agent's automatic task ends with the reassignment
    if (movedIds.length > 0)
      await db.query(
        `UPDATE tasks SET status = 'CANCELLED'
          WHERE tenant_id = $1 AND lead_id = ANY($2::uuid[]) AND source = 'AUTO_ASSIGN' AND status = 'OPEN'`,
        [tenantId, movedIds],
      );
    await insertRows(db, LeadHistory, historyRows);
    await insertRows(db, Interaction, notes);
    await insertRows(db, Task, taskRows);
    // NTF-2: one notice per agent the file hands leads to ("n lead")
    for (const [agentCode, ids] of handedTo)
      await this.notifications.notifyAgent(
        scope,
        agentCode,
        assignedNotice(ids),
        {
          except: userId,
          db,
        },
      );
  }

  /** What planLeads needs to know about the leads an import touches. */
  async existingForImport(
    scope: Scope,
    phones: string[],
    db: EntityManager,
  ): Promise<{ existing: Map<string, ExistingLead>; locked: Set<string> }> {
    const found = await db
      .getRepository(Lead)
      .createQueryBuilder('lead')
      .where('lead.tenantId = :tenantId AND lead.phone = ANY(:phones)', {
        tenantId: scope.tenantId,
        phones,
      })
      .getMany();
    const locked = await this.lockedOwnLeads(scope, found, db);
    return {
      existing: new Map(
        found.map((lead) => [
          lead.phone,
          withoutNulls(lead) as unknown as ExistingLead,
        ]),
      ),
      locked,
    };
  }
}

/** NTF-2: "được giao lead", one lead by name or "n lead". */
function assignedNotice(ids: string[]): NotificationInput {
  return ids.length === 1
    ? {
        type: 'LEAD_ASSIGNED',
        data: { count: 1, leadId: ids[0] },
        link: `/leads/${ids[0]}`,
      }
    : {
        type: 'LEAD_ASSIGNED',
        data: { count: ids.length },
        link: '/leads?tab=isNew',
      };
}
