import type { EntityManager } from 'typeorm';
import type { Actor, Scope } from '../../common/rbac.js';
import { Role } from '../../common/rbac.js';
import { rowsOf } from '../../core/persistence/sql.js';
import type { NotificationsService } from '../notifications/notifications.service.js';

export type AssignmentKind = 'LEAD' | 'CLIENT';

/** Decided 27/11/2026: the GA director assigns customers outright; everyone else asks them. */
export const assignsOutright = (actor: Pick<Actor, 'roles'>): boolean =>
  actor.roles.includes(Role.GAD);

/**
 * Decided 27/11/2026: records an assignment for the GA director to approve, and tells every active
 * director. Kept free of Nest wiring so the lead and client modules can call it without depending
 * on the module that approves (which depends on them). Runs in the caller's transaction.
 */
export async function requestAssignment(
  db: EntityManager,
  scope: Scope,
  actor: Actor,
  kind: AssignmentKind,
  recordIds: readonly string[],
  agentCode: string | null,
  notifications: NotificationsService,
): Promise<string> {
  const [row] = await rowsOf<{ id: string }>(
    db,
    `INSERT INTO assignment_requests (tenant_id, kind, record_ids, to_agent_code, requested_by)
     VALUES ($1, $2, $3::uuid[], $4, $5) RETURNING id`,
    [scope.tenantId, kind, [...recordIds], agentCode, actor.id],
  );
  const directors = await rowsOf<{ id: string }>(
    db,
    `SELECT id FROM users
      WHERE tenant_id = $1 AND status = 'ACTIVE' AND 'GAD' = ANY(roles) AND id <> $2`,
    [scope.tenantId, actor.id],
  );
  await notifications.notify(
    scope,
    directors.map((director) => director.id),
    {
      type: 'ASSIGN_REQUESTED',
      data: { requestId: row.id, count: recordIds.length, kind },
      link: '/assignment-requests',
    },
    db,
  );
  return row.id;
}
