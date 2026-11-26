import type { INestApplication } from '@nestjs/common';
import request from 'supertest';
import { startApp, stopApp } from './support/app.js';
import { ownerDb } from './support/owner-db.js';
import { TenantsService } from '../src/modules/tenants/tenants.service.js';
import { demoEmail, seedDemoData } from '../src/seed/demo-data.js';

const API = '/api/v1';
const PASSWORD = 'demo-password-123';
const GAD = '00100001';
const BM = '00100002';
const UM = '00100003';
const FC = '00100004';
type Agent = ReturnType<typeof request.agent>;

/**
 * Open question 4 (decided 14/11/2026): line managers (GAD, BM, UM) reassign leads within their own
 * line with `leads.assign_line`; LEAD-21 to LEAD-23 otherwise unchanged.
 */
describe('Lead assignment within a line (e2e)', () => {
  let app: INestApplication;
  let head: Agent;
  let um: Agent;
  let fc: Agent;
  let phone = 912_300_000;

  const as = async (key: string) => {
    const agent = request.agent(app.getHttpServer());
    await agent.post(`${API}/auth/sign-in/email`).send({ email: demoEmail(1, key), password: PASSWORD }).expect(200);
    return agent;
  };
  /** A GA lead the head assigns to `agentCode`. */
  const lead = async (agentCode: string) => {
    const { body } = await head
      .post(`${API}/leads`)
      .send({ fullName: `Khách ${phone}`, phone: `0${phone++}`, source: 'Facebook', consent: true })
      .expect(201);
    await head.post(`${API}/leads/assign`).send({ leadIds: [body.id], agentCode }).expect(201);
    return body.id as string;
  };
  const assigneeOf = async (id: string) =>
    (await head.get(`${API}/leads/${id}`).expect(200)).body.lead.assignedAgentCode as string | null;

  beforeAll(async () => {
    app = await startApp();
    await seedDemoData(app, PASSWORD);
    [head, um, fc] = await Promise.all([as('head'), as('um'), as('fc')]);
  });

  afterAll(async () => {
    await stopApp(app);
  });

  it('a UM moves a lead of their line to another agent of the line, with the usual history and task (LEAD-22)', async () => {
    const id = await lead(FC);
    const res = await um.post(`${API}/leads/assign`).send({ leadIds: [id], agentCode: UM }).expect(201);
    expect(res.body).toEqual({ assigned: 1 });
    expect(await assigneeOf(id)).toBe(UM);
    const { rows } = await ownerDb().query(
      `SELECT action, meta FROM audit_events WHERE entity_id = $1 AND action = 'ASSIGN' ORDER BY id DESC LIMIT 1`,
      [id],
    );
    expect(rows[0].meta).toEqual({ from: FC, to: UM });
  });

  it('only to agents of the line: someone above them is agent_out_of_line', async () => {
    const id = await lead(FC);
    const res = await um.post(`${API}/leads/assign`).send({ leadIds: [id], agentCode: BM }).expect(403);
    expect(res.body.error).toBe('agent_out_of_line');
    expect(await assigneeOf(id)).toBe(FC);
  });

  it('only leads of the line: one held above them, or in the GA pool, looks missing (LEAD-6)', async () => {
    const above = await lead(BM);
    await um.post(`${API}/leads/assign`).send({ leadIds: [above], agentCode: FC }).expect(404);
    const { body: pooled } = await head
      .post(`${API}/leads`)
      .send({ fullName: 'Khách chưa giao', phone: `0${phone++}`, source: 'Facebook', consent: true })
      .expect(201);
    await um.post(`${API}/leads/assign`).send({ leadIds: [pooled.id], agentCode: FC }).expect(404);
  });

  it('a line manager cannot unassign, which would send the lead back to the GA pool', async () => {
    const id = await lead(FC);
    await um.post(`${API}/leads/assign`).send({ leadIds: [id], agentCode: null }).expect(403);
  });

  it('LEAD-9 still holds: a self-sourced lead of a working agent cannot move', async () => {
    const { body } = await fc
      .post(`${API}/leads`)
      .send({ fullName: 'Khách tự khai thác', phone: `0${phone++}`, source: 'Facebook', consent: true })
      .expect(201);
    const res = await um.post(`${API}/leads/assign`).send({ leadIds: [body.id], agentCode: UM }).expect(409);
    expect(res.body.error).toBe('own_lead_locked');
  });

  it('LEAD-23: the picker offers only the agents of the line; select-all works for them (LEAD-24)', async () => {
    const picker = (await um.get(`${API}/leads/assignees`).expect(200)).body.items as { agentCode: string }[];
    expect(picker.map((item) => item.agentCode).sort()).toEqual([UM, FC]);
    const all = (await head.get(`${API}/leads/assignees`).expect(200)).body.items as { agentCode: string }[];
    expect(all.map((item) => item.agentCode)).toEqual(expect.arrayContaining([GAD, BM, UM, FC]));
    const { body } = await um.get(`${API}/leads/ids`).expect(200);
    const owners = await ownerDb().query<{ code: string }>(
      `SELECT DISTINCT assigned_agent_code AS code FROM leads WHERE id = ANY($1::uuid[])`,
      [body.ids],
    );
    expect(owners.rows.every((row) => [UM, FC].includes(row.code))).toBe(true);
  });

  it("the lead page offers the action to whoever sees the lead and may assign, not to agents", async () => {
    const id = await lead(FC);
    // Changed 27/11/2026: a line manager no longer opens the leads of their line
    await um.get(`${API}/leads/${id}`).expect(404);
    expect((await head.get(`${API}/leads/${id}`).expect(200)).body.canAssign).toBe(true);
    expect((await fc.get(`${API}/leads/${id}`).expect(200)).body.canAssign).toBe(false);
  });

  it('an agent without the permission cannot assign; a GA head can take it from its UMs (PERM-2)', async () => {
    const id = await lead(FC);
    await fc.post(`${API}/leads/assign`).send({ leadIds: [id], agentCode: FC }).expect(403);
    await fc.get(`${API}/leads/assignees`).expect(403);

    const { grants } = (await head.get(`${API}/permissions`).expect(200)).body as { grants: Record<string, string[]> };
    await head
      .put(`${API}/permissions`)
      .send({ grants: { ...grants, UM: grants.UM.filter((permission) => permission !== 'leads.assign_line') } })
      .expect((res) => expect(res.status).toBeLessThan(300));
    await um.post(`${API}/leads/assign`).send({ leadIds: [id], agentCode: UM }).expect(403);
    await head.put(`${API}/permissions`).send({ grants }).expect((res) => expect(res.status).toBeLessThan(300));
  });

  it('test 11 + PERM-2: GAs from before get leads.assign_line for BM and UM once', async () => {
    // Decided 27/11/2026: the GA director holds every permission, outside the matrix
    const owner = ownerDb();
    const drop = `UPDATE tenant_settings SET grants = grants
      || jsonb_build_object('BM', (grants -> 'BM') - 'leads.assign_line')
      || jsonb_build_object('UM', (grants -> 'UM') - 'leads.assign_line')`;
    await owner.query(`${drop}, permissions_version = 1`);
    await app.get(TenantsService).onModuleInit();
    const { rows } = await owner.query<{ grants: Record<string, string[]> }>('SELECT grants FROM tenant_settings');
    for (const { grants } of rows)
      for (const role of ['BM', 'UM']) expect(grants[role]).toContain('leads.assign_line');
    // A GA that takes it away afterwards keeps its choice
    await owner.query(drop);
    await app.get(TenantsService).onModuleInit();
    const { rows: after } = await owner.query<{ grants: Record<string, string[]> }>('SELECT grants FROM tenant_settings LIMIT 1');
    expect(after[0].grants.UM).not.toContain('leads.assign_line');
  });
});
