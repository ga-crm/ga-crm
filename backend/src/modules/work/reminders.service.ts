import { Injectable, Logger } from '@nestjs/common';
import type { OnApplicationBootstrap, OnModuleDestroy } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { randomUUID } from 'node:crypto';
import { actorOf, Permission } from '../../common/rbac.js';
import type { Grants, Scope } from '../../common/rbac.js';
import type { Env } from '../../config/env.validation.js';
import { rowsOf } from '../../core/persistence/sql.js';
import { PlatformDb } from '../../core/tenancy/platform-db.js';
import { TenantDb } from '../../core/tenancy/tenant-db.js';
import { isActiveStatus } from '../clients/client-links.js';
import { LeadRemovalService } from '../leads/lead-removal.service.js';
import { LeadsService } from '../leads/leads.service.js';
import {
  APPOINTMENT_NOTICE_MS,
  BIRTHDAY_DAYS,
  DEADLINE_WARNING_MS,
  DUE_LOOKBACK_MS,
  morningRoundDue,
  nextDayMonths,
  PREMIUM_DUE_DAYS,
  quietHoursOf,
} from '../notifications/notification-rules.js';
import { NotificationsService } from '../notifications/notifications.service.js';
import { TenantsService } from '../tenants/tenants.service.js';
import { addDays, dayStart, vietnamDay } from './work-rules.js';

const TICK_MS = 60_000;
const LOCK = 'reminders';
const LIVE_LEAD = `deleted_at IS NULL AND erased_at IS NULL`;

interface TaskRow {
  id: string;
  agentCode: string | null;
  leadId: string | null;
  clientId: string | null;
  createdBy: string;
  dueAt: Date;
}

const TASK_ROW = `id, agent_code AS "agentCode", lead_id AS "leadId", client_id AS "clientId",
  created_by AS "createdBy", due_at AS "dueAt"`;

/** TASK-7: where a task reminder leads. */
const taskLink = (task: TaskRow): string =>
  task.leadId
    ? `/leads/${task.leadId}?tab=tasks`
    : task.clientId
      ? `/clients/${task.clientId}`
      : '/tasks';

/**
 * TASK-7, SIG-2 and the timed events of NTF-2. Every minute: tasks coming due, appointments in 15
 * minutes, leads close to their contact deadline. Once a day, when the GA's quiet hours end: overdue
 * tasks, the line's overdue leads for managers, and new care signals. A lease in `job_locks` keeps
 * it to one API instance; `notice_keys` makes each reminder go out once. Phase 3 moves this to the
 * worker.
 */
@Injectable()
export class RemindersService implements OnApplicationBootstrap, OnModuleDestroy {
  private readonly logger = new Logger(RemindersService.name);
  private readonly owner = randomUUID();
  private timer?: NodeJS.Timeout;

  constructor(
    private readonly tenantDb: TenantDb,
    private readonly platformDb: PlatformDb,
    private readonly leads: LeadsService,
    private readonly removal: LeadRemovalService,
    private readonly tenants: TenantsService,
    private readonly notifications: NotificationsService,
    private readonly config: ConfigService<Env, true>,
  ) {}

  onApplicationBootstrap(): void {
    // Tests call tick() with a fixed clock instead
    if (this.config.get('NODE_ENV', { infer: true }) === 'test') return;
    this.timer = setInterval(() => {
      this.tick().catch((error: unknown) =>
        this.logger.error(`Reminder round failed: ${String(error)}`),
      );
    }, TICK_MS);
    this.timer.unref();
  }

  onModuleDestroy(): void {
    if (this.timer) clearInterval(this.timer);
  }

  /** One round for every GA. Returns false when another instance holds the lease. */
  async tick(now = new Date()): Promise<boolean> {
    if (!(await this.lease(now))) return false;
    for (const tenantId of await this.tenants.activeIds()) {
      const scope: Scope = { tenantId };
      await this.minute(scope, now);
      await this.morning(scope, now);
    }
    return true;
  }

  /** Takes the lease when it is free or already ours; the row lock settles two instances racing. */
  private async lease(now: Date): Promise<boolean> {
    const rows = await this.platformDb.run('scheduler', (db) =>
      rowsOf<{ name: string }>(
        db,
        `INSERT INTO job_locks (name, owner, until) VALUES ($1, $2, $3)
         ON CONFLICT (name) DO UPDATE SET owner = EXCLUDED.owner, until = EXCLUDED.until
           WHERE job_locks.until <= $4 OR job_locks.owner = $2
         RETURNING name`,
        [LOCK, this.owner, new Date(now.getTime() + TICK_MS - 5_000), now],
      ),
    );
    return rows.length > 0;
  }

  private async minute(scope: Scope, now: Date): Promise<void> {
    await this.dueTasks(scope, now);
    await this.appointments(scope, now);
    await this.deadlines(scope, now);
  }

  /** TASK-7: a task reaches its due time. */
  private async dueTasks(scope: Scope, now: Date): Promise<void> {
    const due = await this.tenantDb.run(scope, (db) =>
      rowsOf<TaskRow>(
        db,
        `SELECT ${TASK_ROW} FROM tasks
          WHERE tenant_id = $1 AND status = 'OPEN' AND due_at > $2 AND due_at <= $3`,
        [scope.tenantId, new Date(now.getTime() - DUE_LOOKBACK_MS), now],
      ),
    );
    if (due.length === 0) return;
    const keyOf = (task: TaskRow) => `task:${task.id}:${task.dueAt.getTime()}`;
    const fresh = await this.notifications.claim(scope, due.map(keyOf));
    const owners = await this.notifications.usersByAgent(
      scope,
      due.flatMap((task) => (task.agentCode ? [task.agentCode] : [])),
    );
    for (const task of due.filter((item) => fresh.has(keyOf(item)))) {
      // A personal task belongs to whoever wrote it (TASK-1)
      const user = task.agentCode ? owners.get(task.agentCode) : task.createdBy;
      if (!user) continue;
      await this.notifications.notify(scope, [user], {
        type: 'TASK_DUE',
        data: { taskId: task.id },
        link: taskLink(task),
      });
    }
  }

  /** TASK-7: 15 minutes before an appointment (LEAD-31 at APPOINTMENT). */
  private async appointments(scope: Scope, now: Date): Promise<void> {
    const soon = await this.tenantDb.run(scope, (db) =>
      rowsOf<{ id: string; agentCode: string; at: Date }>(
        db,
        `SELECT id, assigned_agent_code AS "agentCode", next_action_at AS at FROM leads
          WHERE tenant_id = $1 AND stage = 'APPOINTMENT' AND assigned_agent_code IS NOT NULL
            AND next_action_at > $2 AND next_action_at <= $3 AND ${LIVE_LEAD}`,
        [scope.tenantId, now, new Date(now.getTime() + APPOINTMENT_NOTICE_MS)],
      ),
    );
    if (soon.length === 0) return;
    const keyOf = (lead: (typeof soon)[number]) =>
      `appt:${lead.id}:${lead.at.getTime()}`;
    const fresh = await this.notifications.claim(scope, soon.map(keyOf));
    for (const lead of soon.filter((item) => fresh.has(keyOf(item))))
      await this.notifications.notifyAgent(scope, lead.agentCode, {
        type: 'APPOINTMENT_SOON',
        data: { leadId: lead.id, at: lead.at.toISOString() },
        link: `/leads/${lead.id}`,
      });
  }

  /** NTF-2: "lead sắp quá hạn" (LEAD-29), four hours before the deadline, one notice per agent. */
  private async deadlines(scope: Scope, now: Date): Promise<void> {
    const deadline = await this.leads.contactDeadlineMs(scope);
    const closing = await this.tenantDb.run(scope, (db) =>
      rowsOf<{ id: string; agentCode: string; assignedAt: Date }>(
        db,
        `SELECT id, assigned_agent_code AS "agentCode", assigned_at AS "assignedAt" FROM leads
          WHERE tenant_id = $1 AND assigned_agent_code IS NOT NULL
            AND assigned_at > $2 AND assigned_at <= $3
            AND first_contact_at IS NULL AND interest IS NULL AND care_status IS NULL
            AND ${LIVE_LEAD}`,
        [
          scope.tenantId,
          new Date(now.getTime() - deadline),
          new Date(now.getTime() - deadline + DEADLINE_WARNING_MS),
        ],
      ),
    );
    if (closing.length === 0) return;
    const keyOf = (lead: (typeof closing)[number]) =>
      `deadline:${lead.id}:${lead.assignedAt.getTime()}`;
    const fresh = await this.notifications.claim(scope, closing.map(keyOf));
    const byAgent = new Map<string, string[]>();
    for (const lead of closing.filter((item) => fresh.has(keyOf(item))))
      byAgent.set(lead.agentCode, [
        ...(byAgent.get(lead.agentCode) ?? []),
        lead.id,
      ]);
    for (const [agentCode, ids] of byAgent)
      await this.notifications.notifyAgent(
        scope,
        agentCode,
        ids.length === 1
          ? {
              type: 'LEAD_DEADLINE_SOON',
              data: { count: 1, leadId: ids[0] },
              link: `/leads/${ids[0]}`,
            }
          : {
              type: 'LEAD_DEADLINE_SOON',
              data: { count: ids.length },
              link: '/leads?tab=mine',
            },
      );
  }

  /** Once a day per GA, as soon as its quiet hours end (NTF-3). */
  private async morning(scope: Scope, now: Date): Promise<void> {
    const settings = await this.tenants.getSettings(scope);
    const quiet = quietHoursOf(
      (settings.notifications as { quietHours?: unknown }).quietHours,
    );
    if (!morningRoundDue(now, quiet)) return;
    const today = vietnamDay(now);
    const claimed = await this.notifications.claim(scope, [
      `morning:${today}`,
    ]);
    if (claimed.size === 0) return;
    await this.overdueTasks(scope, today);
    await this.teamOverdue(scope, settings.grants, now);
    await this.careSignals(scope, today);
    // LEAD-40: leads deleted more than 30 days ago go for good
    await this.removal.purge(scope, now);
  }

  /** TASK-7: what is still open from before today, one notice per person. */
  private async overdueTasks(scope: Scope, today: string): Promise<void> {
    const late = await this.tenantDb.run(scope, (db) =>
      rowsOf<TaskRow>(
        db,
        `SELECT ${TASK_ROW} FROM tasks
          WHERE tenant_id = $1 AND status = 'OPEN' AND due_at < $2`,
        [scope.tenantId, dayStart(today)],
      ),
    );
    if (late.length === 0) return;
    const owners = await this.notifications.usersByAgent(
      scope,
      late.flatMap((task) => (task.agentCode ? [task.agentCode] : [])),
    );
    const counts = new Map<string, number>();
    for (const task of late) {
      const user = task.agentCode ? owners.get(task.agentCode) : task.createdBy;
      if (user) counts.set(user, (counts.get(user) ?? 0) + 1);
    }
    for (const [user, count] of counts)
      await this.notifications.notify(scope, [user], {
        type: 'TASKS_OVERDUE',
        data: { count },
        link: '/tasks',
      });
  }

  /** NTF-2: managers get the number of overdue leads they can see (LEAD-29). */
  private async teamOverdue(
    scope: Scope,
    grants: Grants,
    now: Date,
  ): Promise<void> {
    const people = await this.tenantDb.run(scope, (db) =>
      rowsOf<{
        id: string;
        email: string;
        name: string;
        roles: string[];
        agentCode: string | null;
      }>(
        db,
        `SELECT id, email, name, roles, agent_code AS "agentCode" FROM users
          WHERE tenant_id = $1 AND status = 'ACTIVE'`,
        [scope.tenantId],
      ),
    );
    for (const person of people) {
      const actor = actorOf({ ...person, tenantId: scope.tenantId }, grants);
      const manages =
        actor.reach === 'DOWNLINE' ||
        actor.reach === 'TENANT' ||
        actor.permissions.includes(Permission.LeadsManage);
      if (!manages) continue;
      const count = await this.leads.overdueCount(actor, now);
      if (count === 0) continue;
      await this.notifications.notify(scope, [person.id], {
        type: 'TEAM_OVERDUE',
        data: { count },
        link: '/leads?tab=overdue',
      });
    }
  }

  /**
   * SIG-2: premiums due within 7 days and birthdays within 3 days, told once to each agent who owns
   * the client (CUS-6). Only what is new since the last notice counts.
   */
  private async careSignals(scope: Scope, today: string): Promise<void> {
    const days = nextDayMonths(today, BIRTHDAY_DAYS);
    const { due, clients } = await this.tenantDb.run(scope, async (db) => {
      const policies = await rowsOf<{
        policyNo: string;
        holderClientId: string | null;
        premiumDueDate: string;
        status: string | null;
      }>(
        db,
        `SELECT policy_no AS "policyNo", holder_client_id AS "holderClientId",
                premium_due_date::text AS "premiumDueDate", status
           FROM policies
          WHERE tenant_id = $1 AND premium_due_date BETWEEN $2 AND $3`,
        [scope.tenantId, today, addDays(today, PREMIUM_DUE_DAYS)],
      );
      const due = policies.filter((policy) => isActiveStatus(policy.status));
      const clients = await rowsOf<{
        id: string;
        birthDayMonth: string | null;
        ownerAgentCodes: string[];
      }>(
        db,
        `SELECT id, birth_day_month AS "birthDayMonth",
                owner_agent_codes AS "ownerAgentCodes"
           FROM clients
          WHERE tenant_id = $1
            AND (id = ANY($2::uuid[]) OR birth_day_month = ANY($3::text[]))`,
        [
          scope.tenantId,
          due.flatMap((policy) => policy.holderClientId ?? []),
          days,
        ],
      );
      return { due, clients };
    });
    const owners = new Map(
      clients.map((client) => [client.id, client.ownerAgentCodes]),
    );
    const year = today.slice(0, 4);
    const items: {
      agent: string;
      kind: 'premium' | 'birthday';
      key: string;
    }[] = [];
    for (const policy of due)
      for (const agent of owners.get(policy.holderClientId ?? '') ?? [])
        items.push({
          agent,
          kind: 'premium',
          key: `due:${agent}:${policy.policyNo}:${policy.premiumDueDate}`,
        });
    for (const client of clients)
      if (client.birthDayMonth && days.includes(client.birthDayMonth))
        for (const agent of client.ownerAgentCodes)
          items.push({
            agent,
            kind: 'birthday',
            key: `bday:${agent}:${client.id}:${year}`,
          });
    if (items.length === 0) return;
    const fresh = await this.notifications.claim(
      scope,
      items.map((item) => item.key),
    );
    const tally = new Map<string, { premiumDue: number; birthdays: number }>();
    for (const item of items.filter((entry) => fresh.has(entry.key))) {
      const row = tally.get(item.agent) ?? { premiumDue: 0, birthdays: 0 };
      if (item.kind === 'premium') row.premiumDue += 1;
      else row.birthdays += 1;
      tally.set(item.agent, row);
    }
    for (const [agentCode, data] of tally)
      await this.notifications.notifyAgent(scope, agentCode, {
        type: 'CLIENT_SIGNALS',
        data,
        link: '/',
      });
  }
}
