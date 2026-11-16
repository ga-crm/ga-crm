import type { INestApplication } from '@nestjs/common';
import request from 'supertest';
import { startApp, stopApp } from './support/app.js';
import { connection } from './support/collections.js';
import { demoEmail, seedDemoData } from '../src/seed/demo-data.js';

const API = '/api/v1';
const PASSWORD = 'demo-password-123';
const FC = '00100004';
type Agent = ReturnType<typeof request.agent>;

/** Section 5.2: Cài đặt GA. */
describe('GA settings (e2e)', () => {
  let app: INestApplication;
  let head: Agent;

  const as = async (key: string, ga = 1) => {
    const agent = request.agent(app.getHttpServer());
    await agent
      .post(`${API}/auth/sign-in/email`)
      .send({ email: demoEmail(ga, key), password: PASSWORD })
      .expect(200);
    return agent;
  };
  const read = async (agent: Agent) =>
    (await agent.get(`${API}/settings`).expect(200)).body;

  beforeAll(async () => {
    app = await startApp();
    await seedDemoData(app, PASSWORD);
    head = await as('head');
  });

  afterAll(async () => {
    await stopApp(app);
  });

  it('section 5.2: GA_HEAD reads the settings with their defaults, the plan and a version', async () => {
    const body = await read(head);
    expect(body).toMatchObject({
      version: 0,
      profile: { displayName: '', address: '' },
      leadRules: {
        contactDeadlineHours: 48,
        contactedInTimeHours: 24,
        managersMayReassign: false,
        consentForTelesales: true,
      },
      plan: { name: 'standard' },
    });
    expect(body.plan.users).toBeGreaterThan(0);
  });

  it('section 5.2: only GA_HEAD reads or changes the settings; the API refuses everyone else', async () => {
    for (const key of ['admin', 'marketing', 'fc']) {
      const agent = await as(key);
      await agent.get(`${API}/settings`).expect(403);
      await agent
        .put(`${API}/settings`)
        .send({ version: 0, profile: { displayName: 'Chiếm' } })
        .expect(403);
    }
  });

  it("section 5.2 + TENANT-1: a display name shows in everyone's header, is audited, and clearing it restores the platform name", async () => {
    const before = await read(head);
    await head
      .put(`${API}/settings`)
      .send({
        version: before.version,
        profile: {
          displayName: '  GA Bắc Từ Liêm ',
          address: '12 Phạm Văn Đồng',
        },
      })
      .expect(204);
    const fc = await as('fc');
    expect((await fc.get(`${API}/me`).expect(200)).body.tenant.name).toBe(
      'GA Bắc Từ Liêm',
    );

    const after = await read(head);
    expect(after.version).toBe(before.version + 1);
    expect(after.profile).toEqual({
      displayName: 'GA Bắc Từ Liêm',
      address: '12 Phạm Văn Đồng',
    });
    // Sending only the profile leaves the lead rules alone
    expect(after.leadRules.contactDeadlineHours).toBe(48);

    const event = await connection
      .collection('auditEvents')
      .findOne({ action: 'SETTINGS_CHANGE' }, { sort: { _id: -1 } });
    expect(event?.entity).toBe('settings');
    // Mongoose drops the empty profile object, so "before" may have no profile at all
    expect(event?.meta.before.profile?.displayName).toBeUndefined();
    expect(event?.meta.after.profile.displayName).toBe('GA Bắc Từ Liêm');

    await head
      .put(`${API}/settings`)
      .send({ version: after.version, profile: { displayName: '' } })
      .expect(204);
    expect((await fc.get(`${API}/me`).expect(200)).body.tenant.name).toBe(
      after.gaName,
    );
  });

  it('section 5.2: a form opened before someone else saved is refused with stale_settings', async () => {
    const opened = await read(head);
    const other = await as('head');
    await other
      .put(`${API}/settings`)
      .send({
        version: opened.version,
        leadRules: { contactedInTimeHours: 12 },
      })
      .expect(204);
    const late = await head
      .put(`${API}/settings`)
      .send({
        version: opened.version,
        leadRules: { contactedInTimeHours: 36 },
      })
      .expect(409);
    expect(late.body.error).toBe('stale_settings');
    expect((await read(head)).leadRules.contactedInTimeHours).toBe(12);
  });

  it('section 5.2: values are checked', async () => {
    const { version } = await read(head);
    for (const leadRules of [
      { contactDeadlineHours: 0 },
      { contactDeadlineHours: 721 },
      { contactDeadlineHours: 1.5 },
      { contactedInTimeHours: '24' },
    ]) {
      await head
        .put(`${API}/settings`)
        .send({ version, leadRules })
        .expect(400);
    }
    await head
      .put(`${API}/settings`)
      .send({ version, profile: { address: 'x'.repeat(301) } })
      .expect(400);
    await head.put(`${API}/settings`).send({}).expect(400);
    expect((await read(head)).version).toBe(version);
  });

  it("LEAD-29 + LEAD-22: the GA's contact deadline drives overdue leads and the automatic task", async () => {
    const marketing = await as('marketing');
    const { version } = await read(head);
    await head
      .put(`${API}/settings`)
      .send({ version, leadRules: { contactDeadlineHours: 2 } })
      .expect(204);
    expect(
      (await marketing.get(`${API}/me`).expect(200)).body.settings.leadRules
        .contactDeadlineHours,
    ).toBe(2);

    const { id } = (
      await marketing
        .post(`${API}/leads`)
        .send({
          fullName: 'Hạn Ngắn',
          phone: '0861234567',
          source: 'Facebook',
          consent: false,
        })
        .expect(201)
    ).body;
    await marketing
      .post(`${API}/leads/assign`)
      .send({ leadIds: [id], agentCode: FC })
      .expect(201);
    const task = await connection.collection('tasks').findOne({
      leadId: id,
      source: 'AUTO_ASSIGN',
      status: 'OPEN',
    });
    expect(task?.title).toBe('Liên hệ khách hàng trong 2 giờ');
    const lead = await connection.collection('leads').findOne({ _id: id });
    expect(task?.dueAt.getTime() - lead?.assignedAt.getTime()).toBe(
      2 * 3_600_000,
    );

    // Assigned three hours ago: overdue under 2 hours, not under the default 48
    await connection
      .collection('leads')
      .updateOne(
        { _id: id },
        { $set: { assignedAt: new Date(Date.now() - 3 * 3_600_000) } },
      );
    const overdue = async () =>
      (
        await marketing
          .get(`${API}/leads`)
          .query({ overdue: 1, q: 'Hạn Ngắn' })
          .expect(200)
      ).body.items as { id: string; overdue: boolean }[];
    expect(await overdue()).toEqual([
      expect.objectContaining({ id, overdue: true }),
    ]);
    expect(
      (await marketing.get(`${API}/leads/${id}`).expect(200)).body.lead.overdue,
    ).toBe(true);
    const counts = (await marketing.get(`${API}/leads/counts`).expect(200))
      .body;
    expect(counts.overdue).toBeGreaterThan(0);

    await head
      .put(`${API}/settings`)
      .send({ version: version + 1, leadRules: { contactDeadlineHours: 48 } })
      .expect(204);
    expect(await overdue()).toEqual([]);
  });

  it('TEN-7: GA-2 keeps its own settings', async () => {
    const head2 = await as('head', 2);
    expect(await read(head2)).toMatchObject({
      version: 0,
      profile: { displayName: '' },
      leadRules: { contactDeadlineHours: 48 },
    });
  });
});
