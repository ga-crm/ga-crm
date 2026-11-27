import type { INestApplication } from '@nestjs/common';
import request from 'supertest';
import { startApp, stopApp } from './support/app.js';
import { connection } from './support/collections.js';
import { demoEmail, seedDemoData } from '../src/seed/demo-data.js';

const API = '/api/v1';
const PASSWORD = 'demo-password-123';
type Agent = ReturnType<typeof request.agent>;

/** Decided 25/11/2026: the policy page's detail and premium fields, and the hidden contact address. */
describe('Policy details (e2e)', () => {
  let app: INestApplication;
  let fc: Agent;
  let head: Agent;
  let marketing: Agent;
  let head2: Agent;
  let clientId: string;
  const POLICY = '710000001';
  const ADDRESS = '12 Lê Lợi, Phường Bến Nghé, TP.HCM';

  const as = async (email: string) => {
    const agent = request.agent(app.getHttpServer());
    await agent
      .post(`${API}/auth/sign-in/email`)
      .send({ email, password: PASSWORD })
      .expect(200);
    return agent;
  };
  const policyOf = async (agent: Agent) =>
    (
      (await agent.get(`${API}/clients/${clientId}`).expect(200)).body as {
        policies: Record<string, unknown>[];
      }
    ).policies.find((policy) => policy.policyNo === POLICY)!;

  beforeAll(async () => {
    app = await startApp();
    await seedDemoData(app, PASSWORD);
    [fc, head, marketing, head2] = await Promise.all([
      as(demoEmail(1, 'fc')),
      as(demoEmail(1, 'head')),
      as(demoEmail(1, 'admin')),
      as(demoEmail(2, 'head')),
    ]);
    clientId = (
      await fc
        .post(`${API}/clients`)
        .send({ policyNo: POLICY, role: 'PO', name: 'Khách Có Địa Chỉ' })
        .expect(201)
    ).body.id as string;
  });

  afterAll(async () => {
    await stopApp(app);
  });

  it('keeps the premium fields, and returns only whether a contact address exists', async () => {
    await fc
      .patch(`${API}/clients/${clientId}/policies/${POLICY}`)
      .send({
        status: 'Đang hiệu lực',
        contactAddress: ADDRESS,
        sumAssuredVnd: 900_000_000,
        graceEndDate: '2027-12-12',
        advancePremiumVnd: 1_000_000,
        totalPaidPremiumVnd: 18_059_000,
        basicPremiumVnd: 18_059_000,
        topUpPremiumVnd: 2_000_000,
      })
      .expect(204);

    const policy = await policyOf(fc);
    expect(policy).toMatchObject({
      hasContactAddress: true,
      sumAssuredVnd: 900_000_000,
      // No main product line yet: the page falls back to the policy's own sum assured
      mainSumAssuredVnd: null,
      graceEndDate: '2027-12-12',
      advancePremiumVnd: 1_000_000,
      totalPaidPremiumVnd: 18_059_000,
      basicPremiumVnd: 18_059_000,
      topUpPremiumVnd: 2_000_000,
      assignmentType: null,
      assignmentDate: null,
    });
    expect(policy).not.toHaveProperty('contactAddress');
    expect(JSON.stringify(policy)).not.toContain('Lê Lợi');

    // The change history notes the address changed, never its value
    const change = await connection
      .collection('recordChanges')
      .findOne({ entityKey: POLICY, field: 'contactAddress' });
    expect(change).toMatchObject({ newValue: '***' });
  });

  it("takes the policy's sum assured from its main product line", async () => {
    await fc
      .patch(`${API}/clients/${clientId}/policies/${POLICY}`)
      .send({
        products: [
          { productCode: 'AN_TAM_SONG_HANH', sumAssuredVnd: 1_586_000_000 },
          { productCode: 'BH_TAI_NAN_CAO_CAP', sumAssuredVnd: 200_000_000 },
        ],
      })
      .expect(204);
    expect(await policyOf(fc)).toMatchObject({
      mainSumAssuredVnd: 1_586_000_000,
      sumAssuredVnd: 900_000_000,
    });
  });

  it('reveals the contact address to who sees the client, and audits every reveal (CUS-5, TEN-7)', async () => {
    const url = `${API}/clients/${clientId}/policies/${POLICY}/contact-address`;
    expect((await fc.get(url).expect(200)).body).toEqual({
      contactAddress: ADDRESS,
    });
    expect((await head.get(url).expect(200)).body.contactAddress).toBe(
      ADDRESS,
    );
    expect(
      await connection.collection('auditEvents').countDocuments({
        action: 'VIEW_CLIENT',
        entity: 'policy',
        entityId: POLICY,
      }),
    ).toBe(2);

    // Admin sees the client but not its contact data (27/11/2026); another GA does not see it
    await marketing.get(url).expect(403);
    await head2.get(url).expect(404);

    // A FC does not see a client of another branch
    await head
      .post(`${API}/agents`)
      .send({
        agentCode: '00100096',
        name: 'FC Nhánh Khác',
        rank: 'FC',
        status: 'Đang hoạt động',
        startDate: '2024-01-01',
        managerCode: '00100002',
      })
      .expect(201);
    const theirs = (
      await head
        .post(`${API}/clients`)
        .send({
          policyNo: '710000002',
          role: 'PO',
          name: 'Khách Nhánh Khác',
          agentCode: '00100096',
        })
        .expect(201)
    ).body.id as string;
    await head
      .patch(`${API}/clients/${theirs}/policies/710000002`)
      .send({ contactAddress: ADDRESS })
      .expect(204);
    await fc
      .get(`${API}/clients/${theirs}/policies/710000002/contact-address`)
      .expect(404);
    // A policy that does not name this client
    await fc
      .get(`${API}/clients/${clientId}/policies/000000999/contact-address`)
      .expect(404);
  });
});
