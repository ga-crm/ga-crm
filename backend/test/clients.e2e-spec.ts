import type { INestApplication } from '@nestjs/common';
import ExcelJS from 'exceljs';
import request from 'supertest';
import { startApp, stopApp } from './support/app.js';
import { clientIdOf } from './support/clients.js';
import { connection } from './support/collections.js';
import { ownerDb } from './support/owner-db.js';
import { demoEmail, seedDemoData } from '../src/seed/demo-data.js';

const API = '/api/v1';
const PASSWORD = 'demo-password-123';
const FC = '00100004';
const UM = '00100003';
/** A FC in another branch of GA-1, under the BM but not under the UM. */
const PEER = '00100096';
type Agent = ReturnType<typeof request.agent>;
type Cell = string | number | null;
interface SheetInput {
  name: string;
  headers: string[];
  rows: Cell[][];
}

const CLIENT_HEADERS = [
  'Mã Khách Hàng',
  'Bên Mua BH',
  'Nhóm Khách Hàng',
  'Ngày Sinh',
  'Giới Tính',
];
const POLICY_HEADERS = [
  'Số HĐBH',
  'Mã KH BMBH',
  'Mã NĐBH chính',
  'Mã đại lý',
  'Bên mua BH',
  'NĐBH chính',
  'Tình trạng',
  'Ngày hiệu lực',
  'Ngày đáo hạn',
  'Tỉ lệ chia',
  'Định kỳ đóng phí',
  'Ngày đến hạn đóng phí',
  'Phí định kỳ/cơ bản định kỳ',
];
const policy = (
  policyNo: string,
  client: string,
  agent: string,
  patch: { split?: string; status?: string; due?: string; name?: string } = {},
): Cell[] => [
  policyNo,
  client,
  client,
  agent,
  patch.name ?? 'Khách Hợp Đồng',
  patch.name ?? 'Khách Hợp Đồng',
  patch.status ?? 'Đang hiệu lực',
  '01/06/2024',
  '01/06/2044',
  patch.split ?? '',
  'Năm',
  patch.due ?? '01/06/2099',
  '12000000',
];

/** Section 10 and 12: Success sheets 02-05, and the client book they feed (slice 4a). */
describe('Clients from Success files (e2e)', () => {
  let app: INestApplication;
  let head: Agent;
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

  /** IMP-3: start, send each sheet, validate, and commit unless asked not to. */
  const importFile = async (
    agent: Agent,
    sheets: SheetInput[],
    commit = true,
  ) => {
    const { id } = (
      await agent
        .post(`${API}/imports`)
        .send({
          fileName: 'success.xlsx',
          snapshotDate: '2026-11-10',
          kind: 'SUCCESS',
          sheets: sheets.map(({ name, headers }) => ({ name, headers })),
        })
        .expect(201)
    ).body;
    for (const sheet of sheets) {
      await agent
        .post(`${API}/imports/${id}/rows`)
        .send({
          sheet: sheet.name,
          rows: sheet.rows.map((c, index) => ({ r: index + 2, c })),
        })
        .expect(200);
    }
    const preview = (
      await agent.post(`${API}/imports/${id}/validate`).expect(200)
    ).body;
    const done = commit
      ? (await agent.post(`${API}/imports/${id}/commit`).expect(200)).body
      : null;
    const problems = (
      await agent
        .get(`${API}/imports/${id}/errors`)
        .query({ pageSize: 200 })
        .expect(200)
    ).body.items as {
      sheet: string;
      row: number;
      code: string;
      severity: string;
    }[];
    const sheetOf = (name: string) =>
      (done ?? preview).sheets.find(
        (item: { name: string }) => item.name === name,
      );
    return { id, preview, done, problems, sheetOf };
  };
  const list = async (agent: Agent, query: Record<string, string> = {}) =>
    (await agent.get(`${API}/clients`).query(query).expect(200)).body;
  /** The Success codes of the clients a list shows (the API itself only gives ids). */
  const codesOf = async (page: { items: { id: string }[] }) => {
    const { rows } = await ownerDb().query<{ success_code: string }>(
      `SELECT success_code FROM clients WHERE id = ANY($1::uuid[])`,
      [page.items.map((item) => item.id)],
    );
    return rows
      .map((row) => row.success_code)
      .sort((a, b) => a.localeCompare(b));
  };
  const open = async (agent: Agent, code: string, status = 200) =>
    agent.get(`${API}/clients/${await clientIdOf(code)}`).expect(status);

  beforeAll(async () => {
    app = await startApp();
    await seedDemoData(app, PASSWORD);
    head = await as('head');
    fc = await as('fc');
    um = await as('um');
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

  it('test 28: every sheet of the template as downloaded imports with no errors', async () => {
    const head2 = await as('head', 2);
    const res = await head2
      .get(`${API}/imports/templates/SUCCESS.xlsx`)
      .buffer(true)
      .parse((response, callback) => {
        const chunks: Buffer[] = [];
        response.on('data', (chunk: Buffer) => chunks.push(chunk));
        response.on('end', () => callback(null, Buffer.concat(chunks)));
      })
      .expect(200);
    const workbook = new ExcelJS.Workbook();
    await workbook.xlsx.load(res.body as never);
    const sheets: SheetInput[] = workbook.worksheets
      .filter((sheet) => /^0[1-57]_/.test(sheet.name))
      .map((sheet) => {
        const headers = (sheet.getRow(1).values as string[]).slice(1);
        const rows: Cell[][] = [];
        sheet.eachRow((row, number) => {
          if (number === 1) return;
          rows.push(
            headers.map(
              (_, index) => (row.getCell(index + 1).value as Cell) ?? '',
            ),
          );
        });
        return { name: sheet.name, headers, rows };
      });
    expect(sheets.map((sheet) => sheet.name)).toEqual([
      '01_Agents',
      '02_Clients',
      '03_Policies',
      '04_Policy_Products',
      '05_Applications',
      '07_Activities',
    ]);

    const { preview, sheetOf } = await importFile(head2, sheets);
    expect(preview.errorsTotal).toBe(0);
    expect(preview.warningsTotal).toBe(0);
    expect(sheetOf('02_Clients')).toMatchObject({ found: 1, inserted: 1 });
    expect(sheetOf('03_Policies')).toMatchObject({ found: 1, inserted: 1 });
    expect(sheetOf('04_Policy_Products')).toMatchObject({
      found: 2,
      inserted: 2,
    });
    expect(sheetOf('05_Applications')).toMatchObject({ found: 1, inserted: 1 });
    expect(sheetOf('07_Activities')).toMatchObject({ found: 1, inserted: 1 });

    const { body } = await open(head2, '0000000001');
    expect(JSON.stringify(body)).not.toMatch(/clientCode|successCode/);
    expect(body.client).toMatchObject({
      id: await clientIdOf('0000000001'),
      name: 'Nguyễn Văn Khách',
      tier: 'Vàng',
      dob: '1985-05-12',
      usesDconnect: true,
      idUpdated: true,
      birthDayMonth: '12/05',
      ageBand: '40-49',
      manual: false,
    });
    expect(body.policies).toHaveLength(1);
    expect(body.policies[0]).toMatchObject({
      policyNo: '000000001',
      active: true,
      roles: ['PO', 'LI'],
      servicingAgentCode: '9000001',
      agents: [
        {
          agentCode: '9000001',
          name: 'Nguyễn Thị A',
          splitPercent: 100,
          isServicing: true,
        },
      ],
    });
    expect(
      body.policies[0].products.map(
        (item: { productCode: string }) => item.productCode,
      ),
    ).toEqual(['P001', 'R002']);
    expect(body.applications).toEqual([
      expect.objectContaining({
        applicationNo: 'A0001',
        agentCode: '9000001',
        apeVnd: 12_000_000,
      }),
    ]);
  });

  it("CUS-4 + CUS-7: a FC's own file makes the clients theirs; the manager sees them but does not own them", async () => {
    const { sheetOf, problems } = await importFile(fc, [
      {
        name: '02_Clients',
        headers: CLIENT_HEADERS,
        rows: [
          ['1000000001', 'Trần Văn Một', 'Bạc', '01/02/1990', 'Nam'],
          // IMP-6: Excel dropped the leading zeros
          [100000002, 'Lê Thị Hai', '', '', 'Nữ'],
        ],
      },
      {
        name: '03_Policies',
        headers: POLICY_HEADERS,
        rows: [policy('100000001', '1000000001', FC)],
      },
    ]);
    expect(sheetOf('02_Clients')).toMatchObject({
      inserted: 2,
      warnings: 1,
      rejected: 0,
    });
    expect(problems).toContainEqual(
      expect.objectContaining({ code: 'padded_key', severity: 'warning' }),
    );

    expect(await codesOf(await list(fc))).toEqual(['0100000002', '1000000001']);
    const stored = await connection
      .collection('clients')
      .findOne({ successCode: '1000000001' });
    expect(
      stored?.agentLinks.map((link: { source: string }) => link.source).sort(),
    ).toEqual(['CLIENTS_SHEET', 'POLICY_HOLDER', 'POLICY_INSURED']);
    expect(stored?.ownerAgentCodes).toEqual([FC]);

    // CUS-7: the manager's own list is theirs; "all" shows the branch
    expect(await codesOf(await list(um))).toEqual([]);
    expect(await codesOf(await list(um, { agents: 'ALL' }))).toEqual([
      '0100000002',
      '1000000001',
    ]);
    expect(await codesOf(await list(um, { agents: FC }))).toEqual([
      '0100000002',
      '1000000001',
    ]);
    // GA_HEAD has no agent code, so their default is the whole GA
    expect(await codesOf(await list(head))).toEqual(['0100000002', '1000000001']);

    const row = (await list(fc, { q: 'Trần' })).items[0];
    expect(row).toMatchObject({
      id: await clientIdOf('1000000001'),
      tier: 'Bạc',
      activePolicies: 1,
      nextDue: '2099-06-01',
      agents: [{ agentCode: FC, name: 'Tư vấn viên 1' }],
    });
  });

  it("CUS-4 + CUS-7: a manager's client sheet lets them see clients without making the clients theirs", async () => {
    await importFile(um, [
      {
        name: '02_Clients',
        headers: CLIENT_HEADERS,
        rows: [['1000000009', 'Khách Của Nhóm', '', '', '']],
      },
    ]);
    const stored = await connection
      .collection('clients')
      .findOne({ successCode: '1000000009' });
    expect(stored?.agentLinks).toEqual([
      expect.objectContaining({ agentCode: UM, source: 'CLIENTS_SHEET_SCOPE' }),
    ]);
    expect(stored?.ownerAgentCodes).toEqual([]);
    expect(await codesOf(await list(um))).not.toContain('1000000009');
    expect(await codesOf(await list(um, { agents: 'ALL' }))).toContain('1000000009');
    // The FC below sees nothing of it
    await open(fc, '1000000009', 404);
  });

  it("section 12.2: a FC cannot write a stranger's client, a policy of another agent, or a product of a policy outside scope", async () => {
    // The GA puts a policy and client on the peer FC in another branch
    await importFile(head, [
      {
        name: '02_Clients',
        headers: CLIENT_HEADERS,
        rows: [['2000000001', 'Khách Nhánh Khác', '', '', '']],
      },
      {
        name: '03_Policies',
        headers: POLICY_HEADERS,
        rows: [policy('200000001', '2000000001', PEER)],
      },
    ]);
    const { problems } = await importFile(fc, [
      {
        name: '02_Clients',
        headers: CLIENT_HEADERS,
        rows: [['2000000001', 'Đổi Tên', '', '', '']],
      },
      {
        name: '03_Policies',
        headers: POLICY_HEADERS,
        rows: [policy('200000002', '2000000002', PEER)],
      },
      {
        name: '04_Policy_Products',
        headers: ['Số HĐBH', 'product_code', 'product_role'],
        rows: [['200000001', 'P001', 'Chính']],
      },
    ]);
    expect(problems.map((item) => [item.sheet, item.code])).toEqual(
      expect.arrayContaining([
        ['02_Clients', 'client_out_of_scope'],
        ['03_Policies', 'out_of_scope'],
        ['04_Policy_Products', 'policy_not_found'],
      ]),
    );
    expect(
      (
        await connection
          .collection('clients')
          .findOne({ successCode: '2000000001' })
      )?.name,
    ).toBe('Khách Nhánh Khác');
    await open(fc, '2000000001', 404);
    // The UM is not above the peer either
    await open(um, '2000000001', 404);
    await open(head, '2000000001', 200);
  });

  it('IMP-16 + IMP-17 + CUS-12: a GA file splits a policy, then moves it; history keeps every change (IMP-21)', async () => {
    const split = await importFile(head, [
      {
        name: '03_Policies',
        headers: POLICY_HEADERS,
        rows: [
          policy('300000001', '3000000001', FC, { split: '60%' }),
          policy('300000001', '3000000001', PEER, { split: '40%' }),
          policy('300000002', '3000000002', FC, { split: '50%' }),
        ],
      },
    ]);
    expect(split.problems).toEqual([
      expect.objectContaining({ row: 4, code: 'split_total' }),
    ]);
    // CUS-8: both agents of a split policy see it with every share
    for (const agent of [fc, head]) {
      const { body } = await open(agent, '3000000001');
      expect(body.policies[0].agents).toEqual([
        expect.objectContaining({
          agentCode: FC,
          splitPercent: 60,
          isServicing: true,
        }),
        expect.objectContaining({
          agentCode: PEER,
          splitPercent: 40,
          isServicing: false,
        }),
      ]);
    }

    const moved = await importFile(head, [
      {
        name: '03_Policies',
        headers: POLICY_HEADERS,
        rows: [
          policy('300000001', '3000000001', PEER, {
            split: '100%',
            status: 'Mất hiệu lực',
          }),
        ],
      },
    ]);
    expect(moved.problems).toEqual([
      expect.objectContaining({
        code: 'servicing_changed',
        severity: 'warning',
      }),
    ]);
    // The FC's link to this client came only from the policy, so the client leaves their book
    await open(fc, '3000000001', 404);
    const stored = await connection
      .collection('policies')
      .findOne({ policyNo: '300000001' });
    expect(stored?.currentAgentCodes).toEqual([PEER]);
    expect(
      stored?.agents.find(
        (agent: { agentCode: string }) => agent.agentCode === FC,
      ).endedAt,
      // Stored as JSON, so the end date reads back as ISO text
    ).toEqual(expect.stringMatching(/^\d{4}-\d{2}-\d{2}T/));

    const changes = await connection
      .collection('recordChanges')
      .find({ entity: 'policy', entityKey: '300000001' })
      .toArray();
    expect(
      changes.map((item) => [item.field, item.oldValue, item.newValue]),
    ).toEqual(
      expect.arrayContaining([
        ['status', 'Đang hiệu lực', 'Mất hiệu lực'],
        ['agents', `${FC}:60;${PEER}:40`, `${PEER}:100`],
      ]),
    );
    expect(changes).toHaveLength(2);
  });

  it('CUS-9 + CUS-5: opening a client is audited; Marketing and Admin have no client book; GA-2 gets 404 (TEN-7)', async () => {
    await open(fc, '1000000001', 200);
    expect(
      await connection
        .collection('auditEvents')
        .countDocuments({
          action: 'VIEW_CLIENT',
          entityId: await clientIdOf('1000000001'),
        }),
    ).toBeGreaterThan(0);

    for (const key of ['marketing', 'admin']) {
      const agent = await as(key);
      await agent.get(`${API}/clients`).expect(403);
      await open(agent, '1000000001', 403);
    }
    const head2 = await as('head', 2);
    await open(head2, '1000000001', 404);
    expect(await codesOf(await list(head2, { agents: 'ALL' }))).not.toContain(
      '1000000001',
    );
    // Not an id at all
    await fc.get(`${API}/clients/123`).expect(400);
  });

  it('CUS-14 (decided 25/11/2026): search by name, policy number or phone digits, not by client code; filter by tier', async () => {
    expect(await codesOf(await list(head, { q: 'tran van' }))).toEqual([
      '1000000001',
    ]);
    // A policy number lists the people on that policy
    expect(await codesOf(await list(head, { q: '100000001' }))).toEqual([
      '1000000001',
    ]);
    // The client code itself finds nothing
    expect((await list(head, { q: '1000000009' })).items).toEqual([]);
    expect(await codesOf(await list(head, { tier: 'Bạc' }))).toEqual(['1000000001']);
    await head.get(`${API}/clients`).query({ tier: 'Đồng' }).expect(400);
    await head.get(`${API}/clients`).query({ agents: 'abc' }).expect(400);
  });
});
