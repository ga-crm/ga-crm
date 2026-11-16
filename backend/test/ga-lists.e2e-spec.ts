import type { INestApplication } from '@nestjs/common';
import request from 'supertest';
import { startApp, stopApp } from './support/app.js';
import { ownerDb } from './support/owner-db.js';
import { demoEmail, seedDemoData } from '../src/seed/demo-data.js';

const API = '/api/v1';
const PASSWORD = 'demo-password-123';
type Agent = ReturnType<typeof request.agent>;
type Option = { id: string; kind: string; code: string; label: string; isOpportunity: boolean; sortOrder: number };

/**
 * Section 5.2 + open question D (decided 14/11/2026): the GA's own lists (region, phone source, lost
 * reason) start empty, and the GA head can add a whole list at once to any catalogue list.
 */
describe('GA lists and adding many values (e2e)', () => {
  let app: INestApplication;
  let head: Agent;
  let admin: Agent;
  let head2: Agent;

  const as = async (key: string, ga = 1) => {
    const agent = request.agent(app.getHttpServer());
    await agent.post(`${API}/auth/sign-in/email`).send({ email: demoEmail(ga, key), password: PASSWORD }).expect(200);
    return agent;
  };
  const listOf = async (agent: Agent, kind: string) =>
    ((await agent.get(`${API}/lead-options`).expect(200)).body.items as Option[]).filter((item) => item.kind === kind);

  beforeAll(async () => {
    app = await startApp();
    await seedDemoData(app, PASSWORD);
    [head, admin, head2] = await Promise.all([as('head'), as('admin'), as('head', 2)]);
  });

  afterAll(async () => {
    await stopApp(app);
  });

  it('D: the section 5.2 lists start empty; the GA head fills them', async () => {
    for (const kind of ['region', 'phone_source', 'lost_reason']) expect(await listOf(head, kind)).toEqual([]);
  });

  it('adds a pasted list in order, skipping what is already there or repeated (OPT-4)', async () => {
    const first = await head
      .post(`${API}/lead-options/bulk`)
      .send({ kind: 'region', labels: ['Miền Bắc', ' Miền Trung ', 'miền bắc', 'Mien Trung', 'Miền Nam'] })
      .expect(201);
    expect(first.body).toEqual({ created: ['Miền Bắc', 'Miền Trung', 'Miền Nam'], skipped: ['miền bắc', 'Mien Trung'] });

    const again = await head.post(`${API}/lead-options/bulk`).send({ kind: 'region', labels: ['Miền Nam', 'Tây Nguyên'] }).expect(201);
    expect(again.body).toEqual({ created: ['Tây Nguyên'], skipped: ['Miền Nam'] });

    const regions = await listOf(head, 'region');
    expect(regions.map((item) => [item.label, item.code])).toEqual([
      ['Miền Bắc', 'Miền Bắc'],
      ['Miền Trung', 'Miền Trung'],
      ['Miền Nam', 'Miền Nam'],
      ['Tây Nguyên', 'Tây Nguyên'],
    ]);
    const { rows } = await ownerDb().query(
      `SELECT count(*)::int AS n FROM audit_events WHERE entity = 'lead_option' AND action = 'CREATE' AND meta ->> 'kind' = 'region'`,
    );
    expect(rows[0].n).toBe(4);
  });

  it('works for the lead catalogue too: interest codes come from the labels, with no flags', async () => {
    const res = await head
      .post(`${API}/lead-options/bulk`)
      .send({ kind: 'interest', labels: ['Quan tâm hưu trí', 'Quan tâm giáo dục'] })
      .expect(201);
    expect(res.body.created).toHaveLength(2);
    const added = (await listOf(head, 'interest')).filter((item) => item.label.startsWith('Quan tâm hưu trí'));
    expect(added[0]).toEqual(expect.objectContaining({ code: 'QUAN_TAM_HUU_TRI', isOpportunity: false }));
  });

  it('only the GA head adds; labels over 60 characters, empty lists and more than 200 are refused', async () => {
    await admin.post(`${API}/lead-options/bulk`).send({ kind: 'region', labels: ['Hà Nội'] }).expect(403);
    await head.post(`${API}/lead-options/bulk`).send({ kind: 'region', labels: ['x'.repeat(61)] }).expect(400);
    await head.post(`${API}/lead-options/bulk`).send({ kind: 'region', labels: [] }).expect(400);
    await head
      .post(`${API}/lead-options/bulk`)
      .send({ kind: 'region', labels: Array.from({ length: 201 }, (_, index) => `Vùng ${index}`) })
      .expect(400);
    await head.post(`${API}/lead-options/bulk`).send({ kind: 'colour', labels: ['Đỏ'] }).expect(400);
  });

  it('a value a lead uses can only be hidden (OPT-5); a lead may still carry a value the GA has not listed', async () => {
    const created = await head
      .post(`${API}/leads`)
      .send({ fullName: 'Khách miền Bắc', phone: '0912777001', source: 'Facebook', consent: true, region: 'Miền Bắc' })
      .expect(201);
    expect(created.body.id).toBeTruthy();
    await head
      .post(`${API}/leads`)
      .send({ fullName: 'Khách nơi khác', phone: '0912777002', source: 'Facebook', consent: true, region: 'Đảo Phú Quốc' })
      .expect(201);
    const regions = await listOf(head, 'region');
    const north = regions.find((item) => item.label === 'Miền Bắc')!;
    const res = await head.delete(`${API}/lead-options/${north.id}`).expect(409);
    expect(res.body.error).toBe('option_in_use');
    const highlands = regions.find((item) => item.label === 'Tây Nguyên')!;
    await head.delete(`${API}/lead-options/${highlands.id}`).expect(204);
  });

  it('TEN-7: another GA has its own lists', async () => {
    expect(await listOf(head2, 'region')).toEqual([]);
  });
});
