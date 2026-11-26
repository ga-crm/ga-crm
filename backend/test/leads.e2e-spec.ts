import type { INestApplication } from '@nestjs/common';
import ExcelJS from 'exceljs';
import { randomUUID } from 'node:crypto';
import request from 'supertest';
import { startApp, stopApp } from './support/app.js';
import { connection } from './support/collections.js';
import { demoEmail, seedDemoData } from '../src/seed/demo-data.js';

const API = '/api/v1';
const PASSWORD = 'demo-password-123';
const FC = '00100004';
const UM = '00100003';
const OTHER_FC = '00100095';
type Agent = ReturnType<typeof request.agent>;

describe('Leads (e2e)', () => {
  let app: INestApplication;
  let phoneCounter = 0;
  const http = () => request(app.getHttpServer());
  const nextPhone = () => `09${String(10000000 + ++phoneCounter).slice(-8)}`;

  const signIn = async (email: string) => {
    const agent = request.agent(app.getHttpServer());
    await agent
      .post(`${API}/auth/sign-in/email`)
      .send({ email, password: PASSWORD })
      .expect(200);
    return agent;
  };
  const as = (key: string, ga = 1) => signIn(demoEmail(ga, key));

  const newLead = async (
    agent: Agent,
    patch: Record<string, unknown> = {},
  ): Promise<{ id: string; phone: string }> => {
    const phone = nextPhone();
    const res = await agent
      .post(`${API}/leads`)
      .send({
        fullName: 'Khách Hàng',
        phone,
        source: 'Facebook',
        consent: false,
        ...patch,
      })
      .expect(201);
    return { id: res.body.id, phone: (patch.phone as string) ?? phone };
  };
  const open = async (agent: Agent, id: string) =>
    (await agent.get(`${API}/leads/${id}`).expect(200)).body;
  const update = (agent: Agent, id: string, body: Record<string, unknown>) =>
    agent.patch(`${API}/leads/${id}`).send(body);
  const list = async (
    agent: Agent,
    query: Record<string, string | number> = {},
  ) =>
    (
      await agent
        .get(`${API}/leads`)
        .query({ pageSize: 50, ...query })
        .expect(200)
    ).body;
  const rawLead = (id: string) =>
    connection.collection('leads').findOne({ _id: id });

  let head: Agent;
  let marketing: Agent;
  let fc: Agent;
  let um: Agent;

  beforeAll(async () => {
    app = await startApp();
    await seedDemoData(app, PASSWORD);

    head = await as('head');
    marketing = await as('admin');
    fc = await as('fc');
    um = await as('um');
    // A peer of the demo FC under another UM, so "not in my branch" can be tested
    await head
      .post(`${API}/agents`)
      .send({
        agentCode: OTHER_FC,
        name: 'FC Khác',
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

  describe('creating', () => {
    it('LEAD-3: requires name, phone and source; the consent answer may come later (26/11/2026)', async () => {
      const valid = {
        fullName: 'A',
        phone: nextPhone(),
        source: 'B',
        consent: false,
      };
      for (const patch of [
        { fullName: ' ' },
        { source: '' },
        { consent: 'có' },
        { email: 'sai' },
        { dob: '01/01/1990' },
        { dob: '2024-02-30' },
        { dob: '2999-01-01' },
        { dob: '1800-01-01' },
        { extra: 1 },
      ]) {
        await marketing
          .post(`${API}/leads`)
          .send({ ...valid, ...patch })
          .expect(400);
      }
      // No answer yet: the lead is made, without consent (PDP-5)
      const later = (
        await marketing
          .post(`${API}/leads`)
          .send({ ...valid, phone: nextPhone(), consent: undefined })
          .expect(201)
      ).body.id as string;
      expect(
        (await marketing.get(`${API}/leads/${later}`).expect(200)).body.lead,
      ).toMatchObject({ consentMarketing: false });
      for (const phone of ['123', 'abc', '091234567']) {
        const res = await marketing
          .post(`${API}/leads`)
          .send({ ...valid, phone })
          .expect(400);
        expect(res.body.error).toBe('invalid_phone');
      }
    });

    it("LEAD-2 + test 20: an agent's lead is FC_OWN and always theirs", async () => {
      const { id } = await newLead(fc, { note: 'Bạn của chị Lan' });
      const { lead, assignee, interactions, tasks, canWork, history } =
        await open(fc, id);
      expect(lead).toMatchObject({
        origin: 'FC_OWN',
        stage: 'NEW',
        assignedAgentCode: FC,
        isNew: false,
      });
      expect(assignee).toEqual({ agentCode: FC, name: 'Tư vấn viên 1' });
      expect(canWork).toBe(true);
      // LEAD-3 and NOTE-6
      expect(interactions).toEqual([
        expect.objectContaining({
          type: 'NOTE',
          note: 'Bạn của chị Lan',
          initial: true,
        }),
      ]);
      expect(tasks).toEqual([
        expect.objectContaining({
          source: 'AUTO_ASSIGN',
          status: 'OPEN',
          title: 'Liên hệ khách hàng trong 48 giờ',
        }),
      ]);
      expect(history).toEqual([
        expect.objectContaining({ field: 'assignee', newValue: FC }),
      ]);
    });

    it('LEAD-3: only a lead manager may choose the agent or the campaign', async () => {
      await fc
        .post(`${API}/leads`)
        .send({
          fullName: 'A',
          phone: nextPhone(),
          source: 'B',
          consent: false,
          assignedAgentCode: UM,
        })
        .expect(403);
      await fc
        .post(`${API}/leads`)
        .send({
          fullName: 'A',
          phone: nextPhone(),
          source: 'B',
          consent: false,
          campaignId: randomUUID().toString(),
        })
        .expect(403);
    });

    it('LEAD-2: a manager creates a GA lead, assigned or not, and agent and campaign must exist', async () => {
      const unassigned = await newLead(marketing);
      expect((await open(marketing, unassigned.id)).lead).toMatchObject({
        origin: 'GA',
        assignedAgentCode: null,
      });

      const assigned = await newLead(marketing, { assignedAgentCode: FC });
      expect((await open(marketing, assigned.id)).lead.isNew).toBe(true);

      const noAgent = await marketing
        .post(`${API}/leads`)
        .send({
          fullName: 'A',
          phone: nextPhone(),
          source: 'B',
          consent: false,
          assignedAgentCode: '999',
        })
        .expect(400);
      expect(noAgent.body.error).toBe('agent_not_found');
      const noCampaign = await marketing
        .post(`${API}/leads`)
        .send({
          fullName: 'A',
          phone: nextPhone(),
          source: 'B',
          consent: false,
          campaignId: randomUUID().toString(),
        })
        .expect(400);
      expect(noCampaign.body.error).toBe('campaign_not_found');
    });

    it('accounts with neither an agent code nor leads.manage cannot create leads', async () => {
      const { grants } = (await head.get(`${API}/permissions`).expect(200))
        .body;
      await head
        .put(`${API}/permissions`)
        .send({
          grants: {
            ...grants,
            ADMIN: grants.ADMIN.filter(
              (item: string) => item !== 'leads.manage',
            ),
          },
        })
        .expect(204);
      const admin = await as('admin');
      await admin
        .post(`${API}/leads`)
        .send({
          fullName: 'A',
          phone: nextPhone(),
          source: 'B',
          consent: false,
        })
        .expect(403);
      await head.put(`${API}/permissions`).send({ grants }).expect(204);
    });

    it('LEAD-1 + test 19: one lead per phone, and the id only for someone who may see it', async () => {
      const phone = nextPhone();
      const { id } = await newLead(fc, { phone });
      const sees = await marketing
        .post(`${API}/leads`)
        .send({
          fullName: 'A',
          phone: `+84${phone.slice(1)}`,
          source: 'B',
          consent: false,
        })
        .expect(409);
      expect(sees.body).toEqual({ error: 'phone_exists', leadId: id });

      const other = await as('fc');
      expect(
        (
          await other
            .post(`${API}/leads`)
            .send({ fullName: 'A', phone, source: 'B', consent: false })
            .expect(409)
        ).body.leadId,
      ).toBe(id);

      const peer = await newLead(marketing, { assignedAgentCode: OTHER_FC });
      const hidden = await fc
        .post(`${API}/leads`)
        .send({ fullName: 'A', phone: peer.phone, source: 'B', consent: false })
        .expect(409);
      expect(hidden.body).toEqual({ error: 'phone_exists' });
    });

    it('TEN-1: the same phone can be a lead in two GAs', async () => {
      const phone = nextPhone();
      await newLead(fc, { phone });
      const otherGa = await as('admin', 2);
      await newLead(otherGa, { phone });
    });

    it('LEAD-5: the lead date never changes', async () => {
      const { id } = await newLead(marketing);
      const before = (await rawLead(id))?.leadDate;
      expect(before).toMatch(/^\d{4}-\d{2}-\d{2}$/);
      await update(marketing, id, {
        fullName: 'Khác',
        leadDate: '2000-01-01',
      }).expect(400);
      await update(marketing, id, { fullName: 'Khác' }).expect(200);
      expect((await rawLead(id))?.leadDate).toBe(before);
    });
  });

  describe('who sees what', () => {
    it('LEAD-6 (changed 27/11/2026): each sees their own leads; Admin sees all masked; the director sees all', async () => {
      const { id, phone } = await newLead(fc);
      const peer = await newLead(marketing, { assignedAgentCode: OTHER_FC });
      const masked = `${phone.slice(0, 4)}***${phone.slice(-3)}`;

      // A line manager no longer sees the leads of their line
      await um.get(`${API}/leads/${id}`).expect(404);
      expect(
        (await list(um)).items.some((item: { id: string }) => item.id === id),
      ).toBe(false);
      const bm = await as('bm');
      await bm.get(`${API}/leads/${peer.id}`).expect(404);

      await fc.get(`${API}/leads/${peer.id}`).expect(404);
      const fcIds = (await list(fc)).items.map(
        (item: { id: string }) => item.id,
      );
      expect(fcIds).not.toContain(peer.id);

      // Admin (leads.manage) sees and works every lead, never its phone
      const adminView = await open(marketing, id);
      expect(adminView.lead.phone).toBe(masked);
      expect(
        (await list(marketing)).items.find(
          (item: { id: string }) => item.id === id,
        ).phone,
      ).toBe(masked);
      expect((await open(fc, id)).lead.phone).toBe(phone);
      expect((await open(head, peer.id)).lead.phone).toBe(peer.phone);
    });

    it('LEAD-4: an unassigned lead is only for lead managers', async () => {
      const { id } = await newLead(marketing);
      await fc.get(`${API}/leads/${id}`).expect(404);
      await um.get(`${API}/leads/${id}`).expect(404);
      await head.get(`${API}/leads/${id}`).expect(200);
    });

    it('PDP-3 (changed 27/11/2026): a number finds a lead only for whoever sees its phone', async () => {
      const { phone } = await newLead(fc);
      const found = async (agent: Agent) =>
        (await list(agent, { q: phone })).total;
      expect(await found(fc)).toBe(1);
      expect(await found(head)).toBe(1);
      expect(await found(marketing)).toBe(0);
      expect(await found(um)).toBe(0);
    });

    it('PDP-3: history of a phone change is masked for Admin', async () => {
      const { id } = await newLead(fc);
      const changed = nextPhone();
      await update(fc, id, { phone: changed }).expect(200);
      const row = (await open(marketing, id)).history.find(
        (item: { field: string }) => item.field === 'phone',
      );
      expect(row.newValue).toContain('***');
      const own = (await open(fc, id)).history.find(
        (item: { field: string }) => item.field === 'phone',
      );
      expect(own.newValue).toBe(changed);
    });

    it('TEN-7: GA-2 gets 404 for a lead of GA-1 everywhere', async () => {
      const { id } = await newLead(marketing);
      const other = await as('admin', 2);
      await other.get(`${API}/leads/${id}`).expect(404);
      await update(other, id, { fullName: 'X' }).expect(404);
      await other
        .post(`${API}/leads/${id}/notes`)
        .send({ body: 'x' })
        .expect(404);
      await other
        .post(`${API}/leads/${id}/comments`)
        .send({ body: 'x' })
        .expect(404);
      await other
        .post(`${API}/leads/${id}/tasks`)
        .send({ title: 'x', dueAt: new Date() })
        .expect(404);
      await other
        .post(`${API}/leads/assign`)
        .send({ leadIds: [id], agentCode: null })
        .expect(404);
      expect(
        (await list(other)).items.map((item: { id: string }) => item.id),
      ).not.toContain(id);
    });

    it('TEN-5: a search cannot leave the tenant', async () => {
      const name = 'Khách Riêng Ga Một';
      await newLead(marketing, { fullName: name });
      const other = await as('admin', 2);
      expect((await list(other, { q: name })).total).toBe(0);
      expect((await list(marketing, { q: 'khach rieng ga mot' })).total).toBe(
        1,
      );
      expect((await list(marketing, { q: '.*' })).total).toBe(0);
    });

    it('routes need a session; platform staff have no lead list of their own', async () => {
      await http().get(`${API}/leads`).expect(401);
      const admin = await signIn(process.env.PLATFORM_ADMIN_EMAIL!).catch(
        () => null,
      );
      expect(admin).toBeNull();
      const platform = request.agent(app.getHttpServer());
      await platform
        .post(`${API}/auth/sign-in/email`)
        .send({
          email: process.env.PLATFORM_ADMIN_EMAIL,
          password: process.env.PLATFORM_ADMIN_PASSWORD,
        })
        .expect(200);
      await platform.get(`${API}/leads`).expect(403);
    });
  });

  describe('working on a lead', () => {
    it('LEAD-7 (changed 27/11/2026): a line manager does not reach the leads of their line at all', async () => {
      const { id } = await newLead(fc);
      const expectNotYours = async (req: request.Test) =>
        expect((await req.expect(404)).body.error).toBe('not_found');
      await expectNotYours(update(um, id, { interest: 'LIFE' }));
      await expectNotYours(
        um.post(`${API}/leads/${id}/notes`).send({ body: 'x' }),
      );
      await expectNotYours(
        um
          .post(`${API}/leads/${id}/activities`)
          .send({ type: 'CALL', note: 'x' }),
      );
      await expectNotYours(
        um
          .post(`${API}/leads/${id}/tasks`)
          .send({ title: 'x', dueAt: new Date() }),
      );
      await um
        .post(`${API}/leads/${id}/comments`)
        .send({ body: 'Góp ý' })
        .expect(404);
    });

    it('LEAD-8: the agent edits details; source and campaign are for lead managers', async () => {
      const { id } = await newLead(fc);
      await update(fc, id, {
        fullName: 'Tên Mới',
        email: 'a@b.vn',
        dob: '1990-01-15',
        consent: true,
      }).expect(200);
      const { lead, history } = await open(fc, id);
      expect(lead).toMatchObject({
        fullName: 'Tên Mới',
        consentMarketing: true,
      });
      // Decided 26/11/2026: "Khu vực" is gone; the province and commune say where a lead is
      expect(lead).not.toHaveProperty('region');
      expect(history.map((item: { field: string }) => item.field)).toEqual(
        expect.arrayContaining([
          'fullName',
          'email',
          'dob',
          'consent',
        ]),
      );

      await update(fc, id, { region: 'Miền Bắc' }).expect(400);
      await update(fc, id, { source: 'Khác' }).expect(403);
      await update(fc, id, { campaignId: null }).expect(403);
      await update(marketing, id, { source: 'Khác' }).expect(200);
      expect(
        (
          await update(marketing, id, {
            campaignId: randomUUID().toString(),
          }).expect(400)
        ).body.error,
      ).toBe('campaign_not_found');
    });

    it('LEAD-8: changing to a phone already used is refused', async () => {
      const a = await newLead(fc);
      const b = await newLead(fc);
      expect(
        (await update(fc, a.id, { phone: b.phone }).expect(409)).body,
      ).toEqual({ error: 'phone_exists', leadId: b.id });
      expect(
        (await update(fc, a.id, { phone: '12' }).expect(400)).body.error,
      ).toBe('invalid_phone');
      await update(fc, a.id, { phone: a.phone }).expect(200);
    });

    it('LEAD-14 + test 22: a final interest locks for agents, not for managers', async () => {
      const { id } = await newLead(fc);
      await update(fc, id, { interest: 'NOT_REACHED' }).expect(200);
      await update(fc, id, { interest: 'UNDETERMINED' }).expect(200);
      await update(fc, id, { interest: 'LIFE' }).expect(200);
      expect((await open(fc, id)).interestLocked).toBe(true);
      const refused = await update(fc, id, { interest: 'HEALTH_CARD' }).expect(
        409,
      );
      expect(refused.body.error).toBe('interest_locked');
      // Sending the same value is not a change
      await update(fc, id, { interest: 'LIFE' }).expect(200);
      await update(marketing, id, { interest: 'HEALTH_CARD' }).expect(200);
      expect((await open(marketing, id)).interestLocked).toBe(false);
    });

    it('LEAD-11 + test 22: WON needs a number and DROPPED needs a reason', async () => {
      const { id } = await newLead(fc);
      expect(
        (await update(fc, id, { careStatus: 'WON' }).expect(400)).body.error,
      ).toBe('won_needs_numbers');
      expect(
        (await update(fc, id, { careStatus: 'DROPPED' }).expect(400)).body
          .error,
      ).toBe('lost_reason_required');
      expect(
        (
          await update(fc, id, {
            careStatus: 'WON',
            applicationNo: 'a!',
          }).expect(400)
        ).body.error,
      ).toBe('invalid_application_no');
      expect(
        (
          await update(fc, id, {
            careStatus: 'WON',
            policyNo: '12345678',
          }).expect(400)
        ).body.error,
      ).toBe('invalid_policy_no');
      // A refused change writes nothing
      expect((await open(fc, id)).lead.careStatus).toBeNull();

      const won = await update(fc, id, {
        careStatus: 'WON',
        policyNo: '012345678',
      }).expect(200);
      expect(won.body).toMatchObject({ careStatus: 'WON', stage: 'SUBMITTED' });
      // DATA-1
      expect((await open(fc, id)).lead.policyNo).toBe('012345678');
      expect(
        (await update(fc, id, { policyNo: null }).expect(400)).body.error,
      ).toBe('won_needs_numbers');

      const other = await newLead(fc);
      const dropped = await update(fc, other.id, {
        careStatus: 'DROPPED',
        lostReason: 'Đã mua bên khác',
      }).expect(200);
      expect(dropped.body.stage).toBe('LOST');
    });

    it('LEAD-13 and LEAD-17: classifying counts as first contact and moves the stage', async () => {
      const { id } = await newLead(fc);
      expect((await rawLead(id))?.firstContactAt).toBeUndefined();
      const res = await update(fc, id, { interest: 'NOT_REACHED' }).expect(200);
      expect(res.body.stage).toBe('CONTACTED');
      const first = (await rawLead(id))?.firstContactAt as Date;
      expect(first).toBeInstanceOf(Date);
      await update(fc, id, { careStatus: 'CARING' }).expect(200);
      expect((await rawLead(id))?.firstContactAt).toEqual(first);
    });

    it('LEAD-19: a stage can be set by hand, with the rules of the status it implies', async () => {
      const { id } = await newLead(fc);
      expect(
        (await update(fc, id, { stage: 'APPOINTMENT' }).expect(200)).body.stage,
      ).toBe('APPOINTMENT');
      expect(
        (await update(fc, id, { stage: 'LOST' }).expect(400)).body.error,
      ).toBe('lost_reason_required');
      expect(
        (await update(fc, id, { stage: 'SUBMITTED' }).expect(400)).body.error,
      ).toBe('won_needs_numbers');
      await update(fc, id, { stage: 'ISSUED' }).expect(403);
      await update(fc, id, { stage: 'NEW' }).expect(400);

      const submitted = await update(fc, id, {
        stage: 'SUBMITTED',
        applicationNo: 'HS1234',
      }).expect(200);
      expect(submitted.body).toMatchObject({
        stage: 'SUBMITTED',
        careStatus: 'WON',
      });

      const other = await newLead(fc);
      const lost = await update(fc, other.id, {
        stage: 'LOST',
        lostReason: 'Không còn nhu cầu',
      }).expect(200);
      expect(lost.body).toMatchObject({ stage: 'LOST', careStatus: 'DROPPED' });

      await update(marketing, id, { stage: 'ISSUED' }).expect(200);
      await update(fc, id, { stage: 'MET' }).expect(403);
    });

    it('LEAD-20 + AUD-4: every change is in the history; the audit log names fields only', async () => {
      const { id, phone } = await newLead(fc);
      await update(fc, id, {
        phone: nextPhone(),
        interest: 'NOT_REACHED',
      }).expect(200);
      const { history, userNames } = await open(fc, id);
      const interest = history.find(
        (item: { field: string }) => item.field === 'interest',
      );
      expect(interest).toMatchObject({
        oldValue: null,
        newValue: 'NOT_REACHED',
      });
      expect(userNames[interest.changedBy]).toBe('Tư vấn viên 1');
      expect(history.map((item: { field: string }) => item.field)).toEqual(
        expect.arrayContaining(['phone', 'interest', 'stage']),
      );

      const audit = await connection
        .collection('auditEvents')
        .find({ entity: 'lead', entityId: id, action: 'UPDATE' })
        .toArray();
      expect(audit.at(-1)?.meta.fields).toEqual(
        expect.arrayContaining(['phone', 'interest']),
      );
      expect(JSON.stringify(audit)).not.toContain(phone);
    });

    it('LEAD-31: setting a next action replaces its task; clearing cancels it', async () => {
      const { id } = await newLead(fc);
      const openTasks = async () =>
        (await open(fc, id)).tasks.filter(
          (task: { source: string; status: string }) =>
            task.source === 'NEXT_ACTION' && task.status === 'OPEN',
        );

      await update(fc, id, { nextActionAt: '2030-01-01T02:00:00.000Z' }).expect(
        200,
      );
      await update(fc, id, { nextActionAt: '2030-01-02T02:00:00.000Z' }).expect(
        200,
      );
      const tasks = await openTasks();
      expect(tasks).toHaveLength(1);
      expect(tasks[0].dueAt).toBe('2030-01-02T02:00:00.000Z');
      await update(fc, id, { nextActionAt: null }).expect(200);
      expect(await openTasks()).toEqual([]);
      expect((await open(fc, id)).lead.nextActionAt).toBeNull();
    });
  });

  describe('notes and contacts', () => {
    it('test 24: a contact updates first and last contact, the stage and the 48-hour task', async () => {
      const { id } = await newLead(fc);
      const earlier = new Date(Date.now() - 3_600_000).toISOString();
      await fc
        .post(`${API}/leads/${id}/activities`)
        .send({ type: 'ZALO', note: 'Nhắn tin', occurredAt: earlier })
        .expect(201);
      let { lead, tasks, history } = await open(fc, id);
      expect(lead).toMatchObject({
        stage: 'CONTACTED',
        firstContactAt: earlier,
        lastContactAt: earlier,
      });
      expect(tasks[0]).toMatchObject({ source: 'AUTO_ASSIGN', status: 'DONE' });
      expect(
        history.find((item: { field: string }) => item.field === 'stage'),
      ).toMatchObject({ oldValue: 'NEW', newValue: 'CONTACTED' });

      await fc
        .post(`${API}/leads/${id}/activities`)
        .send({ type: 'CALL', note: 'Gọi', outcome: 'Nghe máy' })
        .expect(201);
      ({ lead } = await open(fc, id));
      expect(lead.firstContactAt).toBe(earlier);
      expect(new Date(lead.lastContactAt).getTime()).toBeGreaterThan(
        new Date(earlier).getTime(),
      );
    });

    it('test 24: a plain note triggers none of those rules', async () => {
      const { id } = await newLead(fc);
      await fc
        .post(`${API}/leads/${id}/notes`)
        .send({ body: 'Chỉ ghi chú' })
        .expect(201);
      const { lead, tasks } = await open(fc, id);
      expect(lead).toMatchObject({
        stage: 'NEW',
        firstContactAt: null,
        lastContactAt: null,
      });
      expect(tasks[0].status).toBe('OPEN');
    });

    it('NOTE-2: validates length, type and date', async () => {
      const { id } = await newLead(fc);
      await fc.post(`${API}/leads/${id}/notes`).send({ body: ' ' }).expect(400);
      await fc
        .post(`${API}/leads/${id}/notes`)
        .send({ body: 'x'.repeat(4001) })
        .expect(400);
      await fc
        .post(`${API}/leads/${id}/activities`)
        .send({ type: 'FAX', note: 'x' })
        .expect(400);
      await fc
        .post(`${API}/leads/${id}/activities`)
        .send({ type: 'CALL', note: 'x', outcome: 'x'.repeat(201) })
        .expect(400);
      await fc
        .post(`${API}/leads/${id}/activities`)
        .send({ type: 'CALL', note: 'x', occurredAt: '2099-01-01T00:00:00Z' })
        .expect(400);
    });

    it('NOTE-1 + test 25: the timeline runs oldest first, notes and contacts together', async () => {
      const { id } = await newLead(fc, { note: 'Đầu tiên' });
      await fc
        .post(`${API}/leads/${id}/activities`)
        .send({
          type: 'CALL',
          note: 'Trước đó',
          occurredAt: new Date(Date.now() - 86_400_000).toISOString(),
        })
        .expect(201);
      await fc
        .post(`${API}/leads/${id}/notes`)
        .send({ body: 'Sau cùng' })
        .expect(201);
      const { interactions } = await open(fc, id);
      expect(interactions.map((item: { note: string }) => item.note)).toEqual([
        'Trước đó',
        'Đầu tiên',
        'Sau cùng',
      ]);
    });
  });

  describe('comments', () => {
    it('CMT-2: comments and views leave updatedAt alone, so imports are not affected', async () => {
      const { id } = await newLead(fc);
      const before = (await rawLead(id))?.updatedAt;
      await head
        .post(`${API}/leads/${id}/comments`)
        .send({ body: 'Góp ý' })
        .expect(201);
      await open(fc, id);
      expect((await rawLead(id))?.updatedAt).toEqual(before);
    });

    it('CMT-3 + test 23: a new comment flags the agent until they open the lead', async () => {
      const { id } = await newLead(fc);
      const flagged = async () =>
        (await list(fc, { newComment: 1 })).items.some(
          (item: { id: string }) => item.id === id,
        );
      expect(await flagged()).toBe(false);

      await head
        .post(`${API}/leads/${id}/comments`)
        .send({ body: 'Gọi lại sớm nhé' })
        .expect(201);
      expect(await flagged()).toBe(true);
      const row = (await list(fc)).items.find(
        (item: { id: string }) => item.id === id,
      );
      expect(row.newComment).toBe(true);
      expect(
        (await fc.get(`${API}/leads/counts`).expect(200)).body.newComment,
      ).toBeGreaterThan(0);

      expect(
        (await open(fc, id)).comments.map(
          (item: { body: string }) => item.body,
        ),
      ).toEqual(['Gọi lại sớm nhé']);
      expect(await flagged()).toBe(false);

      // Their own reply is not news to them
      await fc
        .post(`${API}/leads/${id}/comments`)
        .send({ body: 'Vâng ạ' })
        .expect(201);
      expect(await flagged()).toBe(false);
      // A manager opening the lead does not clear the agent's flag
      await head
        .post(`${API}/leads/${id}/comments`)
        .send({ body: 'Tốt' })
        .expect(201);
      await open(head, id);
      expect(await flagged()).toBe(true);
    });

    it('CMT-1 + test 25: oldest first, with the author; CMT-6: audited', async () => {
      const { id } = await newLead(fc);
      await head
        .post(`${API}/leads/${id}/comments`)
        .send({ body: 'Một' })
        .expect(201);
      await marketing
        .post(`${API}/leads/${id}/comments`)
        .send({ body: 'Hai' })
        .expect(201);
      const { comments, userNames } = await open(head, id);
      expect(comments.map((item: { body: string }) => item.body)).toEqual([
        'Một',
        'Hai',
      ]);
      expect(userNames[comments[0].authorUserId]).toBe(
        'Giám đốc điều hành 1',
      );
      await head
        .post(`${API}/leads/${id}/comments`)
        .send({ body: 'x'.repeat(2001) })
        .expect(400);
      const audit = await connection
        .collection('auditEvents')
        .countDocuments({ entity: 'lead_comment', entityId: id });
      expect(audit).toBe(2);
    });
  });

  describe('tasks', () => {
    it('TASK-2: create, edit, complete and reopen', async () => {
      const { id } = await newLead(fc);
      const created = await fc
        .post(`${API}/leads/${id}/tasks`)
        .send({ title: 'Gửi báo giá', dueAt: '2030-01-01T02:00:00Z' })
        .expect(201);
      const taskId = created.body.id;
      const url = `${API}/leads/${id}/tasks/${taskId}`;
      const find = async () =>
        (await open(fc, id)).tasks.find(
          (task: { id: string }) => task.id === taskId,
        );

      await fc
        .patch(url)
        .send({ title: 'Gửi báo giá mới', dueAt: '2030-01-02T02:00:00Z' })
        .expect(200);
      expect(await find()).toMatchObject({
        title: 'Gửi báo giá mới',
        source: 'APP',
        status: 'OPEN',
      });

      await fc.patch(url).send({ done: true }).expect(200);
      expect((await find()).status).toBe('DONE');
      expect((await find()).doneAt).toEqual(expect.any(String));
      await fc.patch(url).send({ done: false }).expect(200);
      expect(await find()).toMatchObject({
        status: 'OPEN',
        doneAt: null,
        doneBy: null,
      });

      await fc
        .post(`${API}/leads/${id}/tasks`)
        .send({ title: '', dueAt: '2030-01-01T02:00:00Z' })
        .expect(400);
      await fc
        .post(`${API}/leads/${id}/tasks`)
        .send({ title: 'x', dueAt: 'mai' })
        .expect(400);
      await fc
        .patch(`${API}/leads/${id}/tasks/${randomUUID().toString()}`)
        .send({ done: true })
        .expect(404);
      await um.patch(url).send({ done: true }).expect(404);
    });

    it('TASK-4: listed by due date', async () => {
      const { id } = await newLead(marketing);
      await marketing
        .post(`${API}/leads/${id}/tasks`)
        .send({ title: 'Sau', dueAt: '2031-01-01T00:00:00Z' })
        .expect(201);
      await marketing
        .post(`${API}/leads/${id}/tasks`)
        .send({ title: 'Trước', dueAt: '2030-01-01T00:00:00Z' })
        .expect(201);
      expect(
        (await open(marketing, id)).tasks.map(
          (task: { title: string }) => task.title,
        ),
      ).toEqual(['Trước', 'Sau']);
    });
  });

  describe('assigning', () => {
    it('LEAD-21: only lead managers; the agent and every lead must exist', async () => {
      const { id } = await newLead(marketing);
      await fc
        .post(`${API}/leads/assign`)
        .send({ leadIds: [id], agentCode: FC })
        .expect(403);
      expect(
        (
          await marketing
            .post(`${API}/leads/assign`)
            .send({ leadIds: [id], agentCode: '999' })
            .expect(400)
        ).body.error,
      ).toBe('agent_not_found');
      await marketing
        .post(`${API}/leads/assign`)
        .send({ leadIds: [id, randomUUID().toString()], agentCode: FC })
        .expect(404);
      await marketing
        .post(`${API}/leads/assign`)
        .send({ leadIds: [], agentCode: FC })
        .expect(400);
      await marketing
        .post(`${API}/leads/assign`)
        .send({ leadIds: Array.from({ length: 201 }, () => id), agentCode: FC })
        .expect(400);
    });

    it('LEAD-22 + test 21: reassigning cancels the old automatic task and opens a new one', async () => {
      const { id } = await newLead(marketing, { assignedAgentCode: FC });
      expect((await open(fc, id)).lead.isNew).toBe(true);
      expect((await rawLead(id))?.assigneeSeenAt).toBeInstanceOf(Date);

      const res = await head
        .post(`${API}/leads/assign`)
        .send({ leadIds: [id], agentCode: OTHER_FC })
        .expect(201);
      expect(res.body.assigned).toBe(1);
      const raw = await rawLead(id);
      expect(raw?.assigneeSeenAt).toBeUndefined();
      expect(raw?.assignedAgentCode).toBe(OTHER_FC);

      const tasks = await connection
        .collection('tasks')
        .find({ leadId: id })
        .sort({ createdAt: 1 })
        .toArray();
      expect(tasks.map((task) => [task.agentCode, task.status])).toEqual([
        [FC, 'CANCELLED'],
        [OTHER_FC, 'OPEN'],
      ]);
      const due = tasks[1].dueAt.getTime() - raw?.assignedAt.getTime();
      expect(due).toBe(48 * 3_600_000);

      const audit = await connection
        .collection('auditEvents')
        .findOne({ action: 'ASSIGN', entityId: id, 'meta.to': OTHER_FC });
      expect(audit?.meta.from).toBe(FC);
      const { history } = await open(marketing, id);
      expect(history[0]).toMatchObject({
        field: 'assignee',
        oldValue: FC,
        newValue: OTHER_FC,
      });
    });

    it('LEAD-21: already assigned leads are skipped; unassigning works', async () => {
      const { id } = await newLead(marketing, { assignedAgentCode: FC });
      expect(
        (
          await head
            .post(`${API}/leads/assign`)
            .send({ leadIds: [id], agentCode: FC })
            .expect(201)
        ).body.assigned,
      ).toBe(0);
      expect(
        (
          await head
            .post(`${API}/leads/assign`)
            .send({ leadIds: [id], agentCode: null })
            .expect(201)
        ).body.assigned,
      ).toBe(1);
      expect(await rawLead(id)).toMatchObject({});
      expect((await rawLead(id))?.assignedAgentCode).toBeUndefined();
      const open_ = await connection
        .collection('tasks')
        .countDocuments({ leadId: id, status: 'OPEN' });
      expect(open_).toBe(0);
      await fc.get(`${API}/leads/${id}`).expect(404);
    });

    it('LEAD-9 + test 20: a self-sourced lead stays while its creator works here', async () => {
      const { id } = await newLead(fc);
      const locked = await marketing
        .post(`${API}/leads/assign`)
        .send({ leadIds: [id], agentCode: OTHER_FC })
        .expect(409);
      expect(locked.body.error).toBe('own_lead_locked');
      await marketing
        .post(`${API}/leads/assign`)
        .send({ leadIds: [id], agentCode: null })
        .expect(409);

      // AGT-7: once the agent has an end date, a lead manager may hand it on
      await head
        .patch(`${API}/agents/${FC}`)
        .send({ endDate: '2026-01-01' })
        .expect(200);
      await marketing
        .post(`${API}/leads/assign`)
        .send({ leadIds: [id], agentCode: OTHER_FC })
        .expect(201);
      await head
        .patch(`${API}/agents/${FC}`)
        .send({ endDate: null })
        .expect(200);
    });

    it('test 21: assigns 200 leads in one go', async () => {
      const ids: string[] = [];
      const now = new Date();
      const { tenantId } = (await connection
        .collection('users')
        .findOne({ email: demoEmail(1, 'head') }))!;
      const docs = Array.from({ length: 200 }, (_, index) => {
        const _id = randomUUID();
        ids.push(_id.toString());
        return {
          _id,
          tenantId,
          fullName: `Lô ${index}`,
          nameNorm: `LO ${index}`,
          phone: `07${String(10000000 + index).slice(-8)}`,
          source: 'Lô',
          leadDate: '2026-01-01',
          stage: 'NEW',
          origin: 'GA',
          consentMarketing: false,
          createdAt: now,
          updatedAt: now,
        };
      });
      await connection.collection('leads').insertMany(docs);
      const res = await head
        .post(`${API}/leads/assign`)
        .send({ leadIds: ids, agentCode: FC })
        .expect(201);
      expect(res.body.assigned).toBe(200);
      const tasks = await connection.collection('tasks').countDocuments({
        leadId: { $in: docs.map((doc) => doc._id) },
        status: 'OPEN',
      });
      expect(tasks).toBe(200);
      await connection
        .collection('tasks')
        .deleteMany({ leadId: { $in: docs.map((doc) => doc._id) } });
      await connection
        .collection('leads')
        .deleteMany({ _id: { $in: docs.map((doc) => doc._id) } });
    }, 60_000);

    it('LEAD-23: the picker lists active agents with their open leads, for managers', async () => {
      await fc.get(`${API}/leads/assignees`).expect(403);
      const { items } = (
        await marketing
          .get(`${API}/leads/assignees`)
          .query({ q: 'Tư vấn viên' })
          .expect(200)
      ).body;
      expect(items[0]).toMatchObject({
        agentCode: FC,
        name: 'Tư vấn viên 1',
        openLeads: expect.any(Number),
      });
    });
  });

  describe('list, tabs and overdue', () => {
    const ageAssignment = (id: string, hours: number) =>
      connection
        .collection('leads')
        .updateOne(
          { _id: id },
          { $set: { assignedAt: new Date(Date.now() - hours * 3_600_000) } },
        );

    it('LEAD-29 + test 26: overdue after 48 hours, until first contact', async () => {
      const { id } = await newLead(marketing, { assignedAgentCode: FC });
      const isOverdue = async () =>
        (await list(fc, { overdue: 1 })).items.some(
          (item: { id: string }) => item.id === id,
        );
      await ageAssignment(id, 47);
      expect(await isOverdue()).toBe(false);
      await ageAssignment(id, 49);
      expect(await isOverdue()).toBe(true);
      expect((await open(fc, id)).lead.overdue).toBe(true);
      await fc
        .post(`${API}/leads/${id}/activities`)
        .send({ type: 'CALL', note: 'Đã gọi' })
        .expect(201);
      expect(await isOverdue()).toBe(false);
    });

    it('LEAD-38: overdue first, then the next action due, then the latest assigned', async () => {
      const a = await newLead(marketing, {
        assignedAgentCode: UM,
        fullName: 'Sắp xếp mới',
      });
      const b = await newLead(marketing, {
        assignedAgentCode: UM,
        fullName: 'Sắp xếp hẹn',
      });
      const c = await newLead(marketing, {
        assignedAgentCode: UM,
        fullName: 'Sắp xếp quá hạn',
      });
      await update(marketing, b.id, {
        nextActionAt: '2030-01-01T00:00:00Z',
      }).expect(200);
      await ageAssignment(c.id, 72);
      const { items } = await list(marketing, { q: 'Sắp xếp', assignee: UM });
      expect(items.map((item: { id: string }) => item.id)).toEqual([
        c.id,
        b.id,
        a.id,
      ]);
      expect(items[0].overdue).toBe(true);

      const oldest = await list(marketing, { q: 'Sắp xếp', order: 'asc' });
      expect(oldest.items).toHaveLength(3);
    });

    it('test 26: tab counts are right for an agent, a line manager and a lead manager', async () => {
      const count = async (agent: Agent) =>
        (await agent.get(`${API}/leads/counts`).expect(200)).body;
      const beforeFc = await count(fc);
      const beforeUm = await count(um);
      const beforeMk = await count(marketing);

      const assigned = await newLead(marketing, { assignedAgentCode: FC });
      await newLead(marketing);

      const afterFc = await count(fc);
      expect(afterFc.all).toBe(beforeFc.all + 1);
      expect(afterFc.mine).toBe(beforeFc.mine + 1);
      expect(afterFc.isNew).toBe(beforeFc.isNew + 1);
      expect(afterFc.unassigned).toBe(0);

      // Changed 27/11/2026: the line manager does not count the leads of their line
      const afterUm = await count(um);
      expect(afterUm.all).toBe(beforeUm.all);
      expect(afterUm.mine).toBe(beforeUm.mine);
      expect(afterUm.unassigned).toBe(0);

      const afterMk = await count(marketing);
      expect(afterMk.all).toBe(beforeMk.all + 2);
      expect(afterMk.unassigned).toBe(beforeMk.unassigned + 1);
      expect(
        (await list(marketing, { assignee: 'NONE', pageSize: 1 })).total,
      ).toBe(afterMk.unassigned);

      await open(fc, assigned.id);
      expect((await count(fc)).isNew).toBe(beforeFc.isNew);
    });

    it('LEAD-35: every filter narrows the list', async () => {
      const { id } = await newLead(marketing, {
        assignedAgentCode: UM,
        fullName: 'Lọc Thử',
        source: 'Nguồn Lọc',
      });
      await update(marketing, id, {
        interest: 'LIFE',
        careStatus: 'CARING',
      }).expect(200);
      const has = async (query: object) =>
        (await list(marketing, query as Record<string, string>)).items.some(
          (item: { id: string }) => item.id === id,
        );
      for (const query of [
        { interest: 'LIFE' },
        { care: 'CARING' },
        { source: 'Nguồn Lọc' },
        { assignee: UM },
        { stage: 'CONTACTED' },
      ]) {
        expect(await has(query), JSON.stringify(query)).toBe(true);
      }
      for (const query of [
        { interest: 'NONE' },
        { care: 'NONE' },
        { source: 'Khác' },
        { assignee: 'NONE' },
        { stage: 'NEW' },
        { from: '2099-01-01' },
        { to: '2000-01-01' },
      ]) {
        expect(await has(query), JSON.stringify(query)).toBe(false);
      }
      // OPT-1: the filter takes any catalogue code, so an unknown one simply matches nothing
      expect(await has({ interest: 'BOGUS' })).toBe(false);
      await marketing.get(`${API}/leads`).query({ 'q[$ne]': 'x' }).expect(400);
      // Decided 24/11/2026: one "Nguồn gốc" (the source); the system origin is not a filter
      await marketing.get(`${API}/leads`).query({ origin: 'GA' }).expect(400);

      const facets = (await marketing.get(`${API}/leads/facets`).expect(200))
        .body;
      expect(facets.sources).toContain('Nguồn Lọc');
      expect(facets.agents).toContainEqual({ code: UM, name: 'Trưởng nhóm 1' });
    });

    it('test 25: the detail carries the assignee and campaign', async () => {
      const { tenantId } = (await connection
        .collection('users')
        .findOne({ email: demoEmail(1, 'head') }))!;
      const { insertedId } = await connection
        .collection('campaigns')
        .insertOne({
          tenantId,
          name: 'Chiến dịch thử',
          type: 'OTHER',
          status: 'ACTIVE',
        });
      const { id } = await newLead(marketing, {
        assignedAgentCode: FC,
        campaignId: insertedId.toString(),
      });
      const detail = await open(marketing, id);
      expect(detail.campaign).toEqual({
        id: insertedId.toString(),
        name: 'Chiến dịch thử',
      });
      expect(detail.assignee).toEqual({ agentCode: FC, name: 'Tư vấn viên 1' });
      const row = (await list(marketing, { campaignId: insertedId.toString() }))
        .items[0];
      expect(row).toMatchObject({
        campaignName: 'Chiến dịch thử',
        agentName: 'Tư vấn viên 1',
      });
    });
  });

  describe('lead file', () => {
    const HEADERS = [
      'SỐ ĐIỆN THOẠI',
      'TÊN KHÁCH HÀNG',
      'Nguồn',
      'NGÀY CẬP NHẬT LEAD',
      'Mã đại lý',
      'Tình Trạng TVV',
      'Trạng Thái Hiện Tại TVV',
      'Chiến Dịch',
      'TIẾN ĐỘ TƯ VẤN TVV',
      'ĐỒNG Ý LIÊN HỆ',
    ];
    const fileRow = (
      phone: string | number,
      patch: {
        date?: string;
        agent?: string;
        interest?: string;
        care?: string;
        campaign?: string;
        note?: string;
        consent?: string;
        name?: string;
      } = {},
    ) => [
      phone,
      patch.name ?? 'Khách File',
      'Quảng cáo',
      patch.date ?? null,
      patch.agent ?? null,
      patch.interest ?? null,
      patch.care ?? null,
      patch.campaign ?? null,
      patch.note ?? null,
      patch.consent ?? null,
    ];
    const start = async (
      agent: Agent,
      headers: string[] = HEADERS,
      mapping?: Record<string, unknown>,
    ) =>
      (
        await agent
          .post(`${API}/imports`)
          .send({
            fileName: 'chia-lead.xlsx',
            snapshotDate: '2026-11-06',
            kind: 'LEADS',
            sheets: [{ name: 'Chia Lead', headers }],
            ...(mapping && { mapping }),
          })
          .expect(201)
      ).body;
    const run = async (
      agent: Agent,
      rows: unknown[][],
      mapping?: Record<string, unknown>,
    ) => {
      const { id } = await start(agent, HEADERS, mapping);
      await agent
        .post(`${API}/imports/${id}/rows`)
        .send({
          sheet: 'Chia Lead',
          rows: rows.map((c, index) => ({ r: index + 2, c })),
        })
        .expect(200);
      const preview = (
        await agent.post(`${API}/imports/${id}/validate`).expect(200)
      ).body;
      return { id, preview, sheet: preview.sheets[0] };
    };
    const commit = async (
      agent: Agent,
      rows: unknown[][],
      mapping?: Record<string, unknown>,
    ) => {
      const { id } = await run(agent, rows, mapping);
      const done = (await agent.post(`${API}/imports/${id}/commit`).expect(200))
        .body;
      return { id, done, sheet: done.sheets[0] };
    };
    const problems = async (agent: Agent, id: string) =>
      (
        await agent
          .get(`${API}/imports/${id}/errors`)
          .query({ pageSize: 500 })
          .expect(200)
      ).body.items as {
        row: number;
        code: string;
        severity: string;
        messageVi: string;
        recordKey: string;
      }[];
    const byPhone = async (phone: string) => {
      // Decided 27/11/2026: only the GA director finds any lead by its number
      const { items } = await list(head, { q: phone });
      expect(items).toHaveLength(1);
      return open(head, items[0].id);
    };

    it('IMP-11: the template downloads and imports with no errors', async () => {
      const res = await marketing
        .get(`${API}/imports/templates/LEADS.xlsx`)
        .buffer(true)
        .parse((response, callback) => {
          const chunks: Buffer[] = [];
          response.on('data', (chunk: Buffer) => chunks.push(chunk));
          response.on('end', () => callback(null, Buffer.concat(chunks)));
        })
        .expect(200);
      const workbook = new ExcelJS.Workbook();
      await workbook.xlsx.load(res.body as never);
      expect(workbook.worksheets.map((sheet) => sheet.name)).toEqual([
        '00_README',
        '13_Leads',
        '12_Lookups',
      ]);
      const sheet = workbook.getWorksheet('13_Leads')!;
      // Decided 25/11/2026: laid out like a GA's "Chia Lead" file, groups over two header rows;
      // the second row names every column (a merged cell repeats its value)
      expect(sheet.getCell('A1').value).toBe('TÊN TVV');
      // Decided 26/11/2026: no "KHU VỰC KHÁCH HÀNG" column any more
      expect(sheet.getCell('M1').value).toBe('XỬ LÝ SAU');
      expect(sheet.getCell('M2').value).toBe('10 NGÀY');
      expect(sheet.getCell('Q1').value).toBe('THÔNG TIN THÊM');
      const headers = (sheet.getRow(2).values as string[]).slice(1);
      expect(headers).not.toContain('KHU VỰC KHÁCH HÀNG');
      expect(headers.slice(0, 4)).toEqual([
        'TÊN TVV',
        'NGÀY CẬP NHẬT LEAD',
        'TÊN KHÁCH HÀNG',
        'SỐ ĐIỆN THOẠI',
      ]);
      expect(sheet.getCell('D50').numFmt).toBe('@');

      const rows: unknown[][] = [];
      sheet.eachRow((row, number) => {
        if (number > 2)
          rows.push(
            headers.map((_, index) => row.getCell(index + 1).value ?? null),
          );
      });
      // TENANT-5: a product cell naming a catalogue product (any case, no marks) links to it
      const productColumn = headers.indexOf('SẢN PHẨM');
      expect(productColumn).toBeGreaterThan(-1);
      rows[0][productColumn] = 'an tam song hanh';
      const other = await as('admin', 2);
      const { id, sheets } = (
        await other
          .post(`${API}/imports`)
          .send({
            fileName: 'mau.xlsx',
            snapshotDate: '2026-11-06',
            kind: 'LEADS',
            sheets: [{ name: '13_Leads', headers }],
          })
          .expect(201)
      ).body;
      expect(sheets[0].status).toBe('READY');
      await other
        .post(`${API}/imports/${id}/rows`)
        .send({
          sheet: '13_Leads',
          rows: rows.map((c, index) => ({ r: index + 2, c })),
        })
        .expect(200);
      const preview = (
        await other.post(`${API}/imports/${id}/validate`).expect(200)
      ).body;
      expect(preview.errorsTotal).toBe(0);
      expect(preview.sheets[0]).toMatchObject({
        found: 2,
        inserted: 2,
        rejected: 0,
      });
      const done = (await other.post(`${API}/imports/${id}/commit`).expect(200))
        .body;
      expect(done.status).toBe('COMMITTED');
      const leads = (
        await other
          .get(`${API}/leads`)
          .query({ q: 'Nguyễn Văn Mẫu' })
          .expect(200)
      ).body.items;
      expect(leads[0]).toMatchObject({
        source: 'Facebook',
        interest: 'UNDETERMINED',
        careStatus: 'CARING',
        campaignName: 'Chiến dịch mẫu',
        consentMarketing: true,
      });
      const linked = (
        await other.get(`${API}/leads/${leads[0].id}`).expect(200)
      ).body.lead;
      expect(linked).toMatchObject({
        productInterest: 'an tam song hanh',
        productCode: 'AN_TAM_SONG_HANH',
      });
    });

    it('needs leads.import: an agent cannot start one or download the template', async () => {
      await fc
        .post(`${API}/imports`)
        .send({
          fileName: 'a',
          snapshotDate: '2026-11-06',
          kind: 'LEADS',
          sheets: [],
        })
        .expect(403);
      await fc.get(`${API}/imports/templates/LEADS.xlsx`).expect(403);
      await fc.get(`${API}/imports/lead-setup`).expect(403);
      await fc
        .post(`${API}/imports/lead-agents/match`)
        .send({ values: [] })
        .expect(403);
    });

    it('IMP-28: creates leads, campaigns, the first note, assignment and the 48-hour task', async () => {
      const phone = nextPhone();
      const { sheet } = await commit(marketing, [
        fileRow(phone, {
          date: '02/11/2026',
          agent: FC,
          campaign: 'Chiến dịch file',
          note: 'Khách bị tiểu đường, cần tư vấn thẻ',
          consent: 'Có',
        }),
      ]);
      expect(sheet).toMatchObject({ inserted: 1, rejected: 0 });
      const { lead, interactions, tasks, history, campaign } =
        await byPhone(phone);
      expect(lead).toMatchObject({
        origin: 'IMPORT',
        leadDate: '2026-11-02',
        assignedAgentCode: FC,
        consentMarketing: true,
        firstContactAt: null,
      });
      expect(campaign.name).toBe('Chiến dịch file');
      // PDP-2 + NOTE-7
      expect(interactions[0]).toMatchObject({
        source: 'IMPORT',
        note: 'Khách bị tiểu đường, cần tư vấn thẻ',
        occurredAt: '2026-11-01T17:00:00.000Z',
      });
      expect(tasks[0]).toMatchObject({ source: 'AUTO_ASSIGN', status: 'OPEN' });
      expect(history[0]).toMatchObject({
        field: 'assignee',
        newValue: FC,
        imported: true,
      });
      expect(new Date(lead.updatedAt).toISOString()).toBe(
        '2026-11-01T17:00:00.000Z',
      );
    });

    it('LEAD-22: a row with a care status gets no contact task and is not counted overdue', async () => {
      const phone = nextPhone();
      await commit(marketing, [
        fileRow(phone, { date: '02/11/2026', agent: FC, care: 'Hẹn gọi lại' }),
      ]);
      const { lead, tasks } = await byPhone(phone);
      expect(tasks).toEqual([]);
      expect(lead).toMatchObject({
        careStatus: 'CARING',
        stage: 'CONTACTED',
        overdue: false,
        firstContactAt: null,
      });
    });

    it('AC 16.5 + test 32: uploading the same file again changes nothing', async () => {
      const phoneA = nextPhone();
      const phoneB = nextPhone();
      const rows = [
        fileRow(phoneA, { date: '02/11/2026', note: 'Lần đầu' }),
        fileRow(phoneB),
      ];
      await commit(marketing, rows);
      const before = await byPhone(phoneA);

      const { id, sheet } = await commit(marketing, rows);
      expect(sheet).toMatchObject({
        inserted: 0,
        updated: 0,
        skipped: 2,
        warnings: 0,
      });
      const listed = await problems(marketing, id);
      expect(listed.map((item) => [item.code, item.severity])).toEqual([
        ['lead_not_newer', 'skipped'],
        ['lead_not_newer', 'skipped'],
      ]);
      const after = await byPhone(phoneA);
      expect(after.lead.updatedAt).toBe(before.lead.updatedAt);
      expect(after.interactions).toHaveLength(before.interactions.length);
    });

    it('test 32: a later row wins and logs it; blanks never clear; consent only grows', async () => {
      const phone = nextPhone();
      await commit(marketing, [
        fileRow(phone, {
          date: '01/11/2026',
          interest: 'Knm',
          note: 'Cũ',
          consent: 'Có',
          campaign: 'Giữ',
          name: 'Tên Cũ',
        }),
      ]);
      const { id, sheet } = await commit(marketing, [
        fileRow(phone, {
          date: '03/11/2026',
          interest: 'Nhân thọ',
          care: 'Quan tâm',
          note: 'Mới',
          consent: 'Chưa',
          name: 'Tên Mới',
        }),
      ]);
      expect(sheet).toMatchObject({ updated: 1, warnings: 1 });
      expect((await problems(marketing, id))[0]).toMatchObject({
        code: 'lead_exists',
        severity: 'warning',
      });

      const { lead, interactions, history, campaign } = await byPhone(phone);
      expect(lead).toMatchObject({
        fullName: 'Tên Mới',
        interest: 'LIFE',
        careStatus: 'CARING',
        consentMarketing: true,
      });
      expect(lead.leadDate).toBe('2026-11-01');
      expect(campaign.name).toBe('Giữ');
      expect(interactions.map((item: { note: string }) => item.note)).toEqual([
        'Cũ',
        'Mới',
      ]);
      const change = history.find(
        (item: { field: string; newValue: string }) =>
          item.field === 'interest' && item.newValue === 'LIFE',
      );
      expect(change).toMatchObject({
        oldValue: 'NOT_REACHED',
        imported: true,
        changedAt: '2026-11-02T17:00:00.000Z',
      });

      await commit(marketing, [fileRow(phone, { date: '04/11/2026' })]);
      const blank = await byPhone(phone);
      expect(blank.lead).toMatchObject({
        interest: 'LIFE',
        careStatus: 'CARING',
        progressNote: 'Mới',
      });
      expect(blank.interactions).toHaveLength(2);
    });

    it('IMP-26: a CRM edit today beats a file row dated today', async () => {
      const { id, phone } = await newLead(marketing);
      await update(marketing, id, { fullName: 'Sửa Trên CRM' }).expect(200);
      const today = new Intl.DateTimeFormat('en-GB', {
        timeZone: 'Asia/Ho_Chi_Minh',
      }).format(new Date());
      const { sheet } = await commit(marketing, [
        fileRow(phone, { date: today, name: 'Từ File' }),
      ]);
      expect(sheet.skipped).toBe(1);
      expect((await open(marketing, id)).lead.fullName).toBe('Sửa Trên CRM');
    });

    it('CMT-2: a comment does not stop a later file row from applying', async () => {
      const phone = nextPhone();
      await commit(marketing, [fileRow(phone, { date: '01/11/2026' })]);
      const { lead } = await byPhone(phone);
      await marketing
        .post(`${API}/leads/${lead.id}/comments`)
        .send({ body: 'Góp ý' })
        .expect(201);
      const { sheet } = await commit(marketing, [
        fileRow(phone, { date: '02/11/2026', name: 'Cập Nhật' }),
      ]);
      expect(sheet.updated).toBe(1);
    });

    it('IMP-29 + LEAD-22: reassigning through a file follows the same rules', async () => {
      const phone = nextPhone();
      await commit(marketing, [
        fileRow(phone, { date: '01/11/2026', agent: FC }),
      ]);
      const { sheet } = await commit(marketing, [
        fileRow(phone, { date: '02/11/2026', agent: OTHER_FC }),
      ]);
      expect(sheet.updated).toBe(1);
      const { lead } = await byPhone(phone);
      expect(lead.assignedAgentCode).toBe(OTHER_FC);
      const tasks = await connection
        .collection('tasks')
        .find({ leadId: lead.id })
        .sort({ createdAt: 1 })
        .toArray();
      expect(tasks.map((task) => [task.agentCode, task.status])).toEqual([
        [FC, 'CANCELLED'],
        [OTHER_FC, 'OPEN'],
      ]);
    });

    it('LEAD-9: a file cannot move a locked self-sourced lead; only that row is refused', async () => {
      const { phone } = await newLead(fc);
      await connection
        .collection('leads')
        .updateOne({ phone }, { $set: { updatedAt: new Date('2020-01-01') } });
      const good = nextPhone();
      const { id, sheet } = await commit(marketing, [
        fileRow(phone, { date: '02/11/2026', agent: OTHER_FC }),
        fileRow(good, { date: '02/11/2026' }),
      ]);
      expect(sheet).toMatchObject({ rejected: 1, inserted: 1 });
      expect((await problems(marketing, id))[0]).toMatchObject({
        row: 2,
        code: 'own_lead_locked',
        severity: 'error',
      });
      expect((await byPhone(phone)).lead.assignedAgentCode).toBe(FC);
    });

    it('section 20.5: refuses bad rows one by one, and restores phones Excel broke', async () => {
      const goodPhone = nextPhone();
      const restored = nextPhone();
      const { id, sheet, preview } = await run(marketing, [
        fileRow(goodPhone),
        fileRow('123'),
        fileRow(nextPhone(), { date: '31/02/2026' }),
        fileRow(nextPhone(), { interest: 'Có thể' }),
        fileRow(nextPhone(), { care: 'Chưa rõ' }),
        fileRow(nextPhone(), { consent: 'Có lẽ' }),
        fileRow(goodPhone, { name: 'Trùng' }),
        fileRow(nextPhone(), { agent: '424242' }),
        [nextPhone(), '', 'Quảng cáo'],
        fileRow(Number(restored.slice(1))),
      ]);
      expect(sheet).toMatchObject({
        found: 10,
        inserted: 2,
        rejected: 8,
        warnings: 1,
      });
      expect(preview.errorsTotal).toBe(8);
      const listed = await problems(marketing, id);
      expect(listed.map((item) => [item.row, item.code])).toEqual([
        [3, 'invalid_phone'],
        [4, 'invalid_date'],
        [5, 'invalid_list'],
        [6, 'invalid_list'],
        [7, 'invalid_yes_no'],
        [8, 'duplicate_key'],
        [9, 'agent_not_found'],
        [10, 'required'],
        [11, 'padded_key'],
      ]);
      expect(listed[0].messageVi).toContain('"123"');
      await marketing.post(`${API}/imports/${id}/commit`).expect(200);
      expect((await byPhone(restored)).lead.phone).toBe(restored);
    });

    it('IMP-23: a person can map columns by hand; banned columns are never read', async () => {
      const phone = nextPhone();
      const headers = [
        'Khách',
        'Số',
        'Kênh QC',
        'Số CCCD',
        'Tình trạng sức khỏe',
      ];
      const columns = { fullName: 0, phone: 1, source: 2, extraInfo: 4 };
      const { id, sheets } = await start(marketing, headers, {
        columns,
        agents: [],
      });
      expect(sheets[0]).toMatchObject({
        status: 'READY',
        banned: ['Số CCCD'],
        fields: ['fullName', 'phone', 'source', 'extraInfo'],
        present: [0, 1, 2, 4],
      });
      await marketing
        .post(`${API}/imports/${id}/rows`)
        .send({
          sheet: 'Chia Lead',
          rows: [{ r: 2, c: ['Bằng Tay', phone, 'Web', 'Huyết áp cao'] }],
        })
        .expect(200);
      await marketing.post(`${API}/imports/${id}/validate`).expect(200);
      await marketing.post(`${API}/imports/${id}/commit`).expect(200);
      expect((await byPhone(phone)).lead).toMatchObject({
        fullName: 'Bằng Tay',
        extraInfo: 'Huyết áp cao',
      });
      expect((await problems(marketing, id))[0]).toMatchObject({
        code: 'banned_column',
        row: 1,
      });
    });

    it('a GA file keeps its "XỬ LÝ SAU" and "CDYT" columns on the lead, and erasing the lead wipes them (PDP-6)', async () => {
      const phone = nextPhone();
      const headers = [
        'TÊN KHÁCH HÀNG',
        'SỐ ĐIỆN THOẠI',
        'Nguồn',
        '10 NGÀY',
        '15 NGÀY',
        '20 NGÀY',
        'GHI CHÚ XỬ LÝ',
        'CDYT - THỐNG KÊ',
        'CDYT - TRANG CÁ NHÂN',
      ];
      const { id, sheets } = await start(marketing, headers);
      expect(sheets[0]).toMatchObject({
        status: 'READY',
        fields: [
          'fullName',
          'phone',
          'source',
          'followUp10d',
          'followUp15d',
          'followUp20d',
          'handlingNote',
          'cdytStats',
          'cdytProfile',
        ],
      });
      await marketing
        .post(`${API}/imports/${id}/rows`)
        .send({
          sheet: 'Chia Lead',
          rows: [
            {
              r: 2,
              c: [
                'Khách Xử Lý Sau',
                phone,
                'Page BHN',
                'Gọi lại lần 2',
                'Gửi bảng minh họa',
                null,
                'Hẹn gặp cuối tuần',
                '3 lượt xem',
                'https://example.com/khach',
              ],
            },
          ],
        })
        .expect(200);
      await marketing.post(`${API}/imports/${id}/validate`).expect(200);
      await marketing.post(`${API}/imports/${id}/commit`).expect(200);
      const { lead } = await byPhone(phone);
      expect(lead).toMatchObject({
        followUp10d: 'Gọi lại lần 2',
        followUp15d: 'Gửi bảng minh họa',
        followUp20d: null,
        handlingNote: 'Hẹn gặp cuối tuần',
        cdytStats: '3 lượt xem',
        cdytProfile: 'https://example.com/khach',
      });
      await marketing
        .delete(`${API}/leads/${lead.id}`)
        .send({ reason: 'Khách yêu cầu xóa dữ liệu', mode: 'PDP' })
        .expect(204);
      // The test shim leaves out empty columns: the texts are gone
      const erased = await connection
        .collection('leads')
        .findOne({ _id: lead.id });
      for (const field of [
        'followUp10d',
        'followUp15d',
        'handlingNote',
        'cdytStats',
        'cdytProfile',
      ])
        expect(erased, field).not.toHaveProperty(field);
    });

    it('IMP-4: a missing required column blocks the sheet', async () => {
      const { id, sheets } = await start(marketing, [
        'TÊN KHÁCH HÀNG',
        'Nguồn',
      ]);
      expect(sheets[0]).toMatchObject({
        status: 'BLOCKED',
        missingRequired: ['SỐ ĐIỆN THOẠI'],
      });
      await marketing
        .post(`${API}/imports/${id}/rows`)
        .send({ sheet: 'Chia Lead', rows: [] })
        .expect(409);
    });

    it('IMP-24: names map to agents, automatically or by choice', async () => {
      const setup = (
        await marketing.get(`${API}/imports/lead-setup`).expect(200)
      ).body;
      expect(
        setup.columns.find(
          (column: { field: string }) => column.field === 'phone',
        ),
      ).toMatchObject({
        required: true,
        aliases: expect.arrayContaining(['Sđt']),
      });
      expect(
        setup.agents.map((agent: { agentCode: string }) => agent.agentCode),
      ).toContain(FC);

      const matched = (
        await marketing
          .post(`${API}/imports/lead-agents/match`)
          .send({ values: ['Tư vấn viên 1', 'Không Ai', FC, FC] })
          .expect(200)
      ).body.matches;
      expect(matched).toEqual([
        { value: 'Tư vấn viên 1', agentCode: FC },
        { value: 'Không Ai', agentCode: null },
        { value: FC, agentCode: FC },
      ]);

      const a = nextPhone();
      const b = nextPhone();
      const c = nextPhone();
      await commit(
        marketing,
        [
          fileRow(a, { agent: 'Tư vấn viên 1' }),
          fileRow(b, { agent: 'Chị Hoa' }),
          fileRow(c, { agent: 'Không Ai' }),
        ],
        {
          columns: Object.fromEntries(
            [
              'phone',
              'fullName',
              'source',
              'rowDate',
              'agentValue',
              'interest',
              'careStatus',
              'campaignName',
              'progressNote',
              'consent',
            ].map((field, index) => [field, index]),
          ),
          agents: [{ value: 'Chị Hoa', agentCode: OTHER_FC }],
        },
      );
      expect((await byPhone(a)).lead.assignedAgentCode).toBe(FC);
      expect((await byPhone(b)).lead.assignedAgentCode).toBe(OTHER_FC);
      expect((await byPhone(c)).lead.assignedAgentCode).toBeNull();
    });

    it('TEN-7: a lead file of GA-1 is invisible to GA-2, and assigning needs an agent of this GA', async () => {
      const { id } = await run(marketing, [fileRow(nextPhone())]);
      const other = await as('admin', 2);
      await other.get(`${API}/imports/${id}`).expect(404);
      await other.post(`${API}/imports/${id}/commit`).expect(404);
      await marketing.post(`${API}/imports/${id}/cancel`).expect(204);

      const phone = nextPhone();
      const { sheet } = await commit(other, [fileRow(phone, { agent: FC })]);
      expect(sheet).toMatchObject({ rejected: 1, inserted: 0 });
    });

    it('IMP-13: a file of 2,000 leads validates and commits within 30 seconds', async () => {
      const started = Date.now();
      const { id } = await start(marketing);
      const rows = Array.from({ length: 2000 }, (_, index) =>
        fileRow(`08${String(10000000 + index).slice(-8)}`, {
          date: '02/11/2026',
          agent: index % 2 ? FC : OTHER_FC,
          campaign: 'Chiến dịch lớn',
          note: 'Ghi chú',
        }),
      );
      for (let begin = 0; begin < rows.length; begin += 500) {
        await marketing
          .post(`${API}/imports/${id}/rows`)
          .send({
            sheet: 'Chia Lead',
            rows: rows
              .slice(begin, begin + 500)
              .map((c, index) => ({ r: begin + index + 2, c })),
          })
          .expect(200);
      }
      await marketing.post(`${API}/imports/${id}/validate`).expect(200);
      const done = (
        await marketing.post(`${API}/imports/${id}/commit`).expect(200)
      ).body;
      expect(done.sheets[0]).toMatchObject({ found: 2000, inserted: 2000 });
      expect(Date.now() - started).toBeLessThan(30_000);
    }, 60_000);
  });

  describe('handovers and selecting by filter', () => {
    // The director assigns outright (decided 27/11/2026)
    const assign = (agentCode: string | null, leadIds: string[]) =>
      head
        .post(`${API}/leads/assign`)
        .send({ leadIds, agentCode })
        .expect(201);
    const contact = (agent: Agent, id: string, type = 'CALL') =>
      agent
        .post(`${API}/leads/${id}/activities`)
        .send({ type, note: 'Đã gọi' })
        .expect(201);
    const daysAgo = (n: number) => new Date(Date.now() - n * 86_400_000);

    it('LEAD-28 + test 27: who held the lead, when, for how many days and with how many contacts', async () => {
      const { id } = await newLead(marketing);
      const leadId = id;
      await assign(FC, [id]);
      await contact(fc, id);
      await contact(fc, id, 'ZALO');
      // A plain note is not a contact
      await fc
        .post(`${API}/leads/${id}/notes`)
        .send({ body: 'Ghi chú' })
        .expect(201);
      await assign(UM, [id]);
      await assign(FC, [id]);

      // Spread the story over days: FC 10 → 6 days ago, UM 6 → 1, FC again since
      const history = connection.collection('leadHistory');
      const rows = await history
        .find({ leadId, field: 'assignee' })
        .sort({ changedAt: 1, _id: 1 })
        .toArray();
      expect(rows).toHaveLength(3);
      for (const [index, ago] of [10, 6, 1].entries()) {
        await history.updateOne(
          { _id: rows[index]._id },
          { $set: { changedAt: daysAgo(ago) } },
        );
      }
      const calls = connection.collection('interactions');
      await calls.updateMany(
        { leadId, type: { $in: ['CALL', 'ZALO'] } },
        { $set: { occurredAt: daysAgo(9) } },
      );

      const { handovers } = await open(marketing, id);
      expect(handovers).toHaveLength(3);
      expect(handovers[0]).toMatchObject({
        agentCode: FC,
        name: 'Tư vấn viên 1',
        days: 4,
        contacts: 2,
      });
      expect(handovers[0].to).not.toBeNull();
      // Handed over with no contact: the screen marks this row
      expect(handovers[1]).toMatchObject({
        agentCode: UM,
        name: 'Trưởng nhóm 1',
        days: 5,
        contacts: 0,
      });
      expect(handovers[2]).toMatchObject({
        agentCode: FC,
        to: null,
        days: 1,
        contacts: 0,
      });
    });

    it('LEAD-28: a lead that came in already assigned starts with that agent', async () => {
      const { id } = await newLead(fc);
      const { handovers } = await open(fc, id);
      expect(handovers).toEqual([
        expect.objectContaining({ agentCode: FC, to: null, contacts: 0 }),
      ]);
    });

    it('LEAD-24: "select all by filter" returns the ids the filter shows, in list order, up to 200', async () => {
      const source = 'Chọn Theo Lọc';
      const created: string[] = [];
      for (let i = 0; i < 3; i++)
        created.push((await newLead(marketing, { source })).id);
      const listed = (await list(marketing, { source })).items.map(
        (item: { id: string }) => item.id,
      );
      const { body } = await marketing
        .get(`${API}/leads/ids`)
        .query({ source })
        .expect(200);
      expect(body).toEqual({ ids: listed, total: 3 });
      const byCode = (a: string, b: string) => a.localeCompare(b);
      expect([...body.ids].sort(byCode)).toEqual([...created].sort(byCode));

      // More than one assignment can take: the first 200, and the real total
      const template = await rawLead(created[0]);
      const extra = Array.from({ length: 205 }, (_, i) => ({
        ...template,
        _id: randomUUID(),
        phone: `07${String(30000000 + i).slice(-8)}`,
      }));
      await connection.collection('leads').insertMany(extra);
      const many = (
        await marketing.get(`${API}/leads/ids`).query({ source }).expect(200)
      ).body;
      expect(many.total).toBe(208);
      expect(many.ids).toHaveLength(200);
      await marketing
        .post(`${API}/leads/assign`)
        .send({ leadIds: many.ids, agentCode: FC })
        .expect(201);

      // Only lead managers assign, so only they select by filter
      await fc.get(`${API}/leads/ids`).query({ source }).expect(403);
      await connection
        .collection('leads')
        .deleteMany({ _id: { $in: extra.map((lead) => lead._id) } });
    });
  });
});
