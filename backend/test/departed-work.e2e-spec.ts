import type { INestApplication } from '@nestjs/common';
import request from 'supertest';
import { startApp, stopApp } from './support/app.js';
import { ownerDb } from './support/owner-db.js';
import { demoEmail, seedDemoData } from '../src/seed/demo-data.js';

const API = '/api/v1';
const PASSWORD = 'demo-password-123';
const BM = '00100002';
const UM = '00100003';
const FC = '00100004';
type Agent = ReturnType<typeof request.agent>;
type Work = { items: { agentCode: string; status: string; openLeads: number; clients: number }[]; openLeads: number; clients: number };

/** Open question 12e (decided 14/11/2026): reminding the GA of work left by people who have gone. */
describe('Work left by people who have gone (e2e)', () => {
  let app: INestApplication;
  let head: Agent;
  let admin: Agent;
  let fc: Agent;
  let um: Agent;
  let head2: Agent;
  let fcId: string;
  const leadIds: string[] = [];
  let phone = 913_400_000;

  const as = async (key: string, ga = 1) => {
    const agent = request.agent(app.getHttpServer());
    await agent.post(`${API}/auth/sign-in/email`).send({ email: demoEmail(ga, key), password: PASSWORD }).expect(200);
    return agent;
  };
  const lead = async (agentCode: string) => {
    const { body } = await head
      .post(`${API}/leads`)
      .send({ fullName: `Khách ${phone}`, phone: `0${phone++}`, source: 'Facebook', consent: true })
      .expect(201);
    await head.post(`${API}/leads/assign`).send({ leadIds: [body.id], agentCode }).expect(201);
    return body.id as string;
  };
  const work = async (agent: Agent = head) => (await agent.get(`${API}/leads/departed`).expect(200)).body as Work;

  beforeAll(async () => {
    app = await startApp();
    await seedDemoData(app, PASSWORD);
    [head, admin, fc, um, head2] = await Promise.all([as('head'), as('admin'), as('fc'), as('um'), as('head', 2)]);
    for (let index = 0; index < 3; index++) leadIds.push(await lead(FC));
    await fc
      .post(`${API}/clients`)
      .send({ policyNo: '700000001', role: 'PO', name: 'Khách Của FC', dob: '1980-01-01' })
      .expect(201);
    const { rows } = await ownerDb().query<{ id: string }>(`SELECT id FROM users WHERE email = $1`, [demoEmail(1, 'fc')]);
    fcId = rows[0].id;
  });

  afterAll(async () => {
    await stopApp(app);
  });

  it('nothing is listed while everyone still works here', async () => {
    expect(await work()).toEqual({ items: [], openLeads: 0, clients: 0 });
  });

  it('once disabled, the person\'s open leads and clients are listed; closed leads do not count', async () => {
    await ownerDb().query(`UPDATE leads SET care_status = 'WON' WHERE id = $1`, [leadIds[2]]);
    await admin.post(`${API}/users/${fcId}/disable`).expect(204);

    const after = await work();
    expect(after.items).toEqual([{ agentCode: FC, name: expect.any(String), status: 'DISABLED', openLeads: 2, clients: 1 }]);
    expect(after.openLeads).toBe(2);
  });

  it('the GA head hears about it when someone else disabled the account, with a link to the leads', async () => {
    const { rows } = await ownerDb().query<{ data: Record<string, unknown>; link: string }>(
      `SELECT n.data, n.link FROM notifications n JOIN users u ON u.id = n.user_id
        WHERE n.type = 'DEPARTED_WORK' AND u.email = $1`,
      [demoEmail(1, 'head')],
    );
    expect(rows).toEqual([{ data: { userId: fcId, leads: 2, clients: 1 }, link: `/leads?assignee=${FC}` }]);
    const listed = (await head.get(`${API}/notifications`).expect(200)).body.items as { type: string; subject: string }[];
    expect(listed.find((item) => item.type === 'DEPARTED_WORK')?.subject).toBeTruthy();
  });

  it('the lead list filters them with assignee=DEPARTED, and reassigning clears the reminder', async () => {
    const { body } = await head.get(`${API}/leads?assignee=DEPARTED&pageSize=50`).expect(200);
    expect((body.items as { id: string }[]).map((item) => item.id).sort()).toEqual([...leadIds].sort());

    await head.post(`${API}/leads/assign`).send({ leadIds: leadIds.slice(0, 2), agentCode: UM }).expect(201);
    const after = await work();
    expect(after.items).toEqual([expect.objectContaining({ agentCode: FC, openLeads: 0, clients: 1 })]);
  });

  it('archiving the same person later does not notify again', async () => {
    await head.post(`${API}/users/${fcId}/archive`).send({ reason: 'Nghỉ việc' }).expect((res) => expect(res.status).toBeLessThan(300));
    const { rows } = await ownerDb().query(
      `SELECT 1 FROM notifications n JOIN users u ON u.id = n.user_id WHERE n.type = 'DEPARTED_WORK' AND u.email = $1`,
      [demoEmail(1, 'head')],
    );
    expect(rows).toHaveLength(1);
    expect((await work()).items[0].status).toBe('ARCHIVED');
  });

  it('AGT-7: an agent who stopped working counts too, even with no account change', async () => {
    await lead(BM);
    await ownerDb().query(`UPDATE agents SET status = 'Ngưng hoạt động' WHERE agent_code = $1`, [BM]);
    expect((await work()).items).toEqual(expect.arrayContaining([expect.objectContaining({ agentCode: BM, status: 'STOPPED', openLeads: 1 })]));
  });

  it('only lead managers see it (403 otherwise); another GA sees only its own (TEN-7)', async () => {
    await um.get(`${API}/leads/departed`).expect(403);
    expect(await work(head2)).toEqual({ items: [], openLeads: 0, clients: 0 });
  });
});
