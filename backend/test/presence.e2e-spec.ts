import type { INestApplication } from '@nestjs/common';
import { Redis } from 'ioredis';
import type { AddressInfo } from 'node:net';
import { io } from 'socket.io-client';
import type { Socket } from 'socket.io-client';
import request from 'supertest';
import { startApp, stopApp } from './support/app.js';
import { ownerDb } from './support/owner-db.js';
import { ActivityService } from '../src/modules/presence/activity.service.js';
import { presenceKeys, vietnamDay } from '../src/modules/presence/presence-bits.js';
import { PresenceService } from '../src/modules/presence/presence.service.js';
import { DEMO_TENANTS, demoEmail, seedDemoData } from '../src/seed/demo-data.js';

const API = '/api/v1';
const PASSWORD = 'demo-password-123';
const APP_ORIGIN = new URL(process.env.APP_URL!).origin;

type Change = {
  online: string[];
  idle: string[];
  offline: string[];
  since: Record<string, number>;
  lastSeen: Record<string, number>;
};

/** Realtime slice C1: presence from Redis bitmaps, and daily / weekly / monthly active users. */
describe('Presence and active users (e2e)', () => {
  let app: INestApplication;
  let url: string;
  let redis: Redis;
  const ids: Record<string, string> = {};
  const cookies: Record<string, string> = {};
  const sockets: Socket[] = [];

  const signIn = async (key: string, ga = 1) => {
    const res = await request(app.getHttpServer())
      .post(`${API}/auth/sign-in/email`)
      .send({ email: demoEmail(ga, key), password: PASSWORD })
      .expect(200);
    const cookie = ([] as string[])
      .concat(res.headers['set-cookie'] ?? [])
      .map((line) => line.split(';')[0])
      .find((pair) => pair.startsWith('crm_session='));
    if (!cookie) throw new Error('No session cookie');
    return cookie;
  };
  const connect = (cookie: string) =>
    new Promise<Socket>((resolve, reject) => {
      const socket = io(url, {
        path: '/socket.io',
        transports: ['websocket'],
        reconnection: false,
        forceNew: true,
        extraHeaders: { origin: APP_ORIGIN, cookie },
      });
      sockets.push(socket);
      socket.once('connect', () => resolve(socket));
      socket.once('connect_error', reject);
    });
  const changes = (socket: Socket) => {
    const seen: Change[] = [];
    socket.on('presence.changed', (change: Change) => seen.push(change));
    return seen;
  };
  /** Waits until a matching presence change arrives (after index `from`), or fails after two seconds. */
  const until = async (
    seen: Change[],
    test: (change: Change) => boolean,
    from = 0,
  ) => {
    for (let waited = 0; waited < 2_000; waited += 25) {
      if (seen.slice(from).some(test)) return;
      await new Promise((resolve) => setTimeout(resolve, 25));
    }
    throw new Error(`No matching presence change in ${JSON.stringify(seen)}`);
  };
  const presenceOf = async (cookie: string) =>
    (await request(app.getHttpServer()).get(`${API}/presence`).set('Cookie', cookie).expect(200))
      .body as { online: string[]; idle: string[]; since: Record<string, number> };

  beforeAll(async () => {
    redis = new Redis(process.env.REDIS_URL!);
    await redis.flushdb();
    app = await startApp();
    await app.listen(0);
    url = `http://127.0.0.1:${(app.getHttpServer().address() as AddressInfo).port}`;
    await seedDemoData(app, PASSWORD);
    app.get(PresenceService).offlineGraceMs = 50;
    const { rows } = await ownerDb().query<{ id: string; email: string }>(
      `SELECT id, email FROM users WHERE email LIKE '%.gacrm.local'`,
    );
    for (const row of rows) ids[row.email] = row.id;
    for (const [key, ga] of [
      ['head', 1],
      ['fc', 1],
      ['bm', 1],
      ['head', 2],
    ] as const)
      cookies[`${key}${ga}`] = await signIn(key, ga);
  });

  afterEach(async () => {
    for (const socket of sockets.splice(0)) socket.disconnect();
    // Let the offline grace timers of those sockets run out
    await new Promise((resolve) => setTimeout(resolve, 150));
  });

  afterAll(async () => {
    await stopApp(app);
    await redis.quit();
  });

  it('gives every GA user a small number of their own, counted per GA and assigned on insert', async () => {
    const { rows } = await ownerDb().query<{
      tenant_id: string | null;
      member_no: number | null;
    }>(`SELECT tenant_id, member_no FROM users ORDER BY tenant_id, member_no`);
    const byTenant = new Map<string, number[]>();
    for (const row of rows) {
      if (row.tenant_id === null) {
        // Platform staff have no presence in a GA
        expect(row.member_no).toBeNull();
        continue;
      }
      byTenant.set(row.tenant_id, [...(byTenant.get(row.tenant_id) ?? []), row.member_no!]);
    }
    expect(byTenant.size).toBe(DEMO_TENANTS.length);
    for (const numbers of byTenant.values())
      expect(numbers).toEqual(numbers.map((_, index) => index + 1));
  });

  it('a new socket shows the user online to their own GA only (TEN-7)', async () => {
    const head = await connect(cookies.head1);
    const otherGa = await connect(cookies.head2);
    const toHead = changes(head);
    const toOtherGa = changes(otherGa);

    await connect(cookies.fc1);

    const fc = ids[demoEmail(1, 'fc')];
    const connectedAt = Date.now();
    await until(toHead, (change) => change.online.includes(fc));
    const now = await presenceOf(cookies.head1);
    expect(now.online).toContain(fc);
    // K5: "online since"
    expect(now.since[fc]).toBeGreaterThanOrEqual(connectedAt - 1_000);
    expect(toHead.find((change) => change.online.includes(fc))!.since[fc]).toBe(now.since[fc]);
    expect(toOtherGa.flatMap((change) => change.online)).not.toContain(fc);
    expect((await presenceOf(cookies.head2)).online).not.toContain(fc);
  });

  it('a user whose tabs report no activity turns idle once the last active minute passes, and comes back', async () => {
    const head = await connect(cookies.head1);
    const toHead = changes(head);
    const bm = await connect(cookies.bm1);
    const bmId = ids[demoEmail(1, 'bm')];
    await until(toHead, (change) => change.online.includes(bmId));
    const {
      rows: [{ tenant_id: tenantId, member_no: memberNo }],
    } = await ownerDb().query<{ tenant_id: string; member_no: number }>(
      `SELECT tenant_id, member_no FROM users WHERE id = $1`,
      [bmId],
    );
    const presence = app.get(PresenceService);

    // The socket path accepts an idle heartbeat; another tab may still be active, so nothing changes yet
    bm.emit('presence.heartbeat', { active: false });
    await new Promise((resolve) => setTimeout(resolve, 100));
    expect((await presenceOf(cookies.head1)).online).toContain(bmId);

    // Two minutes of idle heartbeats later the active bits have expired
    const later = Date.now() + 2 * 60_000;
    await presence.heartbeat(tenantId, memberNo, false, later);
    await presence.publish(tenantId, later);
    await until(toHead, (change) => change.idle.includes(bmId));

    const before = toHead.length;
    await presence.heartbeat(tenantId, memberNo, true, later);
    await presence.publish(tenantId, later);
    await until(toHead, (change) => change.online.includes(bmId), before);
  });

  it('closing the last tab shows the user offline after the grace period', async () => {
    const head = await connect(cookies.head1);
    const toHead = changes(head);
    const fc = await connect(cookies.fc1);
    const fcId = ids[demoEmail(1, 'fc')];

    const before = Date.now();
    fc.disconnect();

    await until(toHead, (change) => change.offline.includes(fcId));
    expect((await presenceOf(cookies.head1)).online).not.toContain(fcId);
    // K5: how long they have been away is known at once, and kept in PostgreSQL
    const told = toHead.find((change) => change.offline.includes(fcId))!;
    expect(told.lastSeen[fcId]).toBeGreaterThanOrEqual(before);
    const { rows } = await ownerDb().query<{ last_seen_at: Date }>(
      `SELECT last_seen_at FROM users WHERE id = $1`,
      [fcId],
    );
    expect(rows[0].last_seen_at.getTime()).toBe(told.lastSeen[fcId]);
  });

  it('K5: last-seen times come from Redis, else from PostgreSQL; another GA\'s users are not found (TEN-7)', async () => {
    const fcId = ids[demoEmail(1, 'fc')];
    const otherGa = ids[demoEmail(2, 'fc')];
    const read = async () =>
      (
        await request(app.getHttpServer())
          .get(`${API}/presence/last-seen?ids=${fcId},${otherGa}`)
          .set('Cookie', cookies.head1)
          .expect(200)
      ).body.items as { id: string; lastSeenAt: number | null }[];
    const live = await read();
    expect(live.map((item) => item.id)).toEqual([fcId]);
    expect(live[0].lastSeenAt).toBeGreaterThan(0);

    const {
      rows: [{ tenant_id: tenantId }],
    } = await ownerDb().query<{ tenant_id: string }>(`SELECT tenant_id FROM users WHERE id = $1`, [fcId]);
    await redis.del(presenceKeys(tenantId).seen);
    expect(await read()).toEqual(live);
  });

  it('a user whose heartbeats stopped (crashed instance) goes offline at the next round', async () => {
    const head = await connect(cookies.head1);
    const toHead = changes(head);
    await connect(cookies.bm1);
    const headId = ids[demoEmail(1, 'head')];
    const bmId = ids[demoEmail(1, 'bm')];
    await until(toHead, (change) => change.online.includes(bmId));

    // Five minutes on, no bit of that minute or the one before is set for anyone
    await app.get(PresenceService).tick(Date.now() + 5 * 60_000);

    await until(toHead, (change) => change.offline.includes(bmId));
    expect(toHead.at(-1)!.offline).toEqual(expect.arrayContaining([headId, bmId]));
  });

  it('counts daily, weekly and monthly active users from the day bitmap, for users.manage only', async () => {
    const res = await request(app.getHttpServer())
      .get(`${API}/presence/activity`)
      .set('Cookie', cookies.head1)
      .expect(200);
    const summary = res.body as {
      live: boolean;
      activeAccounts: number;
      dau: number;
      wau: number;
      mau: number;
      series: { day: string; active: number }[];
    };
    // head, fc and bm signed in and called the API today
    expect(summary.live).toBe(true);
    expect(summary.dau).toBe(3);
    expect(summary.wau).toBe(3);
    expect(summary.mau).toBe(3);
    expect(summary.activeAccounts).toBeGreaterThanOrEqual(3);
    expect(summary.series).toHaveLength(30);
    expect(summary.series.at(-1)).toEqual({ day: vietnamDay(Date.now()), active: 3 });

    await request(app.getHttpServer())
      .get(`${API}/presence/activity`)
      .set('Cookie', cookies.fc1)
      .expect(403);
  });

  it('keeps the day in PostgreSQL, and puts it back when Redis loses it', async () => {
    await app.get(ActivityService).snapshot(Date.now());
    const { rows } = await ownerDb().query<{ active: number }>(
      `SELECT active FROM activity_days WHERE day = $1::date`,
      [vietnamDay(Date.now())],
    );
    // GA-1: head, fc, bm; GA-2: head
    expect(rows.map((row) => row.active).sort((a, b) => a - b)).toEqual([1, 3]);

    await redis.flushdb();
    const res = await request(app.getHttpServer())
      .get(`${API}/presence/activity`)
      .set('Cookie', cookies.head1)
      .expect(200);
    expect(res.body.dau).toBe(3);
    expect(res.body.mau).toBe(3);
    const keys = await redis.keys('t:*:dau:*');
    expect(keys.length).toBeGreaterThan(0);
  });
});
