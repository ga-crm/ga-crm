import type { INestApplication } from '@nestjs/common';
import request from 'supertest';
import { startApp, stopApp } from './support/app.js';
import { ownerDb } from './support/owner-db.js';
import { LeadsService } from '../src/modules/leads/leads.service.js';
import { demoEmail, seedDemoData } from '../src/seed/demo-data.js';

const API = '/api/v1';
const PASSWORD = 'demo-password-123';
const FC = '00100004';
const DAY = 86_400_000;
type Agent = ReturnType<typeof request.agent>;

/**
 * Decided 27/11/2026: a lead its agent drops ("Chốt xịt", "Không quan tâm") or leaves without
 * care for the GA's number of days (30 by default) goes back to the GA's pool. The director and
 * Admin see the pool; whoever gets the lead next sees its phone.
 */
describe('Leads go back to the pool (e2e)', () => {
  let app: INestApplication;
  let director: Agent;
  let admin: Agent;
  let fc: Agent;
  let director2: Agent;
  let tenantId: string;
  let phones = 0;

  const as = async (key: string, ga = 1) => {
    const agent = request.agent(app.getHttpServer());
    await agent
      .post(`${API}/auth/sign-in/email`)
      .send({ email: demoEmail(ga, key), password: PASSWORD })
      .expect(200);
    return agent;
  };
  /** A lead Admin gives the FC, so it is not the FC's own (LEAD-9). */
  const given = async (name: string) => {
    phones += 1;
    return (
      await admin
        .post(`${API}/leads`)
        .send({
          fullName: name,
          phone: `09130000${String(phones).padStart(2, '0')}`,
          source: 'Facebook',
          assignedAgentCode: FC,
        })
        .expect(201)
    ).body.id as string;
  };
  const pool = async (agent: Agent) =>
    (
      (await agent.get(`${API}/leads`).query({ released: 1 }).expect(200))
        .body.items as { id: string; releaseReason: string }[]
    ).map((item) => item.id);

  beforeAll(async () => {
    app = await startApp();
    await seedDemoData(app, PASSWORD);
    [director, admin, fc, director2] = await Promise.all([
      as('head'),
      as('admin'),
      as('fc'),
      as('head', 2),
    ]);
    tenantId = (
      await ownerDb().query<{ tenant_id: string }>(
        'SELECT tenant_id FROM users WHERE email = $1',
        [demoEmail(1, 'fc')],
      )
    ).rows[0].tenant_id;
  });

  afterAll(async () => {
    await stopApp(app);
  });

  it('"Chốt xịt" sends the lead back: its agent loses it, its open tasks end, the pool shows it', async () => {
    const id = await given('Khách Chốt Xịt');
    const saved = await fc
      .patch(`${API}/leads/${id}`)
      .send({ careStatus: 'DROPPED', lostReason: 'Đã mua bên khác' })
      .expect(200);
    expect(saved.body.released).toBe(true);
    await fc.get(`${API}/leads/${id}`).expect(404);

    expect(await pool(director)).toContain(id);
    expect(await pool(admin)).toContain(id);
    expect(await pool(fc)).toEqual([]);
    expect(
      (await admin.get(`${API}/leads/counts`).expect(200)).body.released,
    ).toBeGreaterThan(0);

    const detail = (await director.get(`${API}/leads/${id}`).expect(200)).body;
    expect(detail.lead).toMatchObject({
      assignedAgentCode: null,
      releasedFrom: FC,
      releaseReason: 'DROPPED',
    });
    expect(detail.history).toContainEqual(
      expect.objectContaining({ field: 'released', newValue: 'DROPPED' }),
    );
    const { rows } = await ownerDb().query<{ n: number }>(
      `SELECT count(*)::int AS n FROM tasks WHERE lead_id = $1 AND status = 'OPEN'`,
      [id],
    );
    expect(rows[0].n).toBe(0);
  });

  it('"Không quan tâm" sends the lead back too', async () => {
    const id = await given('Khách Không Quan Tâm');
    const saved = await fc
      .patch(`${API}/leads/${id}`)
      .send({ interest: 'NOT_INTERESTED' })
      .expect(200);
    expect(saved.body.released).toBe(true);
    expect(
      (await director.get(`${API}/leads/${id}`).expect(200)).body.lead
        .releaseReason,
    ).toBe('NOT_INTERESTED');
  });

  it('LEAD-9: a lead the FC found themselves stays with them', async () => {
    const own = (
      await fc
        .post(`${API}/leads`)
        .send({
          fullName: 'Khách Tự Khai Thác',
          phone: '0913000099',
          source: 'Facebook',
        })
        .expect(201)
    ).body.id as string;
    const saved = await fc
      .patch(`${API}/leads/${own}`)
      .send({ careStatus: 'DROPPED', lostReason: 'Hết nhu cầu' })
      .expect(200);
    expect(saved.body.released).toBe(false);
    await fc.get(`${API}/leads/${own}`).expect(200);
  });

  it('the daily round returns leads left without contact for 30 days, and only those', async () => {
    const idle = await given('Khách Bỏ Quên');
    const recent = await given('Khách Vừa Gọi');
    const now = new Date();
    await ownerDb().query(
      'UPDATE leads SET assigned_at = $2, last_contact_at = NULL WHERE id = $1',
      [idle, new Date(now.getTime() - 31 * DAY)],
    );
    await ownerDb().query(
      'UPDATE leads SET assigned_at = $2, last_contact_at = $3 WHERE id = $1',
      [recent, new Date(now.getTime() - 40 * DAY), new Date(now.getTime() - 2 * DAY)],
    );
    const released = await app
      .get(LeadsService)
      .releaseIdle({ tenantId }, now);
    expect(released).toContain(idle);
    expect(released).not.toContain(recent);
    await fc.get(`${API}/leads/${idle}`).expect(404);
    await fc.get(`${API}/leads/${recent}`).expect(200);
    const history = (await director.get(`${API}/leads/${idle}`).expect(200))
      .body.history as { field: string; changedBy: string | null }[];
    expect(
      history.find((item) => item.field === 'released')?.changedBy,
    ).toBeNull();
  });

  it('the director gives a pooled lead to someone else, who then sees its phone', async () => {
    const id = await given('Khách Giao Lại');
    await fc
      .patch(`${API}/leads/${id}`)
      .send({ careStatus: 'DROPPED', lostReason: 'Không liên lạc được' })
      .expect(200);
    await director
      .post(`${API}/leads/assign`)
      .send({ leadIds: [id], agentCode: FC })
      .expect(201);
    const back = (await fc.get(`${API}/leads/${id}`).expect(200)).body.lead;
    expect(back.phone).not.toContain('***');
    expect(back).toMatchObject({ releasedAt: null, releaseReason: null });
    expect(await pool(director)).not.toContain(id);
  });

  it('TEN-7: another GA sees nothing of the pool', async () => {
    expect(await pool(director2)).toEqual([]);
  });
});
