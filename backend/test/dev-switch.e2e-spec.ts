import type { INestApplication } from '@nestjs/common';
import request from 'supertest';
import { startApp, stopApp } from './support/app.js';
import { connection } from './support/collections.js';
import { demoEmail, seedDemoData } from '../src/seed/demo-data.js';

const API = '/api/v1';
const PASSWORD = 'demo-password-123';

type Account = {
  id: string;
  email: string;
  status: string;
  gaCode: string | null;
};

/** The account switcher for testing (DEV_ACCOUNT_SWITCHER=true). Off, see auth.e2e-spec. */
describe('Dev account switcher (e2e)', () => {
  let app: INestApplication;
  let accounts: Account[];
  const idOf = (email: string) =>
    accounts.find((item) => item.email === email)!.id;

  beforeAll(async () => {
    process.env.DEV_ACCOUNT_SWITCHER = 'true';
    app = await startApp();
    await seedDemoData(app, PASSWORD);
    accounts = (
      await request(app.getHttpServer()).get(`${API}/dev/accounts`).expect(200)
    ).body.items;
  });

  afterAll(async () => {
    delete process.env.DEV_ACCOUNT_SWITCHER;
    await stopApp(app);
  });

  it('lists every account of every demo GA and the platform, without secrets', () => {
    const codes = new Set(accounts.map((item) => item.gaCode));
    expect(codes).toEqual(new Set([null, 'GA-HN', 'GA-HCM', 'GA-MT', 'GA-MN', 'GA-MB']));
    expect(accounts.map((item) => item.email)).toEqual(
      expect.arrayContaining([
        demoEmail(1, 'fc'),
        demoEmail(2, 'head'),
        process.env.PLATFORM_ADMIN_EMAIL!.toLowerCase(),
      ]),
    );
    const text = JSON.stringify(accounts);
    expect(text).not.toMatch(/password|mfa_secret|token/i);
  });

  it('signs in as any active account without a password or MFA code, and audits it', async () => {
    const agent = request.agent(app.getHttpServer());
    const me = await agent
      .post(`${API}/dev/switch`)
      .send({ userId: idOf(demoEmail(1, 'fc')) })
      .expect(200);
    expect(me.body.user.email).toBe(demoEmail(1, 'fc'));
    expect((await agent.get(`${API}/me`).expect(200)).body.user.email).toBe(
      demoEmail(1, 'fc'),
    );

    // Switching again replaces the session the browser holds
    await agent
      .post(`${API}/dev/switch`)
      .send({ userId: idOf(demoEmail(2, 'head')) })
      .expect(200);
    expect((await agent.get(`${API}/me`).expect(200)).body.user.email).toBe(
      demoEmail(2, 'head'),
    );

    const audits = await connection
      .collection('auditEvents')
      .find({ action: 'LOGIN' })
      .toArray();
    expect(
      audits.filter((item) => item.meta?.via === 'dev-switch'),
    ).toHaveLength(2);
  });

  it('refuses an account that may not sign in, and a malformed id', async () => {
    const head = request.agent(app.getHttpServer());
    await head
      .post(`${API}/dev/switch`)
      .send({ userId: idOf(demoEmail(1, 'head')) })
      .expect(200);
    await head
      .post(`${API}/users/${idOf(demoEmail(1, 'um'))}/disable`)
      .expect(204);
    await request(app.getHttpServer())
      .post(`${API}/dev/switch`)
      .send({ userId: idOf(demoEmail(1, 'um')) })
      .expect(401);
    await request(app.getHttpServer())
      .post(`${API}/dev/switch`)
      .send({ userId: 'nope' })
      .expect(400);
  });
});
