import {
  Injectable,
  Logger,
  OnModuleDestroy,
  OnModuleInit,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { forbidden } from '../../common/errors.js';
import type { Actor } from '../../common/rbac.js';
import type { Env } from '../../config/env.validation.js';
import { rowsOf } from '../../core/persistence/sql.js';
import { RedisService } from '../../core/redis/redis.service.js';
import { PlatformDb } from '../../core/tenancy/platform-db.js';
import { TenantDb } from '../../core/tenancy/tenant-db.js';
import {
  countBits,
  DAU_TTL_SECONDS,
  lastDays,
  orBits,
  presenceKeys,
} from './presence-bits.js';

const HOUR_MS = 3_600_000;
const SERIES_DAYS = 30;

export interface ActivitySummary {
  /** False without Redis: only the copies already in PostgreSQL are counted. */
  live: boolean;
  /** Accounts that can sign in now (ACTIVE), the base for the ratios. */
  activeAccounts: number;
  dau: number;
  wau: number;
  mau: number;
  series: { day: string; active: number }[];
}

/**
 * Daily, weekly and monthly active users of a GA, from the day bitmaps PresenceService sets
 * (docs/thiet-ke-chat-realtime.md section 6.3). Redis is the working copy; every hour each
 * bitmap is merged into `activity_days`, and a day Redis lost is put back from there.
 */
@Injectable()
export class ActivityService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(ActivityService.name);
  private timer?: NodeJS.Timeout;

  constructor(
    private readonly redis: RedisService,
    private readonly tenantDb: TenantDb,
    private readonly platformDb: PlatformDb,
    private readonly config: ConfigService<Env, true>,
  ) {}

  onModuleInit(): void {
    if (!this.redis.client || this.config.get('NODE_ENV', { infer: true }) === 'test')
      return;
    const run = () =>
      this.snapshot(Date.now()).catch((error: unknown) =>
        this.logger.warn(`Activity snapshot failed: ${String(error)}`),
      );
    this.timer = setInterval(run, HOUR_MS);
    this.timer.unref();
  }

  onModuleDestroy(): void {
    clearInterval(this.timer);
  }

  /**
   * Copies today's and yesterday's bitmap of every active GA into PostgreSQL. One instance per
   * hour does it; merging (OR) makes a repeat or an overlap harmless.
   */
  async snapshot(now = Date.now()): Promise<void> {
    const redis = this.redis.client;
    if (!redis) return;
    const won = await redis.set(
      `sys:lock:activity:${Math.floor(now / HOUR_MS)}`,
      '1',
      'EX',
      2 * 3600,
      'NX',
    );
    if (!won) return;
    const tenants = await this.platformDb.run('scheduler', (db) =>
      rowsOf<{ id: string }>(db, `SELECT id FROM tenants WHERE status = 'active'`),
    );
    for (const { id } of tenants)
      await this.syncDays(id, lastDays(now, 2), true);
  }

  /** The figures of the actor's GA over the last 30 Vietnam days. */
  async summary(actor: Actor, now = Date.now()): Promise<ActivitySummary> {
    if (!actor.tenantId) throw forbidden();
    const tenantId = actor.tenantId;
    const days = lastDays(now, SERIES_DAYS);
    const bitmaps = await this.syncDays(tenantId, days, false);
    const [{ n: activeAccounts }] = await this.tenantDb.run({ tenantId }, (db) =>
      rowsOf<{ n: number }>(
        db,
        `SELECT count(*)::int AS n FROM users WHERE tenant_id = $1 AND status = 'ACTIVE'`,
        [tenantId],
      ),
    );
    return {
      live: !!this.redis.client,
      activeAccounts,
      dau: countBits(bitmaps.get(days[days.length - 1])),
      wau: await this.distinct(tenantId, days.slice(-7), bitmaps),
      mau: await this.distinct(tenantId, days, bitmaps),
      series: days.map((day) => ({ day, active: countBits(bitmaps.get(day)) })),
    };
  }

  /**
   * People active on any of these days. In Redis: BITOP OR over the day keys, then BITCOUNT; every
   * key is complete because syncDays put back what Redis had lost.
   */
  private async distinct(
    tenantId: string,
    days: string[],
    bitmaps: Map<string, Buffer>,
  ): Promise<number> {
    const redis = this.redis.client;
    if (!redis)
      return countBits(
        days.reduce<Buffer | null>((all, day) => orBits(all, bitmaps.get(day) ?? null), null),
      );
    const keys = presenceKeys(tenantId);
    const [, [, count]] = (await redis
      .multi()
      .bitop('OR', keys.union, ...days.map((day) => keys.day(day)))
      .bitcount(keys.union)
      .expire(keys.union, 60)
      .exec()) as [unknown, [unknown, number], unknown];
    return count;
  }

  /**
   * Merges each day's Redis bitmap with its PostgreSQL copy. A bit only in PostgreSQL goes back to
   * Redis with BITOP OR, which cannot lose a bit set meanwhile. With `save`, the merged bitmap is
   * written to PostgreSQL. Returns the merged bitmaps.
   */
  private async syncDays(
    tenantId: string,
    days: string[],
    save: boolean,
  ): Promise<Map<string, Buffer>> {
    const redis = this.redis.client;
    const keys = presenceKeys(tenantId);
    const stored = await this.tenantDb.run({ tenantId }, (db) =>
      rowsOf<{ day: string; bits: Buffer }>(
        db,
        `SELECT to_char(day, 'YYYY-MM-DD') AS day, bits FROM activity_days
          WHERE tenant_id = $1 AND day = ANY($2::date[])`,
        [tenantId, days],
      ),
    );
    const saved = new Map(stored.map((row) => [row.day, row.bits]));
    let live: (Buffer | null)[] = days.map(() => null);
    if (redis) {
      const batch = redis.multi();
      for (const day of days) batch.getBuffer(keys.day(day));
      live = ((await batch.exec()) ?? []).map(
        ([, value]) => (value as Buffer | null) ?? null,
      );
    }

    const merged = new Map<string, Buffer>();
    const changed: { day: string; bits: Buffer }[] = [];
    for (const [index, day] of days.entries()) {
      const fromDb = saved.get(day) ?? null;
      const bits = orBits(fromDb, live[index]);
      if (bits.length === 0) continue;
      merged.set(day, bits);
      if (redis && fromDb && countBits(bits) !== countBits(live[index])) {
        await redis
          .multi()
          .set(keys.restore, fromDb, 'EX', 60)
          .bitop('OR', keys.day(day), keys.day(day), keys.restore)
          .expire(keys.day(day), DAU_TTL_SECONDS)
          .exec();
      }
      if (save && countBits(bits) !== countBits(fromDb)) changed.push({ day, bits });
    }

    if (changed.length > 0)
      await this.tenantDb.run({ tenantId }, async (db) => {
        for (const { day, bits } of changed)
          await db.query(
            `INSERT INTO activity_days (tenant_id, day, bits, active)
             VALUES ($1, $2, $3, $4)
             ON CONFLICT (tenant_id, day)
             DO UPDATE SET bits = EXCLUDED.bits, active = EXCLUDED.active, updated_at = now()`,
            [tenantId, day, bits, countBits(bits)],
          );
      });
    return merged;
  }
}
