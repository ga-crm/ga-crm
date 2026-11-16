import { HttpStatus, Injectable } from '@nestjs/common';
import type { OnModuleInit } from '@nestjs/common';
import type { EntityManager } from 'typeorm';
import {
  ApiException,
  ErrorCode,
  forbidden,
  notFound,
  pgError,
} from '../../common/errors.js';
import { normalizeName } from '../../common/normalize.js';
import { escapeLike } from '../../common/pagination.js';
import type { Actor, Scope } from '../../common/rbac.js';
import { and, or, sql } from '../../core/persistence/fragment.js';
import type { Sql } from '../../core/persistence/fragment.js';
import { rowsOf } from '../../core/persistence/sql.js';
import { TenantDb } from '../../core/tenancy/tenant-db.js';
import { AgentsService } from '../agents/agents.service.js';
import { AuditAction, AuditService } from '../audit/audit.service.js';
import { Lead, LeadHistory } from '../leads/infrastructure/lead.entities.js';
import { LeadsService } from '../leads/leads.service.js';
import type { LinkLeadDto, UnlinkLeadDto } from './clients.dto.js';
import {
  clientsSeen,
  ClientsService,
  policiesNaming,
  policiesSeen,
  todayInVietnam,
} from './clients.service.js';
import type { Reach } from './clients.service.js';
import { canLinkLead, linkScore, stageFromSuccess } from './lead-link.js';

/** Section 8.8: linking a lead to the client it became (LEAD-32 to LEAD-34). */
@Injectable()
export class LeadLinkService implements OnModuleInit {
  constructor(
    private readonly tenantDb: TenantDb,
    private readonly reader: ClientsService,
    private readonly leads: LeadsService,
    private readonly agents: AgentsService,
    private readonly audit: AuditService,
  ) {}

  onModuleInit(): void {
    // CUS-4: when a linked lead changes hands, the client follows it
    this.leads.onReassign(async (scope, leadIds, now, db) => {
      const linked = await rowsOf<{ client_code: string }>(
        db,
        `SELECT client_code FROM leads
          WHERE tenant_id = $1 AND id = ANY($2::uuid[]) AND link_status = 'CONFIRMED'`,
        [scope.tenantId, leadIds],
      );
      await this.reader.recomputeLinks(
        scope,
        linked.map((lead) => lead.client_code),
        now,
        db,
      );
    });
  }

  private scopeOf(actor: Actor): Scope {
    if (!actor.tenantId) throw forbidden();
    return { tenantId: actor.tenantId };
  }

  /**
   * LEAD-32: the clients a lead may be linked to: in scope of the agent the lead is assigned to
   * (or of the person, for an unassigned lead), and never outside the person's own scope.
   */
  private scopeClause(
    reach: Reach,
    lead: { assignedAgentCode: string | null },
  ): Sql {
    return and(
      clientsSeen(reach),
      lead.assignedAgentCode &&
        sql`${lead.assignedAgentCode}::text = ANY(c.visible_agent_codes)`,
    );
  }

  /** LEAD-32: up to 5 suggestions, or up to 10 matches for a search; best first. */
  async suggestions(actor: Actor, id: string, q?: string) {
    const scope = this.scopeOf(actor);
    return this.tenantDb.run(scope, async (db) => {
      const lead = await this.leads.workable(actor, id, db);
      // CUS-5: Marketing and Admin have no client book
      const reach = await this.reader.reach(actor, db);
      const search = q?.trim();
      let match: Sql;
      if (search) {
        const digits = search.replace(/\D/g, '');
        const name = sql`c.name_norm LIKE ${`%${escapeLike(normalizeName(search))}%`}`;
        match =
          digits.length >= 3
            ? or(
                name,
                sql`c.client_code LIKE ${`${digits}%`}`,
                sql`c.phone LIKE ${`%${digits}%`}`,
              )
            : name;
      } else
        match = or(
          sql`c.name_norm = ${lead.nameNorm}`,
          sql`c.phone = ${lead.phone}`,
        );
      const candidates = await this.reader
        .clients(
          db,
          scope,
          and(
            this.scopeClause(reach, lead),
            // A client already linked to another lead is not offered
            sql`NOT EXISTS (SELECT 1 FROM leads other
                             WHERE other.tenant_id = c.tenant_id AND other.client_code = c.client_code
                               AND other.link_status = 'CONFIRMED' AND other.id <> ${lead.id}::uuid)`,
            match,
          ),
        )
        .limit(50)
        .getMany();
      const codes = candidates.map((client) => client.clientCode);
      const applications = await this.reader
        .applications(
          db,
          scope,
          and(
            sql`a.client_code = ANY(${codes}::text[])`,
            !reach.all && sql`a.agent_code = ANY(${reach.codes}::text[])`,
          ),
        )
        .getMany();
      const policies = await this.reader
        .policies(db, scope, and(policiesNaming(codes), policiesSeen(reach)))
        .getMany();
      const today = todayInVietnam();
      const items = candidates
        .map((client) => {
          const own = applications.filter(
            (item) => item.clientCode === client.clientCode,
          );
          const { score, reasons } = linkScore(lead, client, own, today);
          return {
            clientCode: client.clientCode,
            name: client.name,
            gender: client.gender,
            ageBand: client.ageBand,
            score,
            reasons,
            policies: policies
              .filter((policy) =>
                policy.clients.some(
                  (link) =>
                    link.clientCode === client.clientCode && !link.endedAt,
                ),
              )
              .map((policy) => ({
                policyNo: policy.policyNo,
                status: policy.status,
              })),
            applications: own.map((item) => ({
              applicationNo: item.applicationNo,
              status: item.status,
              createdDate: item.createdDate,
            })),
          };
        })
        .sort((a, b) => b.score - a.score || a.name.localeCompare(b.name, 'vi'))
        .slice(0, search ? 10 : 5);
      return { items };
    });
  }

  /** LEAD-32: confirm the client, and the application if the agent knows it. */
  async link(actor: Actor, id: string, dto: LinkLeadDto): Promise<void> {
    const scope = this.scopeOf(actor);
    const now = new Date();
    try {
      await this.tenantDb.run(scope, async (db) => {
        const lead = await this.leads.workable(actor, id, db);
        if (!canLinkLead(lead))
          throw new ApiException(
            HttpStatus.CONFLICT,
            ErrorCode.LeadNotLinkable,
          );
        const reach = await this.reader.reach(actor, db);
        const client = await this.reader
          .clients(
            db,
            scope,
            and(
              this.scopeClause(reach, lead),
              sql`c.client_code = ${dto.clientCode}`,
            ),
          )
          .getOne();
        if (!client) throw notFound();
        if (dto.applicationNo) {
          const found = await this.reader
            .applications(
              db,
              scope,
              sql`a.application_no = ${dto.applicationNo} AND a.client_code = ${dto.clientCode}`,
            )
            .getCount();
          if (!found) throw notFound();
        }
        const [other] = await rowsOf<{ id: string }>(
          db,
          `SELECT id FROM leads WHERE tenant_id = $1 AND client_code = $2
              AND link_status = 'CONFIRMED' AND id <> $3`,
          [scope.tenantId, dto.clientCode, lead.id],
        );
        if (other)
          throw new ApiException(
            HttpStatus.CONFLICT,
            ErrorCode.ClientAlreadyLinked,
          );
        const before = lead.linkStatus === 'CONFIRMED' ? lead.clientCode : null;
        await db.getRepository(Lead).update(
          { id: lead.id, tenantId: scope.tenantId },
          {
            clientCode: dto.clientCode,
            linkStatus: 'CONFIRMED',
            linkedBy: actor.id,
            linkedAt: now,
            updatedAt: now,
            ...(dto.applicationNo && { applicationNo: dto.applicationNo }),
          },
        );
        await db.getRepository(LeadHistory).insert({
          tenantId: scope.tenantId,
          leadId: lead.id,
          field: 'clientCode',
          oldValue: before,
          newValue: dto.clientCode,
          changedBy: actor.id,
          changedAt: now,
        });
        await this.audit.record(
          {
            tenantId: scope.tenantId,
            userId: actor.id,
            action: AuditAction.Link,
            entity: 'lead',
            entityId: lead.id,
            meta: {
              clientCode: dto.clientCode,
              applicationNo: dto.applicationNo,
              ...(before && { replaced: before }),
            },
          },
          db,
        );
        // CUS-4: the lead's assignee now sees and owns the client
        await this.reader.recomputeLinks(
          scope,
          [dto.clientCode, ...(before ? [before] : [])],
          now,
          db,
        );
      });
    } catch (error) {
      // Two people linking the same client at once
      if (pgError(error)?.constraint === 'leads_client_link_key')
        throw new ApiException(
          HttpStatus.CONFLICT,
          ErrorCode.ClientAlreadyLinked,
        );
      throw error;
    }
  }

  /** LEAD-32: undoing a link needs a reason, which the audit keeps. */
  async unlink(actor: Actor, id: string, dto: UnlinkLeadDto): Promise<void> {
    const scope = this.scopeOf(actor);
    const now = new Date();
    await this.tenantDb.run(scope, async (db) => {
      const lead = await this.leads.workable(actor, id, db);
      if (lead.linkStatus !== 'CONFIRMED' || !lead.clientCode) throw notFound();
      const clientCode = lead.clientCode;
      await db.getRepository(Lead).update(
        { id: lead.id, tenantId: scope.tenantId },
        {
          linkStatus: 'NONE',
          updatedAt: now,
          clientCode: null,
          linkedBy: null,
          linkedAt: null,
        },
      );
      await db.getRepository(LeadHistory).insert({
        tenantId: scope.tenantId,
        leadId: lead.id,
        field: 'clientCode',
        oldValue: clientCode,
        note: dto.reason,
        changedBy: actor.id,
        changedAt: now,
      });
      await this.audit.record(
        {
          tenantId: scope.tenantId,
          userId: actor.id,
          action: AuditAction.Unlink,
          entity: 'lead',
          entityId: lead.id,
          meta: { clientCode, reason: dto.reason },
        },
        db,
      );
      await this.reader.recomputeLinks(scope, [clientCode], now, db);
    });
  }

  /**
   * LEAD-33: after a Success import, each linked lead moves on to SUBMITTED or ISSUED as the data
   * shows, never back. History carries the import. Returns how many leads moved.
   */
  async advanceLinkedLeads(
    scope: Scope,
    importId: string,
    userId: string,
    now: Date,
    db: EntityManager,
  ): Promise<number> {
    const leads = await db
      .getRepository(Lead)
      .createQueryBuilder('lead')
      .where(
        `lead.tenantId = :tenantId AND lead.linkStatus = 'CONFIRMED' AND lead.stage NOT IN ('ISSUED', 'LOST')`,
        { tenantId: scope.tenantId },
      )
      .getMany();
    if (leads.length === 0) return 0;
    const codes = leads.flatMap((lead) => lead.clientCode ?? []);
    const applications = await this.reader
      .applications(db, scope, sql`a.client_code = ANY(${codes}::text[])`)
      .getMany();
    const policies = await this.reader
      .policies(db, scope, policiesNaming(codes))
      .getMany();
    const rows: Partial<LeadHistory>[] = [];
    let moved = 0;
    for (const lead of leads) {
      const next = stageFromSuccess(lead, {
        applications: applications.filter(
          (item) => item.clientCode === lead.clientCode,
        ),
        policies: policies.filter((policy) =>
          policy.clients.some(
            (link) =>
              link.clientCode === lead.clientCode &&
              link.role === 'PO' &&
              !link.endedAt,
          ),
        ),
      });
      if (!next) continue;
      moved++;
      const patch: Partial<Lead> = {
        stage: next.stage,
        updatedAt: now,
        lastImportId: importId,
      };
      const log = (field: string, oldValue: string | null, newValue: string) =>
        rows.push({
          tenantId: scope.tenantId,
          leadId: lead.id,
          field,
          oldValue,
          newValue,
          importId,
          changedBy: userId,
          changedAt: now,
        });
      log('stage', lead.stage, next.stage);
      // LEAD-33: an application makes the lead won, unless it already has a care status
      if (!lead.careStatus) {
        patch.careStatus = 'WON';
        log('careStatus', null, 'WON');
      }
      if (!lead.applicationNo && next.applicationNo)
        patch.applicationNo = next.applicationNo;
      if (!lead.policyNo && next.policyNo) patch.policyNo = next.policyNo;
      await db
        .getRepository(Lead)
        .update({ id: lead.id, tenantId: scope.tenantId }, patch);
    }
    if (rows.length > 0) await db.getRepository(LeadHistory).insert(rows);
    return moved;
  }

  /** LEAD-34: the lead a client came from, for the client page. */
  async linkedLead(actor: Actor, clientCode: string, outer?: EntityManager) {
    const scope = this.scopeOf(actor);
    return this.tenantDb.run(
      scope,
      async (db) => {
        const lead = await db.getRepository(Lead).findOneBy({
          tenantId: scope.tenantId,
          clientCode,
          linkStatus: 'CONFIRMED',
        });
        if (!lead) return null;
        const [campaign] = lead.campaignId
          ? await rowsOf<{ name: string }>(
              db,
              `SELECT name FROM campaigns WHERE tenant_id = $1 AND id = $2`,
              [scope.tenantId, lead.campaignId],
            )
          : [];
        const names = await this.agents.namesByCode(
          scope,
          lead.assignedAgentCode ? [lead.assignedAgentCode] : [],
          db,
        );
        const canOpen = await this.leads.assertVisible(actor, lead.id).then(
          () => true,
          () => false,
        );
        return {
          id: lead.id,
          fullName: lead.fullName,
          stage: lead.stage,
          source: lead.source,
          campaignName: campaign?.name ?? null,
          assignedAgentCode: lead.assignedAgentCode,
          agentName: lead.assignedAgentCode
            ? (names.get(lead.assignedAgentCode) ?? null)
            : null,
          linkedAt: lead.linkedAt,
          // TEN-3: the page only offers a link to someone who may open the lead
          canOpen,
        };
      },
      outer,
    );
  }
}
