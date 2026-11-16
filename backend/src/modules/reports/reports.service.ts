import { HttpStatus, Injectable } from '@nestjs/common';
import type { EntityManager } from 'typeorm';
import { ApiException, ErrorCode, forbidden } from '../../common/errors.js';
import { Permission, Role } from '../../common/rbac.js';
import type { Actor, Scope } from '../../common/rbac.js';
import { and, positional, sql } from '../../core/persistence/fragment.js';
import { rowsOf } from '../../core/persistence/sql.js';
import { TenantDb } from '../../core/tenancy/tenant-db.js';
import { AgentsService } from '../agents/agents.service.js';
import { AuditAction, AuditService } from '../audit/audit.service.js';
import { campaignCosts } from '../campaigns/campaign-stats.js';
import { LIST_SIGNALS } from '../clients/client-insights.js';
import { ClientsService } from '../clients/clients.service.js';
import { LeadOptionsService } from '../leads/lead-options.service.js';
import { handoverHistory } from '../leads/lead-rules.js';
import { TenantsService } from '../tenants/tenants.service.js';
import {
  addMetrics,
  buildReportTree,
  countActivities,
  daysSince,
  PIPELINE_STAGES,
  thisMonth,
  vietnamDay,
  vietnamRange,
} from './report-rules.js';
import type { Metrics, ReportRow, TreeAgent } from './report-rules.js';
import type {
  ExportReportDto,
  FunnelGroup,
  FunnelQueryDto,
  ReportRangeDto,
} from './reports.dto.js';

const DAY_MS = 86_400_000;
/** CUS-13 */
const ISSUED_APPLICATION = 'Đã phát hành hợp đồng';
/** RPT-4: a period longer than this is refused, so one request cannot scan years of data. */
const MAX_DAYS = 400;
/**
 * LEAD-40: a lead in the bin is left out of every report, as the lists leave it out. An erased lead
 * (PDP-6) still counts: only its personal fields are gone.
 */
const IN_USE = 'l.deleted_at IS NULL';
/** R3: the lead column each funnel groups by. */
const FUNNEL_COLUMN: Record<FunnelGroup, string> = {
  source: 'l.source',
  campaign: 'l.campaign_id',
  phoneSource: 'l.phone_source',
};

/** RPT-3: who the report covers. */
interface ReportScope extends Scope {
  /** Every agent of the GA, plus "Chưa phân công" in lead reports. */
  all: boolean;
  codes: string[];
}

/**
 * RPT-3: limits a column to the agents of the report. Adds its value to `params` and returns the
 * condition, or nothing for the whole GA.
 */
function agentFilter(
  scope: ReportScope,
  column: string,
  params: unknown[],
): string {
  return scope.all
    ? ''
    : `AND ${column} = ANY($${params.push(scope.codes)}::text[])`;
}

/** Chapter 13: R1, R2, R3, R5, R7 and R8 in the agent-tree layout (RPT-1), read only. */
@Injectable()
export class ReportsService {
  constructor(
    private readonly tenantDb: TenantDb,
    private readonly agents: AgentsService,
    private readonly leadOptions: LeadOptionsService,
    private readonly clients: ClientsService,
    private readonly tenants: TenantsService,
    private readonly audit: AuditService,
  ) {}

  /**
   * RPT-3: a FC sees their own row, a manager their line, and GA_HEAD or whoever holds
   * reports.view_all (or manages leads, whose screens already show every lead) the whole GA.
   */
  private async scopeOf(actor: Actor, db: EntityManager): Promise<ReportScope> {
    const scope = await this.scopeOrNone(actor, db);
    if (!scope) throw forbidden();
    return scope;
  }

  /** RPT-3, or null for someone with no agents to report on (no agent code, no view_all). */
  private async scopeOrNone(
    actor: Actor,
    db: EntityManager,
  ): Promise<ReportScope | null> {
    if (!actor.tenantId) throw forbidden();
    const tenantId = actor.tenantId;
    const all =
      actor.roles.includes(Role.GaHead) ||
      actor.permissions.includes(Permission.ReportsViewAll) ||
      actor.permissions.includes(Permission.LeadsManage);
    if (all) return { tenantId, all, codes: [] };
    const codes = await this.agents.scopeCodes(actor, db);
    if (codes.length === 0) return null;
    return { tenantId, all, codes };
  }

  /** One report: its scope and its reads in one transaction, so its figures agree. */
  private run<T>(
    actor: Actor,
    work: (db: EntityManager, scope: ReportScope) => Promise<T>,
  ): Promise<T> {
    if (!actor.tenantId) throw forbidden();
    return this.tenantDb.run({ tenantId: actor.tenantId }, async (db) =>
      work(db, await this.scopeOf(actor, db)),
    );
  }

  /** RPT-4 + RPT-8: the period, this month by default. */
  private period(query: ReportRangeDto) {
    const fallback = thisMonth(new Date());
    const from = query.from ?? fallback.from;
    const to = query.to ?? fallback.to;
    const { start, end } = vietnamRange(from, to);
    if (start >= end || end.getTime() - start.getTime() > MAX_DAYS * DAY_MS)
      throw new ApiException(HttpStatus.BAD_REQUEST, ErrorCode.InvalidInput, {
        issues: [{ path: 'to', message: 'range' }],
      });
    return { from, to, start, end };
  }

  /** The agents of the report, for the tree. */
  private treeAgents(db: EntityManager, scope: ReportScope) {
    const params: unknown[] = [scope.tenantId];
    return rowsOf<TreeAgent>(
      db,
      `SELECT agent_code AS "agentCode", name, rank, manager_code AS "managerCode"
         FROM agents WHERE tenant_id = $1 ${agentFilter(scope, 'agent_code', params)}`,
      params,
    );
  }

  /**
   * The home dashboard: the leads of the person's report scope (RPT-3) as a few small figures.
   * Counts and sums only, never a lead's name or phone, so the masking rules have nothing to hide.
   * `days` covers the trend, the sources and the contacts per agent; the pipeline is as of now.
   */
  async dashboard(actor: Actor, days: number) {
    if (!actor.tenantId) throw forbidden();
    return this.tenantDb.run({ tenantId: actor.tenantId }, async (db) => {
      const scope = await this.scopeOrNone(actor, db);
      if (!scope) return { available: false as const };
      const now = new Date();
      const to = vietnamDay(now);
      const from = vietnamDay(new Date(now.getTime() - (days - 1) * DAY_MS));
      const { start, end } = vietnamRange(from, to);
      const filter = (params: unknown[]) =>
        agentFilter(scope, 'l.assigned_agent_code', params);

      const stageParams: unknown[] = [scope.tenantId, [...PIPELINE_STAGES]];
      const stages = await rowsOf<{
        stage: string;
        count: number;
        value: string;
      }>(
        db,
        `SELECT l.stage, count(*)::int AS count, coalesce(sum(l.value_vnd), 0)::text AS value
           FROM leads l
          WHERE l.tenant_id = $1 AND ${IN_USE} AND l.stage = ANY($2::text[]) ${filter(stageParams)}
          GROUP BY 1`,
        stageParams,
      );
      const byStage = new Map(stages.map((row) => [row.stage, row]));
      const pipeline = PIPELINE_STAGES.map((stage) => ({
        stage,
        count: byStage.get(stage)?.count ?? 0,
        valueVnd: Number(byStage.get(stage)?.value ?? 0),
      }));

      // RPT-8: lead days and contact days are Vietnam days. The period before, of the same
      // length, is read too, so each card can say how it moved
      const prevStart = new Date(start.getTime() - days * DAY_MS);
      const prevFrom = vietnamDay(
        new Date(prevStart.getTime() + 12 * 3_600_000),
      );
      const dayParams: unknown[] = [
        scope.tenantId,
        prevFrom,
        to,
        prevStart,
        end,
      ];
      const perDay = await rowsOf<{
        day: string;
        created: number;
        contacted: number;
        won: number;
      }>(
        db,
        `SELECT day, sum(created)::int AS created, sum(contacted)::int AS contacted, sum(won)::int AS won FROM (
           SELECT l.lead_date::text AS day, 1 AS created, 0 AS contacted,
                  CASE WHEN l.care_status = 'WON' THEN 1 ELSE 0 END AS won
             FROM leads l
            WHERE l.tenant_id = $1 AND ${IN_USE} AND l.lead_date BETWEEN $2 AND $3 ${filter(dayParams)}
           UNION ALL
           SELECT ((l.first_contact_at + interval '7 hours')::date)::text, 0, 1, 0
             FROM leads l
            WHERE l.tenant_id = $1 AND ${IN_USE} AND l.first_contact_at >= $4 AND l.first_contact_at < $5
                  ${filter(dayParams)}
         ) counted GROUP BY day`,
        dayParams,
      );
      const counted = new Map(perDay.map((row) => [row.day, row]));

      /*
       * Open leads and pipeline value at the end of each day, worked back from now: every lead
       * creation and stage change in the period moved them by one lead and its value, so undoing
       * the later ones gives an earlier day. Leads in the bin are left out (LEAD-40); a lead's value
       * is its current one, and a FC or a line sees the leads they hold now.
       */
      const moveParams: unknown[] = [
        scope.tenantId,
        [...PIPELINE_STAGES],
        prevStart,
      ];
      const moves = await rowsOf<{ day: string; leads: number; value: string }>(
        db,
        `WITH scoped AS (
           SELECT l.id, l.stage, l.created_at, coalesce(l.value_vnd, 0) AS value
             FROM leads l
            WHERE l.tenant_id = $1 AND ${IN_USE} ${filter(moveParams)}
         ), moved AS (
           -- A new lead enters the pipeline if its first stage was a pipeline stage
           SELECT s.created_at AS at, s.value,
                  CASE WHEN coalesce(first.old_value, s.stage) = ANY($2::text[]) THEN 1 ELSE 0 END AS step
             FROM scoped s
             LEFT JOIN LATERAL (
               SELECT h.old_value FROM lead_history h
                WHERE h.tenant_id = $1 AND h.lead_id = s.id AND h.field = 'stage'
                ORDER BY h.changed_at LIMIT 1
             ) first ON true
            WHERE s.created_at >= $3
           UNION ALL
           SELECT h.changed_at, s.value,
                  (CASE WHEN h.new_value = ANY($2::text[]) THEN 1 ELSE 0 END)
                - (CASE WHEN h.old_value = ANY($2::text[]) THEN 1 ELSE 0 END)
             FROM lead_history h JOIN scoped s ON s.id = h.lead_id
            WHERE h.tenant_id = $1 AND h.field = 'stage' AND h.changed_at >= $3
         )
         SELECT ((at + interval '7 hours')::date)::text AS day, sum(step)::int AS leads,
                sum(step * value)::text AS value
           FROM moved WHERE step <> 0 GROUP BY 1`,
        moveParams,
      );
      const moved = new Map(
        moves.map((row) => [
          row.day,
          { leads: row.leads, value: Number(row.value) },
        ]),
      );
      const openNow = pipeline.reduce((sum, row) => sum + row.count, 0);
      const valueNow = pipeline.reduce((sum, row) => sum + row.valueVnd, 0);

      // Days of both periods, oldest first; the open figures are taken at the end of each day
      const allDays: string[] = [];
      for (let at = 0; at < days * 2; at++)
        allDays.push(
          vietnamDay(
            new Date(prevStart.getTime() + at * DAY_MS + 12 * 3_600_000),
          ),
        );
      let open = openNow;
      let value = valueNow;
      const endOf = new Map<string, { open: number; value: number }>();
      for (const day of [...allDays].reverse()) {
        endOf.set(day, { open, value });
        open -= moved.get(day)?.leads ?? 0;
        value -= moved.get(day)?.value ?? 0;
      }
      const daily = allDays.slice(days).map((day) => ({
        day,
        created: counted.get(day)?.created ?? 0,
        contacted: counted.get(day)?.contacted ?? 0,
        won: counted.get(day)?.won ?? 0,
        open: endOf.get(day)!.open,
        valueVnd: endOf.get(day)!.value,
      }));
      const before = allDays.slice(0, days);
      const sumBefore = (field: 'created' | 'contacted' | 'won') =>
        before.reduce((sum, day) => sum + (counted.get(day)?.[field] ?? 0), 0);
      const atStart = endOf.get(before[before.length - 1])!;
      const previous = {
        openLeads: atStart.open,
        pipelineValueVnd: atStart.value,
        newLeads: sumBefore('created'),
        contacted: sumBefore('contacted'),
        won: sumBefore('won'),
      };

      const sourceParams: unknown[] = [scope.tenantId, from, to];
      const sourceRows = await rowsOf<{
        code: string | null;
        count: number;
        won: number;
      }>(
        db,
        `SELECT l.source AS code, count(*)::int AS count,
                count(*) FILTER (WHERE l.care_status = 'WON')::int AS won
           FROM leads l
          WHERE l.tenant_id = $1 AND ${IN_USE} AND l.lead_date BETWEEN $2 AND $3 ${filter(sourceParams)}
          GROUP BY 1`,
        sourceParams,
      );
      const labels = new Map(
        (await this.leadOptions.list(scope, db))
          .filter((option) => option.kind === 'source')
          .map((option) => [option.code, option.label]),
      );
      const sources = sourceRows.map((row) => ({
        code: row.code,
        label: row.code ? (labels.get(row.code) ?? row.code) : null,
        count: row.count,
        won: row.won,
      }));

      // A manager compares agents; a FC alone has nothing to compare
      let agents:
        | {
            agentCode: string | null;
            name: string | null;
            open: number;
            contacted: number;
          }[]
        | null = null;
      if (scope.all || scope.codes.length > 1) {
        const agentParams: unknown[] = [
          scope.tenantId,
          [...PIPELINE_STAGES],
          start,
          end,
        ];
        const rows = await rowsOf<{
          agentCode: string | null;
          name: string | null;
          open: number;
          contacted: number;
        }>(
          db,
          `SELECT l.assigned_agent_code AS "agentCode", a.name,
                  count(*) FILTER (WHERE l.stage = ANY($2::text[]))::int AS open,
                  count(*) FILTER (WHERE l.first_contact_at >= $3 AND l.first_contact_at < $4)::int AS contacted
             FROM leads l
             LEFT JOIN agents a ON a.tenant_id = l.tenant_id AND a.agent_code = l.assigned_agent_code
            WHERE l.tenant_id = $1 AND ${IN_USE} ${filter(agentParams)}
            GROUP BY 1, 2`,
          agentParams,
        );
        agents = rows.filter((row) => row.open > 0 || row.contacted > 0);
      }

      return {
        available: true as const,
        scope: scope.all ? 'TENANT' : scope.codes.length > 1 ? 'LINE' : 'OWN',
        days,
        from,
        to,
        totals: {
          openLeads: openNow,
          pipelineValueVnd: valueNow,
          newLeads: daily.reduce((sum, row) => sum + row.created, 0),
          contacted: daily.reduce((sum, row) => sum + row.contacted, 0),
          won: daily.reduce((sum, row) => sum + row.won, 0),
        },
        /** The same figures for the period just before, of the same length (open ones at its end). */
        previous,
        pipeline,
        daily,
        sources,
        agents,
      };
    });
  }

  /**
   * R1 (section 13.2): leads by the agent they are assigned to, for leads dated in the period.
   * Contacted = a recorded contact or a status; within 24 hours only counts contacts the CRM timed
   * (LEAD-30); one column per interest of the GA's catalogue; opportunity = the interests flagged
   * "Tính là cơ hội" (OPT-11).
   */
  async conversion(actor: Actor, query: ReportRangeDto) {
    const { from, to } = this.period(query);
    return this.run(actor, async (db, scope) => {
      const { contactDeadlineHours } = await this.tenants.leadRules(scope, db);
      const overdueBefore = new Date(
        Date.now() - contactDeadlineHours * 3_600_000,
      );
      const params: unknown[] = [scope.tenantId, from, to, overdueBefore];
      const rows = await rowsOf<{
        agent: string | null;
        interest: string | null;
        total: number;
        contacted: number;
        timed: number;
        in24h: number;
        overdue: number;
        caring: number;
        won: number;
        dropped: number;
      }>(
        db,
        `SELECT l.assigned_agent_code AS agent, l.interest, count(*)::int AS total,
                count(*) FILTER (WHERE l.first_contact_at IS NOT NULL OR l.interest IS NOT NULL
                                    OR l.care_status IS NOT NULL)::int AS contacted,
                count(*) FILTER (WHERE l.first_contact_at IS NOT NULL
                                   AND l.assigned_at IS NOT NULL)::int AS timed,
                count(*) FILTER (WHERE l.first_contact_at IS NOT NULL AND l.assigned_at IS NOT NULL
                                   AND l.first_contact_at - l.assigned_at <= interval '1 day')::int AS in24h,
                -- LEAD-29 with the GA's own deadline
                count(*) FILTER (WHERE l.assigned_agent_code IS NOT NULL AND l.assigned_at < $4
                                   AND l.first_contact_at IS NULL AND l.interest IS NULL
                                   AND l.care_status IS NULL)::int AS overdue,
                count(*) FILTER (WHERE l.care_status = 'CARING')::int AS caring,
                count(*) FILTER (WHERE l.care_status = 'WON')::int AS won,
                count(*) FILTER (WHERE l.care_status = 'DROPPED')::int AS dropped
           FROM leads l
          WHERE l.tenant_id = $1 AND ${IN_USE} AND l.lead_date BETWEEN $2 AND $3
                ${agentFilter(scope, 'l.assigned_agent_code', params)}
          GROUP BY 1, 2`,
        params,
      );
      const options = (await this.leadOptions.list(scope, db)).filter(
        (option) => option.kind === 'interest',
      );
      const opportunity = new Set(
        options
          .filter((option) => option.isOpportunity)
          .map((option) => option.code),
      );
      const byAgent = new Map<string, Metrics>();
      let unassigned: Metrics | undefined = scope.all ? {} : undefined;
      for (const row of rows) {
        const { agent, interest } = row;
        const values: Metrics = {
          total: row.total,
          contacted: row.contacted,
          timed: row.timed,
          in24h: row.in24h,
          overdue: row.overdue,
          caring: row.caring,
          won: row.won,
          dropped: row.dropped,
          ...(interest && { [`interest:${interest}`]: row.total }),
          ...(interest &&
            opportunity.has(interest) && { opportunity: row.total }),
        };
        const target = agent ? (byAgent.get(agent) ?? {}) : unassigned;
        if (!target) continue;
        addMetrics(target, values);
        if (agent) byAgent.set(agent, target);
        else unassigned = target;
      }
      const tree = buildReportTree(
        await this.treeAgents(db, scope),
        byAgent,
        unassigned,
      );
      // OPT-11: a column for every interest the GA has, or that a lead in the period carries
      const used = new Set(rows.flatMap((row) => row.interest ?? []));
      return {
        from,
        to,
        ...tree,
        interests: options
          .filter((option) => option.active || used.has(option.code))
          .map((option) => ({
            code: option.code,
            label: option.label,
            isOpportunity: option.isOpportunity,
          })),
      };
    });
  }

  /**
   * R2 (section 13.2): activities by agent over the Vietnam days of the period, from CRM contacts on
   * leads and clients and from 07_Activities, plus the leads each agent won in the period.
   */
  async activities(actor: Actor, query: ReportRangeDto) {
    const { from, to, start, end } = this.period(query);
    return this.run(actor, async (db, scope) => {
      // R2: a contact's person is known by the phone of the lead or the client
      const crmParams: unknown[] = [scope.tenantId, start, end];
      const crm = await rowsOf<{
        agentCode: string;
        type: string;
        occurredAt: Date;
        phone: string | null;
      }>(
        db,
        `SELECT i.agent_code AS "agentCode", i.type, i.occurred_at AS "occurredAt",
                CASE WHEN i.lead_id IS NOT NULL THEN l.phone ELSE c.phone END AS phone
           FROM interactions i
           LEFT JOIN leads l ON l.tenant_id = i.tenant_id AND l.id = i.lead_id AND ${IN_USE}
           LEFT JOIN clients c ON c.tenant_id = i.tenant_id AND c.client_code = i.client_code
          WHERE i.tenant_id = $1 AND i.type IN ('CALL', 'ZALO', 'MEETING', 'SEMINAR')
            AND i.occurred_at >= $2 AND i.occurred_at < $3 AND i.agent_code IS NOT NULL
            ${agentFilter(scope, 'i.agent_code', crmParams)}`,
        crmParams,
      );
      const successParams: unknown[] = [scope.tenantId, from, to];
      const success = await rowsOf<{
        agentCode: string;
        activityType: string;
        callType: string | null;
        activityDate: string;
        status: string;
        phoneKey: string | null;
      }>(
        db,
        `SELECT agent_code AS "agentCode", activity_type AS "activityType", call_type AS "callType",
                activity_date::text AS "activityDate", status, phone_key AS "phoneKey"
           FROM success_activities
          WHERE tenant_id = $1 AND activity_date BETWEEN $2 AND $3
            ${agentFilter(scope, 'agent_code', successParams)}`,
        successParams,
      );
      const counts = countActivities({ crm, success });
      // R2: leads won in the period, by their current assignee
      const wonParams: unknown[] = [scope.tenantId, start, end];
      const won = await rowsOf<{ agentCode: string }>(
        db,
        `SELECT l.assigned_agent_code AS "agentCode" FROM leads l
          WHERE l.tenant_id = $1 AND ${IN_USE} AND l.care_status = 'WON'
            AND l.assigned_agent_code IS NOT NULL
            ${agentFilter(scope, 'l.assigned_agent_code', wonParams)}
            AND EXISTS (SELECT 1 FROM lead_history h
                         WHERE h.tenant_id = l.tenant_id AND h.lead_id = l.id
                           AND h.field = 'careStatus' AND h.new_value = 'WON'
                           AND h.changed_at >= $2 AND h.changed_at < $3)`,
        wonParams,
      );
      for (const lead of won) {
        const row = counts.get(lead.agentCode) ?? {};
        row.won = (row.won ?? 0) + 1;
        counts.set(lead.agentCode, row);
      }
      return {
        from,
        to,
        ...buildReportTree(await this.treeAgents(db, scope), counts),
      };
    });
  }

  /**
   * R8 (section 13.2, LEAD-28): per agent, leads received and handed over in the period, handovers
   * with no contact, and the days held before a handover.
   */
  async handovers(actor: Actor, query: ReportRangeDto) {
    const { from, to, start, end } = this.period(query);
    return this.run(actor, async (db, scope) => {
      const leads = await rowsOf<{
        id: string;
        agentCode: string | null;
        assignedAt: Date | null;
        createdAt: Date;
      }>(
        db,
        `SELECT l.id, l.assigned_agent_code AS "agentCode", l.assigned_at AS "assignedAt",
                l.created_at AS "createdAt"
           FROM leads l
          WHERE l.tenant_id = $1 AND ${IN_USE}
            AND EXISTS (SELECT 1 FROM lead_history h
                         WHERE h.tenant_id = l.tenant_id AND h.lead_id = l.id AND h.field = 'assignee'
                           AND h.changed_at >= $2 AND h.changed_at < $3)`,
        [scope.tenantId, start, end],
      );
      const ids = leads.map((lead) => lead.id);
      const rows = ids.length
        ? await rowsOf<{
            leadId: string;
            oldValue: string | null;
            newValue: string | null;
            changedAt: Date;
          }>(
            db,
            `SELECT lead_id AS "leadId", old_value AS "oldValue", new_value AS "newValue",
                    changed_at AS "changedAt"
               FROM lead_history
              WHERE tenant_id = $1 AND field = 'assignee' AND lead_id = ANY($2::uuid[])`,
            [scope.tenantId, ids],
          )
        : [];
      const contacts = ids.length
        ? await rowsOf<{
            leadId: string;
            agentCode: string | null;
            occurredAt: Date;
          }>(
            db,
            `SELECT lead_id AS "leadId", agent_code AS "agentCode", occurred_at AS "occurredAt"
               FROM interactions
              WHERE tenant_id = $1 AND lead_id = ANY($2::uuid[])
                AND type IN ('CALL', 'ZALO', 'MEETING')`,
            [scope.tenantId, ids],
          )
        : [];
      const inScope = (code: string) => scope.all || scope.codes.includes(code);
      const counts = new Map<string, Metrics>();
      const bump = (code: string, key: string, by = 1) => {
        if (!inScope(code)) return;
        const row = counts.get(code) ?? {};
        row[key] = (row[key] ?? 0) + by;
        counts.set(code, row);
      };
      const now = new Date();
      for (const lead of leads) {
        const spans = handoverHistory({
          rows: rows.filter((row) => row.leadId === lead.id),
          contacts: contacts.filter((item) => item.leadId === lead.id),
          currentAgent: lead.agentCode,
          createdAt: lead.createdAt,
          assignedAt: lead.assignedAt,
          now,
        });
        for (const span of spans) {
          if (span.from >= start && span.from < end)
            bump(span.agentCode, 'received');
          if (span.to && span.to >= start && span.to < end) {
            bump(span.agentCode, 'handedOver');
            bump(span.agentCode, 'holdDays', span.days);
            if (span.contacts === 0) bump(span.agentCode, 'noContact');
          }
        }
      }
      return {
        from,
        to,
        ...buildReportTree(await this.treeAgents(db, scope), counts),
      };
    });
  }

  /**
   * R3 (section 13.2): leads dated in the period by source, campaign or phone source, down the
   * funnel: contacted, opportunity, won, linked to a client, issued. Cost per lead and per issued
   * case for campaigns with a budget, for whoever sees every lead (as on the campaign page).
   */
  async funnel(actor: Actor, query: FunnelQueryDto) {
    const { from, to } = this.period(query);
    const groupBy: FunnelGroup = query.groupBy ?? 'source';
    return this.run(actor, async (db, scope) => {
      const options = await this.leadOptions.list(scope, db);
      const opportunity = options
        .filter((option) => option.kind === 'interest' && option.isOpportunity)
        .map((option) => option.code);
      const params: unknown[] = [scope.tenantId, from, to, opportunity];
      const groups = await rowsOf<{
        key: string | null;
        leads: number;
        contacted: number;
        opportunity: number;
        won: number;
        linked: number;
        issued: number;
        applicationNos: string[];
      }>(
        db,
        `SELECT ${FUNNEL_COLUMN[groupBy]}::text AS key, count(*)::int AS leads,
                count(*) FILTER (WHERE l.first_contact_at IS NOT NULL OR l.interest IS NOT NULL
                                    OR l.care_status IS NOT NULL)::int AS contacted,
                count(*) FILTER (WHERE l.interest = ANY($4::text[]))::int AS opportunity,
                count(*) FILTER (WHERE l.care_status = 'WON')::int AS won,
                count(*) FILTER (WHERE l.link_status = 'CONFIRMED')::int AS linked,
                count(*) FILTER (WHERE l.stage = 'ISSUED')::int AS issued,
                coalesce(array_agg(l.application_no)
                           FILTER (WHERE l.link_status = 'CONFIRMED' AND l.application_no IS NOT NULL),
                         '{}') AS "applicationNos"
           FROM leads l
          WHERE l.tenant_id = $1 AND ${IN_USE} AND l.lead_date BETWEEN $2 AND $3
                ${agentFilter(scope, 'l.assigned_agent_code', params)}
          GROUP BY 1`,
        params,
      );
      // R3: APE issued from the applications of linked leads (as CMP-3)
      const applicationNos = [
        ...new Set(groups.flatMap((group) => group.applicationNos)),
      ];
      const issuedApplications = applicationNos.length
        ? await rowsOf<{ applicationNo: string; apeVnd: string | null }>(
            db,
            `SELECT application_no AS "applicationNo", ape_vnd AS "apeVnd" FROM applications
              WHERE tenant_id = $1 AND application_no = ANY($2::text[])
                AND (status = $3 OR issued_date IS NOT NULL)`,
            [scope.tenantId, applicationNos, ISSUED_APPLICATION],
          )
        : [];
      const apeOf = new Map(
        issuedApplications.map((item) => [
          item.applicationNo,
          Number(item.apeVnd ?? 0),
        ]),
      );
      const campaignIds =
        groupBy === 'campaign'
          ? groups.flatMap((group) => group.key ?? [])
          : [];
      const campaigns = campaignIds.length
        ? await rowsOf<{ id: string; name: string; budgetVnd: string | null }>(
            db,
            `SELECT id, name, budget_vnd AS "budgetVnd" FROM campaigns
              WHERE tenant_id = $1 AND id = ANY($2::uuid[])`,
            [scope.tenantId, campaignIds],
          )
        : [];
      const campaignOf = new Map(
        campaigns.map((campaign) => [campaign.id, campaign]),
      );
      const seesAll = actor.permissions.includes(Permission.LeadsManage);
      const label = (id: string | null): string | null => {
        if (!id) return null;
        if (groupBy === 'source')
          return (
            options.find(
              (option) => option.kind === 'source' && option.code === id,
            )?.label ?? id
          );
        if (groupBy === 'campaign') return campaignOf.get(id)?.name ?? id;
        return id;
      };
      const rows: ReportRow[] = groups
        .map((group) => {
          const id = group.key;
          const values: Metrics = {
            leads: group.leads,
            contacted: group.contacted,
            opportunity: group.opportunity,
            won: group.won,
            linked: group.linked,
            issued: group.issued,
            issuedApeVnd: group.applicationNos.reduce(
              (sum, no) => sum + (apeOf.get(no) ?? 0),
              0,
            ),
          };
          const budget = id ? campaignOf.get(id)?.budgetVnd : null;
          if (seesAll && budget !== undefined && budget !== null) {
            values.budgetVnd = Number(budget);
            const costs = campaignCosts(
              values.budgetVnd,
              group.leads,
              group.issued,
            );
            if (costs.perLeadVnd !== null) values.perLeadVnd = costs.perLeadVnd;
            if (costs.perIssuedVnd !== null)
              values.perIssuedVnd = costs.perIssuedVnd;
          }
          return {
            key: `${groupBy}:${id ?? 'NONE'}`,
            kind: 'item' as const,
            agentCode: null,
            name: label(id),
            groupKind: null,
            depth: 0,
            parentKey: null,
            values,
          };
        })
        .sort((a, b) => (b.values.leads ?? 0) - (a.values.leads ?? 0));
      const total: Metrics = {};
      for (const row of rows) {
        const {
          budgetVnd: _budget,
          perLeadVnd: _lead,
          perIssuedVnd: _issued,
          ...additive
        } = row.values;
        addMetrics(total, additive);
      }
      return { from, to, groupBy, rows, total };
    });
  }

  /**
   * R5 (section 13.2): the leads still in the pipeline, by agent and stage, with the expected value
   * (the lead's value) and how long they have sat in their stage. A snapshot, so no period.
   */
  async pipeline(actor: Actor) {
    return this.run(actor, async (db, scope) => {
      const now = new Date();
      const params: unknown[] = [scope.tenantId, [...PIPELINE_STAGES]];
      const leads = await rowsOf<{
        agentCode: string | null;
        stage: string;
        valueVnd: string | null;
        since: Date;
      }>(
        db,
        `SELECT l.assigned_agent_code AS "agentCode", l.stage, l.value_vnd AS "valueVnd",
                coalesce((SELECT max(h.changed_at) FROM lead_history h
                           WHERE h.tenant_id = l.tenant_id AND h.lead_id = l.id AND h.field = 'stage'),
                         l.created_at) AS since
           FROM leads l
          WHERE l.tenant_id = $1 AND ${IN_USE} AND l.stage = ANY($2::text[])
                ${agentFilter(scope, 'l.assigned_agent_code', params)}`,
        params,
      );
      const byAgent = new Map<string, Metrics>();
      const unassigned: Metrics | undefined = scope.all ? {} : undefined;
      for (const lead of leads) {
        const target = lead.agentCode
          ? (byAgent.get(lead.agentCode) ?? {})
          : unassigned;
        if (!target) continue;
        const value = Number(lead.valueVnd ?? 0);
        addMetrics(target, {
          open: 1,
          apeTotal: value,
          [`count:${lead.stage}`]: 1,
          [`ape:${lead.stage}`]: value,
          [`days:${lead.stage}`]: daysSince(lead.since, now),
        });
        if (lead.agentCode) byAgent.set(lead.agentCode, target);
      }
      return buildReportTree(
        await this.treeAgents(db, scope),
        byAgent,
        unassigned,
      );
    });
  }

  /**
   * R7 (section 13.2): per agent, the clients they own that carry each list signal now (SIG-1, the
   * same rules as the client list), and the contacts and notes on clients in the period.
   */
  async care(actor: Actor, query: ReportRangeDto) {
    const { from, to, start, end } = this.period(query);
    return this.run(actor, async (db, scope) => {
      const today = vietnamDay(new Date());
      const reach = { all: scope.all, codes: scope.codes };
      const owners = scope.all
        ? null
        : sql`c.owner_agent_codes && ${scope.codes}::text[]`;
      const counts = new Map<string, Metrics>();
      const bump = (code: string, key: string, by = 1) => {
        if (!scope.all && !scope.codes.includes(code)) return;
        const row = counts.get(code) ?? {};
        row[key] = (row[key] ?? 0) + by;
        counts.set(code, row);
      };
      const ownersOf = async (clause: ReturnType<typeof and>) => {
        const [where, params] = positional(clause);
        return rowsOf<{ ownerAgentCodes: string[] }>(
          db,
          `SELECT c.owner_agent_codes AS "ownerAgentCodes" FROM clients c WHERE ${where}`,
          params,
        );
      };
      const mine = sql`c.tenant_id = ${scope.tenantId}`;
      for (const client of await ownersOf(and(mine, owners)))
        for (const code of client.ownerAgentCodes) bump(code, 'clients');
      for (const signal of LIST_SIGNALS) {
        const clause = await this.clients.signalClause(
          scope,
          reach,
          signal,
          today,
          db,
        );
        for (const client of await ownersOf(and(mine, owners, clause)))
          for (const code of client.ownerAgentCodes) bump(code, signal);
      }
      const params: unknown[] = [scope.tenantId, start, end];
      const work = await rowsOf<{
        agentCode: string;
        clientCode: string;
        type: string;
      }>(
        db,
        `SELECT agent_code AS "agentCode", client_code AS "clientCode", type FROM interactions
          WHERE tenant_id = $1 AND client_code IS NOT NULL AND agent_code IS NOT NULL
            AND occurred_at >= $2 AND occurred_at < $3
            ${agentFilter(scope, 'agent_code', params)}`,
        params,
      );
      const contacted = new Set<string>();
      for (const item of work) {
        if (item.type === 'NOTE') bump(item.agentCode, 'notes');
        else {
          bump(item.agentCode, 'contacts');
          const key = `${item.agentCode}|${item.clientCode}`;
          if (!contacted.has(key)) {
            contacted.add(key);
            bump(item.agentCode, 'clientsContacted');
          }
        }
      }
      return {
        from,
        to,
        ...buildReportTree(await this.treeAgents(db, scope), counts),
      };
    });
  }

  /** RPT-6: the file is built from what the screen shows; the export itself is audited. */
  async recordExport(actor: Actor, dto: ExportReportDto): Promise<void> {
    if (!actor.permissions.includes(Permission.ExportsData)) throw forbidden();
    const { from, to } = this.period(dto);
    await this.run(actor, (db, scope) =>
      this.audit.record(
        {
          tenantId: scope.tenantId,
          userId: actor.id,
          action: AuditAction.Export,
          entity: 'report',
          entityId: dto.report,
          meta: { report: dto.report, from, to },
        },
        db,
      ),
    );
  }
}
