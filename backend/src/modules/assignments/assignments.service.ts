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
import { Role } from '../../common/rbac.js';
import { rowsOf } from '../../core/persistence/sql.js';
import { TenantDb } from '../../core/tenancy/tenant-db.js';
import { AgentsService } from '../agents/agents.service.js';
import { AuditAction, AuditService } from '../audit/audit.service.js';
import { ClientEditorService } from '../clients/client-editor.service.js';
import { LeadsService } from '../leads/leads.service.js';
import { NotificationsService } from '../notifications/notifications.service.js';
import type { AssignmentKind } from './assignment-requests.js';

const STATUSES = ['PENDING', 'APPROVED', 'REJECTED', 'CANCELLED'] as const;
export type AssignmentStatus = (typeof STATUSES)[number];

interface RequestRow {
  id: string;
  kind: AssignmentKind;
  recordIds: string[];
  toAgentCode: string | null;
  requestedBy: string;
  createdAt: Date;
  status: AssignmentStatus;
  decidedBy: string | null;
  decidedAt: Date | null;
  note: string | null;
}

const COLUMNS = `id, kind, record_ids AS "recordIds", to_agent_code AS "toAgentCode",
  requested_by AS "requestedBy", created_at AS "createdAt", status,
  decided_by AS "decidedBy", decided_at AS "decidedAt", note`;

/**
 * Decided 27/11/2026: the GA director approves or refuses the assignments others ask for (Admin, a
 * line manager); approving applies them as if the director had assigned. The requester sees their
 * own requests and may withdraw one still waiting. The records are named, never their phones.
 */
@Injectable()
export class AssignmentsService {
  constructor(
    private readonly tenantDb: TenantDb,
    private readonly leads: LeadsService,
    private readonly clients: ClientEditorService,
    private readonly agents: AgentsService,
    private readonly notifications: NotificationsService,
    private readonly audit: AuditService,
  ) {}

  private scopeOf(actor: Actor): Scope {
    if (!actor.tenantId) throw forbidden();
    return { tenantId: actor.tenantId };
  }

  private isDirector(actor: Actor): boolean {
    return actor.roles.includes(Role.GAD);
  }

  /** The director sees every request of the GA; anyone else their own. Newest first. */
  async list(actor: Actor, status?: string) {
    const scope = this.scopeOf(actor);
    const wanted = STATUSES.find((item) => item === status);
    return this.tenantDb.run(scope, async (db) => {
      const params: unknown[] = [scope.tenantId];
      const where = ['tenant_id = $1'];
      if (!this.isDirector(actor))
        where.push(`requested_by = $${params.push(actor.id)}`);
      if (wanted) where.push(`status = $${params.push(wanted)}`);
      const rows = await rowsOf<RequestRow>(
        db,
        `SELECT ${COLUMNS} FROM assignment_requests WHERE ${where.join(' AND ')}
          ORDER BY created_at DESC, id DESC LIMIT 200`,
        params,
      );
      return { items: await this.views(scope, rows, db) };
    });
  }

  /** What the page shows: who asked, the customers by name, to whom, and the answer. */
  private async views(scope: Scope, rows: RequestRow[], db: EntityManager) {
    const leadIds = rows.flatMap((row) =>
      row.kind === 'LEAD' ? row.recordIds : [],
    );
    const clientIds = rows.flatMap((row) =>
      row.kind === 'CLIENT' ? row.recordIds : [],
    );
    const names = new Map<string, { name: string; agentCode: string | null }>();
    if (leadIds.length > 0)
      for (const lead of await rowsOf<{
        id: string;
        name: string;
        agentCode: string | null;
      }>(
        db,
        `SELECT id, full_name AS name, assigned_agent_code AS "agentCode" FROM leads
          WHERE tenant_id = $1 AND id = ANY($2::uuid[])`,
        [scope.tenantId, leadIds],
      ))
        names.set(lead.id, lead);
    if (clientIds.length > 0)
      for (const client of await rowsOf<{
        id: string;
        name: string;
        agentCode: string | null;
      }>(
        db,
        `SELECT id, name, owner_agent_codes[1] AS "agentCode" FROM clients
          WHERE tenant_id = $1 AND id = ANY($2::uuid[])`,
        [scope.tenantId, clientIds],
      ))
        names.set(client.id, client);
    const userIds = [
      ...new Set(
        rows.flatMap((row) => [row.requestedBy, row.decidedBy ?? []].flat()),
      ),
    ];
    const users = new Map(
      (
        await rowsOf<{ id: string; name: string }>(
          db,
          `SELECT id, name FROM users WHERE tenant_id = $1 AND id = ANY($2::uuid[])`,
          [scope.tenantId, userIds],
        )
      ).map((user) => [user.id, user.name]),
    );
    const codes = [
      ...new Set(
        [
          ...rows.flatMap((row) => row.toAgentCode ?? []),
          ...[...names.values()].flatMap((item) => item.agentCode ?? []),
        ].filter(Boolean),
      ),
    ];
    const agentNames = await this.agents.namesByCode(scope, codes, db);
    const agent = (code: string | null) =>
      code ? { code, name: agentNames.get(code) ?? null } : null;
    return rows.map((row) => ({
      id: row.id,
      kind: row.kind,
      status: row.status,
      createdAt: row.createdAt,
      decidedAt: row.decidedAt,
      note: row.note,
      requestedBy: users.get(row.requestedBy) ?? null,
      decidedBy: row.decidedBy ? (users.get(row.decidedBy) ?? null) : null,
      to: agent(row.toAgentCode),
      records: row.recordIds.map((id) => ({
        id,
        name: names.get(id)?.name ?? null,
        from: agent(names.get(id)?.agentCode ?? null),
      })),
    }));
  }

  /** Locks a request still waiting; another GA's or a missing one looks the same (TEN-3). */
  private async pending(
    scope: Scope,
    id: string,
    db: EntityManager,
  ): Promise<RequestRow> {
    if (!isId(id)) throw notFound();
    const [row] = await rowsOf<RequestRow>(
      db,
      `SELECT ${COLUMNS} FROM assignment_requests
        WHERE tenant_id = $1 AND id = $2 FOR UPDATE`,
      [scope.tenantId, id],
    );
    if (!row) throw notFound();
    if (row.status !== 'PENDING')
      throw new ApiException(HttpStatus.CONFLICT, ErrorCode.RequestDecided);
    return row;
  }

  private async decide(
    scope: Scope,
    actor: Actor,
    row: RequestRow,
    status: AssignmentStatus,
    note: string | null,
    db: EntityManager,
  ): Promise<void> {
    await db.query(
      `UPDATE assignment_requests
          SET status = $3, decided_by = $4, decided_at = now(), note = $5
        WHERE tenant_id = $1 AND id = $2`,
      [scope.tenantId, row.id, status, actor.id, note],
    );
    await this.audit.record(
      {
        tenantId: scope.tenantId,
        userId: actor.id,
        action: AuditAction.Update,
        entity: 'assignment_request',
        entityId: row.id,
        meta: { status, kind: row.kind, count: row.recordIds.length },
      },
      db,
    );
    if (row.requestedBy !== actor.id)
      await this.notifications.notify(
        scope,
        [row.requestedBy],
        {
          type: 'ASSIGN_DECIDED',
          data: {
            requestId: row.id,
            status,
            count: row.recordIds.length,
            kind: row.kind,
          },
          link: '/assignment-requests',
        },
        db,
      );
  }

  /**
   * The director approves: the assignment is applied as theirs (history, audit and the new
   * assignee's notice as for any assignment). A customer that has gone since makes it fail whole.
   */
  async approve(actor: Actor, id: string) {
    if (!this.isDirector(actor)) throw forbidden();
    const scope = this.scopeOf(actor);
    const row = await this.tenantDb.run(scope, (db) =>
      this.pending(scope, id, db),
    );
    const result =
      row.kind === 'LEAD'
        ? await this.leads.assign(actor, row.recordIds, row.toAgentCode)
        : await this.clients.assign(actor, {
            clientIds: row.recordIds,
            agentCode: row.toAgentCode,
          });
    await this.tenantDb.run(scope, async (db) => {
      const locked = await this.pending(scope, id, db);
      await this.decide(scope, actor, locked, 'APPROVED', null, db);
    });
    return { assigned: result.assigned };
  }

  async reject(actor: Actor, id: string, note?: string) {
    if (!this.isDirector(actor)) throw forbidden();
    const scope = this.scopeOf(actor);
    await this.tenantDb.run(scope, async (db) => {
      const row = await this.pending(scope, id, db);
      await this.decide(scope, actor, row, 'REJECTED', note?.trim() || null, db);
    });
  }

  /** The requester takes back a request still waiting. */
  async cancel(actor: Actor, id: string) {
    const scope = this.scopeOf(actor);
    await this.tenantDb.run(scope, async (db) => {
      const row = await this.pending(scope, id, db);
      if (row.requestedBy !== actor.id) throw notFound();
      await this.decide(scope, actor, row, 'CANCELLED', null, db);
    });
  }
}
