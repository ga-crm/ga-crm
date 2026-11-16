import { Injectable } from '@nestjs/common';
import type { EntityManager } from 'typeorm';
import { forbidden } from '../../common/errors.js';
import { escapeLike, isId } from '../../common/pagination.js';
import { actorOf } from '../../common/rbac.js';
import type { Actor, Scope } from '../../common/rbac.js';
import { afterCommit } from '../../core/persistence/after-commit.js';
import { rowsOf } from '../../core/persistence/sql.js';
import { TenantDb } from '../../core/tenancy/tenant-db.js';
import { AuditAction, AuditService } from '../audit/audit.service.js';
import { RealtimeEvent } from '../realtime/realtime.events.js';
import { RealtimeService } from '../realtime/realtime.service.js';
import { TenantsService } from '../tenants/tenants.service.js';
import { Notification } from './infrastructure/notification.entities.js';
import { NOTIFICATION_TYPES, wantsInApp } from './notification-rules.js';
import type {
  NotificationPrefs,
  NotificationType,
} from './notification-rules.js';
import type {
  ListNotificationsQueryDto,
  MarkReadDto,
  NotificationPrefDto,
} from './notifications.dto.js';

export interface NotificationInput {
  type: NotificationType;
  /** Counts and ids only (NTF-4). */
  data?: Record<string, string | number>;
  link: string;
}

/** Chapter 15: the in-app channel (NTF-1), preferences (NTF-3), who may receive (NTF-5). */
@Injectable()
export class NotificationsService {
  constructor(
    private readonly tenantDb: TenantDb,
    private readonly audit: AuditService,
    private readonly tenants: TenantsService,
    private readonly realtime: RealtimeService,
  ) {}

  private scopeOf(actor: Actor): Scope {
    if (!actor.tenantId) throw forbidden();
    return { tenantId: actor.tenantId };
  }

  /**
   * CMT-5: active users of a GA as the API sees them, by id or by a name / email search, so a
   * module can ask whether each may see a record before they are mentioned.
   */
  async activeActors(
    scope: Scope,
    options: { ids?: string[]; q?: string; except?: string; limit?: number },
    outer?: EntityManager,
  ): Promise<Actor[]> {
    const q = options.q?.trim();
    return this.tenantDb.run(
      scope,
      async (db) => {
        const params: unknown[] = [scope.tenantId];
        const where = [`tenant_id = $1`, `status = 'ACTIVE'`];
        if (options.ids)
          where.push(
            `id = ANY($${params.push(options.ids.filter(isId))}::uuid[])`,
          );
        if (options.except && isId(options.except))
          where.push(`id <> $${params.push(options.except)}`);
        if (q)
          where.push(
            `(name ILIKE $${params.push(`%${escapeLike(q)}%`)} OR email ILIKE $${params.length})`,
          );
        const users = await rowsOf<{
          id: string;
          email: string;
          name: string;
          tenant_id: string;
          roles: string[];
          agent_code: string | null;
        }>(
          db,
          `SELECT id, email, name, tenant_id, roles, agent_code FROM users
            WHERE ${where.join(' AND ')} ORDER BY name LIMIT ${options.limit ?? 200}`,
          params,
        );
        if (users.length === 0) return [];
        const { grants } = await this.tenants.getSettings(scope, db);
        return users.map((user) =>
          actorOf(
            {
              id: user.id,
              email: user.email,
              name: user.name,
              tenantId: user.tenant_id,
              roles: user.roles,
              agentCode: user.agent_code,
            },
            grants,
          ),
        );
      },
      outer,
    );
  }

  /**
   * Sends one notification to each user, inside the caller's transaction when there is one.
   * NTF-5: only active users of the tenant receive; NTF-3: a user who turned the event off does not.
   */
  async notify(
    scope: Scope,
    userIds: string[],
    input: NotificationInput,
    outer?: EntityManager,
  ): Promise<number> {
    const ids = [...new Set(userIds)].filter(isId);
    if (ids.length === 0) return 0;
    return this.tenantDb.run(
      scope,
      async (db) => {
        const recipients = await rowsOf<{
          id: string;
          notification_prefs: NotificationPrefs | null;
        }>(
          db,
          `SELECT id, notification_prefs FROM users
            WHERE tenant_id = $1 AND id = ANY($2::uuid[]) AND status = 'ACTIVE'`,
          [scope.tenantId, ids],
        );
        const wanted = recipients.filter((user) =>
          wantsInApp(user.notification_prefs ?? undefined, input.type),
        );
        if (wanted.length === 0) return 0;
        await db.getRepository(Notification).insert(
          wanted.map((user) => ({
            tenantId: scope.tenantId,
            userId: user.id,
            type: input.type,
            data: input.data ?? {},
            link: input.link,
          })),
        );
        // NTF-1: the bell updates at once instead of at its next poll
        afterCommit(db, () =>
          this.realtime.toUsers(
            wanted.map((user) => user.id),
            RealtimeEvent.NotificationNew,
          ),
        );
        return wanted.length;
      },
      outer,
    );
  }

  /** The active users holding these agent codes (ROLE-2: one per code). */
  async usersByAgent(
    scope: Scope,
    agentCodes: string[],
    outer?: EntityManager,
  ): Promise<Map<string, string>> {
    const codes = [...new Set(agentCodes.filter(Boolean))];
    if (codes.length === 0) return new Map();
    const users = await this.tenantDb.run(
      scope,
      (db) =>
        rowsOf<{ id: string; agent_code: string }>(
          db,
          `SELECT id, agent_code FROM users
            WHERE tenant_id = $1 AND agent_code = ANY($2::text[]) AND status = 'ACTIVE'`,
          [scope.tenantId, codes],
        ),
      outer,
    );
    return new Map(users.map((user) => [user.agent_code, user.id]));
  }

  /**
   * Notifies whoever holds an agent code, unless that is the person who acted (or someone who is
   * told another way, such as a mentioned user).
   */
  async notifyAgent(
    scope: Scope,
    agentCode: string,
    input: NotificationInput,
    options: { except?: string | string[]; db?: EntityManager } = {},
  ): Promise<number> {
    const user = (await this.usersByAgent(scope, [agentCode], options.db)).get(
      agentCode,
    );
    const skip = [options.except ?? []].flat();
    if (!user || skip.includes(user)) return 0;
    return this.notify(scope, [user], input, options.db);
  }

  /**
   * Claims keys the scheduler has not used before and returns the new ones, so each reminder goes
   * out once even when a round runs twice. The primary key settles races between rounds.
   */
  async claim(scope: Scope, keys: string[]): Promise<Set<string>> {
    const unique = [...new Set(keys)];
    if (unique.length === 0) return new Set();
    const claimed = await this.tenantDb.run(scope, (db) =>
      rowsOf<{ key: string }>(
        db,
        `INSERT INTO notice_keys (tenant_id, key)
           SELECT $1, unnest($2::text[])
         ON CONFLICT DO NOTHING RETURNING key`,
        [scope.tenantId, unique],
      ),
    );
    return new Set(claimed.map((row) => row.key));
  }

  /** Section 17.12 GET /notifications: one's own, newest first, with the names they mention. */
  async list(actor: Actor, query: ListNotificationsQueryDto) {
    const scope = this.scopeOf(actor);
    return this.tenantDb.run(scope, async (db) => {
      const builder = db
        .getRepository(Notification)
        .createQueryBuilder('item')
        .where('item.tenantId = :tenantId AND item.userId = :userId', {
          tenantId: scope.tenantId,
          userId: actor.id,
        });
      if (query.unreadOnly) builder.andWhere('item.readAt IS NULL');
      const [items, total] = await builder
        .orderBy('item.createdAt', 'DESC')
        .addOrderBy('item.id', 'DESC')
        .skip((query.page - 1) * query.pageSize)
        .take(query.pageSize)
        .getManyAndCount();
      const unread = await this.countUnread(db, scope, actor);
      const names = await this.subjects(db, scope, items);
      return {
        items: items.map((item) => ({
          id: item.id,
          type: item.type,
          data: item.data ?? {},
          subject: names.get(subjectKey(item.data)) ?? null,
          link: item.link,
          read: !!item.readAt,
          createdAt: item.createdAt,
        })),
        page: query.page,
        pageSize: query.pageSize,
        total,
        unread,
      };
    });
  }

  private async countUnread(
    db: EntityManager,
    scope: Scope,
    actor: Actor,
  ): Promise<number> {
    const [row] = await rowsOf<{ n: number }>(
      db,
      `SELECT count(*)::int AS n FROM notifications
        WHERE tenant_id = $1 AND user_id = $2 AND read_at IS NULL`,
      [scope.tenantId, actor.id],
    );
    return row.n;
  }

  /** The bell (NTF-1). */
  async unreadCount(actor: Actor): Promise<{ unread: number }> {
    const scope = this.scopeOf(actor);
    return {
      unread: await this.tenantDb.run(scope, (db) =>
        this.countUnread(db, scope, actor),
      ),
    };
  }

  /** Section 17.12 POST /notifications/read. Someone else's ids are ignored. */
  async markRead(actor: Actor, dto: MarkReadDto): Promise<void> {
    const scope = this.scopeOf(actor);
    if (!dto.all && !dto.ids?.length) return;
    await this.tenantDb.run(scope, async (db) => {
      await db.query(
        `UPDATE notifications SET read_at = now()
          WHERE tenant_id = $1 AND user_id = $2 AND read_at IS NULL
            ${dto.all ? '' : 'AND id = ANY($3::uuid[])'}`,
        dto.all
          ? [scope.tenantId, actor.id]
          : [scope.tenantId, actor.id, dto.ids],
      );
      // The user's other tabs and devices lower their count too
      afterCommit(db, () =>
        this.realtime.toUsers([actor.id], RealtimeEvent.NotificationRead),
      );
    });
  }

  /** NTF-3 */
  async prefs(actor: Actor) {
    const scope = this.scopeOf(actor);
    const [user] = await this.tenantDb.run(scope, (db) =>
      rowsOf<{ notification_prefs: NotificationPrefs | null }>(
        db,
        `SELECT notification_prefs FROM users WHERE id = $1 AND tenant_id = $2`,
        [actor.id, scope.tenantId],
      ),
    );
    return {
      items: NOTIFICATION_TYPES.map((type) => ({
        type,
        inApp: wantsInApp(user?.notification_prefs ?? undefined, type),
      })),
    };
  }

  /** NTF-3: only what is sent changes. Audited like any change to one's account. */
  async setPrefs(actor: Actor, items: NotificationPrefDto[]): Promise<void> {
    const scope = this.scopeOf(actor);
    if (items.length === 0) return;
    await this.tenantDb.run(scope, async (db) => {
      // Locked, so two saves of the settings screen cannot lose each other's changes
      const [user] = await rowsOf<{
        notification_prefs: NotificationPrefs | null;
      }>(
        db,
        `SELECT notification_prefs FROM users WHERE id = $1 AND tenant_id = $2 FOR UPDATE`,
        [actor.id, scope.tenantId],
      );
      const prefs: Record<string, { inApp?: boolean }> = {
        ...user?.notification_prefs,
      };
      for (const item of items)
        prefs[item.type] = { ...prefs[item.type], inApp: item.inApp };
      await db.query(
        `UPDATE users SET notification_prefs = $3 WHERE id = $1 AND tenant_id = $2`,
        [actor.id, scope.tenantId, JSON.stringify(prefs)],
      );
      await this.audit.record(
        {
          tenantId: actor.tenantId,
          userId: actor.id,
          action: AuditAction.Update,
          entity: 'user',
          entityId: actor.id,
          meta: {
            fields: ['notificationPrefs'],
            off: items.filter((item) => !item.inApp).map((item) => item.type),
          },
        },
        db,
      );
    });
  }

  /**
   * NTF-4: names are read when the list is shown, not stored, so a lead or client removed later
   * does not linger in old notifications.
   */
  private async subjects(
    db: EntityManager,
    scope: Scope,
    items: { data?: Record<string, string | number> }[],
  ): Promise<Map<string, string>> {
    const ids = (field: string) => [
      ...new Set(
        items.flatMap((item) =>
          typeof item.data?.[field] === 'string'
            ? [item.data[field] as string]
            : [],
        ),
      ),
    ];
    const result = new Map<string, string>();
    const look = async (
      table: string,
      field: string,
      keyColumn: string,
      label: string,
      values: string[],
      cast: 'uuid' | 'text',
    ) => {
      const valid = cast === 'uuid' ? values.filter(isId) : values;
      if (valid.length === 0) return;
      const rows = await rowsOf<{ key: string; label: string | null }>(
        db,
        `SELECT ${keyColumn}::text AS key, ${label} AS label FROM ${table}
          WHERE tenant_id = $1 AND ${keyColumn} = ANY($2::${cast}[])`,
        [scope.tenantId, valid],
      );
      for (const row of rows)
        result.set(`${field}:${row.key}`, row.label ?? '');
    };
    // One after another: a transaction is one connection, which runs one query at a time
    await look('leads', 'leadId', 'id', 'full_name', ids('leadId'), 'uuid');
    await look('tasks', 'taskId', 'id', 'title', ids('taskId'), 'uuid');
    await look('users', 'userId', 'id', 'name', ids('userId'), 'uuid');
    // A chat notice names its group; a one-to-one one names the other person (userId)
    await look('conversations', 'conversationId', 'id', 'title', ids('conversationId'), 'uuid');
    await look(
      'clients',
      'clientCode',
      'client_code',
      'name',
      ids('clientCode'),
      'text',
    );
    return result;
  }
}

/** Which name a notification shows: its task, else its lead, client or user. */
function subjectKey(data: Record<string, string | number> | undefined): string {
  if (!data) return '';
  for (const field of ['taskId', 'leadId', 'clientCode', 'userId', 'conversationId'])
    if (typeof data[field] === 'string') return `${field}:${data[field]}`;
  return '';
}
