import type { INestApplication } from '@nestjs/common';
import request from 'supertest';
import { startApp, stopApp } from './support/app.js';
import { connection } from './support/collections.js';
import { ownerDb } from './support/owner-db.js';
import { clientIdOf } from './support/clients.js';
import {
  PERMISSIONS_VERSION,
  TenantsService,
} from '../src/modules/tenants/tenants.service.js';
import { demoEmail, seedDemoData } from '../src/seed/demo-data.js';

const API = '/api/v1';
const PASSWORD = 'demo-password-123';
const FC = '00100004';
const UM = '00100003';
const PEER = '00100097';
type Agent = ReturnType<typeof request.agent>;

const policyBody = (policyNo: string, patch: Record<string, unknown> = {}) => ({
  policyNo,
  status: 'Đang hiệu lực',
  effectiveDate: '2024-06-01',
  maturityDate: '2044-06-01',
  premiumFrequency: 'Năm',
  basePremiumVnd: 12_000_000,
  premiumDueDate: '2099-06-01',
  products: [
    {
      productCode: 'AN_TAM_SONG_HANH',
      sumAssuredVnd: 500_000_000,
      termYears: 20,
    },
  ],
  ...patch,
});

/** Sections 5.4, 10.5-10.7: programmes, and clients and policies entered by hand (slice 4b). */
describe('Clients and policies entered by hand (e2e)', () => {
  let app: INestApplication;
  let head: Agent;
  let admin: Agent;
  let fc: Agent;
  let um: Agent;

  const as = async (key: string, ga = 1) => {
    const agent = request.agent(app.getHttpServer());
    await agent
      .post(`${API}/auth/sign-in/email`)
      .send({ email: demoEmail(ga, key), password: PASSWORD })
      .expect(200);
    return agent;
  };
  const programs = async (agent: Agent) =>
    (await agent.get(`${API}/programs`).expect(200)).body.items as {
      id: string;
      code: string;
      label: string;
      productRole: string;
      active: boolean;
    }[];
  const create = (agent: Agent, body: Record<string, unknown>) =>
    agent.post(`${API}/clients`).send(body);
  /** Adds a client on a policy (decided 25/11/2026) and returns their id. */
  const add = async (
    agent: Agent,
    policyNo: string,
    role: 'PO' | 'LI' | 'BEN',
    body: Record<string, unknown>,
  ) =>
    (await create(agent, { policyNo, role, ...body }).expect(201)).body
      .id as string;
  const stored = (id: string) =>
    connection.collection('clients').findOne({ _id: id });
  const { policyNo: _none, ...policyFields } = policyBody('x');
  // The clients the tests below add, by name
  const ids: Record<string, string> = {};
  // GA-1's policy: the same number may also be GA-2's own (TEN-7)
  let ga1 = '';
  const policyOf = (policyNo: string) =>
    connection.collection('policies').findOne({ policyNo, tenantId: ga1 });

  beforeAll(async () => {
    app = await startApp();
    await seedDemoData(app, PASSWORD);
    [head, admin, fc, um] = await Promise.all(
      ['head', 'admin', 'fc', 'um'].map((key) => as(key)),
    );
    ga1 = (await connection
      .collection('users')
      .findOne({ email: demoEmail(1, 'head') }))!.tenantId as string;
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

  describe('programme catalogue', () => {
    it('test 18 + PRG-2 + PRG-3: three defaults that everyone reads; only GA_HEAD and catalog.manage edit', async () => {
      expect(
        (await programs(fc)).map((item) => [item.code, item.productRole]),
      ).toEqual([
        ['AN_TAM_SONG_HANH', 'Chính'],
        ['BH_CHAM_SOC_SUC_KHOE', 'Bổ trợ'],
        ['BH_TAI_NAN_CAO_CAP', 'Bổ trợ'],
      ]);
      for (const agent of [fc, um]) {
        await agent
          .post(`${API}/programs`)
          .send({ label: 'Thử', productRole: 'Chính' })
          .expect(403);
      }
      const { body } = await admin
        .post(`${API}/programs`)
        .send({
          label: 'Hưu Trí An Nhàn',
          productRole: 'Chính',
          productCode: 'P777',
        })
        .expect(201);
      expect(body).toMatchObject({
        code: 'HUU_TRI_AN_NHAN',
        productCode: 'P777',
        active: true,
      });
      expect(
        (
          await head
            .post(`${API}/programs`)
            .send({ label: 'hưu trí an nhàn', productRole: 'Bổ trợ' })
            .expect(409)
        ).body.error,
      ).toBe('program_exists');

      // PRG-4: renaming keeps the code
      const renamed = (
        await head
          .patch(`${API}/programs/${body.id}`)
          .send({ label: 'Hưu Trí Vững Vàng' })
          .expect(200)
      ).body;
      expect(renamed).toMatchObject({
        code: 'HUU_TRI_AN_NHAN',
        label: 'Hưu Trí Vững Vàng',
      });
      await head.delete(`${API}/programs/${body.id}`).expect(204);
      expect(
        await connection
          .collection('auditEvents')
          .countDocuments({ entity: 'insurance_program' }),
      ).toBe(3);
    });

    it('PERM-2: a new GA starts at the latest permissions version, so a restart never grants back what its head removed', async () => {
      // The demo GAs were created after the app started, through TenantsService.create
      const { rows } = await ownerDb().query<{ permissions_version: number }>(
        'SELECT permissions_version FROM tenant_settings',
      );
      expect(rows.length).toBeGreaterThan(0);
      expect(
        rows.every((row) => row.permissions_version === PERMISSIONS_VERSION),
      ).toBe(true);
    });

    it('test 11 + PERM-2: an older GA gets catalog.manage for Admin once, without undoing later choices', async () => {
      const owner = ownerDb();
      // An older GA: before version 1, and without catalog.manage for ADMIN
      const drop = `UPDATE tenant_settings SET grants = jsonb_set(grants, '{ADMIN}', (grants -> 'ADMIN') - 'catalog.manage')`;
      await owner.query(`${drop}, permissions_version = 0`);
      await app.get(TenantsService).onModuleInit();
      const { rows: all } = await owner.query<{
        grants: { ADMIN: string[] };
        permissions_version: number;
      }>('SELECT grants, permissions_version FROM tenant_settings');
      expect(
        all.every(
          (item) =>
            item.grants.ADMIN.includes('catalog.manage') &&
            item.permissions_version === PERMISSIONS_VERSION,
        ),
      ).toBe(true);
      // AUD-1: each GA that received it has a permission change with no person behind it
      const { rows: grantsAudit } = await owner.query<{
        user_id: string | null;
        meta: { added: string[] };
      }>(
        `SELECT user_id, meta FROM audit_events
          WHERE action = 'PERMISSION_CHANGE' AND meta ? 'permissionsVersion'`,
      );
      expect(grantsAudit).toHaveLength(all.length);
      expect(grantsAudit[0]).toMatchObject({
        user_id: null,
        meta: { added: ['ADMIN:catalog.manage'] },
      });
      // A GA that later takes it away keeps its choice
      await owner.query(drop);
      await app.get(TenantsService).onModuleInit();
      const { rows: after } = await owner.query<{
        grants: { ADMIN: string[] };
      }>('SELECT grants FROM tenant_settings LIMIT 1');
      expect(after[0].grants.ADMIN).not.toContain('catalog.manage');
      await owner.query(
        `UPDATE tenant_settings SET grants = jsonb_set(grants, '{ADMIN}', (grants -> 'ADMIN') || '"catalog.manage"')`,
      );
    });

    it('TEN-7: GA-2 has its own catalogue', async () => {
      const head2 = await as('head', 2);
      const ga1 = await programs(head);
      await head2
        .patch(`${API}/programs/${ga1[0].id}`)
        .send({ label: 'Chiếm' })
        .expect(404);
      expect((await programs(head2))[0].label).toBe('An Tâm Song Hành');
    });
  });

  describe('adding a client on a policy (decided 25/11/2026)', () => {
    it('POL-2: the policy number is exactly 9 digits; there is no client code any more', async () => {
      for (const policyNo of ['12345678', '1234567890', '12345678A']) {
        const { body } = await create(fc, {
          policyNo,
          role: 'PO',
          name: 'Sai Số',
        }).expect(400);
        expect(body).toEqual({
          error: 'invalid_policy_no',
          issues: [{ path: 'policyNo', message: 'invalid_policy_no' }],
        });
      }
      await create(fc, {
        policyNo: '500000009',
        role: 'PO',
        name: 'Mã Cũ',
        clientCode: '5000000009',
      }).expect(400);
    });

    it('MAN-3 + MAN-7: a FC adds a client on a new number, which starts a policy holding only that number; the phone is masked in the audit', async () => {
      ids.holder = await add(fc, '500000001', 'PO', {
        name: 'Phạm Thị Tay',
        phone: '+84 912 345 678',
        dob: '1990-02-01',
        gender: 'Nữ',
        tier: 'Bạc',
        idUpdated: true,
      });
      const client = await stored(ids.holder);
      expect(client).toMatchObject({
        origin: 'MANUAL',
        phone: '0912345678',
        birthDayMonth: '01/02',
        birthMonth: 2,
        ageBand: '30-39',
        ownerAgentCodes: [FC],
      });
      expect(client?.successCode).toBeUndefined();
      expect(
        client?.agentLinks
          .map((link: { source: string }) => link.source)
          .sort(),
      ).toEqual(['MANUAL', 'POLICY_HOLDER']);
      const policy = await policyOf('500000001');
      expect(policy).toMatchObject({
        origin: 'MANUAL',
        holderClientId: ids.holder,
        holderName: 'Phạm Thị Tay',
        servicingAgentCode: FC,
        agents: [
          expect.objectContaining({
            agentCode: FC,
            splitPercent: 100,
            isServicing: true,
          }),
        ],
        clients: [{ clientId: ids.holder, role: 'PO', source: 'POLICY' }],
      });
      // Everything but the number comes later, or from Success
      expect(policy?.status).toBeUndefined();
      expect(policy?.effectiveDate).toBeUndefined();
      const audit = await connection.collection('auditEvents').findOne({
        entity: 'client',
        entityId: ids.holder,
        action: 'CREATE',
      });
      expect(audit?.meta).toMatchObject({
        agentCode: FC,
        phone: '0912***678',
        policyNo: '500000001',
        role: 'PO',
      });
      // An age band entered by hand is kept
      ids.second = await add(fc, '500000002', 'PO', {
        name: 'Có Nhóm Tuổi',
        dob: '1990-02-01',
        ageBand: '40-49',
      });
      expect((await stored(ids.second))?.ageBand).toBe('40-49');
      const { body } = await fc.get(`${API}/clients/${ids.holder}`).expect(200);
      expect(body.client).toMatchObject({
        id: ids.holder,
        manual: true,
        phone: '0912345678',
      });
      expect(body.canEdit).toBe(true);
      // No response carries a client code
      expect(JSON.stringify(body)).not.toMatch(/clientCode|successCode/);
    });

    it('a family shares one policy number: holder, insured and beneficiary; the number lists them all', async () => {
      ids.mother = await add(fc, '500000001', 'LI', {
        name: 'Mẹ Cùng Hợp Đồng',
        dob: '1965-05-05',
      });
      ids.child = await add(fc, '500000001', 'LI', {
        name: 'Con Cùng Hợp Đồng',
      });
      ids.heir = await add(fc, '500000001', 'BEN', { name: 'Em Thụ Hưởng' });
      const policy = await policyOf('500000001');
      // CUS-11: one main insured; anyone else insured is on a product line
      expect(policy).toMatchObject({
        holderClientId: ids.holder,
        insuredClientId: ids.mother,
        insuredName: 'Mẹ Cùng Hợp Đồng',
        clients: [
          { clientId: ids.holder, role: 'PO', source: 'POLICY' },
          { clientId: ids.mother, role: 'LI', source: 'POLICY' },
          { clientId: ids.child, role: 'LI', source: 'PRODUCT' },
          { clientId: ids.heir, role: 'BEN', source: 'POLICY' },
        ],
      });

      // Searching the number lists everyone on the policy, each with their role
      const found = (
        await fc
          .get(`${API}/clients`)
          .query({ q: '500000001', pageSize: 50 })
          .expect(200)
      ).body.items as {
        id: string;
        policies: { policyNo: string; roles: string[] }[];
      }[];
      expect(found.map((item) => item.id).sort()).toEqual(
        [ids.holder, ids.mother, ids.child, ids.heir].sort(),
      );
      expect(found.find((item) => item.id === ids.heir)?.policies).toEqual([
        { policyNo: '500000001', roles: ['BEN'] },
      ]);

      // The policy card names everyone on it
      const { body } = await fc.get(`${API}/clients/${ids.child}`).expect(200);
      expect(body.policies[0].people).toEqual([
        {
          clientId: ids.holder,
          name: 'Phạm Thị Tay',
          roles: ['PO'],
          self: false,
        },
        {
          clientId: ids.mother,
          name: 'Mẹ Cùng Hợp Đồng',
          roles: ['LI'],
          self: false,
        },
        {
          clientId: ids.child,
          name: 'Con Cùng Hợp Đồng',
          roles: ['LI'],
          self: true,
        },
        {
          clientId: ids.heir,
          name: 'Em Thụ Hưởng',
          roles: ['BEN'],
          self: false,
        },
      ]);

      // CUS-11: one holder per policy
      expect(
        (
          await create(fc, {
            policyNo: '500000001',
            role: 'PO',
            name: 'Người Mua Thứ Hai',
          }).expect(409)
        ).body,
      ).toEqual({
        error: 'holder_exists',
        issues: [{ path: 'role', message: 'holder_exists' }],
      });
      // The same person twice on one policy, whatever the case or marks
      expect(
        (
          await create(fc, {
            policyNo: '500000001',
            role: 'BEN',
            name: 'me cung hop dong',
            dob: '1965-05-05',
          }).expect(409)
        ).body.error,
      ).toBe('person_on_policy');
    });

    it("MAN-3 + MAN-4: someone else's policy is refused without telling who is on it; a manager adds for the branch; GA_HEAD picks an agent or takes the policy's", async () => {
      ids.peer = await add(head, '500000099', 'PO', {
        name: 'Khách Nhánh Khác',
        agentCode: PEER,
      });
      const refused = await create(fc, {
        policyNo: '500000099',
        role: 'LI',
        name: 'Dò Số',
      }).expect(403);
      expect(refused.body).toEqual({
        error: 'policy_not_yours',
        issues: [{ path: 'policyNo', message: 'policy_not_yours' }],
      });
      expect((await policyOf('500000099'))?.clients).toHaveLength(1);

      // Changed 27/11/2026: a line manager adds only for themselves; the director gives a client
      // to another agent
      expect(
        (
          await create(um, {
            policyNo: '500000010',
            role: 'PO',
            name: 'Của FC Tuyến Dưới',
            agentCode: FC,
          }).expect(400)
        ).body.error,
      ).toBe('agent_not_found');
      ids.branch = await add(head, '500000010', 'PO', {
        name: 'Của FC Tuyến Dưới',
        agentCode: FC,
      });
      expect((await stored(ids.branch))?.ownerAgentCodes).toEqual([FC]);
      const refusedAgent = async (
        agent: Agent,
        body: Record<string, unknown>,
      ) =>
        (
          await create(agent, {
            role: 'PO',
            name: 'Không Được',
            ...body,
          }).expect(400)
        ).body.error;
      expect(
        await refusedAgent(um, { policyNo: '500000011', agentCode: PEER }),
      ).toBe('agent_not_found');
      expect(
        await refusedAgent(fc, { policyNo: '500000012', agentCode: UM }),
      ).toBe('agent_not_found');
      expect(await refusedAgent(head, { policyNo: '500000013' })).toBe(
        'agent_required',
      );
      // On a policy already there, the serving agent is taken when no agent is chosen
      const spouse = await add(head, '500000099', 'LI', {
        name: 'Vợ Khách Nhánh Khác',
      });
      expect((await stored(spouse))?.ownerAgentCodes).toEqual([PEER]);
      // Changed 27/11/2026: Admin sees every client but gives none to another agent
      for (const agent of [admin])
        await create(agent, {
          policyNo: '500000014',
          role: 'PO',
          name: 'Không Được',
          agentCode: FC,
        }).expect(400);
      expect(await policyOf('500000014')).toBeNull();
    });

    it('TEN-7: GA-2 opens no GA-1 client, and the same number in GA-2 is its own policy', async () => {
      const head2 = await as('head', 2);
      await head2.get(`${API}/clients/${ids.holder}`).expect(404);
      await head2
        .patch(`${API}/clients/${ids.holder}`)
        .send({ tier: 'Vàng' })
        .expect(404);
      await create(head2, {
        policyNo: '500000001',
        role: 'PO',
        name: 'Khách GA Khác',
        agentCode: '00200004',
      }).expect(201);
      expect((await policyOf('500000001'))?.clients).toHaveLength(4);
    });
  });

  describe('editing', () => {
    it('test 38 + test 39 + MAN-6: absent keeps, null clears, the birthday follows; history and audit without the phone in clear', async () => {
      await fc
        .patch(`${API}/clients/${ids.holder}`)
        .send({
          name: 'Phạm Thị Tay Mới',
          dob: '1975-12-31',
          phone: null,
          tier: null,
        })
        .expect(204);
      const client = await stored(ids.holder);
      expect(client).toMatchObject({
        name: 'Phạm Thị Tay Mới',
        nameNorm: 'PHAM THI TAY MOI',
        birthDayMonth: '31/12',
        ageBand: '50-59',
        gender: 'Nữ',
      });
      expect(client?.phone).toBeUndefined();
      expect(client?.tier).toBeUndefined();
      // MAN-6: the policy shows the new name of its holder
      expect((await policyOf('500000001'))?.holderName).toBe(
        'Phạm Thị Tay Mới',
      );
      const changes = await connection
        .collection('recordChanges')
        .find({ entity: 'client', entityKey: ids.holder })
        .toArray();
      expect(changes.find((item) => item.field === 'phone')).toMatchObject({
        oldValue: '0912***678',
      });
      expect(changes.every((item) => item.importId === undefined)).toBe(true);
      await fc
        .patch(`${API}/clients/${ids.holder}`)
        .send({ phone: '12345' })
        .expect(400);
      await fc
        .patch(`${API}/clients/${ids.holder}`)
        .send({ phone: '0987654321' })
        .expect(204);
      // CUS-14: the phone the GA keeps can be searched
      expect(
        (
          await fc.get(`${API}/clients`).query({ q: '7654' }).expect(200)
        ).body.items.map((item: { id: string }) => item.id),
      ).toEqual([ids.holder]);
    });

    it('test 38 + test 43 + CUS-6: Admin only reads (changed 27/11/2026); the director edits any client', async () => {
      const refused = await admin
        .patch(`${API}/clients/${ids.holder}`)
        .send({ name: 'Quản Lý Sửa' })
        .expect(403);
      expect(refused.body.error).toBe('client_not_yours');
      expect(
        (await admin.get(`${API}/clients/${ids.holder}`).expect(200)).body.canEdit,
      ).toBe(false);
      await head
        .patch(`${API}/clients/${ids.peer}`)
        .send({ tier: 'Vàng' })
        .expect(204);
      await fc
        .patch(`${API}/clients/${ids.peer}`)
        .send({ tier: 'Bạc' })
        .expect(404);
      for (const agent of [admin])
        await agent
          .patch(`${API}/clients/${ids.holder}`)
          .send({ tier: 'Bạc' })
          .expect(403);
    });

    it("test 40 + POL-1 + POL-3: a policy added later is the client's, served at 100% by their agent; a line manager may not; one outside scope is 404", async () => {
      await fc
        .post(`${API}/clients/${ids.second}/policies`)
        .send(
          policyBody('500000020', {
            products: [
              {
                productCode: 'AN_TAM_SONG_HANH',
                sumAssuredVnd: 500_000_000,
                termYears: 20,
              },
              {
                productCode: 'BH_TAI_NAN_CAO_CAP',
                insuredName: 'Bé Con',
                insuredDob: '2015-04-02',
                insuredGender: 'Nữ',
                sumAssuredVnd: 100_000_000,
              },
            ],
          }),
        )
        .expect(201);
      const policy = await policyOf('500000020');
      expect(policy).toMatchObject({
        origin: 'MANUAL',
        holderClientId: ids.second,
        insuredClientId: ids.second,
        servicingAgentCode: FC,
        clients: [
          { clientId: ids.second, role: 'PO', source: 'POLICY' },
          { clientId: ids.second, role: 'LI', source: 'POLICY' },
        ],
      });
      // PRD-3: the holder's line is theirs; another person keeps a name only
      expect(policy?.products[0]).toMatchObject({
        insuredClientId: ids.second,
      });
      expect(policy?.products[1]).toMatchObject({
        insuredName: 'Bé Con',
        productCode: 'BH_TAI_NAN_CAO_CAP',
      });
      expect(policy?.products[1].insuredClientId).toBeUndefined();
      expect(
        (await stored(ids.second))?.agentLinks
          .map((link: { source: string }) => link.source)
          .sort(),
      ).toEqual(['MANUAL', 'POLICY_HOLDER', 'POLICY_INSURED']);

      expect(
        (
          await admin
            .post(`${API}/clients/${ids.second}/policies`)
            .send(policyBody('500000031'))
            .expect(403)
        ).body.error,
      ).toBe('client_not_yours');
      await fc
        .post(`${API}/clients/${ids.peer}/policies`)
        .send(policyBody('500000032'))
        .expect(404);
      // A policy may be added with its number only
      await fc
        .post(`${API}/clients/${ids.second}/policies`)
        .send({ policyNo: '500000033' })
        .expect(201);
      expect((await policyOf('500000033'))?.status).toBeUndefined();
    });

    it('test 40: a refused policy changes nothing', async () => {
      const cases: [Record<string, unknown>, number, string][] = [
        [policyBody('500000020'), 409, 'policy_exists'],
        [policyBody('12345'), 400, 'invalid_policy_no'],
        [
          policyBody('500000021', { products: [{ productCode: 'KHONG_CO' }] }),
          400,
          'unknown_product',
        ],
        [policyBody('500000023', { agentCode: PEER }), 400, 'agent_not_found'],
      ];
      for (const [policy, status, error] of cases) {
        const { body } = await fc
          .post(`${API}/clients/${ids.second}/policies`)
          .send(policy)
          .expect(status);
        expect(body.error).toBe(error);
      }
      const repeated = await fc
        .post(`${API}/clients/${ids.second}/policies`)
        .send(
          policyBody('500000024', {
            products: [
              { productCode: 'AN_TAM_SONG_HANH' },
              { productCode: 'AN_TAM_SONG_HANH' },
            ],
          }),
        )
        .expect(409);
      expect(repeated.body.issues).toEqual([
        { path: 'products.1.productCode', message: 'program_repeated' },
      ]);
      for (const policyNo of ['500000021', '500000023', '500000024'])
        expect(await policyOf(policyNo)).toBeNull();
    });

    it("POL-2 + CUS-6: any other insured is a name only, so nobody takes over another agent's client by naming them", async () => {
      await fc
        .post(`${API}/clients/${ids.second}/policies`)
        .send(policyBody('500000036', { insuredName: 'Khách Nhánh Khác' }))
        .expect(201);
      const policy = await policyOf('500000036');
      expect(policy).toMatchObject({
        holderClientId: ids.second,
        insuredName: 'Khách Nhánh Khác',
        clients: [{ clientId: ids.second, role: 'PO', source: 'POLICY' }],
      });
      expect(policy?.insuredClientId).toBeUndefined();
      expect((await stored(ids.peer))?.ownerAgentCodes).toEqual([PEER]);
    });

    it('test 41 + POL-4: editing replaces every programme line; the number, the agent and the holder stay; only a policy of this client', async () => {
      const edit = {
        ...policyFields,
        status: 'Mất hiệu lực',
        products: [
          { productCode: 'BH_CHAM_SOC_SUC_KHOE', sumAssuredVnd: 200_000_000 },
        ],
      };
      // The number and the agent are not part of an edit
      await fc
        .patch(`${API}/clients/${ids.second}/policies/500000020`)
        .send({ ...edit, policyNo: '999999999' })
        .expect(400);
      await fc
        .patch(`${API}/clients/${ids.second}/policies/500000020`)
        .send({ ...edit, agentCode: '00100003' })
        .expect(400);
      await fc
        .patch(`${API}/clients/${ids.second}/policies/500000020`)
        .send(edit)
        .expect(204);
      const policy = await policyOf('500000020');
      expect(policy).toMatchObject({
        status: 'Mất hiệu lực',
        servicingAgentCode: FC,
        policyNo: '500000020',
        holderClientId: ids.second,
      });
      expect(policy?.products).toEqual([
        expect.objectContaining({
          productCode: 'BH_CHAM_SOC_SUC_KHOE',
          sumAssuredVnd: 200_000_000,
        }),
      ]);
      const changes = await connection
        .collection('recordChanges')
        .find({ entity: 'policy', entityKey: '500000020' })
        .toArray();
      expect(
        changes
          .map((item) => String(item.field))
          .sort((a, b) => a.localeCompare(b)),
      ).toEqual(['products', 'status']);

      // From the page of someone else on the policy, the holder stays who they are
      const wife = await add(fc, '500000020', 'LI', { name: 'Vợ Có Hợp Đồng' });
      await fc
        .patch(`${API}/clients/${wife}/policies/500000020`)
        .send({ ...edit, status: 'Đang hiệu lực' })
        .expect(204);
      expect(await policyOf('500000020')).toMatchObject({
        status: 'Đang hiệu lực',
        holderClientId: ids.second,
        insuredClientId: ids.second,
      });

      await fc
        .patch(`${API}/clients/${ids.holder}/policies/500000020`)
        .send(edit)
        .expect(404);
      await admin
        .patch(`${API}/clients/${ids.second}/policies/500000020`)
        .send(edit)
        .expect(403);
    });

    it('TENANT-5: a hidden product is not offered for a new line, but a line that has it may stay', async () => {
      const owner = ownerDb();
      await owner.query(
        `UPDATE products SET active = false WHERE product_code = 'BH_CHAM_SOC_SUC_KHOE'`,
      );
      try {
        const refused = await fc
          .post(`${API}/clients/${ids.second}/policies`)
          .send(
            policyBody('500000040', {
              products: [{ productCode: 'BH_CHAM_SOC_SUC_KHOE' }],
            }),
          )
          .expect(400);
        expect(refused.body).toEqual({
          error: 'unknown_product',
          issues: [
            { path: 'products.0.productCode', message: 'unknown_product' },
          ],
        });
        // 500000020 already carries it, so editing that policy keeps working
        await fc
          .patch(`${API}/clients/${ids.second}/policies/500000020`)
          .send({
            ...policyFields,
            products: [
              {
                productCode: 'BH_CHAM_SOC_SUC_KHOE',
                sumAssuredVnd: 250_000_000,
              },
            ],
          })
          .expect(204);
      } finally {
        await owner.query(
          `UPDATE products SET active = true WHERE product_code = 'BH_CHAM_SOC_SUC_KHOE'`,
        );
      }
    });
  });

  it('test 35 + MAN-8 + POL-5: a Success file finds the client added by hand through their policy, then updates the same record', async () => {
    const before = await connection.collection('clients').countDocuments({});
    const importFile = async (
      sheets: { name: string; headers: string[]; rows: string[][] }[],
    ) => {
      const start = (
        await head
          .post(`${API}/imports`)
          .send({
            fileName: 'success.xlsx',
            snapshotDate: '2026-11-10',
            kind: 'SUCCESS',
            sheets: sheets.map(({ name, headers }) => ({ name, headers })),
          })
          .expect(201)
      ).body;
      for (const sheet of sheets)
        await head
          .post(`${API}/imports/${start.id}/rows`)
          .send({
            sheet: sheet.name,
            rows: sheet.rows.map((c, index) => ({ r: index + 2, c })),
          })
          .expect(200);
      await head.post(`${API}/imports/${start.id}/validate`).expect(200);
      return (await head.post(`${API}/imports/${start.id}/commit`).expect(200))
        .body as {
        sheets: { name: string; inserted: number; updated: number }[];
      };
    };
    const done = await importFile([
      {
        name: '02_Clients',
        headers: ['Mã Khách Hàng', 'Bên Mua BH', 'Nhóm Khách Hàng'],
        rows: [['5000000001', 'Tên Theo Success', 'Kim Cương']],
      },
      {
        name: '03_Policies',
        headers: [
          'Số HĐBH',
          'Mã KH BMBH',
          'Mã đại lý',
          'Bên mua BH',
          'NĐBH chính',
          'Tình trạng',
          'Ngày hiệu lực',
          'Ngày đáo hạn',
          'Tỉ lệ chia',
          'Định kỳ đóng phí',
          'Phí định kỳ/cơ bản định kỳ',
        ],
        rows: [
          [
            '500000001',
            '5000000001',
            FC,
            'TÊN THEO SUCCESS',
            'MẸ CÙNG HỢP ĐỒNG',
            'Đang hiệu lực',
            '01/06/2024',
            '01/06/2044',
            '100',
            'Năm',
            '12000000',
          ],
        ],
      },
      {
        name: '04_Policy_Products',
        headers: [
          'Số HĐBH',
          'product_code',
          'product_role',
          'Số tiền bảo hiểm',
        ],
        rows: [['500000020', 'BH_CHAM_SOC_SUC_KHOE', 'Bổ trợ', '900000000']],
      },
    ]);
    expect(
      done.sheets.map((sheet) => [sheet.name, sheet.inserted, sheet.updated]),
    ).toEqual([
      ['02_Clients', 0, 1],
      ['03_Policies', 0, 1],
      ['04_Policy_Products', 0, 1],
    ]);
    // The holder added by hand took the file's code: updated, not duplicated
    expect(await clientIdOf('5000000001')).toBe(ids.holder);
    expect(await connection.collection('clients').countDocuments({})).toBe(
      before,
    );
    expect(await stored(ids.holder)).toMatchObject({
      name: 'Tên Theo Success',
      tier: 'Kim Cương',
      phone: '0987654321',
      origin: 'MANUAL',
    });
    const policy = await policyOf('500000001');
    expect(policy).toMatchObject({
      status: 'Đang hiệu lực',
      holderClientId: ids.holder,
      insuredClientId: ids.mother,
    });
    expect(policy?.clients).toHaveLength(4);
    // The file's blank insured code matched the hand-entered line of the main insured; its term stayed
    expect((await policyOf('500000020'))?.products).toEqual([
      expect.objectContaining({
        productCode: 'BH_CHAM_SOC_SUC_KHOE',
        sumAssuredVnd: 900_000_000,
      }),
    ]);
  });
});
