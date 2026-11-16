import { HttpStatus, Injectable } from '@nestjs/common';
import type { EntityManager } from 'typeorm';
import {
  ApiException,
  ErrorCode,
  forbidden,
  notFound,
  pgError,
} from '../../common/errors.js';
import { escapeLike, isId } from '../../common/pagination.js';
import { Permission } from '../../common/rbac.js';
import type { Actor, Scope } from '../../common/rbac.js';
import { rowsOf } from '../../core/persistence/sql.js';
import { TenantDb } from '../../core/tenancy/tenant-db.js';
import { AccessService } from '../access/access.service.js';
import { AuditAction, AuditService } from '../audit/audit.service.js';
import {
  Campaign,
  Interaction,
} from '../leads/infrastructure/lead.entities.js';
import type { MemberStatus } from '../leads/infrastructure/lead.entities.js';
import { LeadsService } from '../leads/leads.service.js';
import { campaignCosts, countBy, datesInOrder } from './campaign-stats.js';
import type {
  AddMembersDto,
  CampaignFieldsDto,
  CreateCampaignDto,
  ListCampaignsQueryDto,
  UpdateMemberDto,
} from './campaigns.dto.js';

/** CUS-13 */
const ISSUED_APPLICATION = 'Đã phát hành hợp đồng';

/** The optional fields of CMP-1 and CMP-2, as the API names them. */
const OPTIONAL_FIELDS = [
  'channel',
  'startDate',
  'endDate',
  'budgetVnd',
  'ownerUserId',
  'notes',
  'eventAt',
  'location',
] as const;

/** A lead query's visibility (LEAD-6): every lead, or those of these agent codes. */
type Visible = string[] | null;

/** bigint comes back as a string; the API sends a number. */
const budgetOf = (campaign: Campaign): number | null =>
  campaign.budgetVnd === null ? null : Number(campaign.budgetVnd);

/** How a field is stored: money as bigint text, an event time as a date. */
const stored = (field: (typeof OPTIONAL_FIELDS)[number], value: unknown) =>
  field === 'budgetVnd'
    ? String(value)
    : field === 'eventAt'
      ? new Date(value as string)
      : value;

/** Chapter 11: campaigns and seminars (CMP-1, CMP-2, CMP-3, CMP-5). */
@Injectable()
export class CampaignsService {
  constructor(
    private readonly tenantDb: TenantDb,
    private readonly access: AccessService,
    private readonly leads: LeadsService,
    private readonly audit: AuditService,
  ) {}

  private scopeOf(actor: Actor): Scope {
    if (!actor.tenantId) throw forbidden();
    return { tenantId: actor.tenantId };
  }

  /** CMP-5 */
  private manages(actor: Actor): boolean {
    return actor.permissions.includes(Permission.CampaignsManage);
  }

  private requireManage(actor: Actor): void {
    if (!this.manages(actor)) throw forbidden();
  }

  /** Whoever sees every lead of the GA sees costs, since only they see every lead counted. */
  private seesAllLeads(actor: Actor): boolean {
    return actor.permissions.includes(Permission.LeadsManage);
  }

  /**
   * LEAD-6 + LEAD-40: live leads this person sees, as SQL over alias `l`. `next` is the first free
   * parameter number; the returned params follow on.
   */
  private static leadFilter(visible: Visible, next: number) {
    const live = 'l.deleted_at IS NULL AND l.erased_at IS NULL';
    return visible === null
      ? { where: live, params: [] as unknown[] }
      : {
          where: `${live} AND l.assigned_agent_code = ANY($${next})`,
          params: [visible] as unknown[],
        };
  }

  private async find(
    db: EntityManager,
    scope: Scope,
    id: string,
    options: { lock?: boolean } = {},
  ): Promise<Campaign> {
    if (!isId(id)) throw notFound();
    const query = db
      .getRepository(Campaign)
      .createQueryBuilder('campaign')
      .where('campaign.tenantId = :tenantId AND campaign.id = :id', {
        tenantId: scope.tenantId,
        id,
      });
    if (options.lock) query.setLock('pessimistic_write');
    const campaign = await query.getOne();
    // TEN-3: another GA's campaign looks missing
    if (!campaign) throw notFound();
    return campaign;
  }

  private async userNames(db: EntityManager, scope: Scope, ids: string[]) {
    if (ids.length === 0) return new Map<string, string>();
    const users = await rowsOf<{ id: string; name: string }>(
      db,
      `SELECT id, name FROM users WHERE tenant_id = $1 AND id = ANY($2)`,
      [scope.tenantId, ids],
    );
    return new Map(users.map((user) => [user.id, user.name]));
  }

  private view(
    campaign: Campaign,
    owners: Map<string, string>,
    showBudget: boolean,
  ) {
    return {
      id: campaign.id,
      name: campaign.name,
      type: campaign.type,
      status: campaign.status,
      channel: campaign.channel,
      startDate: campaign.startDate,
      endDate: campaign.endDate,
      budgetVnd: showBudget ? budgetOf(campaign) : null,
      ownerUserId: campaign.ownerUserId,
      ownerName: campaign.ownerUserId
        ? (owners.get(campaign.ownerUserId) ?? null)
        : null,
      notes: campaign.notes,
      eventAt: campaign.eventAt,
      location: campaign.location,
    };
  }

  /** Section 16.9: campaigns with their lead counts, newest first. */
  async list(actor: Actor, query: ListCampaignsQueryDto) {
    const scope = this.scopeOf(actor);
    return this.tenantDb.run(scope, async (db) => {
      const builder = db
        .getRepository(Campaign)
        .createQueryBuilder('campaign')
        .where('campaign.tenantId = :tenantId', { tenantId: scope.tenantId });
      const q = query.q?.trim();
      if (q)
        builder.andWhere("campaign.name ILIKE :q ESCAPE '\\'", {
          q: `%${escapeLike(q)}%`,
        });
      if (query.type)
        builder.andWhere('campaign.type = :type', { type: query.type });
      if (query.status)
        builder.andWhere('campaign.status = :status', {
          status: query.status,
        });
      // UUID v7 ids follow creation time
      const [items, total] = await builder
        .orderBy('campaign.id', 'DESC')
        .skip((query.page - 1) * query.pageSize)
        .take(query.pageSize)
        .getManyAndCount();

      // CMP-5: everyone who sees leads filters by campaign; counts follow what they see (LEAD-6)
      const visible = await this.access.leadAgentCodes(actor, db);
      const filter = CampaignsService.leadFilter(visible, 3);
      const counts = items.length
        ? await rowsOf<{ campaign_id: string; leads: number; won: number }>(
            db,
            `SELECT l.campaign_id,
                    count(*)::int AS leads,
                    count(*) FILTER (WHERE l.care_status = 'WON')::int AS won
               FROM leads l
              WHERE l.tenant_id = $1 AND l.campaign_id = ANY($2) AND ${filter.where}
              GROUP BY l.campaign_id`,
            [scope.tenantId, items.map((item) => item.id), ...filter.params],
          )
        : [];
      const countOf = new Map(counts.map((row) => [row.campaign_id, row]));
      const owners = await this.userNames(
        db,
        scope,
        items.flatMap((item) => item.ownerUserId ?? []),
      );
      const showBudget = this.manages(actor) || this.seesAllLeads(actor);
      return {
        items: items.map((item) => {
          const count = countOf.get(item.id);
          const leads = count?.leads ?? 0;
          return {
            ...this.view(item, owners, showBudget),
            leads,
            won: count?.won ?? 0,
            costPerLeadVnd: this.seesAllLeads(actor)
              ? campaignCosts(budgetOf(item), leads, 0).perLeadVnd
              : null,
          };
        }),
        page: query.page,
        pageSize: query.pageSize,
        total,
        canManage: this.manages(actor),
      };
    });
  }

  /** CMP-1: the people a campaign may be given to: active users of the GA. */
  async owners(actor: Actor) {
    this.requireManage(actor);
    const scope = this.scopeOf(actor);
    return this.tenantDb.run(scope, async (db) => ({
      items: await rowsOf<{ id: string; name: string; email: string }>(
        db,
        `SELECT id, name, email FROM users
          WHERE tenant_id = $1 AND status = 'ACTIVE'
          ORDER BY name`,
        [scope.tenantId],
      ),
    }));
  }

  /** CMP-1: dates in order, and an owner from this GA. */
  private async assertFields(
    db: EntityManager,
    scope: Scope,
    fields: {
      startDate?: string | null;
      endDate?: string | null;
      ownerUserId?: string | null;
    },
  ) {
    if (!datesInOrder(fields.startDate, fields.endDate))
      throw new ApiException(HttpStatus.BAD_REQUEST, ErrorCode.InvalidInput, {
        issues: [{ path: 'endDate', message: 'before_start' }],
      });
    if (fields.ownerUserId) {
      const [owner] = await rowsOf<{ id: string }>(
        db,
        `SELECT id FROM users WHERE tenant_id = $1 AND id = $2`,
        [scope.tenantId, fields.ownerUserId],
      );
      if (!owner)
        throw new ApiException(HttpStatus.BAD_REQUEST, ErrorCode.InvalidInput, {
          issues: [{ path: 'ownerUserId', message: 'not_found' }],
        });
    }
  }

  private static duplicateName(error: unknown): boolean {
    const driver = pgError(error);
    return (
      driver?.code === '23505' && driver.constraint === 'campaigns_name_key'
    );
  }

  /** CMP-1 + CMP-5 */
  async create(actor: Actor, dto: CreateCampaignDto): Promise<{ id: string }> {
    this.requireManage(actor);
    const scope = this.scopeOf(actor);
    const now = new Date();
    try {
      return await this.tenantDb.run(scope, async (db) => {
        await this.assertFields(db, scope, dto);
        const values: Partial<Campaign> = {
          tenantId: scope.tenantId,
          name: dto.name,
          type: dto.type,
          status: dto.status ?? 'PLANNED',
          createdAt: now,
          updatedAt: now,
        };
        for (const field of OPTIONAL_FIELDS) {
          const value = dto[field];
          if (value !== undefined && value !== null)
            Object.assign(values, { [field]: stored(field, value) });
        }
        const campaigns = db.getRepository(Campaign);
        const created = await campaigns.save(campaigns.create(values));
        await this.audit.record(
          {
            tenantId: scope.tenantId,
            userId: actor.id,
            action: AuditAction.Create,
            entity: 'campaign',
            entityId: created.id,
            meta: { name: dto.name, type: dto.type },
          },
          db,
        );
        return { id: created.id };
      });
    } catch (error) {
      if (CampaignsService.duplicateName(error))
        throw new ApiException(HttpStatus.CONFLICT, ErrorCode.CampaignExists);
      throw error;
    }
  }

  /** CMP-1: absent keeps, null clears. Ending a campaign is how it stops (DATA-8). */
  async update(
    actor: Actor,
    id: string,
    dto: CampaignFieldsDto,
  ): Promise<void> {
    this.requireManage(actor);
    const scope = this.scopeOf(actor);
    const now = new Date();
    try {
      await this.tenantDb.run(scope, async (db) => {
        const campaign = await this.find(db, scope, id, { lock: true });
        const set: Partial<Campaign> = { updatedAt: now };
        for (const field of ['name', 'type', 'status'] as const)
          if (dto[field] !== undefined)
            Object.assign(set, { [field]: dto[field] });
        for (const field of OPTIONAL_FIELDS) {
          const value = dto[field];
          if (value === undefined) continue;
          Object.assign(set, {
            [field]: value === null ? null : stored(field, value),
          });
        }
        await this.assertFields(db, scope, {
          startDate:
            dto.startDate === undefined ? campaign.startDate : dto.startDate,
          endDate: dto.endDate === undefined ? campaign.endDate : dto.endDate,
          ownerUserId: dto.ownerUserId ?? null,
        });
        await db
          .getRepository(Campaign)
          .update({ id: campaign.id, tenantId: scope.tenantId }, set);
        await this.audit.record(
          {
            tenantId: scope.tenantId,
            userId: actor.id,
            action: AuditAction.Update,
            entity: 'campaign',
            entityId: id,
            meta: { fields: Object.keys(dto) },
          },
          db,
        );
      });
    } catch (error) {
      if (CampaignsService.duplicateName(error))
        throw new ApiException(HttpStatus.CONFLICT, ErrorCode.CampaignExists);
      throw error;
    }
  }

  /** CMP-5 + DATA-8: only a campaign nothing points to can go; the others end instead. */
  async remove(actor: Actor, id: string): Promise<void> {
    this.requireManage(actor);
    const scope = this.scopeOf(actor);
    await this.tenantDb.run(scope, async (db) => {
      const campaign = await this.find(db, scope, id, { lock: true });
      // Leads in the bin still point to it, so they keep it too
      const [used] = await rowsOf<{ used: boolean }>(
        db,
        `SELECT EXISTS (SELECT 1 FROM leads WHERE tenant_id = $1 AND campaign_id = $2)
             OR EXISTS (SELECT 1 FROM campaign_members WHERE tenant_id = $1 AND campaign_id = $2)
             AS used`,
        [scope.tenantId, campaign.id],
      );
      if (used.used)
        throw new ApiException(HttpStatus.CONFLICT, ErrorCode.CampaignInUse);
      await db
        .getRepository(Campaign)
        .delete({ id: campaign.id, tenantId: scope.tenantId });
      await this.audit.record(
        {
          tenantId: scope.tenantId,
          userId: actor.id,
          action: AuditAction.Delete,
          entity: 'campaign',
          entityId: id,
          meta: { name: campaign.name },
        },
        db,
      );
    });
  }

  /** CMP-3: the campaign page, counted over the leads this person sees (LEAD-6). */
  async detail(actor: Actor, id: string) {
    const scope = this.scopeOf(actor);
    return this.tenantDb.run(scope, async (db) => {
      const campaign = await this.find(db, scope, id);
      const visible = await this.access.leadAgentCodes(actor, db);
      const filter = CampaignsService.leadFilter(visible, 3);
      const [facets] = await rowsOf<{
        stage: { _id: string | null; count: number }[];
        interest: { _id: string | null; count: number }[];
        care_status: { _id: string | null; count: number }[];
        linked: (string | null)[];
      }>(
        db,
        `WITH l AS (
           SELECT l.stage, l.interest, l.care_status, l.link_status, l.application_no
             FROM leads l
            WHERE l.tenant_id = $1 AND l.campaign_id = $2 AND ${filter.where}
         )
         SELECT
           (SELECT coalesce(jsonb_agg(jsonb_build_object('_id', stage, 'count', n)), '[]')
              FROM (SELECT stage, count(*)::int n FROM l GROUP BY stage) g) AS stage,
           (SELECT coalesce(jsonb_agg(jsonb_build_object('_id', interest, 'count', n)), '[]')
              FROM (SELECT interest, count(*)::int n FROM l GROUP BY interest) g) AS interest,
           (SELECT coalesce(jsonb_agg(jsonb_build_object('_id', care_status, 'count', n)), '[]')
              FROM (SELECT care_status, count(*)::int n FROM l GROUP BY care_status) g) AS care_status,
           -- LEAD-32: clients linked to the campaign's leads, and their applications
           (SELECT coalesce(jsonb_agg(application_no), '[]')
              FROM l WHERE link_status = 'CONFIRMED') AS linked`,
        [scope.tenantId, campaign.id, ...filter.params],
      );
      const byStage = countBy(facets.stage);
      const leads = Object.values(byStage).reduce(
        (sum, count) => sum + count,
        0,
      );
      const issued = byStage.ISSUED ?? 0;
      const applicationNos = facets.linked.flatMap((no) => no ?? []);
      const [issuedApe] = applicationNos.length
        ? await rowsOf<{ ape: string | null }>(
            db,
            `SELECT sum(ape_vnd)::text AS ape FROM applications
              WHERE tenant_id = $1 AND application_no = ANY($2)
                AND (status = $3 OR issued_date IS NOT NULL)`,
            [scope.tenantId, applicationNos, ISSUED_APPLICATION],
          )
        : [{ ape: null }];
      const seesAll = this.seesAllLeads(actor);
      const owners = await this.userNames(
        db,
        scope,
        campaign.ownerUserId ? [campaign.ownerUserId] : [],
      );
      return {
        campaign: this.view(campaign, owners, this.manages(actor) || seesAll),
        stats: {
          leads,
          byStage,
          byInterest: countBy(facets.interest),
          byCareStatus: countBy(facets.care_status),
          linkedClients: facets.linked.length,
          issued,
          issuedApeVnd: Number(issuedApe.ape ?? 0),
          // CMP-3: only someone who sees every lead sees costs, which divide by every lead
          ...(seesAll
            ? campaignCosts(budgetOf(campaign), leads, issued)
            : { perLeadVnd: null, perIssuedVnd: null }),
        },
        members:
          campaign.type === 'SEMINAR'
            ? await this.memberRows(actor, db, scope, campaign.id, visible)
            : [],
        canManage: this.manages(actor),
        // CMP-4: the form's settings, for whoever may change them
        publicForm: this.manages(actor) ? campaign.publicForm : null,
      };
    });
  }

  /** CMP-2: the seminar's people this person sees, and whether they may mark each one. */
  private async memberRows(
    actor: Actor,
    db: EntityManager,
    scope: Scope,
    campaignId: string,
    visible: Visible,
  ) {
    const filter = CampaignsService.leadFilter(visible, 3);
    const rows = await rowsOf<{
      lead_id: string;
      full_name: string;
      assigned_agent_code: string | null;
      stage: string;
      status: MemberStatus;
      updated_at: Date;
    }>(
      db,
      `SELECT m.lead_id, l.full_name, l.assigned_agent_code, l.stage, m.status, m.updated_at
         FROM campaign_members m
         JOIN leads l ON l.tenant_id = m.tenant_id AND l.id = m.lead_id
        WHERE m.tenant_id = $1 AND m.campaign_id = $2 AND ${filter.where}
        ORDER BY m.updated_at DESC`,
      [scope.tenantId, campaignId, ...filter.params],
    );
    return rows.map((row) => ({
      leadId: row.lead_id,
      fullName: row.full_name,
      assignedAgentCode: row.assigned_agent_code,
      stage: row.stage,
      status: row.status,
      updatedAt: row.updated_at,
      // CMP-2: campaign managers, and whoever works the lead, mark attendance
      canUpdate:
        this.manages(actor) ||
        this.leads.mayWork(actor, {
          assignedAgentCode: row.assigned_agent_code,
        }),
    }));
  }

  /** CMP-2: marking a lead ATTENDED writes a SEMINAR contact on it, once. */
  private async attended(
    actor: Actor,
    db: EntityManager,
    scope: Scope,
    campaign: Campaign,
    leads: readonly { id: string; assignedAgentCode: string | null }[],
  ) {
    if (leads.length === 0) return;
    const now = new Date();
    const at =
      campaign.eventAt && campaign.eventAt < now ? campaign.eventAt : now;
    await db.getRepository(Interaction).insert(
      leads.map((lead) => ({
        tenantId: scope.tenantId,
        leadId: lead.id,
        agentCode: lead.assignedAgentCode,
        type: 'SEMINAR',
        note: `Tham dự hội thảo ${campaign.name}`,
        occurredAt: at,
        source: 'APP',
        createdBy: actor.id,
        createdAt: now,
      })),
    );
  }

  private async seminar(db: EntityManager, scope: Scope, id: string) {
    const campaign = await this.find(db, scope, id, { lock: true });
    if (campaign.type !== 'SEMINAR')
      throw new ApiException(HttpStatus.CONFLICT, ErrorCode.CampaignNotSeminar);
    return campaign;
  }

  /** The live leads among `ids` this person sees. */
  private async visibleLeads(
    db: EntityManager,
    scope: Scope,
    ids: string[],
    visible: Visible,
  ) {
    const filter = CampaignsService.leadFilter(visible, 3);
    const rows = await rowsOf<{
      id: string;
      assigned_agent_code: string | null;
    }>(
      db,
      `SELECT l.id, l.assigned_agent_code FROM leads l
        WHERE l.tenant_id = $1 AND l.id = ANY($2) AND ${filter.where}`,
      [scope.tenantId, ids, ...filter.params],
    );
    return rows.map((row) => ({
      id: row.id,
      assignedAgentCode: row.assigned_agent_code,
    }));
  }

  /** CMP-2: invite or register up to 200 leads the person sees. */
  async addMembers(
    actor: Actor,
    id: string,
    dto: AddMembersDto,
  ): Promise<{ added: number }> {
    this.requireManage(actor);
    const scope = this.scopeOf(actor);
    const ids = [...new Set(dto.leadIds)];
    return this.tenantDb.run(scope, async (db) => {
      const campaign = await this.seminar(db, scope, id);
      const visible = await this.access.leadAgentCodes(actor, db);
      const leads = await this.visibleLeads(db, scope, ids, visible);
      if (leads.length !== ids.length) throw notFound();
      const before = await rowsOf<{ lead_id: string; status: MemberStatus }>(
        db,
        `SELECT lead_id, status FROM campaign_members
          WHERE tenant_id = $1 AND campaign_id = $2 AND lead_id = ANY($3)`,
        [scope.tenantId, campaign.id, ids],
      );
      const statusOf = new Map(before.map((row) => [row.lead_id, row.status]));
      const now = new Date();
      await db.query(
        `INSERT INTO campaign_members (tenant_id, campaign_id, lead_id, status, updated_by, updated_at)
         SELECT $1, $2, lead_id, $4, $5, $6 FROM unnest($3::uuid[]) AS lead_id
         ON CONFLICT (tenant_id, campaign_id, lead_id) DO UPDATE
           SET status = EXCLUDED.status, updated_by = EXCLUDED.updated_by,
               updated_at = EXCLUDED.updated_at`,
        [scope.tenantId, campaign.id, ids, dto.status, actor.id, now],
      );
      if (dto.status === 'ATTENDED')
        await this.attended(
          actor,
          db,
          scope,
          campaign,
          leads.filter((lead) => statusOf.get(lead.id) !== 'ATTENDED'),
        );
      await this.audit.record(
        {
          tenantId: scope.tenantId,
          userId: actor.id,
          action: AuditAction.Update,
          entity: 'campaign',
          entityId: id,
          meta: { members: ids.length, status: dto.status },
        },
        db,
      );
      return { added: ids.filter((leadId) => !statusOf.has(leadId)).length };
    });
  }

  /** CMP-2: one person's status; campaign managers or whoever works the lead. */
  async updateMember(
    actor: Actor,
    id: string,
    leadId: string,
    dto: UpdateMemberDto,
  ): Promise<void> {
    const scope = this.scopeOf(actor);
    if (!isId(leadId)) throw notFound();
    await this.tenantDb.run(scope, async (db) => {
      const campaign = await this.seminar(db, scope, id);
      const visible = await this.access.leadAgentCodes(actor, db);
      const [member] = await rowsOf<{ id: string; status: MemberStatus }>(
        db,
        `SELECT id, status FROM campaign_members
          WHERE tenant_id = $1 AND campaign_id = $2 AND lead_id = $3
          FOR UPDATE`,
        [scope.tenantId, campaign.id, leadId],
      );
      const [lead] = await this.visibleLeads(db, scope, [leadId], visible);
      if (!member || !lead) throw notFound();
      if (!this.manages(actor) && !this.leads.mayWork(actor, lead))
        throw new ApiException(HttpStatus.FORBIDDEN, ErrorCode.LeadNotYours);
      const status: MemberStatus = dto.status;
      await db.query(
        `UPDATE campaign_members SET status = $3, updated_by = $4, updated_at = $5
          WHERE tenant_id = $1 AND id = $2`,
        [scope.tenantId, member.id, status, actor.id, new Date()],
      );
      if (status === 'ATTENDED' && member.status !== 'ATTENDED')
        await this.attended(actor, db, scope, campaign, [lead]);
      await this.audit.record(
        {
          tenantId: scope.tenantId,
          userId: actor.id,
          action: AuditAction.Update,
          entity: 'campaign_member',
          entityId: leadId,
          meta: { campaignId: id, from: member.status, to: status },
        },
        db,
      );
    });
  }
}
