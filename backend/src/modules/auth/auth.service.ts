import { HttpStatus, Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import type { EntityManager } from 'typeorm';
import {
  generateToken,
  hashPassword,
  sha256,
  verifyPassword,
} from '../../common/crypto.js';
import { ApiException, ErrorCode } from '../../common/errors.js';
import { assertStrongPassword } from '../../common/password-policy.js';
import {
  DEFAULT_APPEARANCE,
  DEFAULT_GRANTS,
  resolvePermissions,
  resolveReach,
  Role,
} from '../../common/rbac.js';
import type { Actor, Appearance, Grants } from '../../common/rbac.js';
import type { Env } from '../../config/env.validation.js';
import { rowsOf } from '../../core/persistence/sql.js';
import { ActorDb } from '../../core/tenancy/actor-db.js';
import { PlatformDb } from '../../core/tenancy/platform-db.js';
import { AuditAction, AuditService } from '../audit/audit.service.js';
import { NotificationsService } from '../notifications/notifications.service.js';
import { TenantStatus } from '../tenants/infrastructure/tenant.entity.js';
import { UserStatus } from '../users/infrastructure/user.entity.js';
import type {
  AcceptInviteDto,
  ChangePasswordDto,
  InviteInfoDto,
  PasswordResetInfoDto,
  ResetPasswordDto,
  SignInDto,
} from '../users/users.dto.js';
import { LoginGuardService } from './login-guard.service.js';
import { afterCommit } from '../../core/persistence/after-commit.js';
import { RealtimeService } from '../realtime/realtime.service.js';

const DAY_MS = 24 * 60 * 60 * 1000;
const RENEW_AFTER_MS = DAY_MS;
const MAX_SESSIONS_PER_USER = 10;

// Compared against when the email is unknown, so response time does not reveal which emails exist
const DUMMY_PASSWORD_HASH = await hashPassword(generateToken());

export interface SessionResult {
  actor: Actor;
  token: string;
  /** USER-16: the session waits for the MFA code. */
  mfaPending?: boolean;
}

/** USER-16: MFA is mandatory for these roles. */
const MFA_ROLES: readonly string[] = [
  Role.GAD,
  Role.Admin,
  Role.PlatformAdmin,
];

/** Everything an Actor is built from, read in one query (section 2.5 step 2). */
interface ActorRow {
  id: string;
  tenant_id: string | null;
  email: string;
  name: string;
  roles: string[];
  agent_code: string | null;
  member_no: number | null;
  status: UserStatus;
  mfa_enabled: boolean;
  appearance: Appearance | null;
  tenant_status: TenantStatus | null;
  grants: Grants | null;
  security: { mfaForAll?: boolean } | null;
  /** The platform's switch; false when the Platform Admin stopped forcing MFA set-up. */
  mfa_enforced: boolean | null;
}

const ACTOR_COLUMNS = `
  u.id, u.tenant_id, u.email, u.name, u.roles, u.agent_code, u.member_no, u.status, u.mfa_enabled, u.appearance,
  t.status AS tenant_status, ts.grants, ts.security,
  (SELECT mfa_enforced FROM platform_settings) AS mfa_enforced`;
const ACTOR_JOINS = `
  LEFT JOIN tenants t ON t.id = u.tenant_id
  LEFT JOIN tenant_settings ts ON ts.tenant_id = u.tenant_id`;

interface SessionRow extends ActorRow {
  session_id: string;
  expires_at: Date;
  absolute_expires_at: Date;
  mfa_pending: boolean;
}

@Injectable()
export class AuthService {
  constructor(
    private readonly platformDb: PlatformDb,
    private readonly actorDb: ActorDb,
    private readonly audit: AuditService,
    private readonly loginGuard: LoginGuardService,
    private readonly config: ConfigService<Env, true>,
    private readonly notifications: NotificationsService,
    private readonly realtime: RealtimeService,
  ) {}

  get sessionTtlMs(): number {
    return this.config.get('SESSION_TTL_DAYS', { infer: true }) * DAY_MS;
  }

  private get sessionMaxMs(): number {
    return this.config.get('SESSION_MAX_DAYS', { infer: true }) * DAY_MS;
  }

  /** USER-16. `previousToken` is the session cookie the browser still holds, which this replaces. */
  async signIn(dto: SignInDto, previousToken?: string): Promise<SessionResult> {
    const guardKey = `signin:${dto.email}`;
    const slots = await this.loginGuard.reserve(guardKey);

    const [user] = (await this.platformDb.run('sign-in', (db) =>
      db.query(
        `SELECT ${ACTOR_COLUMNS}, u.password_hash FROM users u ${ACTOR_JOINS} WHERE u.email = $1`,
        [dto.email],
      ),
    )) as (ActorRow & { password_hash: string | null })[];
    const passwordMatches = await verifyPassword(
      dto.password,
      user?.password_hash ?? DUMMY_PASSWORD_HASH,
    );
    const actor = user && passwordMatches ? this.actorOf(user) : null;

    if (!user || !actor) {
      await this.loginGuard.failed(guardKey);
      await this.platformDb.run('sign-in', (db) =>
        this.audit.record(
          {
            tenantId: user?.tenant_id,
            userId: user?.id,
            action: AuditAction.LoginFailed,
            entity: 'session',
          },
          db,
        ),
      );
      throw new ApiException(
        HttpStatus.UNAUTHORIZED,
        ErrorCode.InvalidCredentials,
      );
    }

    const token = await this.platformDb.run('sign-in', async (db) => {
      // Verifying takes a moment. A reset or disable in that moment must win: this write only
      // matches the state that was verified, and waits for any transaction changing that row.
      const current = await db
        .createQueryBuilder()
        .update('users')
        .set({ lastLoginAt: () => 'now()' })
        .where('id = :id AND status = :status AND password_hash = :hash', {
          id: user.id,
          status: UserStatus.Active,
          hash: user.password_hash,
        })
        .execute();
      if (!current.affected)
        throw new ApiException(
          HttpStatus.UNAUTHORIZED,
          ErrorCode.InvalidCredentials,
        );
      // USER-16: with MFA on, the session opens only after the code
      const created = await this.createSession(user, db, user.mfa_enabled);
      await this.audit.record(
        {
          tenantId: user.tenant_id,
          userId: user.id,
          action: AuditAction.Login,
          entity: 'session',
          ...(user.mfa_enabled && { meta: { mfa: 'pending' } }),
        },
        db,
      );
      return created;
    });

    await this.loginGuard.succeeded(guardKey, slots);
    await this.platformDb.run('session', async (db) => {
      if (previousToken)
        await db.query(`DELETE FROM sessions WHERE token_hash = $1`, [
          sha256(previousToken),
        ]);
      await this.pruneSessions(user.id, db);
    });
    return { actor, token, mfaPending: user.mfa_enabled };
  }

  /**
   * Development only: every account of every GA, for the account switcher. The controller refuses
   * unless DEV_ACCOUNT_SWITCHER is on, and the API refuses to start with it on in production.
   */
  async devAccounts() {
    return this.platformDb.run('dev-switcher', (db) =>
      rowsOf<{
        id: string;
        email: string;
        name: string;
        roles: string[];
        status: UserStatus;
        agentCode: string | null;
        tenantId: string | null;
        gaCode: string | null;
        gaName: string | null;
        tenantStatus: TenantStatus | null;
      }>(
        db,
        `SELECT u.id, u.email, u.name, u.roles, u.status, u.agent_code AS "agentCode",
                u.tenant_id AS "tenantId", t.ga_code AS "gaCode", t.name AS "gaName",
                t.status AS "tenantStatus"
           FROM users u LEFT JOIN tenants t ON t.id = u.tenant_id
          ORDER BY t.ga_code NULLS FIRST, u.name, u.email`,
      ),
    );
  }

  /**
   * Development only: opens a session for any active account without its password or MFA code, so
   * a tester can move between roles quickly. Audited as a sign-in with `via: dev-switch`.
   */
  async devSwitch(
    userId: string,
    previousToken?: string,
  ): Promise<SessionResult> {
    const token = await this.platformDb.run('dev-switcher', async (db) => {
      const [user] = (await db.query(
        `SELECT ${ACTOR_COLUMNS} FROM users u ${ACTOR_JOINS} WHERE u.id = $1`,
        [userId],
      )) as ActorRow[];
      if (!user || !this.actorOf(user))
        throw new ApiException(
          HttpStatus.UNAUTHORIZED,
          ErrorCode.InvalidCredentials,
        );
      await db.query(`UPDATE users SET last_login_at = now() WHERE id = $1`, [
        user.id,
      ]);
      const created = await this.createSession(user, db);
      await this.audit.record(
        {
          tenantId: user.tenant_id,
          userId: user.id,
          action: AuditAction.Login,
          entity: 'session',
          meta: { via: 'dev-switch' },
        },
        db,
      );
      if (previousToken)
        await db.query(`DELETE FROM sessions WHERE token_hash = $1`, [
          sha256(previousToken),
        ]);
      await this.pruneSessions(user.id, db);
      return created;
    });
    const actor = await this.loadActor(userId);
    if (!actor)
      throw new ApiException(
        HttpStatus.UNAUTHORIZED,
        ErrorCode.InvalidCredentials,
      );
    return { actor, token };
  }

  /** Lets a user who suspects a stolen session end all the others. */
  async signOutOthers(token: string, actor: Actor): Promise<void> {
    await this.actorDb.run(actor, async (db) => {
      await db.query(
        `DELETE FROM sessions WHERE user_id = $1 AND token_hash <> $2`,
        [actor.id, sha256(token)],
      );
      afterCommit(db, () => this.realtime.recheckUsers([actor.id]));
      await this.audit.record(
        {
          tenantId: actor.tenantId,
          userId: actor.id,
          action: AuditAction.Logout,
          entity: 'session',
          meta: { scope: 'other_devices' },
        },
        db,
      );
    });
  }

  /** Signs out every other device, as disabling does (USER-10), and returns a new session for this one. */
  async changePassword(actor: Actor, dto: ChangePasswordDto): Promise<string> {
    const guardKey = `change-password:${actor.id}`;
    const slots = await this.loginGuard.reserve(guardKey);

    const [user] = (await this.actorDb.run(actor, (db) =>
      db.query(
        `SELECT id, tenant_id, email, name, password_hash FROM users WHERE id = $1`,
        [actor.id],
      ),
    )) as {
      id: string;
      tenant_id: string | null;
      email: string;
      name: string;
      password_hash: string | null;
    }[];
    if (
      !user?.password_hash ||
      !(await verifyPassword(dto.currentPassword, user.password_hash))
    ) {
      await this.loginGuard.failed(guardKey);
      throw new ApiException(
        HttpStatus.BAD_REQUEST,
        ErrorCode.InvalidCurrentPassword,
      );
    }
    await this.loginGuard.succeeded(guardKey, slots);
    if (dto.currentPassword === dto.newPassword)
      throw new ApiException(
        HttpStatus.BAD_REQUEST,
        ErrorCode.PasswordUnchanged,
      );
    assertStrongPassword(dto.newPassword, user);

    const passwordHash = await hashPassword(dto.newPassword);
    return this.actorDb.run(actor, async (db) => {
      await db.query(
        `UPDATE users SET password_hash = $2, auth_version = auth_version + 1 WHERE id = $1`,
        [user.id, passwordHash],
      );
      await db.query(`DELETE FROM sessions WHERE user_id = $1`, [user.id]);
      await db.query(`DELETE FROM password_resets WHERE user_id = $1`, [
        user.id,
      ]);
      afterCommit(db, () => this.realtime.recheckUsers([user.id]));
      const token = await this.createSession(user, db);
      await this.audit.record(
        {
          tenantId: user.tenant_id,
          userId: user.id,
          action: AuditAction.Update,
          entity: 'user',
          entityId: actor.id,
          meta: { fields: ['password'] },
        },
        db,
      );
      return token;
    });
  }

  /** USER-16: shows whose password the link resets. Spec section 17.2 uses invite_invalid for a bad token. */
  async getPasswordReset(token: string): Promise<PasswordResetInfoDto> {
    const [user] = (await this.platformDb.run('password-reset', (db) =>
      db.query(
        `SELECT u.email FROM password_resets r JOIN users u ON u.id = r.user_id
          WHERE r.token_hash = $1 AND r.expires_at > now() AND u.status = $2`,
        [sha256(token), UserStatus.Active],
      ),
    )) as { email: string }[];
    if (!user)
      throw new ApiException(HttpStatus.NOT_FOUND, ErrorCode.InviteInvalid);
    return { email: user.email };
  }

  /** USER-16: single use. Signs the user out of every device. */
  async resetPassword(dto: ResetPasswordDto): Promise<void> {
    // Hashing is expensive, so a made-up token must not get that far
    await this.getPasswordReset(dto.token);
    assertStrongPassword(dto.password);
    const passwordHash = await hashPassword(dto.password);
    await this.platformDb.run('password-reset', async (db) => {
      const [reset] = (await rowsOf(
        db,
        `DELETE FROM password_resets WHERE token_hash = $1 AND expires_at > now()
         RETURNING tenant_id, user_id`,
        [sha256(dto.token)],
      )) as { tenant_id: string; user_id: string }[];
      if (!reset)
        throw new ApiException(HttpStatus.NOT_FOUND, ErrorCode.InviteInvalid);
      const [updated] = (await rowsOf(
        db,
        `UPDATE users SET password_hash = $2, auth_version = auth_version + 1
          WHERE id = $1 AND status = $3 RETURNING email, name`,
        [reset.user_id, passwordHash, UserStatus.Active],
      )) as { email: string; name: string }[];
      if (!updated)
        throw new ApiException(HttpStatus.NOT_FOUND, ErrorCode.InviteInvalid);
      // Throwing rolls the transaction back, so the link stays usable for a better password
      assertStrongPassword(dto.password, updated);

      await db.query(`DELETE FROM sessions WHERE user_id = $1`, [
        reset.user_id,
      ]);
      afterCommit(db, () => this.realtime.recheckUsers([reset.user_id]));
      await this.audit.record(
        {
          tenantId: reset.tenant_id,
          userId: reset.user_id,
          action: AuditAction.Update,
          entity: 'user',
          entityId: reset.user_id,
          meta: { fields: ['password'], via: 'reset_link' },
        },
        db,
      );
    });
  }

  async signOut(token: string, actor: Actor): Promise<void> {
    await this.actorDb.run(actor, async (db) => {
      await db.query(`DELETE FROM sessions WHERE token_hash = $1`, [
        sha256(token),
      ]);
      afterCommit(db, () => this.realtime.recheckUsers([actor.id]));
      await this.audit.record(
        {
          tenantId: actor.tenantId,
          userId: actor.id,
          action: AuditAction.Logout,
          entity: 'session',
        },
        db,
      );
    });
  }

  /**
   * Section 2.5 steps 1-2 and USER-17: the session is checked and the Actor rebuilt from the database
   * on every request, so disabling a user, suspending a tenant or editing grants applies at once.
   * One query does it (session, user, tenant, settings).
   */
  async authenticate(token: string | undefined): Promise<{
    actor: Actor;
    renewed: boolean;
    /** USER-16: the code is still to come, or MFA must be set up first. */
    mfa: 'pending' | 'setup' | null;
  } | null> {
    if (!token) return null;
    return this.platformDb.run('session', async (db) => {
      const [row] = (await db.query(
        `SELECT s.id AS session_id, s.expires_at, s.absolute_expires_at, s.mfa_pending, ${ACTOR_COLUMNS}
           FROM sessions s JOIN users u ON u.id = s.user_id ${ACTOR_JOINS}
          WHERE s.token_hash = $1 AND s.expires_at > now()`,
        [sha256(token)],
      )) as SessionRow[];
      if (!row) return null;
      const actor = this.actorOf(row);
      if (!actor) return null;

      const now = Date.now();
      const expiresAt = Math.min(
        now + this.sessionTtlMs,
        row.absolute_expires_at.getTime(),
      );
      const renewed = expiresAt - row.expires_at.getTime() >= RENEW_AFTER_MS;
      if (renewed)
        await db.query(`UPDATE sessions SET expires_at = $2 WHERE id = $1`, [
          row.session_id,
          new Date(expiresAt),
        ]);

      const mfa = row.mfa_pending
        ? 'pending'
        : actor.mfa?.required && !actor.mfa.enabled
          ? 'setup'
          : null;
      return { actor, renewed, mfa };
    });
  }

  /** USER-4 */
  async getInvite(token: string): Promise<InviteInfoDto> {
    const [invite] = (await this.platformDb.run('invite', (db) =>
      db.query(
        `SELECT u.email, u.name, t.name AS tenant_name
           FROM invitations i JOIN users u ON u.id = i.user_id
           LEFT JOIN tenants t ON t.id = u.tenant_id
          WHERE i.token_hash = $1 AND i.expires_at > now() AND i.accepted_at IS NULL`,
        [sha256(token)],
      ),
    )) as { email: string; name: string; tenant_name: string | null }[];
    if (!invite)
      throw new ApiException(HttpStatus.NOT_FOUND, ErrorCode.InviteInvalid);
    return {
      email: invite.email,
      name: invite.name,
      tenantName: invite.tenant_name,
    };
  }

  /** USER-4: single use; activates the account and signs the user in. */
  async acceptInvite(dto: AcceptInviteDto): Promise<SessionResult> {
    // Hashing is expensive, so a made-up token must not get that far
    await this.getInvite(dto.token);
    assertStrongPassword(dto.password);
    const passwordHash = await hashPassword(dto.password);

    const { userId, token } = await this.platformDb.run(
      'invite',
      async (db) => {
        const [invitation] = (await rowsOf(
          db,
          `UPDATE invitations SET accepted_at = now()
            WHERE token_hash = $1 AND expires_at > now() AND accepted_at IS NULL
            RETURNING user_id, created_by`,
          [sha256(dto.token)],
        )) as { user_id: string; created_by: string | null }[];
        if (!invitation)
          throw new ApiException(HttpStatus.NOT_FOUND, ErrorCode.InviteInvalid);

        const [activated] = (await rowsOf(
          db,
          `UPDATE users SET status = $2, password_hash = $3, last_login_at = now()
            WHERE id = $1 AND status = $4
            RETURNING id, tenant_id, email, name`,
          [
            invitation.user_id,
            UserStatus.Active,
            passwordHash,
            UserStatus.Invited,
          ],
        )) as {
          id: string;
          tenant_id: string | null;
          email: string;
          name: string;
        }[];
        if (!activated)
          throw new ApiException(HttpStatus.NOT_FOUND, ErrorCode.InviteInvalid);
        // Throwing rolls the transaction back, so the invite stays usable for a better password
        assertStrongPassword(dto.password, activated);

        const created = await this.createSession(activated, db);
        await this.audit.record(
          {
            tenantId: activated.tenant_id,
            userId: activated.id,
            action: AuditAction.Login,
            entity: 'session',
            meta: { via: 'invite' },
          },
          db,
        );
        // NTF-2: the person who sent the invite hears it was accepted (same GA only)
        if (invitation.created_by && activated.tenant_id)
          await this.notifications.notify(
            { tenantId: activated.tenant_id },
            [invitation.created_by],
            {
              type: 'INVITE_ACCEPTED',
              data: { userId: activated.id },
              link: '/users',
            },
            db,
          );
        return { userId: activated.id, token: created };
      },
    );

    const actor = await this.loadActor(userId);
    if (!actor)
      throw new ApiException(HttpStatus.NOT_FOUND, ErrorCode.InviteInvalid);
    return { actor, token };
  }

  private async loadActor(userId: string): Promise<Actor | null> {
    const [row] = (await this.platformDb.run('session', (db) =>
      db.query(
        `SELECT ${ACTOR_COLUMNS} FROM users u ${ACTOR_JOINS} WHERE u.id = $1`,
        [userId],
      ),
    )) as ActorRow[];
    return row ? this.actorOf(row) : null;
  }

  /** Null when the account may not act: not ACTIVE, or its tenant is gone or suspended (TENANT-3). */
  private actorOf(row: ActorRow): Actor | null {
    if (row.status !== UserStatus.Active) return null;
    if (row.tenant_id && row.tenant_status !== TenantStatus.Active) return null;
    const grants = row.tenant_id
      ? (row.grants ?? DEFAULT_GRANTS)
      : DEFAULT_GRANTS;
    const mfaForAll = !!row.security?.mfaForAll;
    const roles = row.roles as Role[];
    return {
      // USER-16: mandatory for privileged roles, or for everyone when the GA says so. The
      // Platform Admin can stop forcing it for all GAs (decisions.md, 20/11/2026); whoever has
      // MFA on is still asked for the code.
      mfa: {
        enabled: row.mfa_enabled,
        required:
          this.config.get('MFA_ENFORCE', { infer: true }) !== 'false' &&
          row.mfa_enforced !== false &&
          (mfaForAll || roles.some((role) => MFA_ROLES.includes(role))),
      },
      id: row.id,
      email: row.email,
      name: row.name,
      tenantId: row.tenant_id,
      roles,
      agentCode: row.agent_code ?? undefined,
      memberNo: row.member_no ?? undefined,
      permissions: resolvePermissions(roles, grants),
      reach: resolveReach(roles),
      appearance: { ...DEFAULT_APPEARANCE, ...row.appearance },
    };
  }

  private async createSession(
    user: { id: string; tenant_id: string | null },
    db: EntityManager,
    mfaPending = false,
  ): Promise<string> {
    const token = generateToken();
    await db.query(
      `INSERT INTO sessions (user_id, tenant_id, token_hash, expires_at, absolute_expires_at, mfa_pending)
       VALUES ($1, $2, $3, $4, $5, $6)`,
      [
        user.id,
        user.tenant_id,
        sha256(token),
        new Date(Date.now() + this.sessionTtlMs),
        new Date(Date.now() + this.sessionMaxMs),
        mfaPending,
      ],
    );
    return token;
  }

  /** Repeated sign-ins cannot grow the sessions table without limit: the oldest ones end. */
  private async pruneSessions(
    userId: string,
    db: EntityManager,
  ): Promise<void> {
    await db.query(
      `DELETE FROM sessions WHERE id IN (
         SELECT id FROM sessions WHERE user_id = $1 ORDER BY created_at DESC OFFSET $2)`,
      [userId, MAX_SESSIONS_PER_USER],
    );
  }
}
