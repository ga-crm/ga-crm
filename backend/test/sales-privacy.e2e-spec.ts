import type { INestApplication } from '@nestjs/common';
import request from 'supertest';
import { startApp, stopApp } from './support/app.js';
import { demoEmail, seedDemoData } from '../src/seed/demo-data.js';

const API = '/api/v1';
const PASSWORD = 'demo-password-123';
const FC = '00100004';
const LEAD_PHONE = '0912000444';
const LEAD_MASKED = '0912***444';
const CLIENT_PHONE = '0912000555';
const CLIENT_MASKED = '0912***555';
type Agent = ReturnType<typeof request.agent>;

/**
 * Decided 27/11/2026: every role is a sales person. A customer's phone (lead or client) is for
 * whoever looks after the customer and the GA director; Admin sees every customer without the
 * phone; a line manager sees only their own customers, not those of their line.
 */
describe('Customers stay with whoever looks after them (e2e)', () => {
  let app: INestApplication;
  let director: Agent;
  let admin: Agent;
  let um: Agent;
  let fc: Agent;
  let director2: Agent;
  let leadId: string;
  let clientId: string;

  const as = async (key: string, ga = 1) => {
    const agent = request.agent(app.getHttpServer());
    await agent
      .post(`${API}/auth/sign-in/email`)
      .send({ email: demoEmail(ga, key), password: PASSWORD })
      .expect(200);
    return agent;
  };

  beforeAll(async () => {
    app = await startApp();
    await seedDemoData(app, PASSWORD);
    [director, admin, um, fc, director2] = await Promise.all([
      as('head'),
      as('admin'),
      as('um'),
      as('fc'),
      as('head', 2),
    ]);
    leadId = (
      await admin
        .post(`${API}/leads`)
        .send({
          fullName: 'Khách Riêng Của FC',
          phone: LEAD_PHONE,
          source: 'Facebook',
          assignedAgentCode: FC,
        })
        .expect(201)
    ).body.id as string;
    clientId = (
      await fc
        .post(`${API}/clients`)
        .send({
          policyNo: '960000001',
          role: 'PO',
          name: 'Khách Hợp Đồng Của FC',
          phone: CLIENT_PHONE,
        })
        .expect(201)
    ).body.id as string;
  });

  afterAll(async () => {
    await stopApp(app);
  });

  it('a lead: its agent and the director see the phone; Admin sees the rest masked; the line manager sees nothing', async () => {
    expect(
      (await fc.get(`${API}/leads/${leadId}`).expect(200)).body.lead.phone,
    ).toBe(LEAD_PHONE);
    expect(
      (await director.get(`${API}/leads/${leadId}`).expect(200)).body.lead
        .phone,
    ).toBe(LEAD_PHONE);

    const seen = (await admin.get(`${API}/leads/${leadId}`).expect(200)).body;
    expect(seen.lead).toMatchObject({
      fullName: 'Khách Riêng Của FC',
      phone: LEAD_MASKED,
    });
    expect(JSON.stringify(seen)).not.toContain(LEAD_PHONE);
    // A number Admin only sees masked does not find the lead
    expect(
      (await admin.get(`${API}/leads`).query({ q: LEAD_PHONE }).expect(200))
        .body.items,
    ).toEqual([]);
    expect(
      (
        (await director.get(`${API}/leads`).query({ q: LEAD_PHONE }))
          .body as { items: { id: string }[] }
      ).items.map((item) => item.id),
    ).toContain(leadId);

    // The FC's line manager: not in the list, not on the board, not by id
    await um.get(`${API}/leads/${leadId}`).expect(404);
    const listed = (await um.get(`${API}/leads`).expect(200)).body.items as {
      id: string;
    }[];
    expect(listed.some((item) => item.id === leadId)).toBe(false);
    expect(
      JSON.stringify((await um.get(`${API}/leads/board`).expect(200)).body),
    ).not.toContain('Khách Riêng Của FC');
  });

  it('a client: its agent and the director see the phone; Admin sees it masked; the line manager sees nothing', async () => {
    expect(
      (await fc.get(`${API}/clients/${clientId}`).expect(200)).body.client
        .phone,
    ).toBe(CLIENT_PHONE);
    expect(
      (await director.get(`${API}/clients/${clientId}`).expect(200)).body
        .client.phone,
    ).toBe(CLIENT_PHONE);

    const seen = (await admin.get(`${API}/clients/${clientId}`).expect(200))
      .body;
    expect(seen.client).toMatchObject({
      name: 'Khách Hợp Đồng Của FC',
      phone: CLIENT_MASKED,
    });
    expect(JSON.stringify(seen)).not.toContain(CLIENT_PHONE);
    const all = (
      await admin.get(`${API}/clients`).query({ agents: 'ALL' }).expect(200)
    ).body.items as { id: string; phone: string }[];
    expect(all.find((item) => item.id === clientId)?.phone).toBe(
      CLIENT_MASKED,
    );
    expect(
      (
        await admin
          .get(`${API}/clients`)
          .query({ agents: 'ALL', q: CLIENT_PHONE })
          .expect(200)
      ).body.items,
    ).toEqual([]);

    await um.get(`${API}/clients/${clientId}`).expect(404);
    const umList = (
      await um.get(`${API}/clients`).query({ agents: 'ALL' }).expect(200)
    ).body.items as { id: string }[];
    expect(umList.some((item) => item.id === clientId)).toBe(false);
  });

  it("only the director sees everyone's tasks, and gives a new client to another agent", async () => {
    await um.get(`${API}/tasks`).query({ team: 1 }).expect(403);
    await director.get(`${API}/tasks`).query({ team: 1 }).expect(200);

    const refused = await um
      .post(`${API}/clients`)
      .send({
        policyNo: '960000002',
        role: 'PO',
        name: 'Khách Cho Người Khác',
        agentCode: FC,
      })
      .expect(400);
    expect(refused.body.error).toBe('agent_not_found');
    await director
      .post(`${API}/clients`)
      .send({
        policyNo: '960000003',
        role: 'PO',
        name: 'Khách Giám Đốc Giao',
        agentCode: FC,
      })
      .expect(201);
  });

  it('TEN-7: another GA sees none of it', async () => {
    await director2.get(`${API}/leads/${leadId}`).expect(404);
    await director2.get(`${API}/clients/${clientId}`).expect(404);
  });
});
