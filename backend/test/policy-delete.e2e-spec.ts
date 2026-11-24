import type { INestApplication } from '@nestjs/common';
import request from 'supertest';
import { startApp, stopApp } from './support/app.js';
import { ownerDb } from './support/owner-db.js';
import { demoEmail, seedDemoData } from '../src/seed/demo-data.js';

const API = '/api/v1';
const PASSWORD = 'demo-password-123';
type Agent = ReturnType<typeof request.agent>;

const policyBody = (policyNo: string) => ({
  policyNo,
  status: 'Đang hiệu lực',
  effectiveDate: '2024-06-01',
  maturityDate: '2044-06-01',
  premiumFrequency: 'Năm',
  basePremiumVnd: 12_000_000,
  products: [{ programCode: 'AN_TAM_SONG_HANH', sumAssuredVnd: 500_000_000, termYears: 20 }],
});

/** POL-7 (open question 12b, decided 14/11/2026): deleting a policy entered by hand by mistake. */
describe('Deleting a hand-entered policy (e2e)', () => {
  let app: INestApplication;
  let head: Agent;
  let fc: Agent;
  let um: Agent;
  let head2: Agent;
  /** The client's id, known once they are added. */
  let CLIENT: string;

  const as = async (key: string, ga = 1) => {
    const agent = request.agent(app.getHttpServer());
    await agent.post(`${API}/auth/sign-in/email`).send({ email: demoEmail(ga, key), password: PASSWORD }).expect(200);
    return agent;
  };
  const addPolicy = (policyNo: string) => fc.post(`${API}/clients/${CLIENT}/policies`).send(policyBody(policyNo)).expect(201);
  const policiesOf = async (agent: Agent) =>
    ((await agent.get(`${API}/clients/${CLIENT}`).expect(200)).body.policies as { policyNo: string; canDelete: boolean }[]);
  const stored = async (policyNo: string) =>
    (await ownerDb().query(`SELECT 1 FROM policies WHERE policy_no = $1`, [policyNo])).rows.length > 0;

  beforeAll(async () => {
    app = await startApp();
    await seedDemoData(app, PASSWORD);
    [head, fc, um, head2] = await Promise.all([as('head'), as('fc'), as('um'), as('head', 2)]);
    // Added on a policy known only by its number; the policies under test are added to them
    CLIENT = (
      await fc
        .post(`${API}/clients`)
        .send({ policyNo: '600000000', role: 'PO', name: 'Khách Nhập Tay', dob: '1985-03-02' })
        .expect(201)
    ).body.id;
  });

  afterAll(async () => {
    await stopApp(app);
  });

  it('the agent who may edit the client deletes a policy entered by hand within 7 days; it is audited', async () => {
    await addPolicy('600000001');
    expect((await policiesOf(fc)).find((item) => item.policyNo === '600000001')?.canDelete).toBe(true);

    await fc.delete(`${API}/clients/${CLIENT}/policies/600000001`).expect(204);

    expect(await stored('600000001')).toBe(false);
    expect((await policiesOf(fc)).map((item) => item.policyNo)).not.toContain('600000001');
    const { rows } = await ownerDb().query(
      `SELECT action, meta FROM audit_events WHERE entity = 'policy' AND entity_id = '600000001' ORDER BY id`,
    );
    expect(rows.map((row) => row.action)).toEqual(['CREATE', 'DELETE']);
    expect(rows[1].meta).toEqual(expect.objectContaining({ clientId: CLIENT, products: 1 }));
  });

  it('not after 7 days', async () => {
    await addPolicy('600000002');
    await ownerDb().query(`UPDATE policies SET created_at = now() - interval '8 days' WHERE policy_no = '600000002'`);
    expect((await policiesOf(fc)).find((item) => item.policyNo === '600000002')?.canDelete).toBe(false);
    const res = await fc.delete(`${API}/clients/${CLIENT}/policies/600000002`).expect(409);
    expect(res.body.error).toBe('policy_not_deletable');
    expect(await stored('600000002')).toBe(true);
  });

  it('not once a Success import has written it, nor a policy that came from Success', async () => {
    await addPolicy('600000003');
    const { rows } = await ownerDb().query<{ id: string }>(`SELECT id FROM imports LIMIT 1`);
    // Any import id will do: the column says an import touched the policy
    await ownerDb().query(
      `UPDATE policies SET last_import_id = coalesce($1::uuid, uuidv7()) WHERE policy_no = '600000003'`,
      [rows[0]?.id ?? null],
    );
    await fc.delete(`${API}/clients/${CLIENT}/policies/600000003`).expect(409);
    await addPolicy('600000004');
    await ownerDb().query(`UPDATE policies SET origin = 'IMPORT' WHERE policy_no = '600000004'`);
    await fc.delete(`${API}/clients/${CLIENT}/policies/600000004`).expect(409);
  });

  it('a line manager who may not edit the client cannot; the GA head can; another GA gets 404 (TEN-7)', async () => {
    await addPolicy('600000005');
    const refused = await um.delete(`${API}/clients/${CLIENT}/policies/600000005`).expect(403);
    expect(refused.body.error).toBe('client_not_yours');
    await head2.delete(`${API}/clients/${CLIENT}/policies/600000005`).expect(404);
    expect(await stored('600000005')).toBe(true);
    await head.delete(`${API}/clients/${CLIENT}/policies/600000005`).expect(204);
  });

  it('a policy number of another client is not found from this one', async () => {
    const other = (
      await fc
        .post(`${API}/clients`)
        .send({ policyNo: '600000009', role: 'PO', name: 'Khách Khác', dob: '1990-01-01' })
        .expect(201)
    ).body.id as string;
    await fc.post(`${API}/clients/${other}/policies`).send(policyBody('600000006')).expect(201);
    await fc.delete(`${API}/clients/${CLIENT}/policies/600000006`).expect(404);
    expect(await stored('600000006')).toBe(true);
  });
});
