import type { INestApplication } from '@nestjs/common';
import request from 'supertest';
import { startApp, stopApp } from './support/app.js';
import { connection } from './support/collections.js';
import { demoEmail, seedDemoData } from '../src/seed/demo-data.js';

const API = '/api/v1';
const PASSWORD = 'demo-password-123';
const FC = '00100004';
/** A FC in another branch: the demo FC does not see their leads. */
const PEER = '00100095';
type Agent = ReturnType<typeof request.agent>;

/** Chapter 11: campaigns and seminars (slice 5b). */
describe('Campaigns and seminars (e2e)', () => {
  let app: INestApplication;
  let head: Agent;
  let marketing: Agent;
  let fc: Agent;
  let head2: Agent;
  let seminarId: string;
  let adsId: string;
  const leadIds: string[] = [];

  const as = async (key: string, ga = 1) => {
    const agent = request.agent(app.getHttpServer());
    await agent
      .post(`${API}/auth/sign-in/email`)
      .send({ email: demoEmail(ga, key), password: PASSWORD })
      .expect(200);
    return agent;
  };
  const detail = async (agent: Agent, id: string) =>
    (await agent.get(`${API}/campaigns/${id}`).expect(200)).body;

  beforeAll(async () => {
    app = await startApp();
    await seedDemoData(app, PASSWORD);
    [head, marketing, fc, head2] = await Promise.all([
      as('head'),
      as('marketing'),
      as('fc'),
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
        managerCode: '00100002',
      })
      .expect(201);
  });

  afterAll(async () => {
    await stopApp(app);
  });

  it('CMP-1 + CMP-5: only campaigns.manage creates; names are unique in the GA; dates in order', async () => {
    await fc
      .post(`${API}/campaigns`)
      .send({ name: 'Không được', type: 'ADS' })
      .expect(403);
    seminarId = (
      await marketing
        .post(`${API}/campaigns`)
        .send({
          name: 'Hội thảo hưu trí',
          type: 'SEMINAR',
          budgetVnd: 9_000_000,
          startDate: '2026-12-01',
          endDate: '2026-12-31',
          eventAt: '2026-11-01T02:00:00.000Z',
          location: 'Khách sạn A, Quận 1',
        })
        .expect(201)
    ).body.id;
    adsId = (
      await head
        .post(`${API}/campaigns`)
        .send({ name: 'Quảng cáo Facebook', type: 'ADS', channel: 'Facebook' })
        .expect(201)
    ).body.id;
    expect(
      (
        await marketing
          .post(`${API}/campaigns`)
          .send({ name: 'Hội thảo hưu trí', type: 'ADS' })
          .expect(409)
      ).body.error,
    ).toBe('campaign_exists');
    await marketing
      .post(`${API}/campaigns`)
      .send({
        name: 'Ngày sai',
        type: 'ADS',
        startDate: '2026-12-02',
        endDate: '2026-12-01',
      })
      .expect(400);
    expect(
      await connection
        .collection('auditEvents')
        .countDocuments({ entity: 'campaign', action: 'CREATE' }),
    ).toBe(2);
    expect((await detail(marketing, seminarId)).campaign).toMatchObject({
      status: 'PLANNED',
      type: 'SEMINAR',
      location: 'Khách sạn A, Quận 1',
    });
  });

  it('CMP-3 + LEAD-6: counts follow the leads each person sees; only who sees every lead sees costs', async () => {
    for (const [name, agentCode, phone] of [
      ['Lead Một', FC, '0911000001'],
      ['Lead Hai', FC, '0911000002'],
      ['Lead Ba', PEER, '0911000003'],
    ])
      leadIds.push(
        (
          await marketing
            .post(`${API}/leads`)
            .send({
              fullName: name,
              phone,
              source: 'Facebook',
              consent: true,
              campaignId: seminarId,
              assignedAgentCode: agentCode,
            })
            .expect(201)
        ).body.id,
      );
    await fc
      .patch(`${API}/leads/${leadIds[0]}`)
      .send({ stage: 'PROPOSAL' })
      .expect(200);

    const mine = (await fc.get(`${API}/campaigns`).expect(200)).body;
    const seminarRow = mine.items.find(
      (item: { id: string }) => item.id === seminarId,
    );
    expect(seminarRow).toMatchObject({
      leads: 2,
      budgetVnd: null,
      costPerLeadVnd: null,
    });
    expect(mine.canManage).toBe(false);
    const all = (await marketing.get(`${API}/campaigns`).expect(200)).body;
    expect(
      all.items.find((item: { id: string }) => item.id === seminarId),
    ).toMatchObject({
      leads: 3,
      budgetVnd: 9_000_000,
      costPerLeadVnd: 3_000_000,
    });

    const stats = (await detail(marketing, seminarId)).stats;
    expect(stats).toMatchObject({
      leads: 3,
      byStage: { NEW: 2, PROPOSAL: 1 },
      linkedClients: 0,
      issued: 0,
      perLeadVnd: 3_000_000,
      perIssuedVnd: null,
    });
    expect((await detail(fc, seminarId)).stats).toMatchObject({
      leads: 2,
      perLeadVnd: null,
    });
    // CMP-5: anyone who sees leads filters them by campaign
    const filtered = (
      await fc.get(`${API}/leads`).query({ campaignId: seminarId }).expect(200)
    ).body;
    expect(filtered.total).toBe(2);
  });

  it('CMP-2: seminar members; ATTENDED writes one SEMINAR contact; the FC marks only their own leads', async () => {
    expect(
      (
        await marketing
          .post(`${API}/campaigns/${adsId}/members`)
          .send({ leadIds: [leadIds[0]], status: 'INVITED' })
          .expect(409)
      ).body.error,
    ).toBe('campaign_not_seminar');
    await fc
      .post(`${API}/campaigns/${seminarId}/members`)
      .send({ leadIds: [leadIds[0]], status: 'INVITED' })
      .expect(403);
    const { body } = await marketing
      .post(`${API}/campaigns/${seminarId}/members`)
      .send({ leadIds, status: 'INVITED' })
      .expect(200);
    expect(body).toEqual({ added: 3 });

    const members = (await detail(fc, seminarId)).members as {
      leadId: string;
      status: string;
      canUpdate: boolean;
    }[];
    // The FC sees the people of their own leads only
    expect(members.map((member) => member.leadId).sort()).toEqual(
      leadIds.slice(0, 2).sort(),
    );
    expect(members.every((member) => member.canUpdate)).toBe(true);

    for (let time = 0; time < 2; time++)
      await fc
        .patch(`${API}/campaigns/${seminarId}/members/${leadIds[0]}`)
        .send({ status: 'ATTENDED' })
        .expect(204);
    const contacts = await connection
      .collection('interactions')
      .find({ type: 'SEMINAR' })
      .toArray();
    expect(contacts).toHaveLength(1);
    expect(contacts[0]).toMatchObject({
      agentCode: FC,
      note: 'Tham dự hội thảo Hội thảo hưu trí',
      occurredAt: new Date('2026-11-01T02:00:00.000Z'),
    });
    const lead = (await fc.get(`${API}/leads/${leadIds[0]}`).expect(200)).body;
    expect(
      lead.interactions.map((item: { type: string }) => item.type),
    ).toContain('SEMINAR');

    await fc
      .patch(`${API}/campaigns/${seminarId}/members/${leadIds[2]}`)
      .send({ status: 'ATTENDED' })
      .expect(404);
    await marketing
      .patch(`${API}/campaigns/${seminarId}/members/${leadIds[2]}`)
      .send({ status: 'NO_SHOW' })
      .expect(204);
  });

  it('CMP-5 + DATA-8: a campaign with leads only ends; one made by mistake can go', async () => {
    expect(
      (await marketing.delete(`${API}/campaigns/${seminarId}`).expect(409)).body
        .error,
    ).toBe('campaign_in_use');
    await marketing
      .patch(`${API}/campaigns/${seminarId}`)
      .send({ status: 'ENDED', budgetVnd: null, location: null })
      .expect(204);
    expect((await detail(marketing, seminarId)).campaign).toMatchObject({
      status: 'ENDED',
      budgetVnd: null,
      location: null,
    });
    await fc
      .patch(`${API}/campaigns/${adsId}`)
      .send({ status: 'ENDED' })
      .expect(403);
    await marketing.delete(`${API}/campaigns/${adsId}`).expect(204);
    await marketing.get(`${API}/campaigns/${adsId}`).expect(404);
  });

  it('TEN-7: GA-2 sees none of GA-1 campaigns', async () => {
    await head2.get(`${API}/campaigns/${seminarId}`).expect(404);
    await head2
      .patch(`${API}/campaigns/${seminarId}`)
      .send({ status: 'ACTIVE' })
      .expect(404);
    const list = (await head2.get(`${API}/campaigns`).expect(200)).body;
    expect(list.items).toEqual([]);
  });
});
