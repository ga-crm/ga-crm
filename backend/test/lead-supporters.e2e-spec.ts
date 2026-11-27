import type { INestApplication } from '@nestjs/common';
import request from 'supertest';
import { startApp, stopApp } from './support/app.js';
import { connection } from './support/collections.js';
import { demoEmail, seedDemoData } from '../src/seed/demo-data.js';

const API = '/api/v1';
const PASSWORD = 'demo-password-123';
const UM = '00100003';
const PHONE = '0912000111';
const MASKED = '0912***111';
type Agent = ReturnType<typeof request.agent>;

/**
 * Decided 26/11/2026: "Người hỗ trợ". A supporter sees a lead outside their reach, every field but
 * the phone, which the API masks wherever the lead is returned (PDP-3); they comment but never
 * change the lead.
 */
describe('Lead supporters (e2e)', () => {
  let app: INestApplication;
  let head: Agent;
  let marketing: Agent;
  let um: Agent;
  let fc: Agent;
  let head2: Agent;
  let leadId: string;
  let fcId: string;
  let umId: string;

  const as = async (key: string, ga = 1) => {
    const agent = request.agent(app.getHttpServer());
    await agent
      .post(`${API}/auth/sign-in/email`)
      .send({ email: demoEmail(ga, key), password: PASSWORD })
      .expect(200);
    return agent;
  };
  const userId = async (key: string, ga = 1) =>
    (await connection
      .collection('users')
      .findOne({ email: demoEmail(ga, key) }))!._id as string;
  const supporters = (agent: Agent) => `${API}/leads/${leadId}/supporters`;
  const add = (agent: Agent, id: string) =>
    agent.post(supporters(agent)).send({ userId: id });

  beforeAll(async () => {
    app = await startApp();
    await seedDemoData(app, PASSWORD);
    [head, marketing, um, fc, head2] = await Promise.all([
      as('head'),
      as('admin'),
      as('um'),
      as('fc'),
      as('head', 2),
    ]);
    [fcId, umId] = await Promise.all([userId('fc'), userId('um')]);
    // The line manager's own lead: the FC below them does not see it (LEAD-6)
    leadId = (
      await marketing
        .post(`${API}/leads`)
        .send({
          fullName: 'Khách Cần Hỗ Trợ',
          phone: PHONE,
          email: 'khach@example.com',
          source: 'Facebook',
          consent: true,
          assignedAgentCode: UM,
        })
        .expect(201)
    ).body.id as string;
  });

  afterAll(async () => {
    await stopApp(app);
  });

  it('only whoever works the lead or manages its line adds supporters; the assignee is never one', async () => {
    await fc.get(`${API}/leads/${leadId}`).expect(404);
    // Someone who does not see the lead, another GA, and input that names nobody
    await add(fc, fcId).expect(404);
    await add(head2, fcId).expect(404);
    await add(um, umId).expect(400);
    await add(um, '00000000-0000-7000-8000-000000000000').expect(400);
    await add(um, 'abc').expect(400);

    const candidates = (
      await um.get(`${supporters(um)}/candidates`).query({ q: 'Tư vấn' })
    ).body.items as { id: string }[];
    expect(candidates.map((item) => item.id)).toContain(fcId);
    expect(candidates.map((item) => item.id)).not.toContain(umId);

    await add(um, fcId).expect(204);
    // Twice changes nothing
    await add(um, fcId).expect(204);
    expect(
      await connection
        .collection('leadHistory')
        .countDocuments({ leadId, field: 'supporterAdded' }),
    ).toBe(1);
    expect(
      await connection.collection('auditEvents').countDocuments({
        entity: 'lead_supporter',
        action: 'CREATE',
        entityId: leadId,
      }),
    ).toBe(1);
    // The supporter is told
    const notices = (await fc.get(`${API}/notifications`).expect(200)).body
      .items as { type: string; link: string }[];
    expect(notices).toContainEqual(
      expect.objectContaining({
        type: 'LEAD_SUPPORT',
        link: `/leads/${leadId}`,
      }),
    );
  });

  it('PDP-3: a supporter sees every field but the phone, wherever the lead is returned', async () => {
    // The assignee and a lead manager see the number
    expect(
      (await um.get(`${API}/leads/${leadId}`).expect(200)).body.lead.phone,
    ).toBe(PHONE);

    const detail = (await fc.get(`${API}/leads/${leadId}`).expect(200)).body;
    expect(detail.lead).toMatchObject({
      fullName: 'Khách Cần Hỗ Trợ',
      phone: MASKED,
      email: 'khach@example.com',
      assignedAgentCode: UM,
    });
    expect(detail).toMatchObject({
      supporting: true,
      canWork: false,
      // Notes and tasks are shared with the assignee
      canContribute: true,
      canSupport: false,
      canAssign: false,
      canManage: false,
    });
    expect(detail.supporters).toEqual([
      expect.objectContaining({ userId: fcId, agentCode: '00100004' }),
    ]);
    expect(JSON.stringify(detail)).not.toContain(PHONE);

    // The list and the board: there, masked, and not found by its number
    const list = (await fc.get(`${API}/leads`).expect(200)).body.items as {
      id: string;
      phone: string;
      supporting: boolean;
    }[];
    expect(list.find((item) => item.id === leadId)).toMatchObject({
      phone: MASKED,
      supporting: true,
    });
    expect(JSON.stringify(list)).not.toContain(PHONE);
    expect(
      (await fc.get(`${API}/leads`).query({ q: PHONE }).expect(200)).body.items,
    ).toEqual([]);
    const board = (await fc.get(`${API}/leads/board`).expect(200)).body;
    expect(JSON.stringify(board)).toContain(MASKED);
    expect(JSON.stringify(board)).not.toContain(PHONE);

    // A change of number reaches the supporter masked, in the lead and in its history
    await um
      .patch(`${API}/leads/${leadId}`)
      .send({ phone: '0912000222' })
      .expect(200);
    const after = (await fc.get(`${API}/leads/${leadId}`).expect(200)).body;
    expect(after.lead.phone).toBe('0912***222');
    expect(
      after.history.find((item: { field: string }) => item.field === 'phone'),
    ).toMatchObject({ oldValue: MASKED, newValue: '0912***222' });
    expect(JSON.stringify(after)).not.toMatch(/0912000111|0912000222/);
  });

  it('the assignee stays, and the supporter works beside them: notes, tasks and comments, never the lead itself', async () => {
    // Adding a supporter replaced nobody: the assignee still works the lead
    const mine = (await um.get(`${API}/leads/${leadId}`).expect(200)).body;
    expect(mine.lead.assignedAgentCode).toBe(UM);
    expect(mine).toMatchObject({ canWork: true, canContribute: true });

    // The supporter (a mentor) writes a note and shares the lead's tasks
    await fc
      .post(`${API}/leads/${leadId}/notes`)
      .send({ body: 'Gợi ý: hỏi thêm về nhu cầu học vấn của con.' })
      .expect(201);
    const taskId = (
      await fc
        .post(`${API}/leads/${leadId}/tasks`)
        .send({
          title: 'Chuẩn bị bảng minh họa',
          dueAt: new Date(Date.now() + 86_400_000),
        })
        .expect(201)
    ).body.id as string;
    // It is the lead's task, in the assignee's name, and either of them ticks it
    const tasks = (await um.get(`${API}/leads/${leadId}`).expect(200)).body
      .tasks as { id: string; agentCode: string }[];
    expect(tasks.find((task) => task.id === taskId)).toMatchObject({
      agentCode: UM,
    });
    await fc
      .patch(`${API}/leads/${leadId}/tasks/${taskId}`)
      .send({ done: true })
      .expect(200);
    await fc
      .post(`${API}/leads/${leadId}/comments`)
      .send({ body: 'Tôi đã chuẩn bị bảng minh họa.' })
      .expect(201);

    // LEAD-7: the lead's fields, its status and the record of contacts stay with the assignee
    await fc
      .patch(`${API}/leads/${leadId}`)
      .send({ fullName: 'Tên Khác' })
      .expect(403);
    await fc
      .patch(`${API}/leads/${leadId}`)
      .send({ careStatus: 'CARING' })
      .expect(403);
    await fc
      .post(`${API}/leads/${leadId}/activities`)
      .send({ type: 'CALL', note: 'Đã gọi' })
      .expect(403);
    await add(fc, umId).expect(403);
    await fc.get(`${supporters(fc)}/candidates`).expect(403);
    // Nothing they did revealed the number
    expect(
      JSON.stringify((await fc.get(`${API}/leads/${leadId}`).expect(200)).body),
    ).not.toMatch(/0912000111|0912000222/);
  });

  it('a supporter may leave, and whoever manages the lead removes one; the lead is then out of sight again', async () => {
    // A lead manager adds and removes too
    const adminId = await userId('admin');
    await add(marketing, adminId).expect(204);
    await marketing.delete(`${supporters(marketing)}/${adminId}`).expect(204);
    await marketing.delete(`${supporters(marketing)}/${adminId}`).expect(404);

    // Another GA, and a supporter removing someone else
    await head2.delete(`${supporters(head2)}/${fcId}`).expect(404);
    await add(head, adminId).expect(204);
    await fc.delete(`${supporters(fc)}/${adminId}`).expect(403);

    await fc.delete(`${supporters(fc)}/${fcId}`).expect(204);
    await fc.get(`${API}/leads/${leadId}`).expect(404);
    expect(
      (
        (await fc.get(`${API}/leads`).expect(200)).body.items as {
          id: string;
        }[]
      ).some((item) => item.id === leadId),
    ).toBe(false);
    expect(
      await connection
        .collection('auditEvents')
        .countDocuments({ entity: 'lead_supporter', action: 'DELETE' }),
    ).toBe(2);
  });
});
