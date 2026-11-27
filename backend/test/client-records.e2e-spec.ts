import type { INestApplication } from '@nestjs/common';
import request from 'supertest';
import { startApp, stopApp } from './support/app.js';
import { connection } from './support/collections.js';
import { demoEmail, seedDemoData } from '../src/seed/demo-data.js';

const API = '/api/v1';
const PASSWORD = 'demo-password-123';
const POLICY = '720000001';
type Agent = ReturnType<typeof request.agent>;

/** Decided 26/11/2026: care records and referrals a GA enters on a client. */
describe('Client care records and referrals (e2e)', () => {
  let app: INestApplication;
  let fc: Agent;
  let um: Agent;
  let head: Agent;
  let marketing: Agent;
  let head2: Agent;
  let clientId: string;

  const as = async (key: string, ga = 1) => {
    const agent = request.agent(app.getHttpServer());
    await agent
      .post(`${API}/auth/sign-in/email`)
      .send({ email: demoEmail(ga, key), password: PASSWORD })
      .expect(200);
    return agent;
  };
  const detail = async (agent: Agent) =>
    (await agent.get(`${API}/clients/${clientId}`).expect(200)).body as {
      careRecords: Record<string, unknown>[];
      signingSummary: Record<string, number>;
      referrals: Record<string, unknown>[];
      referralSummary: Record<string, number>;
    };
  const care = (agent: Agent, body: Record<string, unknown>) =>
    agent
      .post(`${API}/clients/${clientId}/care-records`)
      .send({ occurredOn: '2026-10-12', ...body });
  const referral = (agent: Agent, body: Record<string, unknown>) =>
    agent.post(`${API}/clients/${clientId}/referrals`).send({
      personName: 'Người Được Giới Thiệu',
      relation: 'FRIEND',
      referredOn: '2026-10-01',
      result: 'PENDING',
      ...body,
    });

  beforeAll(async () => {
    app = await startApp();
    await seedDemoData(app, PASSWORD);
    [fc, um, head, marketing, head2] = await Promise.all([
      as('fc'),
      // Decided 27/11/2026: Admin now plays the one who sees but does not own
      as('admin'),
      as('head'),
      as('admin'),
      as('head', 2),
    ]);
    clientId = (
      await fc
        .post(`${API}/clients`)
        .send({ policyNo: POLICY, role: 'PO', name: 'Khách Được Chăm Sóc' })
        .expect(201)
    ).body.id as string;
  });

  afterAll(async () => {
    await stopApp(app);
  });

  it('keeps each kind of care record with what it must say, and audits it', async () => {
    const claim = (
      await care(fc, {
        kind: 'CLAIM',
        place: 'Bệnh viện Mẫu',
        amountVnd: 3_500_000,
        policyNo: POLICY,
      }).expect(201)
    ).body.id as string;
    await care(fc, {
      kind: 'SEMINAR',
      title: 'Hội thảo sức khỏe quý 4',
      occurredOn: '2026-11-02',
    }).expect(201);
    await care(fc, { kind: 'HEALTH_CHECK' }).expect(201);
    await care(fc, { kind: 'GIFT', title: 'Quà sinh nhật' }).expect(201);
    await care(fc, { kind: 'VISIT', note: 'Thăm khi nằm viện' }).expect(201);
    await care(fc, { kind: 'SIGNING_CASH', amountVnd: 2_000_000 }).expect(201);
    await care(fc, {
      kind: 'SIGNING_GIFT',
      title: 'Nồi chiên',
      amountVnd: 1_500_000,
    }).expect(201);

    const body = await detail(fc);
    expect(body.careRecords).toHaveLength(7);
    // Newest first
    expect(body.careRecords[0]).toMatchObject({
      kind: 'SEMINAR',
      occurredOn: '2026-11-02',
      title: 'Hội thảo sức khỏe quý 4',
    });
    expect(
      body.careRecords.find((item) => item.kind === 'CLAIM'),
    ).toMatchObject({
      id: claim,
      place: 'Bệnh viện Mẫu',
      amountVnd: 3_500_000,
      policyNo: POLICY,
    });
    // Cash apart from gifts
    expect(body.signingSummary).toEqual({
      cashVnd: 2_000_000,
      gifts: 1,
      giftValueVnd: 1_500_000,
    });
    expect(
      await connection.collection('auditEvents').countDocuments({
        entity: 'client_care_record',
        action: 'CREATE',
      }),
    ).toBe(7);

    // What a kind must say, a policy that is not the client's, and bad input
    const refused = async (patch: Record<string, unknown>, path: string) => {
      const res = await care(fc, patch).expect(400);
      expect(res.body).toMatchObject({
        error: 'invalid_input',
        issues: [expect.objectContaining({ path })],
      });
    };
    await refused({ kind: 'CLAIM' }, 'place');
    await refused({ kind: 'GIFT' }, 'title');
    await refused({ kind: 'SIGNING_CASH' }, 'amountVnd');
    await refused(
      { kind: 'CLAIM', place: 'X', policyNo: '999999999' },
      'policyNo',
    );
    await care(fc, { kind: 'NGHI_MAT' }).expect(400);
    await care(fc, { kind: 'VISIT', occurredOn: '2026-02-30' }).expect(400);
    await care(fc, { kind: 'VISIT', amountVnd: -1 }).expect(400);

    // Changing and removing; a kind's rule holds for the record as it will be
    const url = `${API}/clients/${clientId}/care-records/${claim}`;
    await fc.patch(url).send({ place: null }).expect(400);
    await fc
      .patch(url)
      .send({ place: 'Bệnh viện Khác', amountVnd: null })
      .expect(204);
    expect(
      (await detail(fc)).careRecords.find((item) => item.id === claim),
    ).toMatchObject({ place: 'Bệnh viện Khác', amountVnd: null });
    await fc.delete(url).expect(204);
    await fc.delete(url).expect(404);
    expect((await detail(fc)).careRecords).toHaveLength(6);
  });

  it('counts referrals, the successful ones and the premium they brought', async () => {
    const first = (
      await referral(fc, { personName: 'Bạn Một', relation: 'FRIEND' }).expect(
        201,
      )
    ).body.id as string;
    await referral(fc, {
      personName: 'Em Họ',
      relation: 'FAMILY',
      result: 'SUCCESS',
      premiumVnd: 18_000_000,
    }).expect(201);
    await referral(fc, {
      personName: 'Đồng Nghiệp',
      relation: 'COLLEAGUE',
      result: 'FAILED',
    }).expect(201);
    // A premium without success, an unknown relation
    expect(
      (await referral(fc, { premiumVnd: 1_000_000 }).expect(400)).body,
    ).toMatchObject({
      error: 'invalid_input',
      issues: [expect.objectContaining({ path: 'premiumVnd' })],
    });
    await referral(fc, { relation: 'HANG_XOM_CU' }).expect(400);
    await referral(fc, { personName: ' ' }).expect(400);

    expect((await detail(fc)).referralSummary).toEqual({
      total: 3,
      success: 1,
      pending: 1,
      failed: 1,
      premiumVnd: 18_000_000,
    });

    // The first referral succeeds later
    const url = `${API}/clients/${clientId}/referrals/${first}`;
    await fc
      .patch(url)
      .send({ result: 'SUCCESS', premiumVnd: 12_000_000 })
      .expect(204);
    // It cannot go back to pending while it keeps its premium
    await fc.patch(url).send({ result: 'PENDING' }).expect(400);
    const body = await detail(fc);
    expect(body.referralSummary).toMatchObject({
      success: 2,
      pending: 0,
      premiumVnd: 30_000_000,
    });
    expect(body.referrals.find((item) => item.id === first)).toMatchObject({
      personName: 'Bạn Một',
      relation: 'FRIEND',
      result: 'SUCCESS',
      premiumVnd: 12_000_000,
    });
    await fc.delete(url).expect(204);
    expect((await detail(fc)).referralSummary.total).toBe(2);
    expect(
      await connection
        .collection('auditEvents')
        .countDocuments({ entity: 'client_referral' }),
    ).toBe(5);
  });

  it('CUS-5, CUS-6, TEN-7: whoever sees the client reads; only its owner and the GA head write', async () => {
    // The FC's line manager sees the client and its records, but does not own it
    expect((await detail(um)).careRecords).toHaveLength(6);
    await care(um, { kind: 'VISIT' }).expect(403);
    await referral(um, {}).expect(403);
    // The GA head may write
    const id = (await care(head, { kind: 'VISIT' }).expect(201)).body
      .id as string;
    await head
      .delete(`${API}/clients/${clientId}/care-records/${id}`)
      .expect(204);
    // Marketing has no client book; another GA finds nothing
    await care(marketing, { kind: 'VISIT' }).expect(403);
    await care(head2, { kind: 'VISIT' }).expect(404);
    await referral(head2, {}).expect(404);
    await head2.get(`${API}/clients/${clientId}`).expect(404);
    // A record of this client cannot be reached through another client
    const other = (
      await fc
        .post(`${API}/clients`)
        .send({ policyNo: '720000002', role: 'PO', name: 'Khách Khác' })
        .expect(201)
    ).body.id as string;
    const mine = (await detail(fc)).careRecords[0].id as string;
    await fc
      .patch(`${API}/clients/${other}/care-records/${mine}`)
      .send({ note: 'x' })
      .expect(404);
  });
});
