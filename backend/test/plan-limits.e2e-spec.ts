import type { INestApplication } from '@nestjs/common';
import request from 'supertest';
import { startApp, stopApp } from './support/app.js';
import { connection } from './support/collections.js';
import { demoEmail, seedDemoData } from '../src/seed/demo-data.js';

const API = '/api/v1';
const PASSWORD = 'demo-password-123';
type Agent = ReturnType<typeof request.agent>;

/** Section 5.2 + 16.17 + M13: plans and limits (slice 8a). */
describe('Plan limits and the platform console (e2e)', () => {
  let app: INestApplication;
  let platform: Agent;
  let head: Agent;
  let head2: Agent;
  let tenantId: string;

  const signIn = async (email: string, password = PASSWORD) => {
    const agent = request.agent(app.getHttpServer());
    await agent
      .post(`${API}/auth/sign-in/email`)
      .send({ email, password })
      .expect(200);
    return agent;
  };
  const seats = () =>
    connection.collection('users').countDocuments({
      tenantId: tenantId,
      status: { $ne: 'ARCHIVED' },
    });
  const invite = (email: string) =>
    head
      .post(`${API}/users/invite`)
      .send({ email, name: 'Người Mới', roles: ['MARKETING'] });

  beforeAll(async () => {
    app = await startApp();
    await seedDemoData(app, PASSWORD);
    platform = await signIn(
      process.env.PLATFORM_ADMIN_EMAIL!,
      process.env.PLATFORM_ADMIN_PASSWORD!,
    );
    head = await signIn(demoEmail(1, 'head'));
    head2 = await signIn(demoEmail(2, 'head'));
    tenantId = (await head.get(`${API}/me`).expect(200)).body.tenant.id;
  });

  afterAll(async () => {
    await stopApp(app);
  });

  it('Section 16.17: a new GA has no limits; only the platform sets them, within bounds', async () => {
    const list = (await platform.get(`${API}/platform/tenants`).expect(200))
      .body.items as { id: string; limits: unknown; users: number }[];
    const ga1 = list.find((item) => item.id === tenantId)!;
    expect(ga1.limits).toEqual({
      maxUsers: null,
      aiTokensPerMonth: null,
      storageMb: null,
    });
    expect(ga1.users).toBe(await seats());
    await head
      .patch(`${API}/platform/tenants/${tenantId}`)
      .send({ limits: { maxUsers: 100 } })
      .expect(403);
    await platform
      .patch(`${API}/platform/tenants/${tenantId}`)
      .send({ limits: { maxUsers: 0 } })
      .expect(400);
    await platform
      .patch(`${API}/platform/tenants/${tenantId}`)
      .send({
        plan: 'basic',
        limits: { maxUsers: await seats(), aiTokensPerMonth: 1000 },
      })
      .expect(204);
    const view = (await head.get(`${API}/settings`).expect(200)).body.plan;
    expect(view).toMatchObject({
      name: 'basic',
      limits: {
        maxUsers: await seats(),
        aiTokensPerMonth: 1000,
        storageMb: null,
      },
    });
    // Another GA keeps its own plan
    expect(
      (await head2.get(`${API}/settings`).expect(200)).body.plan.limits,
    ).toEqual({
      maxUsers: null,
      aiTokensPerMonth: null,
      storageMb: null,
    });
    expect(
      await connection.collection('auditEvents').countDocuments({
        entity: 'tenant',
        'meta.limits.maxUsers': { $exists: true },
      }),
    ).toBe(1);
  });

  it('Section 5.2: a full plan refuses new users; archiving frees a seat, reactivating takes one', async () => {
    const full = await invite('khong.cho@ga1.gacrm.local').expect(409);
    expect(full.body.error).toBe('plan_user_limit');

    const marketing = await connection
      .collection('users')
      .findOne({ email: demoEmail(1, 'marketing') });
    await head
      .post(`${API}/users/${marketing!._id.toString()}/archive`)
      .send({})
      .expect(204);
    await invite('cho.moi@ga1.gacrm.local').expect(201);
    const back = await head
      .post(`${API}/users/${marketing!._id.toString()}/reactivate`)
      .expect(409);
    expect(back.body.error).toBe('plan_user_limit');

    // null lifts the limit again
    await platform
      .patch(`${API}/platform/tenants/${tenantId}`)
      .send({ limits: { maxUsers: null } })
      .expect(204);
    await head
      .post(`${API}/users/${marketing!._id.toString()}/reactivate`)
      .expect(200);
    // Other limits stay as they were
    expect(
      (await head.get(`${API}/settings`).expect(200)).body.plan.limits,
    ).toMatchObject({
      maxUsers: null,
      aiTokensPerMonth: 1000,
    });
  });

  it('Section 5.2 + AI-13: the GA token limit stays within the plan', async () => {
    const base = {
      enabled: false,
      tiers: {
        FAST: { provider: 'gemini', model: 'gemini-3.5-flash-lite' },
        BALANCED: { provider: 'gemini', model: 'gemini-3.5-flash' },
        DEEP: { provider: 'gemini', model: 'gemini-3.1-pro-preview' },
      },
      router: { provider: 'gemini', model: 'gemini-3.5-flash-lite' },
    };
    for (const monthlyTokenLimit of [0, 2000]) {
      const { body } = await head
        .put(`${API}/ai/admin/settings`)
        .send({ ...base, monthlyTokenLimit })
        .expect(400);
      expect(body.error).toBe('plan_ai_limit');
    }
    await head
      .put(`${API}/ai/admin/settings`)
      .send({ ...base, monthlyTokenLimit: 800 })
      .expect(204);
    expect(
      (await head.get(`${API}/ai/admin/settings`).expect(200)).body
        .planTokenLimit,
    ).toBe(1000);
    // No plan limit: 0 (no limit) is fine
    await head2
      .put(`${API}/ai/admin/settings`)
      .send({ ...base, monthlyTokenLimit: 0 })
      .expect(204);
  });

  it("USER-16 + TEN-6: the platform resets a GA user's MFA, audited as a cross-tenant act", async () => {
    const headUser = await connection
      .collection('users')
      .findOne({ email: demoEmail(1, 'head') });
    await connection.collection('users').updateOne(
      { _id: headUser!._id },
      {
        $set: { mfaEnabled: true, mfaSecret: 'a.b', mfaRecoveryCodes: ['x'] },
      },
    );
    await head2
      .post(
        `${API}/platform/tenants/${tenantId}/users/${headUser!._id.toString()}/mfa/reset`,
      )
      .expect(403);
    await platform
      .post(
        `${API}/platform/tenants/${tenantId}/users/${headUser!._id.toString()}/mfa/reset`,
      )
      .expect(204);
    const after = await connection
      .collection('users')
      .findOne({ _id: headUser!._id });
    expect(after).toMatchObject({ mfaEnabled: false });
    expect(after!.mfaSecret).toBeUndefined();
    expect(
      await connection.collection('auditEvents').countDocuments({
        action: 'CROSS_TENANT_READ',
        entityId: tenantId,
      }),
    ).toBeGreaterThanOrEqual(1);
    expect(
      await connection.collection('auditEvents').countDocuments({
        entity: 'mfa',
        'meta.mfa': 'reset',
      }),
    ).toBe(1);
    // The head was signed out everywhere
    await head.get(`${API}/me`).expect(401);
  });
});
