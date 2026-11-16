import { HttpStatus, Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import type { EntityManager } from 'typeorm';
import { sha256 } from '../../common/crypto.js';
import { ApiException, ErrorCode, notFound } from '../../common/errors.js';
import { isId } from '../../common/pagination.js';
import type { Actor, Scope } from '../../common/rbac.js';
import { open, seal } from '../../common/secret-box.js';
import {
  newRecoveryCodes,
  newTotpSecret,
  normalizeRecoveryCode,
  otpauthUrl,
  verifyTotp,
} from '../../common/totp.js';
import type { Env } from '../../config/env.validation.js';
import { ActorDb } from '../../core/tenancy/actor-db.js';
import { rowsOf } from '../../core/persistence/sql.js';
import { TenantDb } from '../../core/tenancy/tenant-db.js';
import { AuditAction, AuditService } from '../audit/audit.service.js';
import { MFA_CLEARED } from '../users/users.service.js';
import { LoginGuardService } from './login-guard.service.js';
import { afterCommit } from '../../core/persistence/after-commit.js';
import { RealtimeService } from '../realtime/realtime.service.js';

/** Development and tests only; production refuses to start without MFA_KEYS_SECRET. */
const DEV_SECRET = 'ga-crm-development-mfa-secret-not-for-production';
const PURPOSE = 'mfa-totp/v1';
const ISSUER = 'GA CRM';

interface MfaUser {
  id: string;
  tenantId: string | null;
  email: string;
  mfaEnabled: boolean;
  mfaSecret: string | null;
  mfaPendingSecret: string | null;
  mfaRecoveryCodes: string[] | null;
  mfaLastStep: number | null;
}

const MFA_SELECT = `SELECT id, tenant_id AS "tenantId", email, mfa_enabled AS "mfaEnabled",
  mfa_secret AS "mfaSecret", mfa_pending_secret AS "mfaPendingSecret",
  mfa_recovery_codes AS "mfaRecoveryCodes", mfa_last_step::int AS "mfaLastStep" FROM users`;

/** USER-16: TOTP set-up, the sign-in code, recovery codes and an admin reset. */
@Injectable()
export class MfaService {
  private readonly logger = new Logger(MfaService.name);
  private readonly secret: string;

  constructor(
    private readonly actorDb: ActorDb,
    private readonly tenantDb: TenantDb,
    private readonly audit: AuditService,
    private readonly loginGuard: LoginGuardService,
    config: ConfigService<Env, true>,
    private readonly realtime: RealtimeService,
  ) {
    const configured = config.get('MFA_KEYS_SECRET', { infer: true });
    if (!configured)
      this.logger.warn(
        'MFA_KEYS_SECRET is not set; using the development secret.',
      );
    this.secret = configured ?? DEV_SECRET;
  }

  private async load(actor: Actor): Promise<MfaUser> {
    const [user] = (await this.actorDb.run(actor, (db) =>
      db.query(`${MFA_SELECT} WHERE id = $1`, [actor.id]),
    )) as MfaUser[];
    if (!user) throw notFound();
    return user;
  }

  private sealFor(user: MfaUser, plain: string) {
    return seal(this.secret, PURPOSE, user.id, plain);
  }

  private openFor(user: MfaUser, stored: string | null) {
    return stored ? open(this.secret, PURPOSE, user.id, stored) : null;
  }

  private record(
    user: MfaUser,
    action: AuditAction,
    meta: Record<string, unknown>,
    db: EntityManager,
    by = user.id,
  ) {
    return this.audit.record(
      {
        tenantId: user.tenantId,
        userId: by,
        action,
        entity: 'mfa',
        entityId: user.id,
        meta,
      },
      db,
    );
  }

  async status(actor: Actor) {
    const user = await this.load(actor);
    return {
      enabled: user.mfaEnabled,
      required: !!actor.mfa?.required,
      recoveryCodesLeft: user.mfaRecoveryCodes?.length ?? 0,
    };
  }

  /** Step 1: a new secret for the authenticator app. Nothing changes until it is confirmed. */
  async setup(actor: Actor) {
    const user = await this.load(actor);
    const secret = newTotpSecret();
    await this.actorDb.run(actor, (db) =>
      db.query(`UPDATE users SET mfa_pending_secret = $2 WHERE id = $1`, [
        user.id,
        this.sealFor(user, secret),
      ]),
    );
    return { secret, otpauthUrl: otpauthUrl(ISSUER, user.email, secret) };
  }

  /** Step 2: the first code proves the app has the secret. Returns the recovery codes, once. */
  async enable(
    actor: Actor,
    code: string,
  ): Promise<{ recoveryCodes: string[] }> {
    const user = await this.load(actor);
    const pending = this.openFor(user, user.mfaPendingSecret);
    const step = pending ? verifyTotp(pending, code.trim(), Date.now()) : null;
    if (!pending || step === null)
      throw new ApiException(HttpStatus.BAD_REQUEST, ErrorCode.InvalidCode);
    const recoveryCodes = newRecoveryCodes();
    await this.actorDb.run(actor, async (db) => {
      await db.query(
        `UPDATE users SET mfa_enabled = true, mfa_enabled_at = now(), mfa_secret = $2,
           mfa_last_step = $3, mfa_recovery_codes = $4, mfa_pending_secret = NULL
         WHERE id = $1`,
        [
          user.id,
          this.sealFor(user, pending),
          step,
          recoveryCodes.map((item) => sha256(item)),
        ],
      );
      await this.record(user, AuditAction.Update, { mfa: 'enabled' }, db);
    });
    return { recoveryCodes };
  }

  /**
   * A TOTP code (one step of drift, never the same step twice) or an unused recovery code. Wrong
   * codes count like wrong passwords (USER-16 limits).
   */
  private async check(
    user: MfaUser,
    raw: string,
  ): Promise<{ step?: number; recovery?: string }> {
    const guardKey = `mfa:${user.id}`;
    const slots = await this.loginGuard.reserve(guardKey);
    const code = raw.trim();
    const secret = this.openFor(user, user.mfaSecret);
    const step = secret
      ? verifyTotp(secret, code, Date.now(), user.mfaLastStep ?? -1)
      : null;
    const recovery =
      step === null ? sha256(normalizeRecoveryCode(code)) : undefined;
    const recoveryOk =
      !!recovery && (user.mfaRecoveryCodes ?? []).includes(recovery);
    if (step === null && !recoveryOk) {
      await this.loginGuard.failed(guardKey);
      throw new ApiException(HttpStatus.BAD_REQUEST, ErrorCode.InvalidCode);
    }
    await this.loginGuard.succeeded(guardKey, slots);
    return step !== null ? { step } : { recovery };
  }

  /** Spends the code; the step guard makes a racing second use of the same step fail. */
  private async consume(
    user: MfaUser,
    used: { step?: number; recovery?: string },
    db: EntityManager,
  ) {
    const [row] = (await (used.step !== undefined
      ? rowsOf(
          db,
          `UPDATE users SET mfa_last_step = $2
            WHERE id = $1 AND coalesce(mfa_last_step, -1) < $2 RETURNING id`,
          [user.id, used.step],
        )
      : rowsOf(
          db,
          `UPDATE users SET mfa_recovery_codes = array_remove(mfa_recovery_codes, $2)
            WHERE id = $1 AND $2 = ANY(mfa_recovery_codes) RETURNING id`,
          [user.id, used.recovery],
        ))) as { id: string }[];
    if (!row)
      throw new ApiException(HttpStatus.BAD_REQUEST, ErrorCode.InvalidCode);
  }

  /** Section 17.2 POST /auth/mfa/verify: the code that opens a session waiting for it. */
  async verify(actor: Actor, token: string, code: string): Promise<void> {
    const user = await this.load(actor);
    if (!user.mfaEnabled)
      throw new ApiException(HttpStatus.BAD_REQUEST, ErrorCode.InvalidCode);
    const used = await this.check(user, code);
    await this.actorDb.run(actor, async (db) => {
      await this.consume(user, used, db);
      await db.query(
        `UPDATE sessions SET mfa_pending = false WHERE token_hash = $1 AND user_id = $2`,
        [sha256(token), user.id],
      );
      await this.record(
        user,
        AuditAction.Login,
        { mfa: used.step !== undefined ? 'totp' : 'recovery_code' },
        db,
      );
    });
  }

  /** New recovery codes; the old ones stop working. */
  async regenerate(
    actor: Actor,
    code: string,
  ): Promise<{ recoveryCodes: string[] }> {
    const user = await this.load(actor);
    if (!user.mfaEnabled)
      throw new ApiException(HttpStatus.BAD_REQUEST, ErrorCode.InvalidCode);
    const used = await this.check(user, code);
    const recoveryCodes = newRecoveryCodes();
    await this.actorDb.run(actor, async (db) => {
      await this.consume(user, used, db);
      await db.query(`UPDATE users SET mfa_recovery_codes = $2 WHERE id = $1`, [
        user.id,
        recoveryCodes.map((item) => sha256(item)),
      ]);
      await this.record(
        user,
        AuditAction.Update,
        { mfa: 'recovery_codes' },
        db,
      );
    });
    return { recoveryCodes };
  }

  /** Turning MFA off needs a code, and is refused where it is mandatory. */
  async disable(actor: Actor, code: string): Promise<void> {
    if (actor.mfa?.required)
      throw new ApiException(HttpStatus.CONFLICT, ErrorCode.MfaMandatory);
    const user = await this.load(actor);
    if (!user.mfaEnabled) return;
    await this.check(user, code);
    await this.actorDb.run(actor, async (db) => {
      await this.clear(user.id, db);
      await this.record(user, AuditAction.Update, { mfa: 'disabled' }, db);
    });
  }

  /**
   * A lost phone: someone with users.manage clears the user's MFA and signs them out everywhere,
   * so they set it up again at the next sign-in. TEN-3: another GA's user looks missing.
   */
  async reset(scope: Scope, actor: Actor, userId: string): Promise<void> {
    if (!isId(userId)) throw notFound();
    await this.tenantDb.run(scope, async (db) => {
      const [user] = (await db.query(
        `${MFA_SELECT} WHERE id = $1 AND tenant_id = $2`,
        [userId, scope.tenantId],
      )) as MfaUser[];
      if (!user) throw notFound();
      await this.clear(user.id, db);
      await db.query(`DELETE FROM sessions WHERE user_id = $1`, [user.id]);
      afterCommit(db, () => this.realtime.recheckUsers([user.id]));
      await this.record(
        user,
        AuditAction.Update,
        { mfa: 'reset' },
        db,
        actor.id,
      );
    });
  }

  private async clear(userId: string, db: EntityManager): Promise<void> {
    await db
      .createQueryBuilder()
      .update('users')
      .set({ ...MFA_CLEARED, authVersion: () => 'auth_version + 1' })
      .where('id = :id', { id: userId })
      .execute();
  }
}
