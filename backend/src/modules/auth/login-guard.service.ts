import { HttpStatus, Injectable, Logger } from '@nestjs/common';
import type { EntityManager } from 'typeorm';
import { sha256 } from '../../common/crypto.js';
import { ApiException, ErrorCode } from '../../common/errors.js';
import { getRequestContext } from '../../common/request-context.js';
import { PlatformDb } from '../../core/tenancy/platform-db.js';

const MINUTE_MS = 60_000;
const ACCOUNT_LIMIT = 5; // Section 17.1: failed attempts per account per minute
const IP_LIMIT = 50; // Password spraying: failed attempts per IP across accounts
const IP_WINDOW_MS = 15 * MINUTE_MS;
const LOCK_AFTER_FAILURES = 10; // Section 22.4: lock after repeated failures from one IP
const LOCK_BASE_MS = 15 * MINUTE_MS;
const LOCK_MAX_MS = 60 * MINUTE_MS;
const LOCK_MEMORY_MS = 24 * 60 * MINUTE_MS;

function tooMany(untilMs: number): ApiException {
  const seconds = Math.max(1, Math.ceil((untilMs - Date.now()) / 1000));
  return new ApiException(
    HttpStatus.TOO_MANY_REQUESTS,
    ErrorCode.RateLimited,
    undefined,
    seconds,
  );
}

/**
 * USER-16 and section 22.4. Counts live in PostgreSQL, so limits hold across instances and
 * restarts. Keys are hashed and unknown accounts behave like known ones, so this cannot reveal who
 * exists. A slot is taken before the password check, so parallel guesses cannot slip through
 * between reads; a success gives it back, so people who sign in correctly are never limited.
 *
 * The long lock is per account and IP. If it were per account alone, anyone could keep a GA_HEAD
 * locked out just by sending wrong passwords. The attacker's IP is what gets locked; many IPs
 * against one account still share the account limit of 5 per minute.
 */
@Injectable()
export class LoginGuardService {
  private readonly logger = new Logger(LoginGuardService.name);

  constructor(private readonly platformDb: PlatformDb) {}

  private run<T>(work: (db: EntityManager) => Promise<T>): Promise<T> {
    return this.platformDb.run('sign-in', work);
  }

  async reserve(key: string): Promise<string[]> {
    const hash = sha256(key);
    const [lock] = (await this.run((db) =>
      db.query(`SELECT locked_until FROM login_attempts WHERE id = $1`, [
        this.lockId(key),
      ]),
    )) as { locked_until: Date | null }[];
    if (lock?.locked_until && lock.locked_until.getTime() > Date.now())
      throw tooMany(lock.locked_until.getTime());

    const now = Date.now();
    const accountEnd = (Math.floor(now / MINUTE_MS) + 1) * MINUTE_MS;
    const ipEnd = (Math.floor(now / IP_WINDOW_MS) + 1) * IP_WINDOW_MS;
    const accountKey = `acct:${hash}:${accountEnd}`;
    const ipKey = `ip:${sha256(this.clientIp())}:${ipEnd}`;
    // IP first: an address already over its limit must not use up the account's allowance
    if ((await this.take(ipKey, ipEnd)) > IP_LIMIT) throw tooMany(ipEnd);
    if ((await this.take(accountKey, accountEnd)) > ACCOUNT_LIMIT)
      throw tooMany(accountEnd);
    return [accountKey, ipKey];
  }

  async succeeded(key: string, slots: string[]): Promise<void> {
    await this.run(async (db) => {
      await db.query(`DELETE FROM login_attempts WHERE id = $1`, [
        this.lockId(key),
      ]);
      await db.query(
        `UPDATE login_attempts SET count = count - 1 WHERE id = ANY($1::text[])`,
        [slots],
      );
    });
  }

  /** Each run of failures locks for longer: 15, 30, then 60 minutes. */
  async failed(key: string): Promise<void> {
    const id = this.lockId(key);
    await this.run(async (db) => {
      const [lock] = (await db.query(
        `INSERT INTO login_attempts (id, count, expires_at) VALUES ($1, 1, $2)
         ON CONFLICT (id) DO UPDATE SET count = login_attempts.count + 1, expires_at = $2
         RETURNING count`,
        [id, new Date(Date.now() + LOCK_MEMORY_MS)],
      )) as { count: number }[];
      if (lock.count % LOCK_AFTER_FAILURES !== 0) return;
      const runs = lock.count / LOCK_AFTER_FAILURES;
      const duration = Math.min(LOCK_BASE_MS * 2 ** (runs - 1), LOCK_MAX_MS);
      await db.query(
        `UPDATE login_attempts SET locked_until = $2 WHERE id = $1`,
        [id, new Date(Date.now() + duration)],
      );
      this.logger.warn(
        `Sign-in locked for ${duration / MINUTE_MS} minutes: ${id}`,
      );
    });
  }

  private clientIp(): string {
    return getRequestContext()?.ip ?? 'unknown';
  }

  private lockId(key: string): string {
    return `lock:${sha256(`${key}|${this.clientIp()}`)}`;
  }

  private async take(id: string, endsAt: number): Promise<number> {
    const [attempt] = (await this.run((db) =>
      db.query(
        // Kept a little past the window; a maintenance job removes expired rows
        `INSERT INTO login_attempts (id, count, expires_at) VALUES ($1, 1, $2)
         ON CONFLICT (id) DO UPDATE SET count = login_attempts.count + 1
         RETURNING count`,
        [id, new Date(endsAt + MINUTE_MS)],
      ),
    )) as { count: number }[];
    return attempt.count;
  }
}
