import { Injectable } from '@nestjs/common';
import { createHash } from 'node:crypto';
import type { EntityManager, QueryDeepPartialEntity } from 'typeorm';
import { escapeLike, isId } from '../../common/pagination.js';
import { getRequestContext } from '../../common/request-context.js';
import type { Scope } from '../../core/tenancy/scope.js';
import { PlatformDb } from '../../core/tenancy/platform-db.js';
import { TenantDb } from '../../core/tenancy/tenant-db.js';
import { afterCommit } from '../../core/persistence/after-commit.js';
import { RealtimeService } from '../realtime/realtime.service.js';
import type { ListAuditQueryDto } from './audit.dto.js';
import {
  AuditAction,
  AuditEvent,
} from './infrastructure/audit-event.entity.js';

export { AuditAction };

export interface AuditInput {
  tenantId?: string | null;
  userId?: string | null;
  action: AuditAction;
  entity: string;
  entityId?: string;
  meta?: Record<string, unknown>;
}

export type AuditActor =
  | { kind: 'user'; name: string; email: string }
  | { kind: 'platform' | 'deleted' | 'system' };

export type AuditTarget =
  { kind: 'user'; name: string; email: string } | { kind: 'deleted' } | null;

/** Entities whose entityId is a user id. */
const USER_ENTITIES = new Set(['user', 'invitation', 'password_reset']);

/** Changes the home charts count: once audited and committed, the GA's charts are refreshed. */
const DASHBOARD_ENTITIES = new Set([
  'lead',
  'lead_contact',
  'import',
  'agent',
  'lead_option',
]);

@Injectable()
export class AuditService {
  constructor(
    private readonly tenantDb: TenantDb,
    private readonly platformDb: PlatformDb,
    private readonly realtime: RealtimeService,
  ) {}

  /**
   * AUD-3: written in the caller's transaction, so the event commits together with the change.
   * AUD-1: hash = SHA-256 of the event + the previous hash of its tenant. Taking the chain row
   * locks it until the transaction ends, so writers of one tenant queue instead of conflicting.
   */
  async record(input: AuditInput, db: EntityManager): Promise<void> {
    const context = getRequestContext();
    const tenantId = input.tenantId ?? null;
    const at = new Date();
    const [chain] = (await db.query(
      `INSERT INTO audit_chains (id) VALUES ($1)
       ON CONFLICT (id) DO UPDATE SET touched_at = now()
       RETURNING last_hash`,
      [tenantId ?? 'platform'],
    )) as { last_hash: string | null }[];
    const prevHash = chain.last_hash;
    const body = {
      tenantId,
      userId: input.userId ?? null,
      action: input.action,
      entity: input.entity,
      entityId: input.entityId ?? null,
      meta: input.meta ?? null,
      ip: context?.ip ?? null,
      userAgent: context?.userAgent ?? null,
      at,
      prevHash,
    };
    const hash = createHash('sha256')
      .update(JSON.stringify(body))
      .digest('hex');
    await db
      .createQueryBuilder()
      .insert()
      .into(AuditEvent)
      // meta is plain JSON; TypeORM's deep-partial type cannot express `unknown` values
      .values({ ...body, hash } as QueryDeepPartialEntity<AuditEvent>)
      .updateEntity(false)
      .execute();
    await db.query(`UPDATE audit_chains SET last_hash = $2 WHERE id = $1`, [
      tenantId ?? 'platform',
      hash,
    ]);
    if (tenantId && DASHBOARD_ENTITIES.has(input.entity))
      afterCommit(db, () => this.realtime.touchDashboard(tenantId));
  }

  /** AUD-5. Row-level security keeps every lookup inside the tenant. */
  async list(scope: Scope, query: ListAuditQueryDto) {
    return this.tenantDb.run(scope, async (db) => {
      const builder = db
        .getRepository(AuditEvent)
        .createQueryBuilder('event')
        .where('event.tenantId = :tenantId', { tenantId: scope.tenantId });
      if (query.userId)
        builder.andWhere('event.userId = :userId', { userId: query.userId });
      if (query.email || query.role) {
        // TEN-3: only this tenant's people, so DLVN staff and other GAs cannot be found this way
        const people = db
          .createQueryBuilder()
          .subQuery()
          .select('person.id')
          .from('users', 'person');
        if (query.email)
          people.andWhere(`person.email LIKE :email`, {
            email: `%${escapeLike(query.email)}%`,
          });
        if (query.role)
          people.andWhere(`:role = ANY(person.roles)`, { role: query.role });
        builder.andWhere(`event.userId IN ${people.getQuery()}`);
        builder.setParameters(people.getParameters());
      }
      if (query.ip) {
        builder.andWhere('event.ip LIKE :ip', {
          ip: `%${escapeLike(query.ip)}%`,
        });
        // DLVN staff IPs are hidden from this list, so searching must not confirm them either.
        // Their accounts are invisible here, so "acted by someone of this GA" excludes them.
        if (!query.email && !query.role)
          builder.andWhere(
            '(event.userId IS NULL OR event.userId IN (SELECT id FROM users))',
          );
      }
      if (query.action)
        builder.andWhere('event.action = :action', { action: query.action });
      if (query.entity)
        builder.andWhere('event.entity = :entity', { entity: query.entity });
      if (query.from)
        builder.andWhere('event.at >= :from', { from: query.from });
      if (query.to) builder.andWhere('event.at <= :to', { to: query.to });

      const direction = query.order === 'asc' ? 'ASC' : 'DESC';
      const [items, total] = await builder
        .orderBy('event.at', direction)
        .addOrderBy('event.id', direction)
        .skip((query.page - 1) * query.pageSize)
        .take(query.pageSize)
        .getManyAndCount();
      return { items: await this.withParticipants(db, items), total };
    });
  }

  /** UI-3: every line shows who acted, by name rather than by id. */
  private async withParticipants(db: EntityManager, events: AuditEvent[]) {
    const ids = new Set<string>();
    for (const event of events) {
      if (event.userId) ids.add(event.userId);
      if (
        event.entityId &&
        USER_ENTITIES.has(event.entity) &&
        isId(event.entityId)
      )
        ids.add(event.entityId);
    }
    // Row-level security: only this tenant's people come back
    const people = ids.size
      ? ((await db.query(
          `SELECT id, name, email FROM users WHERE id = ANY($1::uuid[])`,
          [[...ids]],
        )) as { id: string; name: string; email: string }[])
      : [];
    const byId = new Map(people.map((person) => [person.id, person]));
    const unknown = [...ids].filter((id) => !byId.has(id));
    const staff = new Set(
      unknown.length
        ? (
            (await this.platformDb.run('audit-names', (platform) =>
              platform.query(
                `SELECT id FROM users WHERE id = ANY($1::uuid[]) AND tenant_id IS NULL`,
                [unknown],
              ),
            )) as { id: string }[]
          ).map((row) => row.id)
        : [],
    );

    return events.map((event) => {
      const actorUser = event.userId ? byId.get(event.userId) : undefined;
      // TEN-3: only names from this tenant leave here; DLVN staff appear by role, not by name
      let actor: AuditActor;
      if (!event.userId) actor = { kind: 'system' };
      else if (actorUser)
        actor = { kind: 'user', name: actorUser.name, email: actorUser.email };
      else if (staff.has(event.userId)) actor = { kind: 'platform' };
      else actor = { kind: 'deleted' };

      let target: AuditTarget = null;
      if (event.entityId && USER_ENTITIES.has(event.entity)) {
        const targetUser = byId.get(event.entityId);
        target = targetUser
          ? { kind: 'user', name: targetUser.name, email: targetUser.email }
          : { kind: 'deleted' };
      }
      if (actor.kind === 'platform') {
        const { userId: _userId, ip: _ip, userAgent: _agent, ...rest } = event;
        return { ...rest, actor, target };
      }
      return { ...event, actor, target };
    });
  }
}
