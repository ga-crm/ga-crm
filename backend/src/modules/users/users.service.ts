import { HttpStatus, Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import type { EntityManager } from 'typeorm';
import { generateToken, hashPassword, sha256 } from '../../common/crypto.js';
import {
  ApiException,
  ErrorCode,
  forbidden,
  mapDuplicateKey,
  notFound,
} from '../../common/errors.js';
import { escapeLike } from '../../common/pagination.js';
import { assertStrongPassword } from '../../common/password-policy.js';
import { AGENT_ROLES, Role } from '../../common/rbac.js';
import type { Actor, Scope } from '../../common/rbac.js';
import type { Env } from '../../config/env.validation.js';
import { PlatformDb } from '../../core/tenancy/platform-db.js';
import { TenantDb } from '../../core/tenancy/tenant-db.js';
import { AgentsService } from '../agents/agents.service.js';
import { AuditAction, AuditService } from '../audit/audit.service.js';
import {
  Invitation,
  PasswordReset,
  Session,
} from '../auth/infrastructure/auth.entities.js';
import { TenantsService } from '../tenants/tenants.service.js';
import { User, UserStatus } from './infrastructure/user.entity.js';
import type {
  InviteUserDto,
  ListUsersQueryDto,
  UpdateUserDto,
} from './users.dto.js';
import { afterCommit } from '../../core/persistence/after-commit.js';
import { RealtimeService } from '../realtime/realtime.service.js';
import { rowsOf } from '../../core/persistence/sql.js';
import { CLOSED_CARE } from '../access/departed.js';
import { NotificationsService } from '../notifications/notifications.service.js';

export { UserStatus };

const INVITE_TTL_MS = 7 * 24 * 60 * 60 * 1000; // USER-3
const PASSWORD_RESET_TTL_MS = 60 * 60 * 1000; // USER-16

/** ROLE-2 */
function assertAgentCode(
  roles: readonly string[],
  agentCode?: string | null,
): void {
  if (roles.some((role) => AGENT_ROLES.includes(role as Role)) && !agentCode) {
    throw new ApiException(HttpStatus.BAD_REQUEST, ErrorCode.AgentCodeRequired);
  }
}

/**
 * Decided 27/11/2026: a GA has one director, created by the Platform Admin with the GA (TENANT-2).
 * Nobody inside the GA invites a director or makes someone one.
 */
function assertNoNewDirector(
  roles: readonly string[] | undefined,
  before: readonly string[] = [],
): void {
  if (roles?.includes(Role.GAD) && !before.includes(Role.GAD))
    throw new ApiException(HttpStatus.FORBIDDEN, ErrorCode.DirectorByPlatform);
}

/** ROLE-4: only a GA_HEAD may touch a GA_HEAD account or grant that role. */
function assertCanManageHead(
  actor: Actor,
  ...roleSets: readonly (readonly string[] | undefined)[]
): void {
  const touchesHead = roleSets.some((roles) => roles?.includes(Role.GAD));
  if (touchesHead && !actor.roles.includes(Role.GAD)) throw forbidden();
}

/** USER-9, USER-10: the two ways to take an account out of use. */
type Deactivation = UserStatus.Disabled | UserStatus.Archived;

/** USER-10 + USER-16: what an account's MFA consists of, cleared together. */
export const MFA_CLEARED = {
  mfaEnabled: false,
  mfaSecret: null,
  mfaPendingSecret: null,
  mfaRecoveryCodes: null,
  mfaLastStep: null,
  mfaEnabledAt: null,
} as const;

@Injectable()
export class UsersService {
  constructor(
    private readonly tenantDb: TenantDb,
    private readonly platformDb: PlatformDb,
    private readonly tenants: TenantsService,
    private readonly audit: AuditService,
    private readonly config: ConfigService<Env, true>,
    private readonly realtime: RealtimeService,
    private readonly notifications: NotificationsService,
    private readonly agents: AgentsService,
  ) {}

  /** TEN-3: a record of another tenant behaves exactly like a missing one (row-level security). */
  getById(scope: Scope, id: string, db?: EntityManager): Promise<User> {
    return this.tenantDb.run(
      scope,
      async (tx) => {
        const user = await tx
          .getRepository(User)
          .findOneBy({ id, tenantId: scope.tenantId });
        if (!user) throw notFound();
        return user;
      },
      db,
    );
  }

  list(
    scope: Scope,
    query: ListUsersQueryDto,
  ): Promise<{ items: User[]; total: number }> {
    return this.tenantDb.run(scope, async (db) => {
      const builder = db
        .getRepository(User)
        .createQueryBuilder('user')
        .where('user.tenantId = :tenantId', { tenantId: scope.tenantId });
      if (query.role)
        builder.andWhere(':role = ANY(user.roles)', { role: query.role });
      // USER-7: archived users only appear when asked for
      if (query.status)
        builder.andWhere('user.status = :status', { status: query.status });
      else
        builder.andWhere('user.status <> :archived', {
          archived: UserStatus.Archived,
        });
      if (query.q)
        builder.andWhere(
          '(user.email ILIKE :pattern OR user.name ILIKE :pattern OR user.agentCode ILIKE :pattern)',
          { pattern: `%${escapeLike(query.q)}%` },
        );
      if (query.order) {
        const direction = query.order === 'asc' ? 'ASC' : 'DESC';
        // MongoDB put users who never signed in first when ascending; keep that order
        builder
          .orderBy(
            'user.lastLoginAt',
            direction,
            direction === 'ASC' ? 'NULLS FIRST' : 'NULLS LAST',
          )
          .addOrderBy('user.id', direction);
      } else {
        builder.orderBy('user.createdAt', 'DESC').addOrderBy('user.id', 'DESC');
      }
      const [items, total] = await builder
        .skip((query.page - 1) * query.pageSize)
        .take(query.pageSize)
        .getManyAndCount();
      return { items, total };
    });
  }

  /** USER-7: the agent code is the bridge to the tree, so the list shows whether it leads anywhere. */
  async agentNames(
    scope: Scope,
    codes: string[],
  ): Promise<Map<string, string>> {
    if (codes.length === 0) return new Map();
    const rows = await this.tenantDb.run(
      scope,
      (db) =>
        db.query(
          `SELECT agent_code, name FROM agents WHERE tenant_id = $1 AND agent_code = ANY($2::text[])`,
          [scope.tenantId, codes],
        ) as Promise<{ agent_code: string; name: string }[]>,
    );
    return new Map(rows.map((row) => [row.agent_code, row.name]));
  }

  /** USER-1: the tenant comes from the inviter's scope, never from the request body. */
  async invite(
    scope: Scope,
    actor: Actor,
    dto: InviteUserDto,
  ): Promise<{ user: User; inviteUrl: string; addedToTree: boolean }> {
    assertCanManageHead(actor, dto.roles);
    assertNoNewDirector(dto.roles);
    assertAgentCode(dto.roles, dto.agentCode);
    try {
      return await this.tenantDb.run(scope, async (db) => {
        // Section 5.2: the plan's number of users
        await this.tenants.assertSeat(scope, db);
        const created = await this.createInvited(scope, actor.id, dto, db);
        // Decided 26/11/2026: a staff member added by hand joins the agent tree too
        const addedToTree = await this.agents.addForUser(
          scope,
          actor,
          { ...dto, agentCode: dto.agentCode ?? null },
          db,
        );
        await this.audit.record(
          {
            tenantId: scope.tenantId,
            userId: actor.id,
            action: AuditAction.Create,
            entity: 'user',
            entityId: created.user.id,
            meta: { roles: dto.roles },
          },
          db,
        );
        return { ...created, addedToTree };
      });
    } catch (error) {
      return mapDuplicateKey(error);
    }
  }

  /** Used by invite() and by TENANT-2 when a new tenant gets its first GA_HEAD. */
  async createInvited(
    scope: Scope,
    invitedBy: string,
    dto: { email: string; name: string; roles: Role[]; agentCode?: string },
    db: EntityManager,
  ): Promise<{ user: User; inviteUrl: string }> {
    const users = db.getRepository(User);
    const user = await users.save(
      users.create({
        email: dto.email,
        name: dto.name,
        roles: dto.roles,
        agentCode: dto.agentCode ?? null,
        tenantId: scope.tenantId,
        status: UserStatus.Invited,
      }),
    );
    return {
      user,
      inviteUrl: await this.issueInvitation(scope, user, invitedBy, db),
    };
  }

  /** USER-5 */
  resendInvite(scope: Scope, actor: Actor | null, id: string): Promise<string> {
    return this.tenantDb.run(scope, async (db) => {
      const user = await this.getById(scope, id, db);
      if (actor) assertCanManageHead(actor, user.roles);
      if (user.status !== UserStatus.Invited)
        throw new ApiException(HttpStatus.CONFLICT, ErrorCode.NotInvited);
      await db
        .getRepository(Invitation)
        .delete({ tenantId: scope.tenantId, userId: user.id });
      const inviteUrl = await this.issueInvitation(scope, user, actor?.id, db);
      await this.audit.record(
        {
          tenantId: scope.tenantId,
          userId: actor?.id,
          action: AuditAction.Update,
          entity: 'invitation',
          entityId: user.id,
        },
        db,
      );
      return inviteUrl;
    });
  }

  async update(
    scope: Scope,
    actor: Actor,
    id: string,
    dto: UpdateUserDto,
  ): Promise<{ user: User; addedToTree: boolean }> {
    try {
      return await this.tenantDb.run(scope, async (db) => {
        // ROLE-5: serialises concurrent changes that could remove the last GA_HEAD
        await this.tenants.lockHeads(scope, db);
        const user = await this.getById(scope, id, db);
        assertCanManageHead(actor, user.roles, dto.roles);
        assertNoNewDirector(dto.roles, user.roles);

        const roles = dto.roles ?? (user.roles as Role[]);
        const agentCode =
          dto.agentCode === undefined ? user.agentCode : dto.agentCode;
        assertAgentCode(roles, agentCode);

        const rolesChanged =
          dto.roles !== undefined && dto.roles.join() !== user.roles.join();
        const emailChanged =
          dto.email !== undefined && dto.email !== user.email;
        const accessChanged =
          rolesChanged || (agentCode ?? null) !== (user.agentCode ?? null);
        // users.manage must not let its holder widen their own access; GA_HEAD already has it all
        if (
          user.id === actor.id &&
          accessChanged &&
          !actor.roles.includes(Role.GAD)
        )
          throw forbidden();

        const wasActiveHead =
          user.status === UserStatus.Active && user.roles.includes(Role.GAD);
        if (wasActiveHead && !roles.includes(Role.GAD))
          await this.assertAnotherActiveHead(scope, user, db);

        const before = {
          name: user.name,
          email: user.email,
          roles: user.roles,
          agentCode: user.agentCode ?? undefined,
        };
        user.name = dto.name ?? user.name;
        // USER-6: the credentials belong to the user, not the address, so the password keeps working
        user.email = dto.email ?? user.email;
        user.roles = roles;
        user.agentCode = agentCode ?? null;
        await db.getRepository(User).update(
          { id: user.id },
          {
            name: user.name,
            email: user.email,
            roles: user.roles,
            agentCode: user.agentCode,
            // Cached sessions of this user drop (role or code changes reach every instance)
            ...(accessChanged && { authVersion: user.authVersion + 1 }),
          },
        );

        // ROLE-4: whoever kept a link made earlier must not inherit the account's new access.
        // A link sent to the old address dies too, since that address may have been the mistake.
        if (rolesChanged || emailChanged) {
          const links = { tenantId: scope.tenantId, userId: user.id };
          await db.getRepository(PasswordReset).delete(links);
          await db.getRepository(Invitation).delete(links);
        }

        await this.audit.record(
          {
            tenantId: scope.tenantId,
            userId: actor.id,
            action: rolesChanged
              ? AuditAction.PermissionChange
              : AuditAction.Update,
            entity: 'user',
            entityId: user.id,
            meta: {
              before,
              after: {
                name: user.name,
                email: user.email,
                roles,
                agentCode: user.agentCode ?? undefined,
              },
            },
          },
          db,
        );
        // Decided 26/11/2026: an account whose code is not on the tree yet joins it on save
        const addedToTree = await this.agents.addForUser(
          scope,
          actor,
          {
            agentCode: user.agentCode,
            name: user.name,
            roles,
            managerCode: dto.managerCode,
          },
          db,
        );
        return { user, addedToTree };
      });
    } catch (error) {
      return mapDuplicateKey(error);
    }
  }

  /**
   * USER-14: the only hard delete. It removes a user who never accepted an invite and is referenced
   * by nothing. The database refuses any other delete (row-level security policy).
   */
  async revokeInvite(scope: Scope, actor: Actor, id: string): Promise<void> {
    await this.tenantDb.run(scope, async (db) => {
      const user = await this.getById(scope, id, db);
      assertCanManageHead(actor, user.roles);
      if (user.status !== UserStatus.Invited)
        throw new ApiException(HttpStatus.CONFLICT, ErrorCode.NotInvited);
      if (await this.hasHistory(scope, user, db))
        throw new ApiException(HttpStatus.CONFLICT, ErrorCode.UserHasHistory);
      // Invitations and reset links go with the user (ON DELETE CASCADE)
      await db
        .getRepository(User)
        .delete({ id: user.id, tenantId: scope.tenantId });
      await this.audit.record(
        {
          tenantId: scope.tenantId,
          userId: actor.id,
          action: AuditAction.Delete,
          entity: 'user',
          entityId: user.id,
          // USER-14: the record is gone, so the audit keeps who it was
          meta: {
            email: user.email,
            roles: user.roles,
            reason: 'invite_withdrawn',
          },
        },
        db,
      );
    });
  }

  /** USER-9, USER-10, USER-12, USER-15 */
  async disable(scope: Scope, actor: Actor, id: string): Promise<void> {
    await this.deactivate(scope, actor, id, UserStatus.Disabled);
  }

  /** USER-9, USER-10, USER-12, USER-13, USER-15 */
  async archive(
    scope: Scope,
    actor: Actor,
    id: string,
    reason?: string,
  ): Promise<void> {
    await this.deactivate(scope, actor, id, UserStatus.Archived, reason);
  }

  private async deactivate(
    scope: Scope,
    actor: Actor,
    id: string,
    target: Deactivation,
    reason?: string,
  ): Promise<void> {
    try {
      await this.tenantDb.run(scope, async (db) => {
        // ROLE-5: serialises concurrent changes that could remove the last GA_HEAD
        await this.tenants.lockHeads(scope, db);
        const user = await this.getById(scope, id, db);
        assertCanManageHead(actor, user.roles); // USER-12 + ROLE-4
        if (user.id === actor.id)
          throw new ApiException(
            HttpStatus.CONFLICT,
            ErrorCode.CannotDisableSelf,
          );
        // Already out of use: archiving a disabled user moves on, everything else changes nothing
        if (
          user.status === target ||
          (user.status === UserStatus.Archived &&
            target === UserStatus.Disabled)
        )
          return;
        // USER-12: a pending invite is withdrawn instead, unless the user has history (USER-14)
        if (
          user.status === UserStatus.Invited &&
          !(await this.hasHistory(scope, user, db))
        )
          throw new ApiException(HttpStatus.CONFLICT, ErrorCode.InvitePending);
        if (
          user.status === UserStatus.Active &&
          user.roles.includes(Role.GAD)
        )
          await this.assertAnotherActiveHead(scope, user, db);

        const archived = target === UserStatus.Archived;
        await db.getRepository(User).update(
          { id: user.id, tenantId: scope.tenantId },
          {
            status: target,
            // USER-10: the credentials go, MFA included; SSO links join this list when they exist
            passwordHash: null,
            ...MFA_CLEARED,
            authVersion: user.authVersion + 1,
            ...(archived && {
              archivedAt: new Date(),
              archivedBy: actor.id,
              archiveReason: reason ?? null,
            }),
          },
        );
        await this.wipeAccess(scope, user, db);
        // Open question 12e: only when the person leaves now (not when a disabled account is archived)
        if (user.status === UserStatus.Active || user.status === UserStatus.Invited)
          await this.tellHeadsAboutWork(scope, actor, user, db);
        // USER-10: open sockets end now, not at the next sweep
        afterCommit(db, () => this.realtime.recheckUsers([user.id]));
        await this.audit.record(
          {
            tenantId: scope.tenantId,
            userId: actor.id,
            action: archived ? AuditAction.Archive : AuditAction.Update,
            entity: 'user',
            entityId: user.id,
            meta: {
              before: { status: user.status },
              after: { status: target },
            },
          },
          db,
        );
      });
    } catch (error) {
      mapDuplicateKey(error);
    }
  }

  /**
   * USER-11: the credentials were wiped, so the user comes back as INVITED and sets a new password
   * through a new invite. The agent code may have gone to someone else meanwhile (agent_code_taken).
   */
  async reactivate(scope: Scope, actor: Actor, id: string): Promise<string> {
    try {
      return await this.tenantDb.run(scope, async (db) => {
        const user = await this.getById(scope, id, db);
        assertCanManageHead(actor, user.roles);
        if (user.status === UserStatus.Active)
          throw new ApiException(HttpStatus.CONFLICT, ErrorCode.NotInvited);
        if (user.status === UserStatus.Invited)
          throw new ApiException(HttpStatus.CONFLICT, ErrorCode.InvitePending);
        // Section 5.2: an archived user takes a seat again
        if (user.status === UserStatus.Archived)
          await this.tenants.assertSeat(scope, db);

        await db.getRepository(User).update(
          { id: user.id, tenantId: scope.tenantId },
          {
            status: UserStatus.Invited,
            ...MFA_CLEARED,
            passwordHash: null,
            archivedAt: null,
            archivedBy: null,
            archiveReason: null,
            authVersion: user.authVersion + 1,
          },
        );
        await this.wipeAccess(scope, user, db);
        const inviteUrl = await this.issueInvitation(scope, user, actor.id, db);
        await this.audit.record(
          {
            tenantId: scope.tenantId,
            userId: actor.id,
            action: AuditAction.Update,
            entity: 'user',
            entityId: user.id,
            meta: {
              before: { status: user.status },
              after: { status: UserStatus.Invited },
            },
          },
          db,
        );
        return inviteUrl;
      });
    } catch (error) {
      return mapDuplicateKey(error);
    }
  }

  /** USER-10: signs the user out everywhere and kills every link made for the account. */
  /**
   * Open question 12e (decided 14/11/2026): when someone leaves with open leads or clients in their
   * name, and nobody else holds their agent code, the GA heads are told, with a link to reassign them.
   */
  private async tellHeadsAboutWork(
    scope: Scope,
    actor: Actor,
    user: User,
    db: EntityManager,
  ): Promise<void> {
    if (!user.agentCode) return;
    const [work] = await rowsOf<{ leads: number; clients: number; held: boolean }>(
      db,
      `SELECT (SELECT count(*)::int FROM leads l
                WHERE l.tenant_id = $1 AND l.assigned_agent_code = $2 AND l.deleted_at IS NULL
                  AND l.erased_at IS NULL AND (l.care_status IS NULL OR l.care_status NOT IN ${CLOSED_CARE})) AS leads,
              (SELECT count(*)::int FROM clients c WHERE c.tenant_id = $1 AND $2 = ANY(c.owner_agent_codes)) AS clients,
              EXISTS (SELECT 1 FROM users a WHERE a.tenant_id = $1 AND a.agent_code = $2 AND a.id <> $3
                        AND a.status IN ('ACTIVE', 'INVITED')) AS held`,
      [scope.tenantId, user.agentCode, user.id],
    );
    if (work.held || (work.leads === 0 && work.clients === 0)) return;
    // Whoever did it sees it on screen; the other heads hear about it
    const heads = await rowsOf<{ id: string }>(
      db,
      `SELECT id FROM users WHERE tenant_id = $1 AND status = 'ACTIVE' AND 'GAD' = ANY(roles) AND id <> $2`,
      [scope.tenantId, actor.id],
    );
    await this.notifications.notify(
      scope,
      heads.map((head) => head.id),
      {
        type: 'DEPARTED_WORK',
        data: { userId: user.id, leads: work.leads, clients: work.clients },
        link: work.leads > 0 ? `/leads?assignee=${user.agentCode}` : `/clients?agents=${user.agentCode}`,
      },
      db,
    );
  }

  private async wipeAccess(
    scope: Scope,
    user: User,
    db: EntityManager,
  ): Promise<void> {
    const links = { tenantId: scope.tenantId, userId: user.id };
    await db.getRepository(Session).delete({ userId: user.id });
    await db.getRepository(PasswordReset).delete(links);
    await db.getRepository(Invitation).delete(links);
  }

  /**
   * USER-14: whether anything refers to this user. Every action a user takes is audited under their
   * id (AUD-3), and nobody acts without signing in, so the audit log and the last sign-in answer it.
   */
  private async hasHistory(
    scope: Scope,
    user: User,
    db: EntityManager,
  ): Promise<boolean> {
    if (user.lastLoginAt) return true;
    const [row] = (await db.query(
      `SELECT EXISTS (SELECT 1 FROM audit_events WHERE tenant_id = $1 AND user_id = $2) AS acted`,
      [scope.tenantId, user.id],
    )) as { acted: boolean }[];
    return row.acted;
  }

  /** An administrator sets the password directly. The user is signed out of every device (USER-10). */
  async setPassword(
    scope: Scope,
    actor: Actor,
    id: string,
    password: string,
  ): Promise<void> {
    assertStrongPassword(password);
    const passwordHash = await hashPassword(password);
    await this.tenantDb.run(scope, async (db) => {
      const user = await this.getResettableUser(scope, actor, id, db);
      assertStrongPassword(password, user);
      await db
        .getRepository(User)
        .update(
          { id: user.id, tenantId: scope.tenantId },
          { passwordHash, authVersion: user.authVersion + 1 },
        );
      await db.getRepository(Session).delete({ userId: user.id });
      await db
        .getRepository(PasswordReset)
        .delete({ tenantId: scope.tenantId, userId: user.id });
      await this.audit.record(
        {
          tenantId: scope.tenantId,
          userId: actor.id,
          action: AuditAction.Update,
          entity: 'user',
          entityId: user.id,
          meta: { fields: ['password'] },
        },
        db,
      );
    });
  }

  /** USER-16: a one-hour single-use link. It is copied by hand until email sending exists. */
  async createPasswordReset(
    scope: Scope,
    actor: Actor,
    id: string,
  ): Promise<string> {
    const token = generateToken();
    await this.tenantDb.run(scope, async (db) => {
      const user = await this.getResettableUser(scope, actor, id, db);
      const resets = db.getRepository(PasswordReset);
      await resets.delete({ tenantId: scope.tenantId, userId: user.id });
      await resets.insert({
        tenantId: scope.tenantId,
        userId: user.id,
        tokenHash: sha256(token),
        expiresAt: new Date(Date.now() + PASSWORD_RESET_TTL_MS),
        createdBy: actor.id,
      });
      await this.audit.record(
        {
          tenantId: scope.tenantId,
          userId: actor.id,
          action: AuditAction.Create,
          entity: 'password_reset',
          entityId: user.id,
        },
        db,
      );
    });
    return `${this.config.get('APP_URL', { infer: true })}/reset-password/${token}`;
  }

  private async getResettableUser(
    scope: Scope,
    actor: Actor,
    id: string,
    db: EntityManager,
  ): Promise<User> {
    const user = await this.getById(scope, id, db);
    assertCanManageHead(actor, user.roles);
    // Changing your own password goes through the current-password check instead
    if (user.id === actor.id)
      throw new ApiException(HttpStatus.CONFLICT, ErrorCode.CannotResetSelf);
    if (user.status === UserStatus.Invited)
      throw new ApiException(HttpStatus.CONFLICT, ErrorCode.InvitePending);
    if (
      user.status === UserStatus.Disabled ||
      user.status === UserStatus.Archived
    )
      throw new ApiException(HttpStatus.CONFLICT, ErrorCode.UserDisabled);
    return user;
  }

  /** Development seed and the first Platform Admin: an already activated account. */
  async createActive(
    tenantId: string | null,
    dto: {
      email: string;
      name: string;
      roles: Role[];
      agentCode?: string;
      password: string;
    },
  ): Promise<User> {
    const { password, ...fields } = dto;
    const passwordHash = await hashPassword(password);
    const write = async (db: EntityManager) => {
      const users = db.getRepository(User);
      return users.save(
        users.create({
          ...fields,
          agentCode: fields.agentCode ?? null,
          tenantId,
          status: UserStatus.Active,
          passwordHash,
        }),
      );
    };
    return tenantId
      ? this.tenantDb.run({ tenantId }, write)
      : this.platformDb.run('platform-console', write);
  }

  private async assertAnotherActiveHead(
    scope: Scope,
    user: User,
    db: EntityManager,
  ): Promise<void> {
    const [row] = (await db.query(
      `SELECT count(*)::int AS others FROM users
        WHERE tenant_id = $1 AND id <> $2 AND $3 = ANY(roles) AND status = $4`,
      [scope.tenantId, user.id, Role.GAD, UserStatus.Active],
    )) as { others: number }[];
    if (row.others === 0)
      throw new ApiException(HttpStatus.CONFLICT, ErrorCode.LastGaHead);
  }

  private async issueInvitation(
    scope: Scope,
    user: User,
    createdBy: string | undefined,
    db: EntityManager,
  ): Promise<string> {
    const token = generateToken();
    await db.getRepository(Invitation).insert({
      tenantId: scope.tenantId,
      userId: user.id,
      tokenHash: sha256(token),
      expiresAt: new Date(Date.now() + INVITE_TTL_MS),
      createdBy: createdBy ?? null,
    });
    return `${this.config.get('APP_URL', { infer: true })}/invite/${token}`;
  }
}
