import type { INestApplication } from '@nestjs/common';
import request from 'supertest';
import { startApp, stopApp } from './support/app.js';
import { connection } from './support/collections.js';
import { demoEmail, seedDemoData } from '../src/seed/demo-data.js';

const API = '/api/v1';
const PASSWORD = 'demo-password-123';
const FC = '00100004';
const PEER = '00100098';
type Agent = ReturnType<typeof request.agent>;

// The signals run on today's date, so the fixtures are built around it
const TODAY = new Date(Date.now() + 7 * 3_600_000).toISOString().slice(0, 10);
const addDays = (days: number) =>
  new Date(Date.parse(`${TODAY}T00:00:00Z`) + days * 86_400_000)
    .toISOString()
    .slice(0, 10);
const MONTH = TODAY.slice(5, 7);
const OTHER_MONTH = String(((Number(MONTH) + 5) % 12) + 1).padStart(2, '0');

// FAM-5: the main insured of a policy, known only by the name the policy writes (no client record)
const MOTHER = 'name:NGUYEN THI ME';

interface FamilyRow {
  key: string;
  linkId: string | null;
  relation: string | null;
  name: string;
  clientId: string | null;
  isClient: boolean;
  canOpen: boolean;
  birth: {
    day: number | null;
    month: number | null;
    year: number | null;
  } | null;
  leadId: string | null;
  sharedPolicies: { policyNo: string; roles: string[] }[];
}

/** Sections 10.9-10.11 and NOTE-5: family, coverage, care opportunities and notes (slice 4c). */
describe('Family, coverage and care opportunities (e2e)', () => {
  let app: INestApplication;
  let head: Agent;
  let fc: Agent;
  let um: Agent;
  let head2: Agent;
  // Client ids, known once the clients are added
  let HOLDER: string;
  let SPOUSE: string;
  let CHILD: string;
  let OUT_OF_SCOPE: string;

  const as = async (key: string, ga = 1) => {
    const agent = request.agent(app.getHttpServer());
    await agent
      .post(`${API}/auth/sign-in/email`)
      .send({ email: demoEmail(ga, key), password: PASSWORD })
      .expect(200);
    return agent;
  };
  const detail = async (agent: Agent, clientId: string) =>
    (await agent.get(`${API}/clients/${clientId}`).expect(200)).body as {
      family: FamilyRow[];
      coverage: {
        key: string;
        name: string;
        groups: Record<string, number>;
        hasDetail: boolean;
        gaps: string[];
      }[];
      signals: { code: string; values: Record<string, unknown> }[];
      notes: { type: string; note: string; createdBy: string }[];
      userNames: Record<string, string>;
      policies: { products: { group: string }[] }[];
    };
  const family = (
    agent: Agent,
    clientId: string,
    body: Record<string, unknown>,
  ) => agent.post(`${API}/clients/${clientId}/family`).send(body);
  const entry = async (clientId: string, key: string) =>
    (await detail(fc, clientId)).family.find((row) => row.key === key);
  const add = async (agent: Agent, body: Record<string, unknown>) =>
    (await agent.post(`${API}/clients`).send(body).expect(201)).body
      .id as string;

  beforeAll(async () => {
    app = await startApp();
    await seedDemoData(app, PASSWORD);
    [head, fc, um, head2] = await Promise.all([
      as('head'),
      as('fc'),
      // Decided 27/11/2026: Admin now plays the one who sees but does not own
      as('admin'),
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

    const policy = (patch: Record<string, unknown>) => ({
      status: 'Đang hiệu lực',
      effectiveDate: '2024-06-01',
      maturityDate: '2044-06-01',
      premiumFrequency: 'Năm',
      basePremiumVnd: 12_000_000,
      ...patch,
    });
    // Added on the policy as its holder, then the policy is filled in; the holder is its main insured
    HOLDER = await add(fc, {
      policyNo: '600000001',
      role: 'PO',
      name: 'Trần Văn Bố',
      dob: `1980-${MONTH}-05`,
    });
    await fc
      .patch(`${API}/clients/${HOLDER}/policies/600000001`)
      .send(
        policy({
          premiumDueDate: addDays(10),
          maturityDate: addDays(180),
          unpaidPremiumVnd: 2_000_000,
          products: [
            { productCode: 'AN_TAM_SONG_HANH', sumAssuredVnd: 500_000_000 },
            {
              productCode: 'BH_CHAM_SOC_SUC_KHOE',
              sumAssuredVnd: 100_000_000,
              insuredName: 'Trần Bé An',
            },
          ],
        }),
      )
      .expect(204);
    // FAM-5: the insured of this policy is a name only, not a client
    await fc
      .post(`${API}/clients/${HOLDER}/policies`)
      .send({
        policyNo: '600000002',
        ...policy({
          status: 'Mất hiệu lực',
          insuredName: 'NGUYỄN THỊ MẸ',
          products: [
            { productCode: 'AN_TAM_SONG_HANH', sumAssuredVnd: 300_000_000 },
          ],
        }),
      })
      .expect(201);
    // Each on a policy known only by its number: nothing about their cover is known (COV-4)
    SPOUSE = await add(fc, {
      policyNo: '600000003',
      role: 'PO',
      name: 'Lê Thị Vợ',
      dob: `1985-${OTHER_MONTH}-04`,
    });
    CHILD = await add(fc, {
      policyNo: '600000004',
      role: 'PO',
      name: 'Trần Con Lớn',
    });
    OUT_OF_SCOPE = await add(head, {
      policyNo: '600000005',
      role: 'PO',
      name: 'Khách Nhánh Khác',
      agentCode: PEER,
    });
  });

  afterAll(async () => {
    await stopApp(app);
  });

  describe('family', () => {
    it('test 44 + FAM-2: one record per pair; the other side sees the relation the other way round', async () => {
      await family(fc, HOLDER, {
        relation: 'SPOUSE',
        relatedClientId: SPOUSE,
      }).expect(201);
      const child = await family(fc, HOLDER, {
        relation: 'CHILD',
        relatedClientId: CHILD,
      }).expect(201);
      expect(await entry(HOLDER, CHILD)).toMatchObject({
        relation: 'CHILD',
        isClient: true,
        canOpen: true,
        name: 'Trần Con Lớn',
      });
      expect(await entry(CHILD, HOLDER)).toMatchObject({ relation: 'PARENT' });
      expect(await entry(SPOUSE, HOLDER)).toMatchObject({ relation: 'SPOUSE' });

      // Recorded again from the other side: the same record, stored from the first side
      const again = await family(fc, CHILD, {
        relation: 'PARENT',
        relatedClientId: HOLDER,
        note: 'Bố của khách',
      }).expect(201);
      expect(again.body.id).toBe(child.body.id);
      expect(
        await connection.collection('familyLinks').countDocuments({
          clientId: { $in: [HOLDER, CHILD] },
          relatedClientId: { $in: [HOLDER, CHILD] },
        }),
      ).toBe(1);
      // Edited from the other side: the stored relation is the inverse
      await fc
        .patch(`${API}/clients/${CHILD}/family/${child.body.id}`)
        .send({ relation: 'OTHER' })
        .expect(204);
      await fc
        .patch(`${API}/clients/${CHILD}/family/${child.body.id}`)
        .send({ relation: 'PARENT' })
        .expect(204);
      expect(
        (
          await connection
            .collection('familyLinks')
            .findOne({ clientId: HOLDER, relatedClientId: CHILD })
        )?.relation,
      ).toBe('CHILD');
    });

    it('test 44 + FAM-3: not the client itself; someone out of scope looks missing; someone only on a policy can be labelled', async () => {
      expect(
        (
          await family(fc, HOLDER, {
            relation: 'OTHER',
            relatedClientId: HOLDER,
          }).expect(400)
        ).body.error,
      ).toBe('same_client');
      await family(fc, HOLDER, {
        relation: 'SPOUSE',
        relatedClientId: OUT_OF_SCOPE,
      }).expect(404);

      // FAM-5: found on the policy, named as the policy writes it, with capitals on each word
      expect(await entry(HOLDER, MOTHER)).toMatchObject({
        linkId: null,
        relation: null,
        name: 'Nguyễn Thị Mẹ',
        isClient: false,
        canOpen: false,
        sharedPolicies: [{ policyNo: '600000002', roles: ['LI'] }],
      });
      // Not a client, so labelled by the name the policy gives; it joins the person on the policy
      await family(fc, HOLDER, {
        relation: 'PARENT',
        fullName: 'Nguyễn Thị Mẹ',
      }).expect(201);
      expect(await entry(HOLDER, MOTHER)).toMatchObject({
        relation: 'PARENT',
        name: 'Nguyễn Thị Mẹ',
        isClient: false,
      });
    });

    it('test 44 + FAM-4: a relative with part of a birth date joins the person named on a product; a client is refused', async () => {
      const created = await family(fc, HOLDER, {
        relation: 'CHILD',
        fullName: 'Trần Bé An',
        birthYear: 2018,
        gender: 'Nữ',
      }).expect(201);
      const row = (await detail(fc, HOLDER)).family.filter(
        (item) => item.name === 'Trần Bé An',
      );
      expect(row).toEqual([
        expect.objectContaining({
          linkId: created.body.id,
          relation: 'CHILD',
          clientId: null,
          birth: { day: null, month: null, year: 2018 },
          sharedPolicies: [{ policyNo: '600000001', roles: ['LI'] }],
        }),
      ]);
      expect(
        (
          await family(fc, HOLDER, {
            relation: 'SPOUSE',
            fullName: 'lê thị vợ',
            birthDay: 4,
            birthMonth: Number(OTHER_MONTH),
            birthYear: 1985,
          }).expect(409)
        ).body.error,
      ).toBe('already_client');
      // A name, or a client, never both
      await family(fc, HOLDER, {
        relation: 'SPOUSE',
        fullName: 'Ai Đó',
        relatedClientId: SPOUSE,
      }).expect(400);
      await fc
        .patch(`${API}/clients/${HOLDER}/family/${created.body.id}`)
        .send({ birthMonth: 6, birthYear: null })
        .expect(204);
      expect((await entry(HOLDER, 'name:TRAN BE AN'))?.birth).toEqual({
        day: null,
        month: 6,
        year: null,
      });
    });

    it('test 44 + FAM-8: only the owner and GA_HEAD change the family, with an audit', async () => {
      expect(
        (
          await family(um, HOLDER, {
            relation: 'OTHER',
            fullName: 'Người Quen',
          }).expect(403)
        ).body.error,
      ).toBe('client_not_yours');
      const made = await family(head, HOLDER, {
        relation: 'OTHER',
        fullName: 'Người Quen',
      }).expect(201);
      await fc
        .delete(`${API}/clients/${HOLDER}/family/${made.body.id}`)
        .expect(204);
      const actions = await connection
        .collection('auditEvents')
        .find({ entity: 'family_link', entityId: made.body.id })
        .map((event) => event.action)
        .toArray();
      expect(actions).toEqual(['CREATE', 'DELETE']);
      await fc
        .delete(`${API}/clients/${HOLDER}/family/${made.body.id}`)
        .expect(404);
    });

    it('test 44 + FAM-6: a relative becomes a lead of the agent, or is linked to a lead they see', async () => {
      const member = (await entry(HOLDER, 'name:TRAN BE AN'))!;
      const { body } = await fc
        .post(`${API}/clients/${HOLDER}/family/${member.linkId}/lead`)
        .send({ create: { phone: '0912000111', consent: true } })
        .expect(200);
      const lead = await connection
        .collection('leads')
        .findOne({ fullName: 'Trần Bé An' });
      expect(lead).toMatchObject({
        assignedAgentCode: FC,
        origin: 'FC_OWN',
        phone: '0912000111',
      });
      expect(String(lead?._id)).toBe(body.leadId);
      expect((await entry(HOLDER, 'name:TRAN BE AN'))?.leadId).toBe(
        body.leadId,
      );
      // A lead the person cannot see looks missing; a client relation has no lead to make
      const other = await head2.post(`${API}/leads`).send({
        fullName: 'Lead GA Hai',
        phone: '0912000222',
        source: 'Facebook',
        consent: false,
      });
      await fc
        .post(`${API}/clients/${HOLDER}/family/${member.linkId}/lead`)
        .send({ leadId: other.body.id ?? '000000000000000000000000' })
        .expect(404);
      const spouse = (await entry(HOLDER, SPOUSE))!;
      await fc
        .post(`${API}/clients/${HOLDER}/family/${spouse.linkId}/lead`)
        .send({ create: { phone: '0912000333', consent: true } })
        .expect(400);
    });
  });

  describe('coverage and signals', () => {
    it('test 45 + COV-1 to COV-5: groups per person from products in force; gaps only with product detail', async () => {
      const { coverage, policies } = await detail(fc, HOLDER);
      const of = (key: string) => coverage.find((row) => row.key === key);
      expect(of(HOLDER)).toMatchObject({
        groups: { LIFE: 500_000_000 },
        hasDetail: true,
        gaps: ['HEALTH', 'CI', 'ACCIDENT'],
      });
      expect(of('name:TRAN BE AN')).toMatchObject({
        groups: { HEALTH: 100_000_000 },
        gaps: ['CI', 'ACCIDENT'],
      });
      // On a lapsed policy only: detail without cover
      expect(of(MOTHER)).toMatchObject({ groups: {}, hasDetail: true });
      // COV-4: nothing known, so no gap is claimed
      expect(of(SPOUSE)).toMatchObject({
        groups: {},
        hasDetail: false,
        gaps: [],
      });
      expect(
        policies
          .flatMap((policy) => policy.products.map((product) => product.group))
          .sort(),
      ).toEqual(['HEALTH', 'LIFE', 'LIFE']);
    });

    it('test 45 + section 10.11: the care opportunities of the client', async () => {
      const { signals } = await detail(fc, HOLDER);
      const codes = signals.map((signal) => signal.code);
      expect(codes).toEqual(
        expect.arrayContaining([
          'PREMIUM_DUE',
          'UNPAID',
          'MATURITY',
          'NOT_ACTIVE',
          'BIRTHDAY',
          'GAP',
          'FAMILY_UNCOVERED',
        ]),
      );
      expect(codes).not.toContain('LAPSED');
      expect(
        signals.find((signal) => signal.code === 'PREMIUM_DUE')?.values,
      ).toEqual({
        policyNo: '600000001',
        date: addDays(10),
        amount: 12_000_000,
      });
      expect(
        signals.find((signal) => signal.code === 'BIRTHDAY')?.values,
      ).toEqual({ date: `05/${MONTH}` });
      expect(
        signals
          .filter((signal) => signal.code === 'FAMILY_UNCOVERED')
          .map((signal) => signal.values.name),
      ).toEqual(
        expect.arrayContaining(['Lê Thị Vợ', 'Trần Con Lớn', 'Nguyễn Thị Mẹ']),
      );
    });

    it('test 45 + SIG-1: tabs count from the same rules, 0 when none; the list filters and labels rows', async () => {
      const counts = (await fc.get(`${API}/clients/counts`).expect(200)).body;
      expect(counts).toEqual({
        all: 3,
        due: 1,
        debt: 1,
        maturity: 1,
        birthday: 1,
        lapsed: 1,
      });
      const { body } = await fc.get(`${API}/clients?signal=due`).expect(200);
      expect(body.items.map((item: { id: string }) => item.id)).toEqual([
        HOLDER,
      ]);
      expect(body.items[0]).toMatchObject({
        due: true,
        debt: true,
        maturity: true,
        birthday: true,
        lapsed: true,
      });
      const all = (await fc.get(`${API}/clients`).expect(200)).body
        .items as Record<string, unknown>[];
      expect(all.find((item) => item.id === SPOUSE)).toMatchObject({
        due: false,
        debt: false,
        maturity: false,
        birthday: false,
        lapsed: false,
      });
      await fc.get(`${API}/clients?signal=soon`).expect(400);
      // TEN-7: another GA counts nothing of GA-1, and still answers 0 rather than nothing
      expect(
        (await head2.get(`${API}/clients/counts?agents=ALL`).expect(200)).body,
      ).toEqual({
        all: 0,
        due: 0,
        debt: 0,
        maturity: 0,
        birthday: 0,
        lapsed: 0,
      });
    });
  });

  describe('notes and contacts', () => {
    it('NOTE-1 + NOTE-2 + NOTE-5: the owner writes notes and contacts, never ahead of time; a line manager reads', async () => {
      await fc
        .post(`${API}/clients/${HOLDER}/notes`)
        .send({ body: 'Khách muốn tăng quyền lợi' })
        .expect(201);
      await fc
        .post(`${API}/clients/${HOLDER}/activities`)
        .send({ type: 'CALL', note: 'Nhắc phí', outcome: 'Hẹn tuần sau' })
        .expect(201);
      await fc
        .post(`${API}/clients/${HOLDER}/activities`)
        .send({
          type: 'CALL',
          note: 'Tương lai',
          occurredAt: new Date(Date.now() + 86_400_000).toISOString(),
        })
        .expect(400);
      expect(
        (
          await um
            .post(`${API}/clients/${HOLDER}/notes`)
            .send({ body: 'Quản lý' })
            .expect(403)
        ).body.error,
      ).toBe('client_not_yours');
      const { notes, userNames } = await detail(um, HOLDER);
      expect(notes.map((note) => [note.type, note.note])).toEqual([
        ['CALL', 'Nhắc phí'],
        ['NOTE', 'Khách muốn tăng quyền lợi'],
      ]);
      expect(Object.keys(userNames)).toContain(notes[0].createdBy);
      expect(
        await connection
          .collection('auditEvents')
          .countDocuments({ entity: 'client_note', 'meta.clientId': HOLDER }),
      ).toBe(2);
    });
  });

  it('TEN-7: GA-2 cannot read or change the family of a GA-1 client', async () => {
    const member = (await entry(HOLDER, SPOUSE))!;
    await head2.get(`${API}/clients/${HOLDER}`).expect(404);
    await family(head2, HOLDER, {
      relation: 'OTHER',
      fullName: 'Người Lạ',
    }).expect(404);
    await head2
      .patch(`${API}/clients/${HOLDER}/family/${member.linkId}`)
      .send({ relation: 'OTHER' })
      .expect(404);
    await head2
      .delete(`${API}/clients/${HOLDER}/family/${member.linkId}`)
      .expect(404);
    await head2
      .post(`${API}/clients/${HOLDER}/notes`)
      .send({ body: 'x' })
      .expect(404);
    expect((await entry(HOLDER, SPOUSE))?.relation).toBe('SPOUSE');
  });
});
