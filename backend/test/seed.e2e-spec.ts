import type { INestApplication } from '@nestjs/common';
import request from 'supertest';
import { startApp, stopApp } from './support/app.js';
import { connection } from './support/collections.js';
import { demoEmail, seedDemoData } from '../src/seed/demo-data.js';
import {
  applyDemoPasswords,
  DEMO_PASSWORD,
  seedShowcase,
} from '../src/seed/showcase.js';

const API = '/api/v1';

/** What README promises: run the seed, sign in, and every screen has something to show. */
describe('Demo seed (e2e)', () => {
  let app: INestApplication;

  const signIn = async (email: string) => {
    const agent = request.agent(app.getHttpServer());
    await agent
      .post(`${API}/auth/sign-in/email`)
      .send({ email, password: DEMO_PASSWORD })
      .expect(200);
    return agent;
  };
  const leadsOf = async (
    agent: ReturnType<typeof request.agent>,
    query: Record<string, string | number> = {},
  ) =>
    (
      await agent
        .get(`${API}/leads`)
        .query({ pageSize: 50, ...query })
        .expect(200)
    ).body;

  beforeAll(async () => {
    app = await startApp();
    await seedDemoData(app, DEMO_PASSWORD);
    await seedShowcase(app, DEMO_PASSWORD);
    await applyDemoPasswords(
      app,
      DEMO_PASSWORD,
      process.env.PLATFORM_ADMIN_EMAIL!,
    );
  }, 180_000);

  afterAll(async () => {
    await stopApp(app);
  });

  it('every role of both GAs signs in with the demo password', async () => {
    for (const ga of [1, 2]) {
      for (const key of [
        'head',
        'admin',
        'marketing',
        'gad',
        'bm',
        'um',
        'fc',
        'fc2',
        'fc3',
        'fc4',
        'um2',
      ]) {
        await signIn(demoEmail(ga, key));
      }
    }
    await signIn(process.env.PLATFORM_ADMIN_EMAIL!);
  }, 60_000);

  it('slice 4b: each demo GA has clients with policies, owned by its agents', async () => {
    const fc = await signIn(demoEmail(1, 'fc'));
    const { items } = (await fc.get(`${API}/clients`).expect(200)).body;
    expect(
      items.map((item: { clientCode: string }) => item.clientCode),
    ).toEqual(
      expect.arrayContaining(['0100000001', '0100000002', '0100000003']),
    );
    const { body } = await fc.get(`${API}/clients/0100000001`).expect(200);
    expect(body.policies[0].products).toHaveLength(3);
    expect(body.canEdit).toBe(true);
  });

  it('shows the account states: an invite pending and a locked account refused', async () => {
    const head = await signIn(demoEmail(1, 'head'));
    const { items } = (
      await head.get(`${API}/users`).query({ pageSize: 50 }).expect(200)
    ).body;
    const statuses = new Set(
      items.map((user: { status: string }) => user.status),
    );
    expect(statuses).toEqual(new Set(['ACTIVE', 'INVITED', 'DISABLED']));
    expect(
      items.every(
        (user: { agentName?: string | null }) => user.agentName !== null,
      ),
    ).toBe(true);
    await request(app.getHttpServer())
      .post(`${API}/auth/sign-in/email`)
      .send({ email: demoEmail(1, 'fc.nghi'), password: DEMO_PASSWORD })
      .expect(401);
  });

  it('fills the agent tree, including personal fields and someone who has left', async () => {
    const head = await signIn(demoEmail(1, 'head'));
    const { items } = (await head.get(`${API}/agents/tree`).expect(200)).body;
    expect(items.length).toBe(10);
    expect(
      items.some(
        (item: { status: string }) => item.status === 'Ngưng hoạt động',
      ),
    ).toBe(true);
    for (const item of items as { agentCode: string }[]) {
      const agent = (
        await head.get(`${API}/agents/${item.agentCode}`).expect(200)
      ).body;
      for (const field of [
        'gender',
        'dob',
        'phone',
        'startDate',
        'officeCode',
      ]) {
        expect(agent[field], `${item.agentCode} ${field}`).toBeTruthy();
      }
    }
  });

  it('gives every lead tab, filter and status something to show', async () => {
    const marketing = await signIn(demoEmail(1, 'marketing'));
    const counts = (await marketing.get(`${API}/leads/counts`).expect(200))
      .body;
    expect(counts.all).toBe(44);
    expect(counts.unassigned).toBeGreaterThan(0);
    expect(counts.overdue).toBeGreaterThan(0);

    const fc = await signIn(demoEmail(1, 'fc'));
    const mine = (await fc.get(`${API}/leads/counts`).expect(200)).body;
    expect(mine.mine).toBeGreaterThan(0);
    expect(mine.isNew).toBeGreaterThan(0);
    expect(mine.newComment).toBeGreaterThan(0);

    const has = async (query: Record<string, string>) =>
      (await leadsOf(marketing, { ...query, pageSize: 1 })).total > 0;
    for (const interest of [
      'NOT_REACHED',
      'UNDETERMINED',
      'NOT_INTERESTED',
      'LIFE',
      'HEALTH_CARD',
      'NONE',
    ]) {
      expect(await has({ interest }), interest).toBe(true);
    }
    for (const care of ['CARING', 'WON', 'DROPPED', 'NOT_INTERESTED', 'NONE']) {
      expect(await has({ care }), care).toBe(true);
    }
    for (const stage of [
      'NEW',
      'CONTACTED',
      'APPOINTMENT',
      'PROPOSAL',
      'SUBMITTED',
      'ISSUED',
      'LOST',
    ]) {
      expect(await has({ stage }), stage).toBe(true);
    }
    for (const origin of ['GA', 'IMPORT', 'FC_OWN']) {
      expect(await has({ origin }), origin).toBe(true);
    }
    const facets = (await marketing.get(`${API}/leads/facets`).expect(200))
      .body;
    expect(facets.sources.length).toBeGreaterThan(3);
    expect(facets.campaigns.length).toBeGreaterThanOrEqual(3);
  });

  it('fills a lead so its detail screen has no empty sections', async () => {
    const marketing = await signIn(demoEmail(1, 'marketing'));
    const { items } = await leadsOf(marketing, {
      care: 'CARING',
      origin: 'GA',
    });
    const { lead, interactions, comments, tasks, history, campaign, assignee } =
      (await marketing.get(`${API}/leads/${items[0].id}`).expect(200)).body;
    for (const field of [
      'email',
      'dob',
      'gender',
      'region',
      'province',
      'phoneSource',
      'productInterest',
      'extraInfo',
      'registeredAt',
      'valueVnd',
      'firstContactAt',
      'nextActionAt',
    ]) {
      expect(lead[field], field).toBeTruthy();
    }
    expect(campaign).toBeTruthy();
    expect(assignee).toBeTruthy();
    expect(interactions.length).toBeGreaterThan(1);
    expect(comments.length).toBeGreaterThan(0);
    expect(tasks.length).toBeGreaterThan(0);
    expect(history.length).toBeGreaterThan(0);
  });

  it('keeps the rules: a line manager sees masked phones, and a won lead has its number', async () => {
    const um = await signIn(demoEmail(1, 'um'));
    const row = (await leadsOf(um)).items.find(
      (item: { assignedAgentCode: string }) =>
        item.assignedAgentCode !== '00100003',
    );
    expect(row.phone).toContain('***');

    const marketing = await signIn(demoEmail(1, 'marketing'));
    const raw = await connection
      .collection('leads')
      .find({ careStatus: 'WON', origin: 'GA' })
      .toArray();
    expect(raw.length).toBeGreaterThan(0);
    for (const lead of raw) expect(lead.applicationNo).toBeTruthy();
    expect((await leadsOf(marketing, { q: 'Sai Số Điện Thoại' })).total).toBe(
      0,
    );
  });

  it('TEN-7: the two GAs share nothing', async () => {
    const one = await signIn(demoEmail(1, 'marketing'));
    const two = await signIn(demoEmail(2, 'marketing'));
    const ids = (agent: Awaited<ReturnType<typeof signIn>>) =>
      leadsOf(agent).then(({ items }) =>
        items.map((item: { id: string }) => item.id),
      );
    const inOne = await ids(one);
    const inTwo = await ids(two);
    expect(inOne.filter((id: string) => inTwo.includes(id))).toEqual([]);
  });

  it('leaves import history to look at: one finished with errors, one awaiting confirmation', async () => {
    const admin = await signIn(demoEmail(1, 'admin'));
    const { items } = (await admin.get(`${API}/imports`).expect(200)).body;
    const finished = items.find(
      (item: { kind: string }) => item.kind === 'LEADS',
    );
    expect(finished.status).toBe('COMMITTED');
    expect(finished.sheets[0]).toMatchObject({ inserted: 2, rejected: 3 });
    const pending = items.find(
      (item: { status: string }) => item.status === 'VALIDATED',
    );
    expect(pending.kind).toBe('SUCCESS');
    const errors = (
      await admin.get(`${API}/imports/${pending.id}/errors`).expect(200)
    ).body;
    expect(errors.total).toBeGreaterThan(0);
  });

  it('fills the audit log', async () => {
    const head = await signIn(demoEmail(1, 'head'));
    for (const action of ['CREATE', 'UPDATE', 'ASSIGN', 'IMPORT']) {
      const { total } = (
        await head.get(`${API}/audit`).query({ action }).expect(200)
      ).body;
      expect(total, action).toBeGreaterThan(0);
    }
  });

  it('can run again without adding anything or breaking the passwords', async () => {
    const count = () => connection.collection('leads').countDocuments();
    const before = await count();
    const added = await seedShowcase(app, DEMO_PASSWORD);
    await seedDemoData(app, DEMO_PASSWORD);
    await applyDemoPasswords(
      app,
      DEMO_PASSWORD,
      process.env.PLATFORM_ADMIN_EMAIL!,
    );
    expect(added).toEqual({ agents: 0, users: 0, leads: 0, clients: 0 });
    expect(await count()).toBe(before);
    await signIn(demoEmail(1, 'head'));
  }, 60_000);
});
