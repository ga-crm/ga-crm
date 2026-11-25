import type { INestApplication } from '@nestjs/common';
import request from 'supertest';
import { startApp, stopApp } from './support/app.js';
import { connection } from './support/collections.js';
import { demoEmail, seedDemoData } from '../src/seed/demo-data.js';

const API = '/api/v1';
const PASSWORD = 'demo-password-123';
const FC = '00100004';
type Agent = ReturnType<typeof request.agent>;

/** CMT-5: comments on a client and @mentions (on leads and clients). */
describe('Comments on clients and mentions (e2e)', () => {
  let app: INestApplication;
  let head: Agent;
  let fc: Agent;
  let um: Agent;
  let marketing: Agent;
  let head2: Agent;
  let leadId: string;
  const ids: Record<string, string> = {};
  /** The client's id, known once they are added. */
  let CLIENT: string;

  const as = async (key: string, ga = 1) => {
    const agent = request.agent(app.getHttpServer());
    await agent
      .post(`${API}/auth/sign-in/email`)
      .send({ email: demoEmail(ga, key), password: PASSWORD })
      .expect(200);
    return agent;
  };
  const notices = async (key: string, type: string) =>
    connection
      .collection('notifications')
      .countDocuments({ userId: (await user(key))._id, type });
  const user = async (key: string, ga = 1) =>
    (await connection
      .collection('users')
      .findOne({ email: demoEmail(ga, key) }))!;

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
    for (const key of ['head', 'fc', 'um', 'marketing'])
      ids[key] = (await user(key))._id.toString();
    ids.head2 = (await user('head', 2))._id.toString();
    CLIENT = (
      await fc
        .post(`${API}/clients`)
        .send({ policyNo: '950000001', role: 'PO', name: 'Khách Góp Ý' })
        .expect(201)
    ).body.id;
    leadId = (
      await head
        .post(`${API}/leads`)
        .send({
          fullName: 'Lead Nhắc Tên',
          phone: '0935000001',
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

  it('CMT-5: a line manager comments on a client of their line; the owner hears about it', async () => {
    await um
      .post(`${API}/clients/${CLIENT}/comments`)
      .send({ body: 'Em nhắc khách đóng phí tháng này nhé' })
      .expect(201);
    // The owner replies; they do not notify themselves
    await fc
      .post(`${API}/clients/${CLIENT}/comments`)
      .send({ body: 'Dạ em gọi rồi ạ' })
      .expect(201);
    const { body } = await fc.get(`${API}/clients/${CLIENT}`).expect(200);
    expect(body.comments.map((item: { body: string }) => item.body)).toEqual([
      'Em nhắc khách đóng phí tháng này nhé',
      'Dạ em gọi rồi ạ',
    ]);
    expect(body.userNames[ids.um]).toBe('Trưởng nhóm 1');
    expect(await notices('fc', 'CLIENT_COMMENT')).toBe(1);
    expect(await notices('um', 'CLIENT_COMMENT')).toBe(0);
    // CMT-6 style audit for the client comment
    expect(
      await connection
        .collection('auditEvents')
        .countDocuments({ entity: 'client_comment', action: 'CREATE' }),
    ).toBe(2);
  });

  it('CMT-5: roles without a client book cannot comment; another GA gets 404 (TEN-7)', async () => {
    await marketing
      .post(`${API}/clients/${CLIENT}/comments`)
      .send({ body: 'x' })
      .expect(403);
    await head2
      .post(`${API}/clients/${CLIENT}/comments`)
      .send({ body: 'x' })
      .expect(404);
    await head2.get(`${API}/clients/${CLIENT}/mentionable`).expect(404);
  });

  it('CMT-5: the @ picker offers only people who see the record, never oneself', async () => {
    const onClient = (
      await um.get(`${API}/clients/${CLIENT}/mentionable`).expect(200)
    ).body.items as { id: string; name: string }[];
    const clientIds = onClient.map((item) => item.id);
    expect(clientIds).toEqual(expect.arrayContaining([ids.head, ids.fc]));
    expect(clientIds).not.toContain(ids.um);
    expect(clientIds).not.toContain(ids.marketing);

    const searched = (
      await um
        .get(`${API}/clients/${CLIENT}/mentionable`)
        .query({ q: 'tư vấn' })
        .expect(200)
    ).body.items as { id: string }[];
    expect(searched.map((item) => item.id)).toEqual([ids.fc]);

    const onLead = (
      await head.get(`${API}/leads/${leadId}/mentionable`).expect(200)
    ).body.items as { id: string }[];
    expect(onLead.map((item) => item.id)).toEqual(
      expect.arrayContaining([ids.fc, ids.um]),
    );
    expect(onLead.map((item) => item.id)).not.toContain(ids.head);
  });

  it('CMT-5: a mentioned person is told directly, and the assignee is not told twice', async () => {
    await head
      .post(`${API}/leads/${leadId}/comments`)
      .send({ body: '@Trưởng nhóm 1 kèm em này nhé', mentions: [ids.um] })
      .expect(201);
    expect(await notices('um', 'MENTION')).toBe(1);
    expect(await notices('fc', 'LEAD_COMMENT')).toBe(1);

    await head
      .post(`${API}/leads/${leadId}/comments`)
      .send({ body: '@Tư vấn viên 1 gọi ngay nhé', mentions: [ids.fc] })
      .expect(201);
    expect(await notices('fc', 'MENTION')).toBe(1);
    expect(await notices('fc', 'LEAD_COMMENT')).toBe(1);

    const { body } = await fc.get(`${API}/leads/${leadId}`).expect(200);
    expect(body.comments.at(-1).mentions).toEqual([ids.fc]);
    expect(body.userNames[ids.um]).toBe('Trưởng nhóm 1');

    await um
      .post(`${API}/clients/${CLIENT}/comments`)
      .send({ body: '@Chủ GA 1 xem giúp', mentions: [ids.head] })
      .expect(201);
    expect(await notices('head', 'MENTION')).toBe(1);
    const { items } = (await head.get(`${API}/notifications`).expect(200))
      .body as { items: { type: string; subject: string; link: string }[] };
    expect(items.find((item) => item.type === 'MENTION')).toMatchObject({
      subject: 'Khách Góp Ý',
      link: `/clients/${CLIENT}?tab=care`,
    });
  });

  it('CMT-5: mentioning someone who cannot see the record is refused', async () => {
    for (const mention of [ids.marketing, ids.head2]) {
      const { body } = await um
        .post(`${API}/clients/${CLIENT}/comments`)
        .send({ body: '@ai đó', mentions: [mention] })
        .expect(400);
      expect(body.error).toBe('mention_not_visible');
    }
    const { body } = await head
      .post(`${API}/leads/${leadId}/comments`)
      .send({ body: '@ai đó', mentions: [ids.head2] })
      .expect(400);
    expect(body.error).toBe('mention_not_visible');
    await head
      .post(`${API}/leads/${leadId}/comments`)
      .send({ body: 'x', mentions: ['not-an-id'] })
      .expect(400);
  });
});
