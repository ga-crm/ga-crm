import type { INestApplication } from '@nestjs/common';
import request from 'supertest';
import { startApp, stopApp } from './support/app.js';
import { connection } from './support/collections.js';
import { ownerDb } from './support/owner-db.js';
import { PERMISSIONS_VERSION, TenantsService } from '../src/modules/tenants/tenants.service.js';
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
      programCode: 'AN_TAM_SONG_HANH',
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
  let marketing: Agent;

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
  const stored = (clientCode: string) =>
    connection.collection('clients').findOne({ clientCode });
  const policyOf = (policyNo: string) =>
    connection.collection('policies').findOne({ policyNo });

  beforeAll(async () => {
    app = await startApp();
    await seedDemoData(app, PASSWORD);
    [head, admin, fc, um, marketing] = await Promise.all(
      ['head', 'admin', 'fc', 'um', 'marketing'].map((key) => as(key)),
    );
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
      for (const agent of [fc, um, marketing]) {
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

  describe('adding a client', () => {
    it('test 37 + MAN-2: the code is exactly 10 digits', async () => {
      for (const clientCode of ['123456789', '12345678901', '12345678AB']) {
        const { body } = await create(fc, {
          clientCode,
          name: 'Sai Mã',
        }).expect(400);
        expect(body.error).toBe('invalid_client_code');
      }
    });

    it('test 37 + MAN-3 + MAN-7: a FC adds their own client; the age band follows the birth date; the phone is masked in the audit', async () => {
      await create(fc, {
        clientCode: '5000000001',
        name: 'Phạm Thị Tay',
        phone: '+84 912 345 678',
        dob: '1990-02-01',
        gender: 'Nữ',
        tier: 'Bạc',
        idUpdated: true,
      }).expect(201);
      const client = await stored('5000000001');
      expect(client).toMatchObject({
        origin: 'MANUAL',
        phone: '0912345678',
        birthDayMonth: '01/02',
        birthMonth: 2,
        ageBand: '30-39',
        ownerAgentCodes: [FC],
        agentLinks: [
          expect.objectContaining({ agentCode: FC, source: 'MANUAL' }),
        ],
      });
      const audit = await connection.collection('auditEvents').findOne({
        entity: 'client',
        entityId: '5000000001',
        action: 'CREATE',
      });
      expect(audit?.meta).toMatchObject({ agentCode: FC, phone: '0912***678' });
      // An age band entered by hand is kept
      await create(fc, {
        clientCode: '5000000002',
        name: 'Có Nhóm Tuổi',
        dob: '1990-02-01',
        ageBand: '40-49',
      }).expect(201);
      expect((await stored('5000000002'))?.ageBand).toBe('40-49');
      const { body } = await fc.get(`${API}/clients/5000000001`).expect(200);
      expect(body.client).toMatchObject({ manual: true, phone: '0912345678' });
      expect(body.canEdit).toBe(true);
    });

    it('test 37 + MAN-4: a code in use is refused, and only named back to someone who sees that client', async () => {
      const seen = await create(fc, {
        clientCode: '5000000001',
        name: 'Trùng',
      }).expect(409);
      expect(seen.body).toEqual({
        error: 'client_exists',
        clientCode: '5000000001',
      });
      await create(head, {
        clientCode: '5000000099',
        name: 'Khách Nhánh Khác',
        agentCode: PEER,
      }).expect(201);
      const unseen = await create(fc, {
        clientCode: '5000000099',
        name: 'Dò Mã',
      }).expect(409);
      expect(unseen.body).toEqual({ error: 'client_exists' });
    });

    it('test 37 + MAN-3: a manager adds for the branch only; GA_HEAD without an agent code must pick one; Marketing and Admin cannot add', async () => {
      await create(um, {
        clientCode: '5000000010',
        name: 'Của FC Tuyến Dưới',
        agentCode: FC,
      }).expect(201);
      expect((await stored('5000000010'))?.ownerAgentCodes).toEqual([FC]);
      expect(
        (
          await create(um, {
            clientCode: '5000000011',
            name: 'Ngoài Tuyến',
            agentCode: PEER,
          }).expect(400)
        ).body.error,
      ).toBe('agent_not_found');
      expect(
        (
          await create(fc, {
            clientCode: '5000000012',
            name: 'FC Chọn Người Khác',
            agentCode: UM,
          }).expect(400)
        ).body.error,
      ).toBe('agent_not_found');
      expect(
        (
          await create(head, {
            clientCode: '5000000013',
            name: 'Chưa Chọn',
          }).expect(400)
        ).body.error,
      ).toBe('agent_required');
      for (const agent of [marketing, admin]) {
        await create(agent, {
          clientCode: '5000000014',
          name: 'Không Được',
          agentCode: FC,
        }).expect(403);
      }
    });

    it('test 40 + MAN-5 + POL-3: policies saved with the client; the agent serves at 100%; programmes from the catalogue only', async () => {
      await create(fc, {
        clientCode: '5000000020',
        name: 'Có Hợp Đồng',
        policies: [
          policyBody('500000020', {
            products: [
              {
                programCode: 'AN_TAM_SONG_HANH',
                sumAssuredVnd: 500_000_000,
                termYears: 20,
              },
              {
                programCode: 'BH_TAI_NAN_CAO_CAP',
                insuredName: 'Bé Con',
                insuredDob: '2015-04-02',
                insuredGender: 'Nữ',
                sumAssuredVnd: 100_000_000,
              },
            ],
          }),
        ],
      }).expect(201);
      const policy = await policyOf('500000020');
      expect(policy).toMatchObject({
        origin: 'MANUAL',
        holderClientCode: '5000000020',
        insuredClientCode: '5000000020',
        servicingAgentCode: FC,
        agents: [
          expect.objectContaining({
            agentCode: FC,
            splitPercent: 100,
            isServicing: true,
          }),
        ],
        clients: [
          { clientCode: '5000000020', role: 'PO', source: 'POLICY' },
          { clientCode: '5000000020', role: 'LI', source: 'POLICY' },
        ],
      });
      // PRD-3: another person keeps a name only
      expect(policy?.products[1]).toMatchObject({
        insuredCode: '',
        insuredName: 'Bé Con',
        productCode: 'BH_TAI_NAN_CAO_CAP',
      });
      expect(
        (await stored('5000000020'))?.agentLinks
          .map((link: { source: string }) => link.source)
          .sort(),
      ).toEqual(['MANUAL', 'POLICY_HOLDER', 'POLICY_INSURED']);
    });

    it('test 40 + MAN-5: a refused policy leaves no half-made client', async () => {
      const cases: [Record<string, unknown>, number, string][] = [
        [policyBody('500000020'), 409, 'policy_exists'],
        [policyBody('12345'), 400, 'invalid_policy_no'],
        [
          policyBody('500000021', { products: [{ programCode: 'KHONG_CO' }] }),
          400,
          'unknown_program',
        ],
        [
          policyBody('500000022', {
            products: [
              { programCode: 'AN_TAM_SONG_HANH' },
              { programCode: 'AN_TAM_SONG_HANH' },
            ],
          }),
          409,
          'program_repeated',
        ],
        [policyBody('500000023', { agentCode: PEER }), 400, 'agent_not_found'],
      ];
      for (const [policy, status, error] of cases) {
        const { body } = await create(fc, {
          clientCode: '5000000021',
          name: 'Dở Dang',
          policies: [policy],
        }).expect(status);
        expect(body.error).toBe(error);
        expect(await stored('5000000021')).toBeNull();
      }
      const repeated = await create(fc, {
        clientCode: '5000000021',
        name: 'Dở Dang',
        policies: [
          policyBody('500000024', {
            products: [
              { programCode: 'AN_TAM_SONG_HANH' },
              { programCode: 'AN_TAM_SONG_HANH' },
            ],
          }),
        ],
      }).expect(409);
      expect(repeated.body.issues).toEqual([
        {
          path: 'policies.0.products.1.programCode',
          message: 'program_repeated',
        },
      ]);
    });
  });

  describe('editing', () => {
    it('test 38 + test 39 + MAN-6: absent keeps, null clears, the birthday follows; history and audit without the phone in clear', async () => {
      await fc
        .patch(`${API}/clients/5000000001`)
        .send({
          name: 'Phạm Thị Tay Mới',
          dob: '1975-12-31',
          phone: null,
          tier: null,
        })
        .expect(204);
      const client = await stored('5000000001');
      expect(client).toMatchObject({
        name: 'Phạm Thị Tay Mới',
        nameNorm: 'PHAM THI TAY MOI',
        birthDayMonth: '31/12',
        ageBand: '50-59',
        gender: 'Nữ',
      });
      expect(client?.phone).toBeUndefined();
      expect(client?.tier).toBeUndefined();
      const changes = await connection
        .collection('recordChanges')
        .find({ entity: 'client', entityKey: '5000000001' })
        .toArray();
      expect(changes.find((item) => item.field === 'phone')).toMatchObject({
        oldValue: '0912***678',
      });
      expect(changes.every((item) => item.importId === undefined)).toBe(true);
      await fc
        .patch(`${API}/clients/5000000001`)
        .send({ phone: '12345' })
        .expect(400);
      await fc
        .patch(`${API}/clients/5000000001`)
        .send({ phone: '0987654321' })
        .expect(204);
      // CUS-14: the phone the GA keeps can be searched
      expect(
        (
          await fc.get(`${API}/clients`).query({ q: '7654' }).expect(200)
        ).body.items.map((item: { clientCode: string }) => item.clientCode),
      ).toEqual(['5000000001']);
    });

    it('test 38 + test 43 + CUS-6: a line manager only reads; GA_HEAD edits any client', async () => {
      const refused = await um
        .patch(`${API}/clients/5000000001`)
        .send({ name: 'Quản Lý Sửa' })
        .expect(403);
      expect(refused.body.error).toBe('client_not_yours');
      expect(
        (await um.get(`${API}/clients/5000000001`).expect(200)).body.canEdit,
      ).toBe(false);
      await head
        .patch(`${API}/clients/5000000099`)
        .send({ tier: 'Vàng' })
        .expect(204);
      await fc
        .patch(`${API}/clients/5000000099`)
        .send({ tier: 'Bạc' })
        .expect(404);
      for (const agent of [marketing, admin])
        await agent
          .patch(`${API}/clients/5000000001`)
          .send({ tier: 'Bạc' })
          .expect(403);
    });

    it('test 40 + POL-1: a policy added later; a line manager may not; one outside scope is 404', async () => {
      await fc
        .post(`${API}/clients/5000000002/policies`)
        .send(policyBody('500000030'))
        .expect(201);
      expect((await policyOf('500000030'))?.servicingAgentCode).toBe(FC);
      expect(
        (
          await um
            .post(`${API}/clients/5000000002/policies`)
            .send(policyBody('500000031'))
            .expect(403)
        ).body.error,
      ).toBe('client_not_yours');
      await fc
        .post(`${API}/clients/5000000099/policies`)
        .send(policyBody('500000032'))
        .expect(404);
    });

    it('test 41 + POL-4: editing replaces every programme line; the number and the agent stay; only a policy of this client', async () => {
      const { policyNo: _ignored, ...edit } = policyBody('x', {
        status: 'Mất hiệu lực',
        products: [
          { programCode: 'BH_CHAM_SOC_SUC_KHOE', sumAssuredVnd: 200_000_000 },
        ],
      });
      // The number and the agent are not part of an edit
      await fc
        .patch(`${API}/clients/5000000020/policies/500000020`)
        .send({ ...edit, policyNo: '999999999' })
        .expect(400);
      await fc
        .patch(`${API}/clients/5000000020/policies/500000020`)
        .send({ ...edit, agentCode: '00100003' })
        .expect(400);
      await fc
        .patch(`${API}/clients/5000000020/policies/500000020`)
        .send(edit)
        .expect(204);
      const policy = await policyOf('500000020');
      expect(policy).toMatchObject({
        status: 'Mất hiệu lực',
        servicingAgentCode: FC,
        policyNo: '500000020',
      });
      expect(policy?.products).toEqual([
        expect.objectContaining({
          programCode: 'BH_CHAM_SOC_SUC_KHOE',
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
      await fc
        .patch(`${API}/clients/5000000001/policies/500000020`)
        .send(edit)
        .expect(404);
      await um
        .patch(`${API}/clients/5000000020/policies/500000020`)
        .send(edit)
        .expect(403);
    });

    it('PRG-5: a programme on a policy can only be hidden', async () => {
      const used = (await programs(head)).find(
        (item) => item.code === 'BH_CHAM_SOC_SUC_KHOE',
      )!;
      expect(
        (await head.delete(`${API}/programs/${used.id}`).expect(409)).body
          .error,
      ).toBe('program_in_use');
      await head
        .patch(`${API}/programs/${used.id}`)
        .send({ active: false })
        .expect(200);
      expect(
        (
          await fc
            .post(`${API}/clients/5000000002/policies`)
            .send(
              policyBody('500000040', {
                products: [{ programCode: 'BH_CHAM_SOC_SUC_KHOE' }],
              }),
            )
            .expect(400)
        ).body.error,
      ).toBe('unknown_program');
      await head
        .patch(`${API}/programs/${used.id}`)
        .send({ active: true })
        .expect(200);
    });
  });

  it('test 35 + MAN-8 + POL-5: a later Success file updates the same records and keeps what the GA keeps', async () => {
    const start = (
      await head
        .post(`${API}/imports`)
        .send({
          fileName: 'success.xlsx',
          snapshotDate: '2026-11-10',
          kind: 'SUCCESS',
          sheets: [
            {
              name: '02_Clients',
              headers: ['Mã Khách Hàng', 'Bên Mua BH', 'Nhóm Khách Hàng'],
            },
            {
              name: '04_Policy_Products',
              headers: [
                'Số HĐBH',
                'product_code',
                'product_role',
                'Số tiền bảo hiểm',
              ],
            },
          ],
        })
        .expect(201)
    ).body;
    await head
      .post(`${API}/imports/${start.id}/rows`)
      .send({
        sheet: '02_Clients',
        rows: [{ r: 2, c: ['5000000001', 'Tên Theo Success', 'Kim Cương'] }],
      })
      .expect(200);
    await head
      .post(`${API}/imports/${start.id}/rows`)
      .send({
        sheet: '04_Policy_Products',
        rows: [
          { r: 2, c: ['500000030', 'AN_TAM_SONG_HANH', 'Chính', '900000000'] },
        ],
      })
      .expect(200);
    await head.post(`${API}/imports/${start.id}/validate`).expect(200);
    const done = (
      await head.post(`${API}/imports/${start.id}/commit`).expect(200)
    ).body;
    expect(
      done.sheets.map(
        (sheet: { name: string; inserted: number; updated: number }) => [
          sheet.name,
          sheet.inserted,
          sheet.updated,
        ],
      ),
    ).toEqual([
      ['02_Clients', 0, 1],
      ['04_Policy_Products', 0, 1],
    ]);
    expect(await stored('5000000001')).toMatchObject({
      name: 'Tên Theo Success',
      tier: 'Kim Cương',
      phone: '0987654321',
      origin: 'MANUAL',
    });
    // The file's blank insured code matched the hand-entered line of the main insured; its term stayed
    expect((await policyOf('500000030'))?.products).toEqual([
      expect.objectContaining({
        productCode: 'AN_TAM_SONG_HANH',
        sumAssuredVnd: 900_000_000,
        termYears: 20,
        programCode: 'AN_TAM_SONG_HANH',
      }),
    ]);
  });
});
