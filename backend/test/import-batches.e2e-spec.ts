import type { INestApplication } from '@nestjs/common';
import request from 'supertest';
import { startApp, stopApp } from './support/app.js';
import { ownerDb } from './support/owner-db.js';
import { demoEmail, seedDemoData } from '../src/seed/demo-data.js';
import { BATCH_THRESHOLD, ImportsService } from '../src/modules/imports/imports.service.js';

const API = '/api/v1';
const PASSWORD = 'demo-password-123';
const SHEET = '01_Agents';
const HEADERS = [
  'Quản lý',
  'Tư vấn tài chính',
  'Giới tính',
  'Ngày sinh',
  'Trạng thái',
  'Điện thoại',
  'Ngày bắt đầu hoạt động',
  'Ngày chấm dứt hoạt động',
  'office_code',
];
const ROOT = '00100001';
/** The agent whose insert the test trigger refuses, so its batch fails. */
const POISON = '07999999';
type Agent = ReturnType<typeof request.agent>;
type Cell = string | number | null;
type Detail = {
  status: string;
  progress: { done: number; total: number; failedBatches: number; failedRows: number } | null;
  sheets: { inserted: number; updated: number; rejected: number; found: number }[];
  errorsTotal: number;
};

const agentRow = (code: string): Cell[] => [
  `SUM: ${ROOT}-Chủ GA`,
  `FC: ${code}-Tư vấn ${code}`,
  '',
  '',
  'Đang hoạt động',
  '',
  '01/01/2024',
  '',
  '',
];
const codes = (from: number, count: number) =>
  Array.from({ length: count }, (_, index) => `08${String(from + index).padStart(6, '0')}`);
const stored = async (list: string[]) =>
  (
    await ownerDb().query<{ n: number }>(`SELECT count(*)::int AS n FROM agents WHERE agent_code = ANY($1::text[])`, [
      list,
    ])
  ).rows[0].n;

/** Open question I (decided 14/11/2026): files under 2,000 rows are all or nothing; larger ones go in batch by batch. */
describe('Importing a large file in batches (e2e)', () => {
  let app: INestApplication;
  let head: Agent;
  let head2: Agent;

  const as = async (key: string, ga = 1) => {
    const agent = request.agent(app.getHttpServer());
    await agent.post(`${API}/auth/sign-in/email`).send({ email: demoEmail(ga, key), password: PASSWORD }).expect(200);
    return agent;
  };

  /** Starts, sends and validates an agent file; returns the import ready to confirm. */
  const validated = async (list: string[]) => {
    const { body } = await head
      .post(`${API}/imports`)
      .send({
        fileName: 'cay-lon.xlsx',
        snapshotDate: '2026-11-14',
        kind: 'SUCCESS',
        sheets: [{ name: SHEET, headers: HEADERS }],
      })
      .expect(201);
    const id = body.id as string;
    for (let at = 0; at < list.length; at += 500)
      await head
        .post(`${API}/imports/${id}/rows`)
        .send({
          sheet: SHEET,
          rows: list.slice(at, at + 500).map((code, index) => ({ r: 2 + at + index, c: agentRow(code) })),
        })
        .expect(200);
    await head.post(`${API}/imports/${id}/validate`).expect(200);
    return id;
  };
  const detail = async (id: string) => (await head.get(`${API}/imports/${id}`).expect(200)).body as Detail;

  beforeAll(async () => {
    app = await startApp();
    await seedDemoData(app, PASSWORD);
    [head, head2] = await Promise.all([as('head'), as('head', 2)]);
    // A trigger that refuses one agent stands in for any write error inside a batch
    await ownerDb().query(`
      CREATE OR REPLACE FUNCTION test_refuse_agent() RETURNS trigger LANGUAGE plpgsql AS $$
      BEGIN
        IF NEW.agent_code = '${POISON}' THEN RAISE EXCEPTION 'refused by test'; END IF;
        RETURN NEW;
      END $$;
      CREATE TRIGGER test_refuse_agent BEFORE INSERT ON agents FOR EACH ROW EXECUTE FUNCTION test_refuse_agent();
    `);
  });

  afterAll(async () => {
    await ownerDb().query(`DROP TRIGGER IF EXISTS test_refuse_agent ON agents; DROP FUNCTION IF EXISTS test_refuse_agent()`);
    await stopApp(app);
  });

  it('a file under 2,000 rows stays all or nothing: one bad row and nothing is written', async () => {
    const list = [...codes(100, 9), POISON];
    const id = await validated(list);
    await head.post(`${API}/imports/${id}/commit`).expect(500);
    expect(await stored(list)).toBe(0);
    expect((await detail(id)).status).toBe('VALIDATED');
  });

  it('a file of 2,000 rows or more returns at once and is written batch by batch; a failed batch is reported row by row and the others go in', async () => {
    // The poisoned agent sits in the second batch of 500 (rows 502-1001)
    const list = codes(1_000, BATCH_THRESHOLD);
    list[700] = POISON;
    const id = await validated(list);

    const started = await head.post(`${API}/imports/${id}/commit`).expect(200);
    expect(started.body.status).toBe('COMMITTING');
    await app.get(ImportsService).waitForCommit(id);

    const done = await detail(id);
    expect(done.status).toBe('COMMITTED');
    // Four batches of agents, then the tree rebuild
    expect(done.progress).toEqual({ done: 5, total: 5, failedBatches: 1, failedRows: 500 });
    expect(done.sheets[0]).toEqual(expect.objectContaining({ found: 2_000, inserted: 1_500, rejected: 500 }));
    expect(await stored(list)).toBe(1_500);
    expect(await stored(list.slice(500, 1_000))).toBe(0);

    const { body } = await head.get(`${API}/imports/${id}/errors`).query({ pageSize: 50 }).expect(200);
    expect(body.total).toBe(500);
    expect(body.items[0]).toEqual(expect.objectContaining({ code: 'batch_failed', row: 502, recordKey: list[500] }));
    expect(body.items[0].messageVi).toContain('chưa được ghi');

    const { rows } = await ownerDb().query(
      `SELECT meta FROM audit_events WHERE entity = 'import' AND entity_id = $1 AND action = 'IMPORT'`,
      [id],
    );
    expect(rows).toEqual([
      { meta: expect.objectContaining({ inserted: 1_500, rejected: 500, batches: 5, failedBatches: 1, failedRows: 500 }) },
    ]);
    // The staging rows are gone, as after any commit
    const staging = await ownerDb().query(`SELECT 1 FROM import_rows WHERE import_id = $1`, [id]);
    expect(staging.rows).toHaveLength(0);
  });

  it('a large Success file goes in batch by batch too, and agent links are worked out once at the end (CUS-4)', async () => {
    const fc = await as('fc');
    const { body } = await fc
      .post(`${API}/imports`)
      .send({
        fileName: 'khach-hang-lon.xlsx',
        snapshotDate: '2026-11-14',
        kind: 'SUCCESS',
        sheets: [{ name: '02_Clients', headers: ['Mã Khách Hàng', 'Bên Mua BH', 'Nhóm Khách Hàng', 'Ngày Sinh', 'Giới Tính'] }],
      })
      .expect(201);
    const id = body.id as string;
    const clients = Array.from({ length: 2_100 }, (_, index) => `55${String(index).padStart(8, '0')}`);
    for (let at = 0; at < clients.length; at += 500)
      await fc
        .post(`${API}/imports/${id}/rows`)
        .send({
          sheet: '02_Clients',
          rows: clients.slice(at, at + 500).map((code, index) => ({ r: 2 + at + index, c: [code, `Khách ${code}`, '', '', 'Nam'] })),
        })
        .expect(200);
    await fc.post(`${API}/imports/${id}/validate`).expect(200);
    expect((await fc.post(`${API}/imports/${id}/commit`).expect(200)).body.status).toBe('COMMITTING');
    await app.get(ImportsService).waitForCommit(id);

    const done = (await fc.get(`${API}/imports/${id}`).expect(200)).body as Detail;
    // Five batches of clients, then the links
    expect(done).toEqual(expect.objectContaining({ status: 'COMMITTED', progress: { done: 6, total: 6, failedBatches: 0, failedRows: 0 } }));
    expect(done.sheets[0]).toEqual(expect.objectContaining({ inserted: 2_100, rejected: 0 }));
    const { rows } = await ownerDb().query<{ n: number }>(
      `SELECT count(*)::int AS n FROM clients WHERE client_code LIKE '55%' AND owner_agent_codes = ARRAY['00100004']::text[]`,
    );
    expect(rows[0].n).toBe(2_100);
  });

  it('a running write cannot be confirmed or cancelled again', async () => {
    const id = await validated(codes(5_000, 3));
    await ownerDb().query(`UPDATE imports SET status = 'COMMITTING' WHERE id = $1`, [id]);
    await head.post(`${API}/imports/${id}/commit`).expect(409);
    await head.post(`${API}/imports/${id}/cancel`).expect(409);
  });

  it('a write cut off by a restart is closed as it stands and the person is told', async () => {
    const id = await validated(codes(6_000, 3));
    await ownerDb().query(`UPDATE imports SET status = 'COMMITTING' WHERE id = $1`, [id]);
    const service = app.get(ImportsService);
    expect(await service.closeStalled(new Date())).toBe(0);
    expect(await service.closeStalled(new Date(Date.now() + 11 * 60_000))).toBeGreaterThanOrEqual(1);

    expect((await detail(id)).status).toBe('COMMITTED');
    const { body } = await head.get(`${API}/imports/${id}/errors`).expect(200);
    expect(body.items).toEqual([expect.objectContaining({ code: 'import_interrupted', row: 1 })]);
  });

  it('TEN-7: another GA cannot see the import', async () => {
    const { rows } = await ownerDb().query<{ id: string }>(`SELECT id FROM imports WHERE file_name = 'cay-lon.xlsx' LIMIT 1`);
    await head2.get(`${API}/imports/${rows[0].id}`).expect(404);
  });
});
