import type { INestApplication } from '@nestjs/common';
import request from 'supertest';
import { startApp, stopApp } from './support/app.js';
import { ownerDb } from './support/owner-db.js';
import { sha256 } from '../src/common/crypto.js';
import { demoEmail, seedDemoData } from '../src/seed/demo-data.js';

const API = '/api/v1';
const PASSWORD = 'demo-password-123';
const FC = '00100004';
const CLIENT = '9200000001';
type Agent = ReturnType<typeof request.agent>;

const DAY_MS = 86_400_000;
const TODAY = new Date(Date.now() + 7 * 3_600_000).toISOString().slice(0, 10);
const inDays = (days: number) =>
  new Date(Date.parse(`${TODAY}T00:00:00Z`) + days * DAY_MS)
    .toISOString()
    .slice(0, 10);
/** Noon in Vietnam on a day, so the day never shifts. */
const noon = (day: string) => new Date(`${day}T12:00:00+07:00`).toISOString();

/** Section 9.3: tasks, "Hôm nay" and the calendar (slice 6c). */
describe('Tasks, Today and calendar (e2e)', () => {
  let app: INestApplication;
  let head: Agent;
  let fc: Agent;
  let um: Agent;
  let head2: Agent;
  let leadId: string;
  const ids: Record<string, string> = {};

  const as = async (key: string, ga = 1) => {
    const agent = request.agent(app.getHttpServer());
    await agent
      .post(`${API}/auth/sign-in/email`)
      .send({ email: demoEmail(ga, key), password: PASSWORD })
      .expect(200);
    return agent;
  };
  const tasksOf = async (agent: Agent, query: Record<string, string> = {}) =>
    (await agent.get(`${API}/tasks`).query(query).expect(200)).body.items as {
      id: string;
      kind: string;
      title: string;
      source: string;
      status: string;
      canEdit: boolean;
    }[];

  beforeAll(async () => {
    app = await startApp();
    await seedDemoData(app, PASSWORD);
    [head, fc, um, head2] = await Promise.all([
      as('head'),
      as('fc'),
      as('um'),
      as('head', 2),
    ]);
    leadId = (
      await head
        .post(`${API}/leads`)
        .send({
          fullName: 'Lead Có Hẹn',
          phone: '0933000001',
          source: 'Facebook',
          consent: true,
          assignedAgentCode: FC,
        })
        .expect(201)
    ).body.id;
    // A client with a birthday this week and a premium due in three days
    await fc
      .post(`${API}/clients`)
      .send({
        clientCode: CLIENT,
        name: 'Khách Tuần Này',
        dob: `1990-${TODAY.slice(5)}`,
        policies: [
          {
            policyNo: '920000001',
            status: 'Đang hiệu lực',
            effectiveDate: '2024-06-01',
            maturityDate: '2044-06-01',
            premiumFrequency: 'Năm',
            basePremiumVnd: 12_000_000,
            premiumDueDate: inDays(3),
          },
        ],
      })
      .expect(201);
  });

  afterAll(async () => {
    await stopApp(app);
  });

  it('TASK-1: personal tasks stay with their maker; client tasks follow the client owner (NOTE-5)', async () => {
    ids.personal = (
      await head
        .post(`${API}/tasks`)
        .send({ title: 'Họp với DLVN', dueAt: noon(TODAY) })
        .expect(201)
    ).body.id;
    expect((await tasksOf(head)).map((task) => task.kind)).toEqual([
      'personal',
    ]);
    expect((await tasksOf(fc)).some((task) => task.id === ids.personal)).toBe(
      false,
    );
    await fc
      .patch(`${API}/tasks/${ids.personal}`)
      .send({ done: true })
      .expect(404);

    ids.signal = (
      await fc
        .post(`${API}/clients/${CLIENT}/tasks`)
        .send({
          title: 'Gọi chúc mừng sinh nhật',
          dueAt: noon(TODAY),
          signal: 'BIRTHDAY',
        })
        .expect(201)
    ).body.id;
    expect(
      (
        await um
          .post(`${API}/clients/${CLIENT}/tasks`)
          .send({ title: 'Quản lý', dueAt: noon(TODAY) })
          .expect(403)
      ).body.error,
    ).toBe('client_not_yours');
    const mine = await tasksOf(fc);
    expect(mine.find((task) => task.id === ids.signal)).toMatchObject({
      kind: 'client',
      source: 'SIGNAL',
      canEdit: true,
    });
    // LEAD-22: the automatic contact task of the lead is the FC's too
    expect(
      mine.some(
        (task) => task.kind === 'lead' && task.source === 'AUTO_ASSIGN',
      ),
    ).toBe(true);
    // A manager sees the line's tasks, read only
    const team = await tasksOf(um, { team: '1' });
    expect(team.find((task) => task.id === ids.signal)?.canEdit).toBe(false);
  });

  it('TASK-2: done, reopened, moved and cancelled through one route, with the rights of each kind', async () => {
    const leadTask = (await tasksOf(fc)).find((task) => task.kind === 'lead')!;
    await fc
      .patch(`${API}/tasks/${leadTask.id}`)
      .send({ done: true })
      .expect(204);
    expect(
      (await tasksOf(fc, { status: 'DONE' })).map((task) => task.id),
    ).toContain(leadTask.id);
    await fc
      .patch(`${API}/tasks/${leadTask.id}`)
      .send({ done: false })
      .expect(204);
    await fc
      .patch(`${API}/tasks/${leadTask.id}`)
      .send({ dueAt: noon(inDays(-1)) })
      .expect(204);
    expect(
      (
        await um
          .patch(`${API}/tasks/${leadTask.id}`)
          .send({ done: true })
          .expect(403)
      ).body.error,
    ).toBe('lead_not_yours');
    await um
      .patch(`${API}/tasks/${ids.signal}`)
      .send({ done: true })
      .expect(403);
    ids.cancel = (
      await fc
        .post(`${API}/tasks`)
        .send({ title: 'Việc nhầm', dueAt: noon(TODAY) })
        .expect(201)
    ).body.id;
    await fc
      .patch(`${API}/tasks/${ids.cancel}`)
      .send({ cancelled: true })
      .expect(204);
    expect(
      (await tasksOf(fc, { status: 'CANCELLED' })).map((task) => task.id),
    ).toEqual([ids.cancel]);
    await head2
      .patch(`${API}/tasks/${leadTask.id}`)
      .send({ done: true })
      .expect(404);
  });

  it("TASK-5: today's and late tasks first, lead counts, and the week's care opportunities", async () => {
    const { body } = await fc.get(`${API}/today`).expect(200);
    expect(
      body.tasks.overdue.map((task: { kind: string }) => task.kind),
    ).toEqual(['lead']);
    expect(
      body.tasks.today.map((task: { title: string }) => task.title),
    ).toEqual(['Gọi chúc mừng sinh nhật']);
    expect(body.leads).toMatchObject({ mine: 1 });
    expect(body.care.premiumDue).toEqual([
      expect.objectContaining({
        clientCode: CLIENT,
        policyNo: '920000001',
        date: inDays(3),
      }),
    ]);
    expect(body.care.birthdays).toEqual([
      expect.objectContaining({
        clientCode: CLIENT,
        date: TODAY,
        isToday: true,
      }),
    ]);
    expect(body.uploads).toBeNull();
    const headToday = (await head.get(`${API}/today`).expect(200)).body;
    expect(headToday.newLeadsToday).toBe(1);
    expect(
      headToday.uploads.find(
        (item: { agentCode: string }) => item.agentCode === FC,
      ),
    ).toMatchObject({
      lastUploadAt: null,
      stale: true,
    });
  });

  it('TASK-6: the calendar shows tasks and timed appointments; a private ICS feed that a new link replaces', async () => {
    await fc
      .patch(`${API}/leads/${leadId}`)
      .send({ stage: 'APPOINTMENT', nextActionAt: noon(inDays(2)) })
      .expect(200);
    const { body } = await fc
      .get(`${API}/calendar`)
      .query({ from: inDays(-3), to: inDays(10) })
      .expect(200);
    expect(body.appointments).toEqual([
      expect.objectContaining({ leadId, fullName: 'Lead Có Hẹn' }),
    ]);
    expect(body.tasks.length).toBeGreaterThanOrEqual(2);
    await fc
      .get(`${API}/calendar`)
      .query({ from: inDays(0), to: inDays(90) })
      .expect(400);

    const first = (await fc.post(`${API}/calendar/token`).expect(201)).body
      .url as string;
    const token = new URL(first).searchParams.get('token')!;
    const feed = await request(app.getHttpServer())
      .get(`${API}/calendar.ics`)
      .query({ token })
      .expect(200);
    expect(feed.headers['content-type']).toContain('text/calendar');
    expect(feed.text).toContain('SUMMARY:Gọi chúc mừng sinh nhật');
    expect(feed.text).toContain('SUMMARY:Lead Có Hẹn');
    expect(feed.text).not.toContain('0933000001');
    await request(app.getHttpServer())
      .get(`${API}/calendar.ics`)
      .query({ token: 'sai' })
      .expect(404);
    // TENANT-3: a suspended GA stops serving the feed; reactivating brings it back
    const setStatus = (status: string) =>
      ownerDb().query(
        `UPDATE tenants SET status = $2
          WHERE id = (SELECT tenant_id FROM calendar_tokens WHERE token_hash = $1)`,
        [sha256(token), status],
      );
    await setStatus('suspended');
    await request(app.getHttpServer())
      .get(`${API}/calendar.ics`)
      .query({ token })
      .expect(404);
    await setStatus('active');
    await request(app.getHttpServer())
      .get(`${API}/calendar.ics`)
      .query({ token })
      .expect(200);

    await fc.post(`${API}/calendar/token`).expect(201);
    await request(app.getHttpServer())
      .get(`${API}/calendar.ics`)
      .query({ token })
      .expect(404);
  });
});
