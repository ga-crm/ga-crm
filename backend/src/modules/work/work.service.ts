import { HttpStatus, Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import type { EntityManager } from 'typeorm';
import { generateToken, sha256 } from '../../common/crypto.js';
import {
  ApiException,
  ErrorCode,
  forbidden,
  notFound,
} from '../../common/errors.js';
import { isId } from '../../common/pagination.js';
import { actorOf, Permission, Role } from '../../common/rbac.js';
import type { Actor, Scope } from '../../common/rbac.js';
import type { Env } from '../../config/env.validation.js';
import { rowsOf } from '../../core/persistence/sql.js';
import { PlatformDb } from '../../core/tenancy/platform-db.js';
import { TenantDb } from '../../core/tenancy/tenant-db.js';
import { AgentsService } from '../agents/agents.service.js';
import { AuditAction, AuditService } from '../audit/audit.service.js';
import { isActiveStatus } from '../clients/client-links.js';
import { ClientEditorService } from '../clients/client-editor.service.js';
import type { Task } from '../leads/infrastructure/lead.entities.js';
import { LeadsService } from '../leads/leads.service.js';
import { TenantsService } from '../tenants/tenants.service.js';
import { buildIcs } from './ics.js';
import type {
  CalendarQueryDto,
  CreateClientTaskDto,
  CreateTaskDto,
  EditTaskDto,
  ListTasksQueryDto,
} from './work.dto.js';
import {
  addDays,
  dayStart,
  STALE_UPLOAD_DAYS,
  vietnamDay,
  weekDayMonths,
} from './work-rules.js';

const DAY_MS = 86_400_000;
/** TASK-6: an appointment is shown as an hour. */
const APPOINTMENT_MINUTES = 60;
const TASK_MINUTES = 30;

export type TaskRow = Pick<
  Task,
  | 'id'
  | 'leadId'
  | 'clientId'
  | 'signal'
  | 'agentCode'
  | 'title'
  | 'dueAt'
  | 'status'
  | 'source'
  | 'doneAt'
  | 'createdBy'
>;

/** The columns of a task as the services use them. */
export const TASK_COLUMNS = `t.id, t.lead_id AS "leadId", t.client_id AS "clientId", t.signal,
  t.agent_code AS "agentCode", t.title, t.due_at AS "dueAt", t.status, t.source,
  t.done_at AS "doneAt", t.created_by AS "createdBy"`;

/** Leads in neither the bin (LEAD-40) nor erased (PDP-6). */
const LIVE_LEAD = `l.deleted_at IS NULL AND l.erased_at IS NULL`;

/**
 * TASK-1: the person's own tasks: those of their agent code, and their personal ones. Adds its
 * values to `params` and returns the condition on alias `t`.
 */
function mine(actor: Actor, params: unknown[]): string {
  const personal = `(t.lead_id IS NULL AND t.client_id IS NULL AND t.created_by = $${params.push(actor.id)})`;
  return actor.agentCode
    ? `(t.agent_code = $${params.push(actor.agentCode)} OR ${personal})`
    : personal;
}

/** Section 9.3: tasks, "Hôm nay" and the calendar (TASK-1 to TASK-6, SIG-2). */
@Injectable()
export class WorkService {
  constructor(
    private readonly tenantDb: TenantDb,
    private readonly platformDb: PlatformDb,
    private readonly leads: LeadsService,
    private readonly editor: ClientEditorService,
    private readonly agents: AgentsService,
    private readonly tenants: TenantsService,
    private readonly audit: AuditService,
    private readonly config: ConfigService<Env, true>,
  ) {}

  private scopeOf(actor: Actor): Scope {
    if (!actor.tenantId) throw forbidden();
    return { tenantId: actor.tenantId };
  }

  /** Lead names, client names and agent names for a list of tasks. */
  private async views(
    actor: Actor,
    scope: Scope,
    items: TaskRow[],
    db: EntityManager,
  ) {
    const leadIds = [...new Set(items.flatMap((task) => task.leadId ?? []))];
    const clientIds = [
      ...new Set(items.flatMap((task) => task.clientId ?? [])),
    ];
    const leads = leadIds.length
      ? await rowsOf<{
          id: string;
          fullName: string;
          assignedAgentCode: string | null;
        }>(
          db,
          `SELECT id, full_name AS "fullName", assigned_agent_code AS "assignedAgentCode"
             FROM leads WHERE tenant_id = $1 AND id = ANY($2::uuid[])`,
          [scope.tenantId, leadIds],
        )
      : [];
    const clients = clientIds.length
      ? await rowsOf<{
          id: string;
          name: string;
          ownerAgentCodes: string[];
        }>(
          db,
          `SELECT id, name, owner_agent_codes AS "ownerAgentCodes"
             FROM clients WHERE tenant_id = $1 AND id = ANY($2::uuid[])`,
          [scope.tenantId, clientIds],
        )
      : [];
    const agentNames = await this.agents.namesByCode(
      scope,
      [...new Set(items.flatMap((task) => task.agentCode ?? []))],
      db,
    );
    const leadOf = new Map(leads.map((lead) => [lead.id, lead]));
    const clientOf = new Map(clients.map((client) => [client.id, client]));
    const isHead = actor.roles.includes(Role.GaHead);
    return items.map((task) => {
      const lead = task.leadId ? leadOf.get(task.leadId) : undefined;
      const client = task.clientId ? clientOf.get(task.clientId) : undefined;
      // TASK-2 + NOTE-5: who may change it follows who works the lead or owns the client
      const canEdit = lead
        ? this.leads.mayWork(actor, lead)
        : client
          ? isHead ||
            (!!actor.agentCode &&
              client.ownerAgentCodes.includes(actor.agentCode))
          : task.createdBy === actor.id;
      return {
        id: task.id,
        kind: task.leadId ? 'lead' : task.clientId ? 'client' : 'personal',
        title: task.title,
        dueAt: task.dueAt,
        status: task.status,
        source: task.source,
        signal: task.signal ?? null,
        lead: lead ? { id: lead.id, fullName: lead.fullName } : null,
        client: client ? { id: client.id, name: client.name } : null,
        agentCode: task.agentCode ?? null,
        agentName: task.agentCode
          ? (agentNames.get(task.agentCode) ?? null)
          : null,
        doneAt: task.doneAt ?? null,
        canEdit,
      };
    });
  }

  /** Section 17.14 GET /tasks: one's own, or the line's for a manager (`team=1`). */
  async list(actor: Actor, query: ListTasksQueryDto) {
    const scope = this.scopeOf(actor);
    return this.tenantDb.run(scope, async (db) => {
      const params: unknown[] = [scope.tenantId];
      const where = [`t.tenant_id = $1`];
      if (query.team) {
        const codes = await this.agents.scopeCodes(actor, db);
        if (codes.length === 0) throw forbidden();
        where.push(`t.agent_code = ANY($${params.push(codes)}::text[])`);
      } else where.push(mine(actor, params));
      where.push(`t.status = $${params.push(query.status ?? 'OPEN')}`);
      if (query.dueFrom)
        where.push(`t.due_at >= $${params.push(dayStart(query.dueFrom))}`);
      if (query.dueTo)
        where.push(
          `t.due_at < $${params.push(dayStart(addDays(query.dueTo, 1)))}`,
        );
      if (query.leadId) where.push(`t.lead_id = $${params.push(query.leadId)}`);
      if (query.clientId)
        where.push(`t.client_id = $${params.push(query.clientId)}`);
      const items = await rowsOf<TaskRow>(
        db,
        `SELECT ${TASK_COLUMNS} FROM tasks t WHERE ${where.join(' AND ')}
          ORDER BY t.due_at, t.id LIMIT 500`,
        params,
      );
      return { items: await this.views(actor, scope, items, db) };
    });
  }

  private async insertTask(
    db: EntityManager,
    values: {
      tenantId: string;
      clientId?: string;
      agentCode?: string | null;
      title: string;
      dueAt: Date;
      source: 'APP' | 'SIGNAL';
      signal?: string;
      createdBy: string;
    },
  ): Promise<string> {
    const [task] = await rowsOf<{ id: string }>(
      db,
      `INSERT INTO tasks (tenant_id, client_id, agent_code, title, due_at, status, source, signal,
                          created_by, created_at)
       VALUES ($1, $2, $3, $4, $5, 'OPEN', $6, $7, $8, now()) RETURNING id`,
      [
        values.tenantId,
        values.clientId ?? null,
        values.agentCode ?? null,
        values.title,
        values.dueAt,
        values.source,
        values.signal ?? null,
        values.createdBy,
      ],
    );
    return task.id;
  }

  /** TASK-1: a personal task, or one on a client the person owns (NOTE-5). */
  async create(actor: Actor, dto: CreateTaskDto): Promise<{ id: string }> {
    if (dto.clientId) return this.createForClient(actor, dto.clientId, dto);
    const scope = this.scopeOf(actor);
    return this.tenantDb.run(scope, async (db) => {
      const id = await this.insertTask(db, {
        tenantId: scope.tenantId,
        title: dto.title,
        dueAt: dto.dueAt,
        source: 'APP',
        createdBy: actor.id,
      });
      await this.audit.record(
        {
          tenantId: scope.tenantId,
          userId: actor.id,
          action: AuditAction.Create,
          entity: 'task',
          entityId: id,
          meta: { kind: 'personal' },
        },
        db,
      );
      return { id };
    });
  }

  /** Section 17.8: a task on a client; from a care opportunity when `signal` is given (SIG-2). */
  async createForClient(
    actor: Actor,
    clientId: string,
    dto: CreateClientTaskDto,
  ): Promise<{ id: string }> {
    const scope = this.scopeOf(actor);
    return this.tenantDb.run(scope, async (db) => {
      const client = await this.editor.ownedClient(actor, clientId, db);
      const id = await this.insertTask(db, {
        tenantId: scope.tenantId,
        clientId,
        agentCode: actor.agentCode ?? client.ownerAgentCodes[0] ?? null,
        title: dto.title,
        dueAt: dto.dueAt,
        source: dto.signal ? 'SIGNAL' : 'APP',
        signal: dto.signal,
        createdBy: actor.id,
      });
      await this.audit.record(
        {
          tenantId: scope.tenantId,
          userId: actor.id,
          action: AuditAction.Create,
          entity: 'task',
          entityId: id,
          meta: { clientId, signal: dto.signal },
        },
        db,
      );
      return { id };
    });
  }

  /** TASK-2: change, finish, reopen or cancel any task the person may work on. */
  async update(actor: Actor, id: string, dto: EditTaskDto): Promise<void> {
    const scope = this.scopeOf(actor);
    if (!isId(id)) throw notFound();
    await this.tenantDb.run(scope, async (db) => {
      const [task] = await rowsOf<TaskRow & { doneBy: string | null }>(
        db,
        `SELECT ${TASK_COLUMNS}, t.done_by AS "doneBy" FROM tasks t
          WHERE t.tenant_id = $1 AND t.id = $2 FOR UPDATE`,
        [scope.tenantId, id],
      );
      if (!task) throw notFound();
      if (task.leadId) {
        // LEAD-7: 404 for a lead out of sight, 403 lead_not_yours for one only read
        await this.leads.workable(actor, task.leadId, db);
      } else if (task.clientId) {
        await this.editor.ownedClient(actor, task.clientId, db);
      } else if (task.createdBy !== actor.id) throw notFound();
      const next = { ...task };
      if (dto.title !== undefined && dto.title !== null) next.title = dto.title;
      if (dto.dueAt !== undefined && dto.dueAt !== null) next.dueAt = dto.dueAt;
      if (dto.cancelled === true) next.status = 'CANCELLED';
      if (dto.done === true && next.status !== 'DONE') {
        next.status = 'DONE';
        next.doneAt = new Date();
        next.doneBy = actor.id;
      }
      if (
        (dto.done === false || dto.cancelled === false) &&
        next.status !== 'OPEN'
      ) {
        next.status = 'OPEN';
        next.doneAt = null;
        next.doneBy = null;
      }
      await db.query(
        `UPDATE tasks SET title = $3, due_at = $4, status = $5, done_at = $6, done_by = $7
          WHERE tenant_id = $1 AND id = $2`,
        [
          scope.tenantId,
          id,
          next.title,
          next.dueAt,
          next.status,
          next.doneAt,
          next.doneBy,
        ],
      );
      await this.audit.record(
        {
          tenantId: scope.tenantId,
          userId: actor.id,
          action: AuditAction.Update,
          entity: 'task',
          entityId: id,
          meta: { fields: Object.keys(dto) },
        },
        db,
      );
    });
  }

  /**
   * TASK-5 + section 16.2: what the person should do today. Agents: tasks due today and late, their
   * lead counts, clients with a premium due within 7 days or a birthday this week. Managers also see
   * their line's overdue leads; whoever sees every lead, the unassigned and today's new leads, and how
   * fresh each agent's Success upload is.
   */
  async today(actor: Actor) {
    const scope = this.scopeOf(actor);
    const now = new Date();
    const today = vietnamDay(now);
    const startOfToday = dayStart(today);
    const manages = actor.permissions.includes(Permission.LeadsManage);
    const counts = await this.leads.counts(actor);
    return this.tenantDb.run(scope, async (db) => {
      const params: unknown[] = [scope.tenantId, dayStart(addDays(today, 1))];
      const tasks = await rowsOf<TaskRow>(
        db,
        `SELECT ${TASK_COLUMNS} FROM tasks t
          WHERE t.tenant_id = $1 AND t.status = 'OPEN' AND t.due_at < $2 AND ${mine(actor, params)}
          ORDER BY t.due_at, t.id LIMIT 100`,
        params,
      );
      const views = await this.views(actor, scope, tasks, db);
      // TASK-5: the person's own clients
      const care = actor.agentCode
        ? await this.careToday(db, scope, actor.agentCode, today)
        : { premiumDue: [], birthdays: [] };
      let newLeadsToday: number | null = null;
      if (manages) {
        const [row] = await rowsOf<{ n: number }>(
          db,
          `SELECT count(*)::int AS n FROM leads l
            WHERE l.tenant_id = $1 AND l.lead_date = $2 AND ${LIVE_LEAD}`,
          [scope.tenantId, today],
        );
        newLeadsToday = row.n;
      }
      return {
        today,
        tasks: {
          overdue: views.filter((task) => new Date(task.dueAt) < startOfToday),
          today: views.filter((task) => new Date(task.dueAt) >= startOfToday),
        },
        leads: counts,
        care,
        isManager: actor.reach === 'DOWNLINE' || actor.reach === 'TENANT',
        manages,
        newLeadsToday,
        uploads:
          manages || actor.roles.includes(Role.GaHead)
            ? await this.uploads(db, scope, now)
            : null,
      };
    });
  }

  /** TASK-5: clients with a premium due within 7 days or a birthday this week. */
  private async careToday(
    db: EntityManager,
    scope: Scope,
    agentCode: string,
    today: string,
  ) {
    const owned = await rowsOf<{
      id: string;
      name: string;
      birthDayMonth: string | null;
    }>(
      db,
      `SELECT id, name, birth_day_month AS "birthDayMonth"
         FROM clients WHERE tenant_id = $1 AND owner_agent_codes @> ARRAY[$2]::text[]`,
      [scope.tenantId, agentCode],
    );
    const nameOf = new Map(owned.map((client) => [client.id, client.name]));
    const policies = nameOf.size
      ? await rowsOf<{
          policyNo: string;
          holderClientId: string;
          premiumDueDate: string;
          basePremiumVnd: string;
          status: string | null;
        }>(
          db,
          `SELECT policy_no AS "policyNo", holder_client_id AS "holderClientId",
                  premium_due_date::text AS "premiumDueDate", base_premium_vnd AS "basePremiumVnd", status
             FROM policies
            WHERE tenant_id = $1 AND holder_client_id = ANY($2::uuid[])
              AND premium_due_date BETWEEN $3 AND $4
            ORDER BY premium_due_date, policy_no`,
          [scope.tenantId, [...nameOf.keys()], today, addDays(today, 7)],
        )
      : [];
    const week = weekDayMonths(today);
    const dayOf = new Map(week.map((item) => [item.dayMonth, item.day]));
    return {
      premiumDue: policies
        .filter((policy) => isActiveStatus(policy.status))
        .slice(0, 20)
        .map((policy) => ({
          clientId: policy.holderClientId,
          name: nameOf.get(policy.holderClientId) ?? '',
          policyNo: policy.policyNo,
          date: policy.premiumDueDate,
          amountVnd: Number(policy.basePremiumVnd),
        })),
      birthdays: owned
        .filter(
          (client) => client.birthDayMonth && dayOf.has(client.birthDayMonth),
        )
        .map((client) => ({
          clientId: client.id,
          name: client.name,
          date: dayOf.get(client.birthDayMonth!)!,
          isToday: dayOf.get(client.birthDayMonth!) === today,
        }))
        .sort((a, b) => a.date.localeCompare(b.date))
        .slice(0, 20),
    };
  }

  /** Section 16.2: each agent's last Success upload; over 14 days is stale. */
  private async uploads(db: EntityManager, scope: Scope, now: Date) {
    const agents = await rowsOf<{
      agentCode: string;
      name: string;
      lastUploadAt: Date | null;
    }>(
      db,
      `SELECT a.agent_code AS "agentCode", a.name, u.at AS "lastUploadAt"
         FROM agents a
         LEFT JOIN (
           SELECT agent_code, max(committed_at) AS at FROM imports
            WHERE tenant_id = $1 AND kind = 'SUCCESS' AND status = 'COMMITTED'
              AND agent_code IS NOT NULL
            GROUP BY agent_code
         ) u ON u.agent_code = a.agent_code
        WHERE a.tenant_id = $1 AND a.end_date IS NULL
        ORDER BY a.name, a.agent_code`,
      [scope.tenantId],
    );
    return agents.map((agent) => ({
      ...agent,
      stale:
        !agent.lastUploadAt ||
        now.getTime() - agent.lastUploadAt.getTime() >
          STALE_UPLOAD_DAYS * DAY_MS,
    }));
  }

  /** The person's tasks and appointments between two instants (TASK-6). */
  private async events(
    db: EntityManager,
    actor: Actor,
    scope: Scope,
    start: Date,
    end: Date,
  ) {
    const params: unknown[] = [scope.tenantId, start, end];
    const tasks = await rowsOf<TaskRow>(
      db,
      `SELECT ${TASK_COLUMNS} FROM tasks t
        WHERE t.tenant_id = $1 AND t.status <> 'CANCELLED' AND t.due_at >= $2 AND t.due_at < $3
          AND ${mine(actor, params)}
        ORDER BY t.due_at, t.id LIMIT 1000`,
      params,
    );
    const appointments = actor.agentCode
      ? await rowsOf<{ id: string; fullName: string; nextActionAt: Date }>(
          db,
          `SELECT l.id, l.full_name AS "fullName", l.next_action_at AS "nextActionAt" FROM leads l
            WHERE l.tenant_id = $1 AND l.assigned_agent_code = $2 AND l.stage = 'APPOINTMENT'
              AND l.next_action_at >= $3 AND l.next_action_at < $4 AND ${LIVE_LEAD}
            ORDER BY l.next_action_at, l.id`,
          [scope.tenantId, actor.agentCode, start, end],
        )
      : [];
    return { tasks, appointments };
  }

  /** TASK-6: the month or week on screen. */
  async calendar(actor: Actor, query: CalendarQueryDto) {
    const scope = this.scopeOf(actor);
    const start = dayStart(query.from);
    const end = dayStart(addDays(query.to, 1));
    if (end <= start || end.getTime() - start.getTime() > 62 * DAY_MS)
      throw new ApiException(HttpStatus.BAD_REQUEST, ErrorCode.InvalidInput, {
        issues: [{ path: 'to', message: 'range' }],
      });
    return this.tenantDb.run(scope, async (db) => {
      const { tasks, appointments } = await this.events(
        db,
        actor,
        scope,
        start,
        end,
      );
      return {
        tasks: await this.views(actor, scope, tasks, db),
        appointments: appointments.map((lead) => ({
          leadId: lead.id,
          fullName: lead.fullName,
          at: lead.nextActionAt,
        })),
      };
    });
  }

  /**
   * TASK-6: a new private feed link; the old one stops working. Only the token's hash is stored, and
   * the link is shown once.
   */
  async newCalendarToken(actor: Actor): Promise<{ url: string }> {
    const scope = this.scopeOf(actor);
    const token = generateToken();
    await this.tenantDb.run(scope, async (db) => {
      await db.query(
        `INSERT INTO calendar_tokens (tenant_id, user_id, token_hash, created_at)
         VALUES ($1, $2, $3, now())
         ON CONFLICT (tenant_id, user_id)
           DO UPDATE SET token_hash = EXCLUDED.token_hash, created_at = EXCLUDED.created_at`,
        [scope.tenantId, actor.id, sha256(token)],
      );
      await this.audit.record(
        {
          tenantId: scope.tenantId,
          userId: actor.id,
          action: AuditAction.Update,
          entity: 'calendar_feed',
          entityId: actor.id,
        },
        db,
      );
    });
    return {
      url: `${this.config.get('APP_URL', { infer: true })}/api/v1/calendar.ics?token=${token}`,
    };
  }

  /**
   * TASK-6: the feed itself, read by calendar apps that cannot sign in. The token alone identifies
   * the person, like an invitation link, so only that lookup crosses GAs (TEN-6); the rest runs in
   * the person's GA. The person must still be active, and the feed carries titles and lead names
   * only (no phone numbers).
   */
  async ics(token: string | undefined): Promise<string> {
    if (!token || token.length > 200) throw notFound();
    // TENANT-3: a suspended GA serves nothing, including links saved in calendar apps before it was
    const [found] = await this.platformDb.run('calendar-feed', (db) =>
      rowsOf<{ tenantId: string; userId: string }>(
        db,
        `SELECT c.tenant_id AS "tenantId", c.user_id AS "userId" FROM calendar_tokens c
           JOIN tenants t ON t.id = c.tenant_id
          WHERE c.token_hash = $1 AND t.status = 'active'`,
        [sha256(token)],
      ),
    );
    if (!found) throw notFound();
    const scope: Scope = { tenantId: found.tenantId };
    const now = new Date();
    const app = this.config.get('APP_URL', { infer: true });
    return this.tenantDb.run(scope, async (db) => {
      const [user] = await rowsOf<{
        id: string;
        email: string;
        name: string;
        roles: string[];
        agentCode: string | null;
      }>(
        db,
        `SELECT id, email, name, roles, agent_code AS "agentCode" FROM users
          WHERE tenant_id = $1 AND id = $2 AND status = 'ACTIVE'`,
        [scope.tenantId, found.userId],
      );
      if (!user) throw notFound();
      const { grants } = await this.tenants.getSettings(scope, db);
      const actor = actorOf({ ...user, tenantId: scope.tenantId }, grants);
      const { tasks, appointments } = await this.events(
        db,
        actor,
        scope,
        new Date(now.getTime() - 30 * DAY_MS),
        new Date(now.getTime() + 180 * DAY_MS),
      );
      const leadIds = [...new Set(tasks.flatMap((task) => task.leadId ?? []))];
      const leadNames = new Map(
        (leadIds.length
          ? await rowsOf<{ id: string; fullName: string }>(
              db,
              `SELECT id, full_name AS "fullName" FROM leads
                WHERE tenant_id = $1 AND id = ANY($2::uuid[])`,
              [scope.tenantId, leadIds],
            )
          : []
        ).map((lead) => [lead.id, lead.fullName]),
      );
      return buildIcs(
        `GA CRM - ${user.name}`,
        [
          ...tasks
            .filter((task) => task.status === 'OPEN')
            .map((task) => ({
              uid: `task-${task.id}@gacrm`,
              title: task.title,
              start: task.dueAt,
              minutes: TASK_MINUTES,
              description: task.leadId ? leadNames.get(task.leadId) : undefined,
              url: task.leadId ? `${app}/leads/${task.leadId}` : undefined,
            })),
          ...appointments.map((lead) => ({
            uid: `appointment-${lead.id}@gacrm`,
            title: lead.fullName,
            start: lead.nextActionAt,
            minutes: APPOINTMENT_MINUTES,
            url: `${app}/leads/${lead.id}`,
          })),
        ],
        now,
      );
    });
  }
}
