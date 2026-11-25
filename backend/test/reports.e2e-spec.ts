import type { INestApplication } from '@nestjs/common';
import request from 'supertest';
import { startApp, stopApp } from './support/app.js';
import { connection } from './support/collections.js';
import { demoEmail, seedDemoData } from '../src/seed/demo-data.js';

const API = '/api/v1';
const PASSWORD = 'demo-password-123';
const GAD = '00100001';
const BM = '00100002';
const UM = '00100003';
const FC = '00100004';
/** A FC under the BM, outside the UM's line. */
const PEER = '00100093';
type Agent = ReturnType<typeof request.agent>;
interface Row {
  key: string;
  depth: number;
  groupKind: string | null;
  values: Record<string, number>;
}

const TODAY = new Date(Date.now() + 7 * 3_600_000).toISOString().slice(0, 10);

/** Chapter 13: R1, R2 and R8 in the agent-tree layout (slice 6a). */
describe('Reports (e2e)', () => {
  let app: INestApplication;
  let head: Agent;
  let fc: Agent;
  let um: Agent;
  let marketing: Agent;
  let head2: Agent;
  const leadIds: string[] = [];

  const as = async (key: string, ga = 1) => {
    const agent = request.agent(app.getHttpServer());
    await agent
      .post(`${API}/auth/sign-in/email`)
      .send({ email: demoEmail(ga, key), password: PASSWORD })
      .expect(200);
    return agent;
  };
  const report = async (agent: Agent, name: string) =>
    (
      await agent
        .get(`${API}/reports/${name}`)
        .query({ from: TODAY, to: TODAY })
        .expect(200)
    ).body as { rows: Row[]; total: Record<string, number> };
  const row = (rows: Row[], key: string) =>
    rows.find((item) => item.key === key)?.values ?? {};

  beforeAll(async () => {
    app = await startApp();
    await seedDemoData(app, PASSWORD);
    [head, fc, um, marketing, head2] = await Promise.all([
      as('head'),
      as('fc'),
      as('um'),
      as('marketing'),
      as('head', 2),
    ]);
    await head
      .post(`${API}/agents`)
      .send({
        agentCode: PEER,
        name: 'FC Nhánh Khác',
        rank: 'FC',
        status: 'Đang hoạt động',
        startDate: '2024-01-01',
        managerCode: BM,
      })
      .expect(201);
    for (const [phone, agentCode] of [
      ['0911000001', FC],
      ['0911000002', FC],
      ['0911000003', UM],
      ['0911000004', PEER],
      ['0911000005', undefined],
    ])
      leadIds.push(
        (
          await head
            .post(`${API}/leads`)
            .send({
              fullName: `Lead ${phone}`,
              phone,
              source: 'Facebook',
              consent: true,
              ...(agentCode && { assignedAgentCode: agentCode }),
            })
            .expect(201)
        ).body.id,
      );
    // A timed CRM contact, and an interest that counts as an opportunity
    await fc
      .post(`${API}/leads/${leadIds[0]}/activities`)
      .send({ type: 'CALL', note: 'Gọi lần đầu' })
      .expect(201);
    await fc
      .patch(`${API}/leads/${leadIds[0]}`)
      .send({ interest: 'LIFE', careStatus: 'CARING' })
      .expect(200);
    // An untouched lead given out three days ago is overdue (LEAD-29)
    await connection
      .collection('leads')
      .updateOne(
        { _id: leadIds[1] },
        { $set: { assignedAt: new Date(Date.now() - 3 * 86_400_000) } },
      );
  });

  afterAll(async () => {
    await stopApp(app);
  });

  it('test 46 + R1: the tree with group totals and the manager on a row of their own; unassigned for whoever sees every lead', async () => {
    const { rows, total } = await report(head, 'conversion');
    expect(rows.map((item) => [item.key, item.depth, item.groupKind])).toEqual([
      [`group:${GAD}`, 0, 'DEPARTMENT'],
      [`agent:${GAD}`, 1, null],
      [`group:${BM}`, 1, 'BRANCH'],
      [`agent:${BM}`, 2, null],
      [`group:${UM}`, 2, 'DEPARTMENT'],
      [`agent:${UM}`, 3, null],
      [`agent:${FC}`, 3, null],
      [`agent:${PEER}`, 2, null],
      ['unassigned', 0, null],
    ]);
    expect(row(rows, `agent:${FC}`)).toEqual({
      total: 2,
      contacted: 1,
      timed: 1,
      in24h: 1,
      overdue: 1,
      caring: 1,
      won: 0,
      dropped: 0,
      'interest:LIFE': 1,
      opportunity: 1,
    });
    expect(row(rows, `group:${UM}`).total).toBe(3);
    expect(row(rows, `group:${BM}`).total).toBe(4);
    expect(row(rows, 'unassigned').total).toBe(1);
    expect(total.total).toBe(5);
    const body = (
      await head
        .get(`${API}/reports/conversion`)
        .query({ from: TODAY, to: TODAY })
        .expect(200)
    ).body;
    expect(
      body.interests.find((item: { code: string }) => item.code === 'LIFE'),
    ).toMatchObject({ isOpportunity: true });
  });

  it('RPT-3: a FC sees their own row, a line manager their line, Marketing the whole GA', async () => {
    expect(
      (await report(fc, 'conversion')).rows.map((item) => item.key),
    ).toEqual([`agent:${FC}`]);
    expect(
      (await report(um, 'conversion')).rows.map((item) => item.key),
    ).toEqual([`group:${UM}`, `agent:${UM}`, `agent:${FC}`]);
    const all = await report(marketing, 'conversion');
    expect(all.rows.at(-1)?.key).toBe('unassigned');
    expect(all.total.total).toBe(5);
  });

  it('test 33 + R2: CRM and Success activities, one person once a day per type; Success drafts left out', async () => {
    const tenant = await connection
      .collection('tenants')
      .findOne({ gaCode: 'GA-HN' });
    const base = {
      tenantId: tenant!._id,
      agentCode: FC,
      startedAt: new Date(),
      activityDate: TODAY,
    };
    await connection.collection('successActivities').insertMany([
      // The same call the CRM already has
      {
        ...base,
        activityId: 'S1',
        activityType: 'CALL',
        status: 'approved',
        phoneKey: '0911***001',
      },
      {
        ...base,
        activityId: 'S2',
        activityType: 'MEETING',
        status: 'approved',
        phoneKey: '0911***001',
      },
      { ...base, activityId: 'S3', activityType: 'COACHING', status: 'draft' },
      {
        ...base,
        activityId: 'S4',
        activityType: 'CALL',
        callType: 'zalo',
        status: 'locked',
      },
    ]);
    const { rows } = await report(fc, 'activities');
    expect(row(rows, `agent:${FC}`)).toEqual({
      CALL: 1,
      MEETING: 1,
      ZALO: 1,
      total: 3,
      fromCrm: 1,
      fromSuccess: 2,
    });
  });

  it('R8: received, handed over, handed over with no contact, days held', async () => {
    await head
      .post(`${API}/leads/assign`)
      .send({ leadIds: [leadIds[0], leadIds[1]], agentCode: PEER })
      .expect(201);
    const { rows } = await report(head, 'handovers');
    expect(row(rows, `agent:${FC}`)).toEqual({
      received: 2,
      handedOver: 2,
      holdDays: 0,
      // The second lead was never contacted
      noContact: 1,
    });
    expect(row(rows, `agent:${PEER}`)).toMatchObject({ received: 3 });
  });

  it('RPT-8 + RPT-4: a period in order and not over a year long; this month by default', async () => {
    await head
      .get(`${API}/reports/conversion`)
      .query({ from: '2026-12-02', to: '2026-12-01' })
      .expect(400);
    await head
      .get(`${API}/reports/conversion`)
      .query({ from: '2024-01-01', to: '2026-12-31' })
      .expect(400);
    const { body } = await head.get(`${API}/reports/conversion`).expect(200);
    expect(body.from).toBe(`${TODAY.slice(0, 7)}-01`);
  });

  it('RPT-6: exporting needs exports.data and is audited with the period', async () => {
    await fc
      .post(`${API}/reports/exports`)
      .send({ report: 'conversion', from: TODAY, to: TODAY })
      .expect(403);
    await head
      .post(`${API}/reports/exports`)
      .send({ report: 'conversion', from: TODAY, to: TODAY })
      .expect(204);
    expect(
      await connection
        .collection('auditEvents')
        .findOne({ action: 'EXPORT', entity: 'report' }),
    ).toMatchObject({ meta: { report: 'conversion', from: TODAY, to: TODAY } });
  });

  it('TEN-7: another GA counts none of GA-1', async () => {
    const { total, rows } = await report(head2, 'conversion');
    expect(total.total ?? 0).toBe(0);
    expect(rows.some((item) => item.key === `agent:${FC}`)).toBe(false);
  });
  it('R3: the funnel by source and by campaign; campaign costs only for whoever sees every lead', async () => {
    const bySource = (
      await head
        .get(`${API}/reports/funnel`)
        .query({ from: TODAY, to: TODAY })
        .expect(200)
    ).body as {
      rows: (Row & { name: string })[];
      total: Record<string, number>;
    };
    expect(bySource.rows).toHaveLength(1);
    expect(bySource.rows[0]).toMatchObject({
      name: 'Facebook',
      values: {
        leads: 5,
        contacted: 1,
        opportunity: 1,
        won: 0,
        linked: 0,
        issued: 0,
      },
    });
    const campaign = (
      await marketing
        .post(`${API}/campaigns`)
        .send({ name: 'Phễu thử', type: 'ADS', budgetVnd: 3_000_000 })
        .expect(201)
    ).body.id;
    await marketing
      .post(`${API}/leads`)
      .send({
        fullName: 'Lead Chiến Dịch',
        phone: '0911000009',
        source: 'Facebook',
        consent: true,
        campaignId: campaign,
        assignedAgentCode: FC,
      })
      .expect(201);
    const byCampaign = (
      await head
        .get(`${API}/reports/funnel`)
        .query({ from: TODAY, to: TODAY, groupBy: 'campaign' })
        .expect(200)
    ).body.rows as (Row & { name: string | null })[];
    expect(
      byCampaign.find((item) => item.name === 'Phễu thử')?.values,
    ).toMatchObject({
      leads: 1,
      budgetVnd: 3_000_000,
      perLeadVnd: 3_000_000,
    });
    // Leads with no campaign are a row of their own
    expect(
      byCampaign.find((item) => item.key === 'campaign:NONE')?.values.leads,
    ).toBe(5);
    const mine = (
      await fc
        .get(`${API}/reports/funnel`)
        .query({ from: TODAY, to: TODAY, groupBy: 'campaign' })
        .expect(200)
    ).body.rows as Row[];
    expect(mine.every((item) => item.values.budgetVnd === undefined)).toBe(
      true,
    );
  });

  it('R5: open leads by agent and stage, their value, and days in the stage', async () => {
    await connection.collection('leads').updateOne(
      { _id: leadIds[3] },
      {
        $set: {
          valueVnd: 20_000_000,
          createdAt: new Date(Date.now() - 5 * 86_400_000),
        },
      },
    );
    const { rows } = (await head.get(`${API}/reports/pipeline`).expect(200))
      .body as { rows: Row[] };
    expect(row(rows, `agent:${UM}`)).toMatchObject({ open: 1, 'count:NEW': 1 });
    expect(row(rows, `agent:${PEER}`)).toMatchObject({
      'ape:NEW': 20_000_000,
      'days:NEW': 5,
    });
    expect(row(rows, 'unassigned')).toMatchObject({ open: 1 });
  });

  it('R7: clients with each signal by owner, and contacts and notes on clients in the period', async () => {
    const clientId = (
      await fc
        .post(`${API}/clients`)
        .send({
          policyNo: '910000001',
          role: 'PO',
          name: 'Khách Sinh Nhật',
          dob: `1990-${TODAY.slice(5, 7)}-01`,
        })
        .expect(201)
    ).body.id as string;
    await fc
      .post(`${API}/clients/${clientId}/notes`)
      .send({ body: 'Chúc mừng sinh nhật' })
      .expect(201);
    for (let time = 0; time < 2; time++)
      await fc
        .post(`${API}/clients/${clientId}/activities`)
        .send({ type: 'CALL', note: 'Gọi hỏi thăm' })
        .expect(201);
    const { rows } = await report(fc, 'care');
    expect(row(rows, `agent:${FC}`)).toEqual({
      clients: 1,
      birthday: 1,
      notes: 1,
      contacts: 2,
      clientsContacted: 1,
    });
    await head2.get(`${API}/reports/care`).expect(200);
    expect(row((await report(head2, 'care')).rows, `agent:${FC}`)).toEqual({});
  });
});
