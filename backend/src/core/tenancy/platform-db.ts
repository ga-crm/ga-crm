import { Injectable } from '@nestjs/common';
import { InjectDataSource } from '@nestjs/typeorm';
import type { DataSource, EntityManager } from 'typeorm';
import { transactionWithCallbacks } from '../persistence/after-commit.js';
import { PLATFORM_CONNECTION } from '../db/data-source-options.js';

/** TEN-6: why a cross-tenant connection is opened. Anything else goes through TenantDb. */
export type CrossTenantReason =
  | 'sign-in'
  | 'session'
  | 'invite'
  | 'password-reset'
  | 'public-form'
  | 'platform-console'
  | 'outbox-relay'
  /** TASK-6: a calendar app reads a feed by its token alone, like an invite link. */
  | 'calendar-feed'
  /** TASK-7: the reminder rounds visit every active GA and hold one lease. */
  | 'scheduler'
  /** Development only (DEV_ACCOUNT_SWITCHER): list every account and sign in as one. */
  | 'dev-switcher'
  /** Which audit actors are DLVN staff, shown by role and never by name (TEN-3). */
  | 'audit-names';

/**
 * TEN-6: role crm_platform, which bypasses row-level security. Each use names its reason, so a
 * review can find every cross-tenant path; platform-console reads are audited by the caller.
 */
@Injectable()
export class PlatformDb {
  constructor(
    @InjectDataSource(PLATFORM_CONNECTION) private readonly source: DataSource,
  ) {}

  run<T>(
    reason: CrossTenantReason,
    work: (db: EntityManager) => Promise<T>,
    outer?: EntityManager,
  ): Promise<T> {
    if (outer) return work(outer);
    return transactionWithCallbacks(this.source, async (db) => {
      // Visible in pg_stat_activity and the database logs
      await db.query(`SELECT set_config('application_name', $1, true)`, [
        `ga-crm-platform:${reason}`,
      ]);
      return work(db);
    });
  }
}
