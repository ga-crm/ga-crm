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
import { TenantDb } from '../../core/tenancy/tenant-db.js';
import { RealtimeEvent } from '../realtime/realtime.events.js';
import { RealtimeService } from '../realtime/realtime.service.js';
import {
  DAU_TTL_SECONDS,
  MINUTE_TTL_SECONDS,
  minuteOf,
  presenceDiff,
  presenceKeys,
  presenceState,
  vietnamDay,
} from './presence-bits.js';
import type { PresenceState } from './presence-bits.js';

/** How often each instance compares the GA's presence with what browsers were last told. */
const ROUND_MS = 15_000;
/** How often (in rounds) each GA's last-seen times are copied to users.last_seen_at: about 5 minutes. */
const FLUSH_EVERY_ROUNDS = 20;
/** How long the member-number → user-id list of a GA is reused. */
const ROSTER_TTL_MS = 5 * 60_000;
const SNAPSHOT_TTL_SECONDS = 120;

interface Roster {
  loadedAt: number;
  byNo: Map<number, string>;
}

/**
 * Realtime slice C1 (docs/thiet-ke-chat-realtime.md section 6): who is online, from per-minute
 * Redis bitmaps that each heartbeat sets. A user is online while their bit is set in this minute
 * or the last one, so a crashed instance's users go offline by themselves within two minutes.
 * Without Redis nothing is tracked and everyone looks offline.
 */
@Injectable()
export class PresenceService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(PresenceService.name);
  private readonly rosters = new Map<string, Roster>();
  /** Who was already counted today by this instance, so a busy user costs one SETBIT a day. */
  private counted = { day: '', members: new Set<string>() };
  private round?: NodeJS.Timeout;
  /** A reload or a short network drop should not flash a user offline. Tests shorten it. */
  offlineGraceMs = 5_000;

  constructor(
    private readonly redis: RedisService,
    private readonly tenantDb: TenantDb,
    private readonly realtime: RealtimeService,
    private readonly config: ConfigService<Env, true>,
  ) {}

  onModuleInit(): void {
    if (!this.redis.client || this.config.get('NODE_ENV', { infer: true }) === 'test')
      return;
    this.round = setInterval(() => {
      this.tick(Date.now()).catch((error: unknown) =>
        this.logger.warn(`Presence round failed: ${String(error)}`),
      );
    }, ROUND_MS);
    this.round.unref();
  }

  onModuleDestroy(): void {
    clearInterval(this.round);
  }

  /** A socket's heartbeat: online in this minute, active if the person used the tab lately. */
  async heartbeat(
    tenantId: string,
    memberNo: number,
    active: boolean,
    now = Date.now(),
  ): Promise<void> {
    const redis = this.redis.client;
    if (!redis) return;
    const keys = presenceKeys(tenantId);
    const minute = minuteOf(now);
    const batch = redis
      .multi()
      .setbit(keys.online(minute), memberNo, 1)
      .expire(keys.online(minute), MINUTE_TTL_SECONDS)
      .hset(keys.seen, String(memberNo), String(now));
    if (active)
      batch
        .setbit(keys.active(minute), memberNo, 1)
        .expire(keys.active(minute), MINUTE_TTL_SECONDS);
    await batch.exec();
    await this.countToday(tenantId, memberNo, now);
  }

  /** Daily active users: any request or heartbeat counts the person for the Vietnam day. */
  async countToday(
    tenantId: string,
    memberNo: number,
    now = Date.now(),
  ): Promise<void> {
    const redis = this.redis.client;
    if (!redis) return;
    const day = vietnamDay(now);
    if (this.counted.day !== day) this.counted = { day, members: new Set() };
    const member = `${tenantId}:${memberNo}`;
    if (this.counted.members.has(member)) return;
    const key = presenceKeys(tenantId).day(day);
    await redis
      .multi()
      .setbit(key, memberNo, 1)
      .expire(key, DAU_TTL_SECONDS)
      .exec();
    this.counted.members.add(member);
  }

  /** Called from the REST guard: never fails or slows a request. */
  countRequest(actor: Actor): void {
    if (!actor.tenantId || actor.memberNo === undefined) return;
    this.countToday(actor.tenantId, actor.memberNo).catch(() => undefined);
  }

  /** The last socket of a user closed: clear this minute and the last, so they go offline now. */
  async disconnected(
    tenantId: string,
    userId: string,
    memberNo: number,
  ): Promise<void> {
    const redis = this.redis.client;
    if (!redis) return;
    await new Promise((resolve) => setTimeout(resolve, this.offlineGraceMs));
    if (await this.realtime.isConnected(userId)) return;
    const keys = presenceKeys(tenantId);
    const minute = minuteOf(Date.now());
    await redis
      .multi()
      .setbit(keys.online(minute), memberNo, 0)
      .setbit(keys.online(minute - 1), memberNo, 0)
      .setbit(keys.active(minute), memberNo, 0)
      .setbit(keys.active(minute - 1), memberNo, 0)
      .hset(keys.seen, String(memberNo), String(Date.now()))
      .exec();
    await this.publish(tenantId);
  }

  /** Member numbers in each state now: OR of this minute and the last. */
  async state(tenantId: string, now = Date.now()): Promise<PresenceState> {
    const redis = this.redis.client;
    if (!redis) return { online: [], idle: [] };
    const keys = presenceKeys(tenantId);
    const minute = minuteOf(now);
    const [, , [, onlineBits], [, activeBits]] = (await redis
      .multi()
      .bitop('OR', keys.onlineNow, keys.online(minute), keys.online(minute - 1))
      .bitop('OR', keys.activeNow, keys.active(minute), keys.active(minute - 1))
      .getBuffer(keys.onlineNow)
      .getBuffer(keys.activeNow)
      .exec()) as [unknown, unknown, [unknown, Buffer | null], [unknown, Buffer | null]];
    return presenceState(onlineBits, activeBits);
  }

  /**
   * Tells the GA's browsers what changed since they were last told. The swap of the stored state
   * is atomic (SET ... GET), so two instances running this at once never both send one change.
   */
  async publish(tenantId: string, now = Date.now()): Promise<void> {
    const redis = this.redis.client;
    if (!redis) return;
    const after = await this.state(tenantId, now);
    const stored = await redis.set(
      presenceKeys(tenantId).snapshot,
      JSON.stringify(after),
      'EX',
      SNAPSHOT_TTL_SECONDS,
      'GET',
    );
    const before = stored
      ? (JSON.parse(stored) as PresenceState)
      : { online: [], idle: [] };
    const diff = presenceDiff(before, after);
    // K5: an online stretch starts the first time a round sees it (kept if it already started)
    const keys = presenceKeys(tenantId);
    const present = [...after.online, ...after.idle];
    if (present.length || diff.offline.length) {
      const batch = redis.multi();
      for (const no of present) batch.hsetnx(keys.since, String(no), String(now));
      if (diff.offline.length) batch.hdel(keys.since, ...diff.offline.map(String));
      await batch.exec();
    }
    if (!diff.online.length && !diff.idle.length && !diff.offline.length)
      return;
    const ids = await this.userIds(tenantId, [
      ...diff.online,
      ...diff.idle,
      ...diff.offline,
    ]);
    const pick = (numbers: number[]) =>
      numbers.map((no) => ids.get(no)).filter((id): id is string => !!id);
    const timesOf = async (key: string, numbers: number[]) => {
      if (numbers.length === 0) return {};
      const values = await redis.hmget(key, ...numbers.map(String));
      return Object.fromEntries(
        numbers.flatMap((no, index) => {
          const id = ids.get(no);
          return id && values[index] ? [[id, Number(values[index])]] : [];
        }),
      );
    };
    this.realtime.toTenant(tenantId, RealtimeEvent.PresenceChanged, {
      online: pick(diff.online),
      idle: pick(diff.idle),
      offline: pick(diff.offline),
      since: await timesOf(keys.since, [...diff.online, ...diff.idle]),
      lastSeen: await timesOf(keys.seen, diff.offline),
    });
    // Whoever just went offline keeps their last-seen time even if Redis is lost
    if (diff.offline.length) await this.flushSeen(tenantId, diff.offline);
  }

  /**
   * The periodic round: catches users whose bits expired (closed laptop, crashed instance). One
   * instance per GA per round, by a lock named after the round.
   */
  async tick(now = Date.now()): Promise<void> {
    const redis = this.redis.client;
    if (!redis) return;
    const round = Math.floor(now / ROUND_MS);
    for (const tenantId of this.realtime.localTenantIds()) {
      const won = await redis.set(
        `${presenceKeys(tenantId).lock}:${round}`,
        '1',
        'EX',
        60,
        'NX',
      );
      if (!won) continue;
      await this.publish(tenantId, now);
      if (round % FLUSH_EVERY_ROUNDS === 0) await this.flushSeen(tenantId);
    }
  }

  /** K5: copies Redis last-seen times to users.last_seen_at (never moving them back). */
  async flushSeen(tenantId: string, numbers?: number[]): Promise<void> {
    const redis = this.redis.client;
    if (!redis) return;
    const key = presenceKeys(tenantId).seen;
    const pairs: [number, number][] = numbers
      ? (await redis.hmget(key, ...numbers.map(String))).flatMap((value, index) =>
          value ? [[numbers[index], Number(value)] as [number, number]] : [],
        )
      : Object.entries(await redis.hgetall(key)).map(([no, value]) => [Number(no), Number(value)]);
    if (pairs.length === 0) return;
    await this.tenantDb.run({ tenantId }, (db) =>
      db.query(
        `UPDATE users u SET last_seen_at = greatest(u.last_seen_at, to_timestamp(s.at / 1000.0))
           FROM unnest($2::int[], $3::bigint[]) AS s(no, at)
          WHERE u.tenant_id = $1 AND u.member_no = s.no`,
        [tenantId, pairs.map(([no]) => no), pairs.map(([, at]) => at)],
      ),
    );
  }

  /**
   * K5: when each of these colleagues was last active (epoch ms), from Redis when it has a value,
   * else the copy in PostgreSQL. Users of another GA are simply not found (TEN-7).
   */
  async lastSeen(actor: Actor, userIds: string[]): Promise<{ items: { id: string; lastSeenAt: number | null }[] }> {
    if (!actor.tenantId) throw forbidden();
    const tenantId = actor.tenantId;
    const rows = await this.tenantDb.run({ tenantId }, (db) =>
      rowsOf<{ id: string; member_no: number | null; last_seen_at: Date | null }>(
        db,
        // Signing in counts as being active, so people seen before last_seen_at existed still have a time
        `SELECT id, member_no, greatest(last_seen_at, last_login_at) AS last_seen_at
           FROM users WHERE tenant_id = $1 AND id = ANY($2::uuid[])`,
        [tenantId, userIds],
      ),
    );
    const redis = this.redis.client;
    const live =
      redis && rows.length
        ? await redis.hmget(presenceKeys(tenantId).seen, ...rows.map((row) => String(row.member_no ?? -1)))
        : [];
    return {
      items: rows.map((row, index) => {
        const stored = row.last_seen_at?.getTime() ?? null;
        const fresh = live[index] ? Number(live[index]) : null;
        return { id: row.id, lastSeenAt: fresh === null ? stored : Math.max(fresh, stored ?? 0) };
      }),
    };
  }

  /** GET /presence: who in the actor's GA is online or idle now (user ids), and since when (epoch ms). */
  async forActor(
    actor: Actor,
  ): Promise<{ online: string[]; idle: string[]; since: Record<string, number> }> {
    if (!actor.tenantId) throw forbidden();
    const state = await this.state(actor.tenantId);
    const present = [...state.online, ...state.idle];
    const ids = await this.userIds(actor.tenantId, present);
    const pick = (numbers: number[]) =>
      numbers.map((no) => ids.get(no)).filter((id): id is string => !!id);
    const redis = this.redis.client;
    const starts =
      redis && present.length
        ? await redis.hmget(presenceKeys(actor.tenantId).since, ...present.map(String))
        : [];
    const since = Object.fromEntries(
      present.flatMap((no, index) => {
        const id = ids.get(no);
        return id && starts[index] ? [[id, Number(starts[index])]] : [];
      }),
    );
    return { online: pick(state.online), idle: pick(state.idle), since };
  }

  /** Member number → user id of a GA, reloaded when a number is unknown or the list is old. */
  private async userIds(
    tenantId: string,
    numbers: number[],
  ): Promise<Map<number, string>> {
    let roster = this.rosters.get(tenantId);
    const stale =
      !roster ||
      Date.now() - roster.loadedAt > ROSTER_TTL_MS ||
      numbers.some((no) => !roster!.byNo.has(no));
    if (stale) {
      const rows = await this.tenantDb.run({ tenantId }, (db) =>
        rowsOf<{ id: string; member_no: number }>(
          db,
          `SELECT id, member_no FROM users WHERE tenant_id = $1`,
          [tenantId],
        ),
      );
      roster = {
        loadedAt: Date.now(),
        byNo: new Map(rows.map((row) => [row.member_no, row.id])),
      };
      this.rosters.set(tenantId, roster);
    }
    return roster!.byNo;
  }
}
