import type { INestApplication } from '@nestjs/common';
import request from 'supertest';
import { startApp, stopApp } from './support/app.js';
import { connection } from './support/collections.js';
import { demoEmail, seedDemoData } from '../src/seed/demo-data.js';

const API = '/api/v1';
const PASSWORD = 'demo-password-123';
const UM = '00100003';
const FC = '00100004';
type Agent = ReturnType<typeof request.agent>;
type RequestView = {
  id: string;
  kind: string;
  status: string;
  to: { code: string } | null;
  records: { id: string; name: string }[];
};

/**
 * Decided 27/11/2026: only the GA director assigns customers outright. Admin's and a line
 * manager's assignments wait for the director; until then the customers stay where they are.
 */
describe('Assignments wait for the GA director (e2e)', () => {
  let app: INestApplication;
  let director: Agent;
  let admin: Agent;
  let um: Agent;
  let fc: Agent;
  let director2: Agent;
  let phones = 0;

  const as = async (key: string, ga = 1) => {
    const agent = request.agent(app.getHttpServer());
    await agent
      .post(`${API}/auth/sign-in/email`)
      .send({ email: demoEmail(ga, key), password: PASSWORD })
      .expect(200);
    return agent;
  };
  const lead = async (by: Agent, assignedAgentCode?: string) => {
    phones += 1;
    return (
      await by
        .post(`${API}/leads`)
        .send({
          fullName: `Khách Chờ Duyệt ${phones}`,
          phone: `09140000${String(phones).padStart(2, '0')}`,
          source: 'Facebook',
          ...(assignedAgentCode && { assignedAgentCode }),
        })
        .expect(201)
    ).body.id as string;
  };
  const requests = async (agent: Agent, status?: string) =>
    (
      await agent
        .get(`${API}/assignment-requests`)
        .query(status ? { status } : {})
        .expect(200)
    ).body.items as RequestView[];
  const owner = async (id: string) =>
    (await director.get(`${API}/leads/${id}`).expect(200)).body.lead
      .assignedAgentCode as string | null;

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
  });

  afterAll(async () => {
    await stopApp(app);
  });

  it("Admin's assignment waits; the lead stays put until the director approves", async () => {
    const id = await lead(admin);
    const sent = await admin
      .post(`${API}/leads/assign`)
      .send({ leadIds: [id], agentCode: FC })
      .expect(201);
    expect(sent.body).toMatchObject({ assigned: 0, requested: 1 });
    expect(await owner(id)).toBeNull();
    await fc.get(`${API}/leads/${id}`).expect(404);

    // The director is told and sees it; Admin sees their own request
    const notices = (await director.get(`${API}/notifications`).expect(200))
      .body.items as { type: string }[];
    expect(notices.map((item) => item.type)).toContain('ASSIGN_REQUESTED');
    const waiting = (await requests(director, 'PENDING')).find(
      (item) => item.records.some((record) => record.id === id),
    )!;
    expect(waiting).toMatchObject({ kind: 'LEAD', to: { code: FC } });
    expect(
      (await requests(admin)).some((item) => item.id === waiting.id),
    ).toBe(true);
    // Never a phone on this page
    expect(JSON.stringify(await requests(director))).not.toMatch(/0914\d{6}/);

    // Only the director decides
    await admin
      .post(`${API}/assignment-requests/${waiting.id}/approve`)
      .expect(403);
    await director
      .post(`${API}/assignment-requests/${waiting.id}/approve`)
      .expect(200);
    expect(await owner(id)).toBe(FC);
    expect(
      (await fc.get(`${API}/leads/${id}`).expect(200)).body.lead.phone,
    ).not.toContain('***');
    // Admin hears the answer; deciding twice is refused
    const told = (await admin.get(`${API}/notifications`).expect(200)).body
      .items as { type: string }[];
    expect(told.map((item) => item.type)).toContain('ASSIGN_DECIDED');
    const again = await director
      .post(`${API}/assignment-requests/${waiting.id}/approve`)
      .expect(409);
    expect(again.body.error).toBe('request_decided');
  });

  it('the director assigns outright', async () => {
    const id = await lead(admin);
    const done = await director
      .post(`${API}/leads/assign`)
      .send({ leadIds: [id], agentCode: FC })
      .expect(201);
    expect(done.body).toMatchObject({ assigned: 1, requested: 0 });
    expect(await owner(id)).toBe(FC);
  });

  it('a refused or withdrawn request changes nothing', async () => {
    const id = await lead(admin);
    await admin
      .post(`${API}/leads/assign`)
      .send({ leadIds: [id], agentCode: FC })
      .expect(201);
    const [first] = (await requests(admin, 'PENDING')).filter((item) =>
      item.records.some((record) => record.id === id),
    );
    await director
      .post(`${API}/assignment-requests/${first.id}/reject`)
      .send({ note: 'Để kho chia sau' })
      .expect(204);
    expect(await owner(id)).toBeNull();
    expect(
      (await requests(admin)).find((item) => item.id === first.id)?.status,
    ).toBe('REJECTED');

    await admin
      .post(`${API}/leads/assign`)
      .send({ leadIds: [id], agentCode: FC })
      .expect(201);
    const [second] = (await requests(admin, 'PENDING')).filter((item) =>
      item.records.some((record) => record.id === id),
    );
    // Only its sender withdraws it
    await um.post(`${API}/assignment-requests/${second.id}/cancel`).expect(404);
    await admin
      .post(`${API}/assignment-requests/${second.id}/cancel`)
      .expect(204);
    expect(await owner(id)).toBeNull();
  });

  it("a line manager's assignment of their own lead waits too; they cannot move a lead they do not see", async () => {
    const own = await lead(director, UM);
    const sent = await um
      .post(`${API}/leads/assign`)
      .send({ leadIds: [own], agentCode: FC })
      .expect(201);
    expect(sent.body).toMatchObject({ assigned: 0, requested: 1 });
    expect(await owner(own)).toBe(UM);

    const theirs = await lead(director, FC);
    await um
      .post(`${API}/leads/assign`)
      .send({ leadIds: [theirs], agentCode: UM })
      .expect(404);
    expect(await owner(theirs)).toBe(FC);
  });

  it('clients follow the same rule', async () => {
    const clientId = (
      await fc
        .post(`${API}/clients`)
        .send({ policyNo: '970000001', role: 'PO', name: 'Khách Hợp Đồng Duyệt' })
        .expect(201)
    ).body.id as string;
    const { grants } = (await director.get(`${API}/permissions`).expect(200))
      .body as { grants: Record<string, string[]> };
    await director
      .put(`${API}/permissions`)
      .send({ grants: { ...grants, ADMIN: [...grants.ADMIN, 'clients.assign'] } })
      .expect(204);
    const sent = await admin
      .post(`${API}/clients/assign`)
      .send({ clientIds: [clientId], agentCode: UM })
      .expect(200);
    expect(sent.body).toMatchObject({ assigned: 0, requested: 1 });
    const stored = await connection
      .collection('clients')
      .findOne({ _id: clientId as never });
    expect(stored?.ownerAgentCodes).toEqual([FC]);

    const [waiting] = (await requests(director, 'PENDING')).filter(
      (item) => item.kind === 'CLIENT',
    );
    await director
      .post(`${API}/assignment-requests/${waiting.id}/approve`)
      .expect(200);
    const after = await connection
      .collection('clients')
      .findOne({ _id: clientId as never });
    expect(after?.ownerAgentCodes).toContain(UM);
    await director.put(`${API}/permissions`).send({ grants }).expect(204);
  });

  it('TEN-7: another GA sees none of the requests and cannot decide them', async () => {
    const [any] = await requests(director);
    expect(await requests(director2)).toEqual([]);
    await director2
      .post(`${API}/assignment-requests/${any.id}/reject`)
      .send({})
      .expect(404);
  });
});
