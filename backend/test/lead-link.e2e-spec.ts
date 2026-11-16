import type { INestApplication } from '@nestjs/common';
import request from 'supertest';
import { startApp, stopApp } from './support/app.js';
import { connection } from './support/collections.js';
import { demoEmail, seedDemoData } from '../src/seed/demo-data.js';

const API = '/api/v1';
const PASSWORD = 'demo-password-123';
const FC = '00100004';
/** A second FC under the UM, with no user account. */
const FC2 = '00100094';
/** A FC in another branch. */
const PEER = '00100095';
const SAME_NAME = '8000000001';
const SAME_PHONE = '8000000002';
const PEERS_TWIN = '8000000003';
const LEAD_PHONE = '0987654321';
type Agent = ReturnType<typeof request.agent>;
type Cell = string | number | null;

// LEAD-33 compares Success dates with the lead's day, which is today
const TODAY = new Date(Date.now() + 7 * 3_600_000).toISOString().slice(0, 10);
const TODAY_VN = TODAY.split('-').reverse().join('/');

/** Section 8.8: linking a lead to the client it became, and what Success data does next (slice 5a). */
describe('Lead - client link (e2e)', () => {
  let app: INestApplication;
  let head: Agent;
  let fc: Agent;
  let head2: Agent;
  let leadId: string;
  let otherLeadId: string;

  const as = async (key: string, ga = 1) => {
    const agent = request.agent(app.getHttpServer());
    await agent
      .post(`${API}/auth/sign-in/email`)
      .send({ email: demoEmail(ga, key), password: PASSWORD })
      .expect(200);
    return agent;
  };
  const clientOf = (clientCode: string) =>
    connection.collection('clients').findOne({ clientCode });
  const leadOf = async (id: string) =>
    (await fc.get(`${API}/leads/${id}`).expect(200)).body;
  const importApplications = async (rows: Cell[][]) => {
    const headers = [
      'Số HSYCBH',
      'Mã đại lý',
      'Mã KH',
      'Bên mua BH',
      'Ngày tạo hồ sơ',
      'Tình trạng',
      'Số HĐBH',
    ];
    const { id } = (
      await head
        .post(`${API}/imports`)
        .send({
          fileName: 'success.xlsx',
          snapshotDate: TODAY,
          kind: 'SUCCESS',
          sheets: [{ name: '05_Applications', headers }],
        })
        .expect(201)
    ).body;
    await head
      .post(`${API}/imports/${id}/rows`)
      .send({
        sheet: '05_Applications',
        rows: rows.map((c, index) => ({ r: index + 2, c })),
      })
      .expect(200);
    await head.post(`${API}/imports/${id}/validate`).expect(200);
    await head.post(`${API}/imports/${id}/commit`).expect(200);
    return id as string;
  };

  beforeAll(async () => {
    app = await startApp();
    await seedDemoData(app, PASSWORD);
    [head, fc, head2] = await Promise.all([
      as('head'),
      as('fc'),
      as('head', 2),
    ]);
    for (const [agentCode, managerCode] of [
      [FC2, '00100003'],
      [PEER, '00100002'],
    ])
      await head
        .post(`${API}/agents`)
        .send({
          agentCode,
          name: `FC ${agentCode}`,
          rank: 'FC',
          status: 'Đang hoạt động',
          startDate: '2024-01-01',
          managerCode,
        })
        .expect(201);
    await fc
      .post(`${API}/clients`)
      .send({
        clientCode: SAME_NAME,
        name: 'Nguyễn Văn An',
        gender: 'Nam',
      })
      .expect(201);
    await fc
      .post(`${API}/clients`)
      .send({
        clientCode: SAME_PHONE,
        name: 'Anh An Khác Tên',
        phone: LEAD_PHONE,
      })
      .expect(201);
    await head
      .post(`${API}/clients`)
      .send({ clientCode: PEERS_TWIN, name: 'Nguyễn Văn An', agentCode: PEER })
      .expect(201);
    // A manager's lead given to the FC, so it can later move to someone else (LEAD-9)
    leadId = (
      await head
        .post(`${API}/leads`)
        .send({
          fullName: 'Nguyễn Văn An',
          phone: LEAD_PHONE,
          gender: 'Nam',
          source: 'Facebook',
          consent: true,
          assignedAgentCode: FC,
        })
        .expect(201)
    ).body.id;
    otherLeadId = (
      await head
        .post(`${API}/leads`)
        .send({
          fullName: 'Người Khác',
          phone: '0987000111',
          source: 'Facebook',
          consent: true,
          assignedAgentCode: FC,
        })
        .expect(201)
    ).body.id;
  });

  afterAll(async () => {
    await stopApp(app);
  });

  it('LEAD-32: linking waits for PROPOSAL (or a won lead)', async () => {
    expect((await leadOf(leadId)).canLink).toBe(false);
    expect(
      (
        await fc
          .post(`${API}/leads/${leadId}/link`)
          .send({ clientCode: SAME_NAME })
          .expect(409)
      ).body.error,
    ).toBe('lead_not_linkable');
    for (const id of [leadId, otherLeadId])
      await fc
        .patch(`${API}/leads/${id}`)
        .send({ stage: 'PROPOSAL' })
        .expect(200);
    expect((await leadOf(leadId)).canLink).toBe(true);
  });

  it('LEAD-32: suggestions in the FC scope, scored by name, phone, gender; a search finds by code', async () => {
    const { items } = (
      await fc.get(`${API}/leads/${leadId}/link-suggestions`).expect(200)
    ).body as { clientCode: string; score: number; reasons: string[] }[] & {
      items: { clientCode: string; score: number; reasons: string[] }[];
    };
    expect(
      items.map((item) => [item.clientCode, item.score, item.reasons]),
    ).toEqual([
      [SAME_NAME, 0.7, ['NAME', 'GENDER']],
      [SAME_PHONE, 0.4, ['PHONE']],
    ]);
    // Never a client outside the FC scope, even with the same name
    const found = (
      await head
        .get(`${API}/leads/${leadId}/link-suggestions`)
        .query({ q: PEERS_TWIN })
        .expect(200)
    ).body.items;
    expect(found).toEqual([]);
    const byCode = (
      await fc
        .get(`${API}/leads/${leadId}/link-suggestions`)
        .query({ q: SAME_PHONE })
        .expect(200)
    ).body.items;
    expect(
      byCode.map((item: { clientCode: string }) => item.clientCode),
    ).toEqual([SAME_PHONE]);
    await fc
      .post(`${API}/leads/${leadId}/link`)
      .send({ clientCode: PEERS_TWIN })
      .expect(404);
  });

  it('LEAD-32 + CUS-4: a link is audited, one lead per client, and the client follows the lead to its new agent', async () => {
    await fc
      .post(`${API}/leads/${leadId}/link`)
      .send({ clientCode: SAME_NAME })
      .expect(204);
    expect((await leadOf(leadId)).link).toMatchObject({
      clientCode: SAME_NAME,
      clientName: 'Nguyễn Văn An',
    });
    expect(
      await connection
        .collection('auditEvents')
        .findOne({ action: 'LINK', entityId: leadId }),
    ).toMatchObject({ meta: { clientCode: SAME_NAME } });
    expect(
      (
        await fc
          .post(`${API}/leads/${otherLeadId}/link`)
          .send({ clientCode: SAME_NAME })
          .expect(409)
      ).body.error,
    ).toBe('client_already_linked');
    // A linked client is no longer suggested to another lead
    const others = (
      await fc
        .get(`${API}/leads/${otherLeadId}/link-suggestions`)
        .query({ q: 'Nguyễn Văn An' })
        .expect(200)
    ).body.items;
    expect(others).toEqual([]);

    await head
      .post(`${API}/leads/assign`)
      .send({ leadIds: [leadId], agentCode: FC2 })
      .expect(201);
    const client = await clientOf(SAME_NAME);
    expect(client?.agentLinks).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ agentCode: FC2, source: 'LEAD_LINK' }),
      ]),
    );
    expect(client?.ownerAgentCodes).toEqual(expect.arrayContaining([FC, FC2]));
    await head
      .post(`${API}/leads/assign`)
      .send({ leadIds: [leadId], agentCode: FC })
      .expect(201);
  });

  it('LEAD-34: the client page shows the lead it came from', async () => {
    const { body } = await fc.get(`${API}/clients/${SAME_NAME}`).expect(200);
    expect(body.linkedLead).toMatchObject({
      id: leadId,
      fullName: 'Nguyễn Văn An',
      source: 'Facebook',
      assignedAgentCode: FC,
      canOpen: true,
    });
    expect(
      (await fc.get(`${API}/clients/${SAME_PHONE}`).expect(200)).body
        .linkedLead,
    ).toBeNull();
  });

  it('LEAD-33: a Success import moves the linked lead to SUBMITTED, then ISSUED, never back', async () => {
    const first = await importApplications([
      [
        'A8001',
        FC,
        SAME_NAME,
        'Nguyễn Văn An',
        TODAY_VN,
        'Đang chờ NB xử lý',
        '',
      ],
    ]);
    let lead = (await leadOf(leadId)).lead;
    expect(lead).toMatchObject({
      stage: 'SUBMITTED',
      careStatus: 'WON',
      applicationNo: 'A8001',
    });
    const history = await connection
      .collection('leadHistory')
      .find({ field: 'stage', newValue: 'SUBMITTED' })
      .toArray();
    expect(history.map((row) => String(row.importId))).toEqual([first]);

    await importApplications([
      [
        'A8001',
        FC,
        SAME_NAME,
        'Nguyễn Văn An',
        TODAY_VN,
        'Đã phát hành hợp đồng',
        '800000001',
      ],
    ]);
    lead = (await leadOf(leadId)).lead;
    expect(lead).toMatchObject({ stage: 'ISSUED', policyNo: '800000001' });

    // The application going back to pending does not move the lead back
    await importApplications([
      [
        'A8001',
        FC,
        SAME_NAME,
        'Nguyễn Văn An',
        TODAY_VN,
        'Đang chờ NB xử lý',
        '',
      ],
    ]);
    expect((await leadOf(leadId)).lead.stage).toBe('ISSUED');
  });

  it('LEAD-32: unlinking needs a reason, is audited, and takes the lead link off the client', async () => {
    await fc.delete(`${API}/leads/${leadId}/link`).send({}).expect(400);
    await fc
      .delete(`${API}/leads/${leadId}/link`)
      .send({ reason: 'Nhầm khách trùng tên' })
      .expect(204);
    expect((await leadOf(leadId)).link).toBeNull();
    expect(
      await connection
        .collection('auditEvents')
        .findOne({ action: 'UNLINK', entityId: leadId }),
    ).toMatchObject({ meta: { reason: 'Nhầm khách trùng tên' } });
    const client = await clientOf(SAME_NAME);
    expect(
      ((client?.agentLinks ?? []) as { source: string }[]).some(
        (link) => link.source === 'LEAD_LINK',
      ),
    ).toBe(false);
    await fc
      .delete(`${API}/leads/${leadId}/link`)
      .send({ reason: 'Lần nữa' })
      .expect(404);
  });

  it('TEN-7: another GA cannot see suggestions for, or link, a GA-1 lead', async () => {
    await head2.get(`${API}/leads/${leadId}/link-suggestions`).expect(404);
    await head2
      .post(`${API}/leads/${leadId}/link`)
      .send({ clientCode: SAME_NAME })
      .expect(404);
  });
});
