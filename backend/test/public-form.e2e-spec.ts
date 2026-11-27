import type { INestApplication } from '@nestjs/common';
import request from 'supertest';
import { startApp, stopApp } from './support/app.js';
import { connection } from './support/collections.js';
import { TurnstileVerifier } from '../src/modules/campaigns/turnstile.verifier.js';
import { demoEmail, seedDemoData } from '../src/seed/demo-data.js';

const API = '/api/v1';
const PASSWORD = 'demo-password-123';
const FC = '00100004';
type Agent = ReturnType<typeof request.agent>;

/** A Turnstile that accepts the token "ok", so tests never call Cloudflare. */
const fakeTurnstile = {
  siteKey: 'site-key-for-tests',
  available: true,
  verify: (token?: string) => Promise.resolve(token === 'ok'),
};

const SETTINGS = {
  enabled: true,
  fields: ['email', 'need'],
  consentText: 'Tôi đồng ý để GA liên hệ tư vấn bảo hiểm.',
  privacyNotice: 'GA chỉ dùng thông tin này để tư vấn.',
};

/** CMP-4: the public lead form (slice 5c). */
describe('Public lead form (e2e)', () => {
  let app: INestApplication;
  let head: Agent;
  let fc: Agent;
  let marketing: Agent;
  let head2: Agent;
  let anonymous: ReturnType<typeof request>;
  let campaignId: string;
  let seminarId: string;
  let slug: string;

  const as = async (key: string, ga = 1) => {
    const agent = request.agent(app.getHttpServer());
    await agent
      .post(`${API}/auth/sign-in/email`)
      .send({ email: demoEmail(ga, key), password: PASSWORD })
      .expect(200);
    return agent;
  };
  const submit = (body: Record<string, unknown>, to = slug) =>
    anonymous.post(`${API}/public/forms/${to}`).send({
      fullName: 'Khách Từ Form',
      phone: '0938000001',
      consent: true,
      turnstileToken: 'ok',
      ...body,
    });
  const leadsByPhone = (phone: string) =>
    connection.collection('leads').find({ phone }).toArray();

  beforeAll(async () => {
    app = await startApp((builder) =>
      builder.overrideProvider(TurnstileVerifier).useValue(fakeTurnstile),
    );
    await seedDemoData(app, PASSWORD);
    [head, fc, marketing, head2] = await Promise.all([
      as('head'),
      as('fc'),
      as('admin'),
      as('head', 2),
    ]);
    anonymous = request(app.getHttpServer());
    campaignId = (
      await marketing
        .post(`${API}/campaigns`)
        .send({ name: 'Form Facebook', type: 'ADS', channel: 'Facebook Ads' })
        .expect(201)
    ).body.id;
    seminarId = (
      await marketing
        .post(`${API}/campaigns`)
        .send({
          name: 'Hội thảo Form',
          type: 'SEMINAR',
          eventAt: '2026-12-20T09:00:00+07:00',
          location: 'Hà Nội',
        })
        .expect(201)
    ).body.id;
  });

  afterAll(async () => {
    await stopApp(app);
  });

  it('CMP-4 + CMP-5: campaigns.manage turns a form on; the link keeps its code', async () => {
    await fc
      .put(`${API}/campaigns/${campaignId}/form`)
      .send(SETTINGS)
      .expect(403);
    await marketing
      .put(`${API}/campaigns/${campaignId}/form`)
      .send({ ...SETTINGS, fields: ['phone'] })
      .expect(400);
    await marketing
      .put(`${API}/campaigns/${campaignId}/form`)
      .send({ ...SETTINGS, consentText: '' })
      .expect(400);
    const first = (
      await marketing
        .put(`${API}/campaigns/${campaignId}/form`)
        .send(SETTINGS)
        .expect(200)
    ).body;
    slug = first.slug;
    expect(slug).toMatch(/^[a-z0-9]{10}$/);
    const again = (
      await marketing
        .put(`${API}/campaigns/${campaignId}/form`)
        .send({ ...SETTINGS, fields: ['province'] })
        .expect(200)
    ).body;
    expect(again.slug).toBe(slug);
    await marketing
      .put(`${API}/campaigns/${campaignId}/form`)
      .send(SETTINGS)
      .expect(200);
    const detail = (
      await marketing.get(`${API}/campaigns/${campaignId}`).expect(200)
    ).body;
    expect(detail.publicForm).toMatchObject({ slug, enabled: true });
    // TEN-7
    await head2
      .put(`${API}/campaigns/${campaignId}/form`)
      .send(SETTINGS)
      .expect(404);
  });

  it('Section 17.9: the public definition shows the GA, campaign, fields and consent, nothing else', async () => {
    const { body } = await anonymous
      .get(`${API}/public/forms/${slug}`)
      .expect(200);
    expect(body).toEqual({
      gaName: 'Tổng đại lý khu vực Hà Nội',
      campaignName: 'Form Facebook',
      fields: ['email', 'need'],
      consentText: SETTINGS.consentText,
      privacyNotice: SETTINGS.privacyNotice,
      turnstileSiteKey: 'site-key-for-tests',
    });
    await anonymous.get(`${API}/public/forms/khongtontai`).expect(404);
  });

  it('CMP-4: a new number becomes an unassigned PUBLIC_FORM lead with consent and an IP hash', async () => {
    await submit({ consent: false }).expect(400);
    const bot = await submit({ turnstileToken: 'bad' }).expect(400);
    expect(bot.body.error).toBe('captcha_failed');
    const phone = await submit({ phone: '123' }).expect(400);
    expect(phone.body.error).toBe('invalid_phone');
    expect(
      (
        await submit({
          email: 'khach@example.com',
          need: 'Bảo hiểm cho con',
          province: 'Huế',
        }).expect(201)
      ).body,
    ).toEqual({ ok: true });

    const [lead] = await leadsByPhone('0938000001');
    expect(lead).toMatchObject({
      fullName: 'Khách Từ Form',
      origin: 'PUBLIC_FORM',
      stage: 'NEW',
      email: 'khach@example.com',
      productInterest: 'Bảo hiểm cho con',
      consentMarketing: true,
      consentSource: 'PUBLIC_FORM',
      source: 'Facebook Ads',
    });
    // Province was not asked on this form, so it is not kept
    expect(lead.province).toBeUndefined();
    expect(lead.assignedAgentCode).toBeUndefined();
    expect(lead.consentIpHash).toMatch(/^[a-f0-9]{64}$/);
    expect(JSON.stringify(lead)).not.toMatch(/127\.0\.0\.1|::1/);
    // Lead managers see it in "Chưa phân công"
    const counts = (await head.get(`${API}/leads/counts`).expect(200)).body;
    expect(counts.unassigned).toBeGreaterThanOrEqual(1);
  });

  it('CMP-4: a known number gets a note and the assignee is told; the answer is the same', async () => {
    const [lead] = await leadsByPhone('0938000001');
    await head
      .post(`${API}/leads/assign`)
      .send({ leadIds: [lead._id.toString()], agentCode: FC })
      .expect(201);
    const { body } = await submit({
      fullName: 'Tên Khác',
      need: 'Muốn gặp trực tiếp',
    }).expect(201);
    expect(body).toEqual({ ok: true });
    const leads = await leadsByPhone('0938000001');
    expect(leads).toHaveLength(1);
    // The existing lead keeps its own name
    expect(leads[0].fullName).toBe('Khách Từ Form');
    const notes = await connection
      .collection('interactions')
      .find({ leadId: lead._id, source: 'FORM' })
      .toArray();
    expect(notes[0].note).toBe(
      'Đăng ký lại qua form Form Facebook: Muốn gặp trực tiếp',
    );
    const fcId = (await connection
      .collection('users')
      .findOne({ email: demoEmail(1, 'fc') }))!._id;
    expect(
      await connection
        .collection('notifications')
        .countDocuments({ userId: fcId, type: 'FORM_REREGISTERED' }),
    ).toBe(1);
    // The lead page shows the note without an author
    const detail = (
      await fc.get(`${API}/leads/${lead._id.toString()}`).expect(200)
    ).body;
    expect(
      detail.interactions.find(
        (item: { source: string }) => item.source === 'FORM',
      ),
    ).toMatchObject({ createdBy: null });
  });

  it('CMP-4: one number at most three times a day', async () => {
    // Two submissions so far today for this number
    await submit({}).expect(201);
    const { body } = await submit({}).expect(429);
    expect(body.error).toBe('rate_limited');
  });

  it('CMP-2 + CMP-4: a seminar form registers the person; a closed form takes nothing', async () => {
    const seminarSlug = (
      await marketing
        .put(`${API}/campaigns/${seminarId}/form`)
        .send({ ...SETTINGS, fields: [] })
        .expect(200)
    ).body.slug;
    await submit({ phone: '0938000002' }, seminarSlug).expect(201);
    const [lead] = await leadsByPhone('0938000002');
    expect(
      await connection
        .collection('campaignMembers')
        .findOne({ leadId: lead._id }),
    ).toMatchObject({ status: 'REGISTERED' });

    await marketing
      .put(`${API}/campaigns/${seminarId}/form`)
      .send({ ...SETTINGS, enabled: false })
      .expect(200);
    const closed = await anonymous
      .get(`${API}/public/forms/${seminarSlug}`)
      .expect(404);
    expect(closed.body.error).toBe('form_unavailable');
    await submit({ phone: '0938000003' }, seminarSlug).expect(404);
    expect(await leadsByPhone('0938000003')).toHaveLength(0);
  });
});
