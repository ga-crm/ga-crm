import type { INestApplication } from '@nestjs/common';
import type { AddressInfo } from 'node:net';
import { io } from 'socket.io-client';
import type { Socket } from 'socket.io-client';
import request from 'supertest';
import { startApp, stopApp } from './support/app.js';
import { ownerDb } from './support/owner-db.js';
import { TenantDb } from '../src/core/tenancy/tenant-db.js';
import { NotificationsService } from '../src/modules/notifications/notifications.service.js';
import { RealtimeService } from '../src/modules/realtime/realtime.service.js';
import { demoEmail, seedDemoData } from '../src/seed/demo-data.js';

const API = '/api/v1';
const PASSWORD = 'demo-password-123';
const APP_ORIGIN = new URL(process.env.APP_URL!).origin;

/** Section 9 (realtime), slice C0: the handshake, pushes after commit, and ending revoked sockets. */
describe('Realtime (e2e)', () => {
  let app: INestApplication;
  let url: string;
  let tenantId: string;
  const ids: Record<string, string> = {};
  const sockets: Socket[] = [];

  /** A fresh session cookie, as a browser would hold it after signing in. */
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

  /** Connects like the browser does; resolves once admitted, rejects with the refusal message. */
  const connect = (cookie?: string, origin = APP_ORIGIN) =>
    new Promise<Socket>((resolve, reject) => {
      const socket = io(url, {
        path: '/socket.io',
        transports: ['websocket'],
        reconnection: false,
        forceNew: true,
        extraHeaders: { origin, ...(cookie && { cookie }) },
      });
      sockets.push(socket);
      socket.once('connect', () => resolve(socket));
      socket.once('connect_error', (error) => reject(error));
    });

  /** Collects one event's payloads, so a test can also prove an event did not arrive. */
  const record = (socket: Socket, event: string) => {
    const seen: unknown[] = [];
    socket.on(event, (payload: unknown) => seen.push(payload));
    return seen;
  };
  const disconnected = (socket: Socket) =>
    new Promise<string>((resolve) => socket.once('disconnect', resolve));
  /** Long enough for an event to cross the in-process adapter. */
  const settle = () => new Promise((resolve) => setTimeout(resolve, 150));

  beforeAll(async () => {
    app = await startApp();
    await app.listen(0);
    url = `http://127.0.0.1:${(app.getHttpServer().address() as AddressInfo).port}`;
    await seedDemoData(app, PASSWORD);
    const { rows } = await ownerDb().query<{
      id: string;
      email: string;
      tenant_id: string;
    }>(`SELECT id, email, tenant_id FROM users WHERE email = ANY($1)`, [
      [
        demoEmail(1, 'head'),
        demoEmail(1, 'fc'),
        demoEmail(1, 'bm'),
        demoEmail(1, 'um'),
        demoEmail(2, 'fc'),
      ],
    ]);
    for (const row of rows) ids[row.email] = row.id;
    tenantId = rows.find((row) => row.email === demoEmail(1, 'fc'))!.tenant_id;
  });

  afterEach(() => {
    for (const socket of sockets.splice(0)) socket.disconnect();
  });

  afterAll(async () => {
    await stopApp(app);
  });

  it('refuses a socket without a session, with an unknown token, or from another site (USER-18)', async () => {
    await expect(connect()).rejects.toThrow('unauthenticated');
    await expect(connect('crm_session=not-a-real-token')).rejects.toThrow(
      'unauthenticated',
    );
    const cookie = await signIn('fc');
    await expect(connect(cookie, 'https://evil.example')).rejects.toThrow(
      'forbidden_origin',
    );
    await expect(connect(cookie)).resolves.toBeTruthy();
  });

  it('NTF-1: a new notification reaches only its recipient, and only once committed (TEN-7)', async () => {
    const fc = await connect(await signIn('fc'));
    const bm = await connect(await signIn('bm'));
    const otherGa = await connect(await signIn('fc', 2));
    const toFc = record(fc, 'notification.new');
    const toBm = record(bm, 'notification.new');
    const toOtherGa = record(otherGa, 'notification.new');

    const notifications = app.get(NotificationsService);
    const scope = { tenantId };
    await notifications.notify(scope, [ids[demoEmail(1, 'fc')]], {
      type: 'LEAD_ASSIGNED',
      link: '/leads',
    });
    // A rolled-back change is never announced
    await expect(
      app.get(TenantDb).run(scope, async (db) => {
        await notifications.notify(
          scope,
          [ids[demoEmail(1, 'bm')]],
          { type: 'LEAD_ASSIGNED', link: '/leads' },
          db,
        );
        throw new Error('rollback');
      }),
    ).rejects.toThrow('rollback');
    await settle();

    expect(toFc).toHaveLength(1);
    expect(toBm).toHaveLength(0);
    expect(toOtherGa).toHaveLength(0);
  });

  it('marking notifications read updates the same user\'s other tabs', async () => {
    const cookie = await signIn('fc');
    const tab = await connect(cookie);
    const otherDevice = await connect(await signIn('fc'));
    const reads = record(otherDevice, 'notification.read');

    await request(app.getHttpServer())
      .post(`${API}/notifications/read`)
      .set('Cookie', cookie)
      .set('Origin', APP_ORIGIN)
      .send({ all: true })
      .expect(204);
    await settle();

    expect(reads).toHaveLength(1);
    expect(tab.connected).toBe(true);
  });

  it('USER-10: disabling a user ends their sockets at once; other users stay connected', async () => {
    const head = await signIn('head');
    const umCookie = await signIn('um');
    const um = await connect(umCookie);
    const bm = await connect(await signIn('bm'));
    const ended = record(um, 'session.ended');
    const gone = disconnected(um);

    await request(app.getHttpServer())
      .post(`${API}/users/${ids[demoEmail(1, 'um')]}/disable`)
      .set('Cookie', head)
      .set('Origin', APP_ORIGIN)
      .expect((res) => expect(res.status).toBeLessThan(300));

    expect(await gone).toBe('io server disconnect');
    expect(ended).toHaveLength(1);
    expect(bm.connected).toBe(true);
    // The old cookie cannot open a new socket either
    await expect(connect(umCookie)).rejects.toThrow('unauthenticated');
  });

  it('signing out ends that session\'s socket only, not the same user\'s other devices', async () => {
    const phone = await signIn('fc');
    const laptop = await signIn('fc');
    const phoneSocket = await connect(phone);
    const laptopSocket = await connect(laptop);
    const gone = disconnected(phoneSocket);

    await request(app.getHttpServer())
      .post(`${API}/auth/sign-out`)
      .set('Cookie', phone)
      .set('Origin', APP_ORIGIN)
      .expect((res) => expect(res.status).toBeLessThan(300));

    expect(await gone).toBe('io server disconnect');
    await settle();
    expect(laptopSocket.connected).toBe(true);
  });

  it('the periodic check ends a socket whose session expired with no event', async () => {
    const cookie = await signIn('bm');
    const socket = await connect(cookie);
    const gone = disconnected(socket);
    await ownerDb().query(
      `UPDATE sessions SET expires_at = now() - interval '1 second'
        WHERE user_id = $1`,
      [ids[demoEmail(1, 'bm')]],
    );

    await app.get(RealtimeService).recheckLocal();

    expect(await gone).toBe('io server disconnect');
  });
});
