import type { INestApplication } from '@nestjs/common';
import request from 'supertest';
import { startApp, stopApp } from './support/app.js';
import { connection } from './support/collections.js';
import { RemindersService } from '../src/modules/work/reminders.service.js';
import { demoEmail, seedDemoData } from '../src/seed/demo-data.js';

const API = '/api/v1';
const PASSWORD = 'demo-password-123';
const FC = '00100004';
const BM = '00100002';
type Agent = ReturnType<typeof request.agent>;
type Item = {
  id: string;
  type: string;
  data: Record<string, string | number>;
  subject: string | null;
  link: string;
  read: boolean;
};

const DAY_MS = 86_400_000;
const TODAY = new Date(Date.now() + 7 * 3_600_000).toISOString().slice(0, 10);
const inDays = (days: number) =>
  new Date(Date.parse(`${TODAY}T00:00:00Z`) + days * DAY_MS)
    .toISOString()
    .slice(0, 10);
/** An instant in Vietnam time. */
const vn = (day: string, time: string) => new Date(`${day}T${time}:00+07:00`);

/** Chapter 15 (NTF), TASK-7, SIG-2: slice 6d. */
describe('Notifications (e2e)', () => {
  let app: INestApplication;
  let reminders: RemindersService;
  let head: Agent;
  let fc: Agent;
  let um: Agent;
  let head2: Agent;
  let tenantId: string;
  const userIds: Record<string, string> = {};
  let leadId: string;

  const as = async (key: string, ga = 1) => {
    const agent = request.agent(app.getHttpServer());
    await agent
      .post(`${API}/auth/sign-in/email`)
      .send({ email: demoEmail(ga, key), password: PASSWORD })
      .expect(200);
    return agent;
  };
  const inbox = async (agent: Agent, query: Record<string, string> = {}) =>
    (
      await agent
        .get(`${API}/notifications`)
        .query({ pageSize: '50', ...query })
        .expect(200)
    ).body as { items: Item[]; total: number; unread: number };
  /** Notifications of one user and type, straight from the database. */
  const stored = (key: string, type: string) =>
    connection
      .collection('notifications')
      .find({ tenantId, userId: userIds[key], type })
      .sort({ _id: 1 })
      .toArray();

  beforeAll(async () => {
    app = await startApp();
    reminders = app.get(RemindersService);
    await seedDemoData(app, PASSWORD);
    [head, fc, um, head2] = await Promise.all([
      as('head'),
      as('fc'),
      as('um'),
      as('head', 2),
    ]);
    tenantId = (await head.get(`${API}/me`).expect(200)).body.tenant
      .id as string;
    for (const key of ['head', 'fc', 'um', 'bm']) {
      const user = await connection
        .collection('users')
        .findOne({ email: demoEmail(1, key) });
      userIds[key] = user!._id;
    }
  });

  afterAll(async () => {
    await stopApp(app);
  });

  it('NTF-2: an assignee hears about a new lead, by name in the app; the one who assigned does not', async () => {
    leadId = (
      await head
        .post(`${API}/leads`)
        .send({
          fullName: 'Lead Thông Báo',
          phone: '0934000001',
          source: 'Facebook',
          consent: true,
          assignedAgentCode: FC,
        })
        .expect(201)
    ).body.id;
    const { items, unread } = await inbox(fc);
    const notice = items.find((item) => item.type === 'LEAD_ASSIGNED');
    expect(notice).toMatchObject({
      data: { count: 1, leadId },
      subject: 'Lead Thông Báo',
      link: `/leads/${leadId}`,
      read: false,
    });
    expect(unread).toBe(1);
    // NTF-4: nothing stored holds the phone or the name
    const [raw] = await stored('fc', 'LEAD_ASSIGNED');
    expect(JSON.stringify(raw)).not.toMatch(/0934000001|Thông Báo/);
    expect((await inbox(head)).total).toBe(0);
    expect(
      (await fc.get(`${API}/notifications/unread`).expect(200)).body,
    ).toEqual({ unread: 1 });
  });

  it('NTF-2: assigning several leads at once is one notice ("n lead")', async () => {
    const ids: string[] = [];
    for (const phone of ['0934000002', '0934000003'])
      ids.push(
        (
          await head
            .post(`${API}/leads`)
            .send({ fullName: 'Lead Lô', phone, source: 'Facebook', consent: true })
            .expect(201)
        ).body.id,
      );
    await head
      .post(`${API}/leads/assign`)
      .send({ leadIds: ids, agentCode: FC })
      .expect(201);
    const notices = await stored('fc', 'LEAD_ASSIGNED');
    expect(notices).toHaveLength(2);
    expect(notices[1]).toMatchObject({
      data: { count: 2 },
      link: '/leads?tab=isNew',
    });
  });

  it('CMT-5: the assignee hears about a comment by someone else, not about their own', async () => {
    await head
      .post(`${API}/leads/${leadId}/comments`)
      .send({ body: 'Gọi lại trong hôm nay nhé' })
      .expect(201);
    await fc
      .post(`${API}/leads/${leadId}/comments`)
      .send({ body: 'Dạ em gọi rồi' })
      .expect(201);
    const notices = await stored('fc', 'LEAD_COMMENT');
    expect(notices).toHaveLength(1);
    expect(notices[0]).toMatchObject({ link: `/leads/${leadId}` });
  });

  it('NTF-3: a user turns an event off and stops receiving it', async () => {
    await fc
      .put(`${API}/notifications/prefs`)
      .send({ items: [{ type: 'LEAD_COMMENT', inApp: false }] })
      .expect(204);
    await fc
      .put(`${API}/notifications/prefs`)
      .send({ items: [{ type: 'NOT_A_TYPE', inApp: false }] })
      .expect(400);
    const prefs = (await fc.get(`${API}/notifications/prefs`).expect(200))
      .body.items as { type: string; inApp: boolean }[];
    expect(prefs.find((item) => item.type === 'LEAD_COMMENT')?.inApp).toBe(
      false,
    );
    expect(prefs.find((item) => item.type === 'TASK_DUE')?.inApp).toBe(true);
    await head
      .post(`${API}/leads/${leadId}/comments`)
      .send({ body: 'Thêm một góp ý' })
      .expect(201);
    expect(await stored('fc', 'LEAD_COMMENT')).toHaveLength(1);
    await fc
      .put(`${API}/notifications/prefs`)
      .send({ items: [{ type: 'LEAD_COMMENT', inApp: true }] })
      .expect(204);
  });

  it('NTF-2 + ASG-1: an agent hears about clients newly given to them', async () => {
    await um
      .post(`${API}/clients`)
      .send({ clientCode: '9400000001', name: 'Khách Được Giao' })
      .expect(201);
    await head
      .post(`${API}/clients/assign`)
      .send({ clientCodes: ['9400000001'], agentCode: FC })
      .expect(200);
    const { items } = await inbox(fc);
    expect(items.find((item) => item.type === 'CLIENT_ASSIGNED')).toMatchObject(
      {
        data: { count: 1, clientCode: '9400000001' },
        subject: 'Khách Được Giao',
        link: '/clients/9400000001',
      },
    );
  });

  it('Section 17.12: marking read touches only one\'s own notifications (TEN-7)', async () => {
    const before = await inbox(fc);
    const first = before.items[0];
    expect((await inbox(head2)).items).toHaveLength(0);
    // GA-2 cannot mark GA-1's notifications
    await head2
      .post(`${API}/notifications/read`)
      .send({ ids: [first.id] })
      .expect(204);
    expect((await inbox(fc)).unread).toBe(before.unread);
    await fc
      .post(`${API}/notifications/read`)
      .send({ ids: [first.id] })
      .expect(204);
    const after = await inbox(fc);
    expect(after.unread).toBe(before.unread - 1);
    expect(after.items.find((item) => item.id === first.id)?.read).toBe(true);
    expect(
      (await inbox(fc, { unreadOnly: 'true' })).items.every(
        (item) => !item.read,
      ),
    ).toBe(true);
    await fc.post(`${API}/notifications/read`).send({ all: true }).expect(204);
    expect((await inbox(fc)).unread).toBe(0);
    await request(app.getHttpServer()).get(`${API}/notifications`).expect(401);
  });

  it('TASK-7: a task due now is reminded once', async () => {
    const dueAt = vn(inDays(1), '12:00');
    const taskId = (
      await fc
        .post(`${API}/tasks`)
        .send({ title: 'Gửi bảng minh họa', dueAt: dueAt.toISOString() })
        .expect(201)
    ).body.id as string;
    await reminders.tick(new Date(dueAt.getTime() + 60_000));
    await reminders.tick(new Date(dueAt.getTime() + 120_000));
    const notices = (await stored('fc', 'TASK_DUE')).filter(
      (item) => item.data.taskId === taskId,
    );
    expect(notices).toHaveLength(1);
    const { items } = await inbox(fc);
    expect(
      items.find((item) => item.data.taskId === taskId),
    ).toMatchObject({ subject: 'Gửi bảng minh họa', link: '/tasks' });
  });

  it('TASK-7: 15 minutes before an appointment', async () => {
    const at = vn(inDays(2), '10:00');
    await connection
      .collection('leads')
      .updateOne(
        { _id: leadId },
        { $set: { stage: 'APPOINTMENT', nextActionAt: at } },
      );
    await reminders.tick(new Date(at.getTime() - 20 * 60_000));
    expect(await stored('fc', 'APPOINTMENT_SOON')).toHaveLength(0);
    await reminders.tick(new Date(at.getTime() - 10 * 60_000));
    await reminders.tick(new Date(at.getTime() - 9 * 60_000));
    const notices = await stored('fc', 'APPOINTMENT_SOON');
    expect(notices).toHaveLength(1);
    expect(notices[0].data).toMatchObject({ leadId });
  });

  it('NTF-2: a lead close to its contact deadline (LEAD-29) warns the assignee once', async () => {
    const soon = new Date(Date.now() + 45 * 3_600_000);
    await reminders.tick(soon);
    await reminders.tick(new Date(soon.getTime() + 60_000));
    const notices = await stored('fc', 'LEAD_DEADLINE_SOON');
    expect(notices).toHaveLength(1);
    // The three leads assigned above, none contacted yet
    expect(notices[0].data).toMatchObject({ count: 3 });
  });

  it('SIG-2 + TASK-7: the morning round waits for quiet hours to end and runs once a day', async () => {
    // A client with a premium due in 4 days and a birthday in 4 days
    const birthday = inDays(5);
    await fc
      .post(`${API}/clients`)
      .send({
        clientCode: '9400000002',
        name: 'Khách Sắp Đến Hạn',
        dob: `1985-${birthday.slice(5)}`,
        policies: [
          {
            policyNo: '940000002',
            status: 'Đang hiệu lực',
            effectiveDate: '2024-06-01',
            maturityDate: '2044-06-01',
            premiumFrequency: 'Năm',
            basePremiumVnd: 10_000_000,
            premiumDueDate: inDays(7),
          },
        ],
      })
      .expect(201);
    await fc
      .post(`${API}/tasks`)
      .send({ title: 'Việc để quá hạn', dueAt: vn(inDays(1), '08:00').toISOString() })
      .expect(201);

    const morning = inDays(3);
    const overdueBefore = (await stored('fc', 'TASKS_OVERDUE')).length;
    // 06:00 is still quiet (21:00-07:30)
    await reminders.tick(vn(morning, '06:00'));
    expect(await stored('fc', 'TASKS_OVERDUE')).toHaveLength(overdueBefore);
    await reminders.tick(vn(morning, '07:30'));
    await reminders.tick(vn(morning, '07:31'));
    const overdue = await stored('fc', 'TASKS_OVERDUE');
    expect(overdue).toHaveLength(overdueBefore + 1);
    expect(overdue.at(-1)!.data.count).toBeGreaterThanOrEqual(1);

    // Premium due within 7 days and birthday within 3 days of the morning
    const signals = await stored('fc', 'CLIENT_SIGNALS');
    expect(signals).toHaveLength(1);
    expect(signals[0].data).toMatchObject({ premiumDue: 1, birthdays: 1 });
    // The next morning has nothing new to say about the same client
    await reminders.tick(vn(inDays(4), '08:00'));
    expect(await stored('fc', 'CLIENT_SIGNALS')).toHaveLength(1);

    // Managers: the overdue leads of their line (the three leads are past 48 hours by now)
    const team = await stored('head', 'TEAM_OVERDUE');
    expect(team.length).toBeGreaterThanOrEqual(1);
    expect(team.at(-1)!.data.count).toBeGreaterThanOrEqual(3);
    expect(await stored('fc', 'TEAM_OVERDUE')).toHaveLength(0);
  });

  it('Section 5.2 + NTF-3: GA_HEAD sets quiet hours', async () => {
    const view = (await head.get(`${API}/settings`).expect(200)).body;
    expect(view.notifications.quietHours).toEqual({
      from: '21:00',
      to: '07:30',
    });
    await head
      .put(`${API}/settings`)
      .send({
        version: view.version,
        notifications: { quietHours: { from: '22:00', to: '25:00' } },
      })
      .expect(400);
    await head
      .put(`${API}/settings`)
      .send({
        version: view.version,
        notifications: { quietHours: { from: '22:00', to: '06:00' } },
      })
      .expect(204);
    expect(
      (await head.get(`${API}/settings`).expect(200)).body.notifications,
    ).toEqual({ quietHours: { from: '22:00', to: '06:00' } });
  });

  it('NTF-2: the inviter hears that an invite was accepted', async () => {
    const { inviteUrl } = (
      await head
        .post(`${API}/users/invite`)
        .send({
          email: 'moi.thongbao@ga1.gacrm.local',
          name: 'Người Mới',
          roles: ['MARKETING'],
        })
        .expect(201)
    ).body as { inviteUrl: string };
    const token = /([A-Za-z0-9_-]{20,})\/?$/.exec(inviteUrl)![1];
    await request(app.getHttpServer())
      .post(`${API}/invites/accept`)
      .send({ token, password: 'Thong-Bao-2026!x' })
      .expect(201);
    const { items } = await inbox(head);
    expect(items.find((item) => item.type === 'INVITE_ACCEPTED')).toMatchObject(
      { subject: 'Người Mới', link: '/users' },
    );
  });

  it('NTF-5: a disabled user receives nothing', async () => {
    await head.post(`${API}/users/${userIds.bm.toString()}/disable`).expect(204);
    await head
      .post(`${API}/leads`)
      .send({
        fullName: 'Lead Cho Người Nghỉ',
        phone: '0934000009',
        source: 'Facebook',
        consent: true,
        assignedAgentCode: BM,
      })
      .expect(201);
    expect(await stored('bm', 'LEAD_ASSIGNED')).toHaveLength(0);
  });
});
