import type { INestApplication } from '@nestjs/common';
import { gzipSync } from 'node:zlib';
import ExcelJS from 'exceljs';
import request from 'supertest';
import { startApp, stopApp } from './support/app.js';
import { connection } from './support/collections.js';
import { ownerDb } from './support/owner-db.js';
import { demoEmail, seedDemoData } from '../src/seed/demo-data.js';
import { ImportsService } from '../src/modules/imports/imports.service.js';

const API = '/api/v1';
const PASSWORD = 'demo-password-123';
const SHEET = '01_Agents';
const HEADERS = [
  'Quản lý',
  'Tư vấn tài chính',
  'Giới tính',
  'Ngày sinh',
  'Trạng thái',
  'Điện thoại',
  'Ngày bắt đầu hoạt động',
  'Ngày chấm dứt hoạt động',
  'office_code',
];
const ACTIVE = 'Đang hoạt động';
type Agent = ReturnType<typeof request.agent>;
type Cell = string | number | null;

/** One row in template column order. */
const agentRow = (
  agent: string,
  manager = '',
  patch: { status?: string; start?: string; phone?: string; dob?: string } = {},
): Cell[] => [
  manager,
  agent,
  '',
  patch.dob ?? '',
  patch.status ?? ACTIVE,
  patch.phone ?? '',
  patch.start ?? '01/01/2024',
  '',
  '',
];

describe('Agent tree and imports (e2e)', () => {
  let app: INestApplication;
  const http = () => request(app.getHttpServer());

  const signIn = async (email: string, password = PASSWORD) => {
    const agent = request.agent(app.getHttpServer());
    await agent
      .post(`${API}/auth/sign-in/email`)
      .send({ email, password })
      .expect(200);
    return agent;
  };

  const startImport = async (
    agent: Agent,
    sheets: { name: string; headers: string[] }[] = [
      { name: SHEET, headers: HEADERS },
    ],
  ) => {
    const res = await agent
      .post(`${API}/imports`)
      .send({
        fileName: 'cay-dai-ly.xlsx',
        snapshotDate: '2026-11-06',
        kind: 'SUCCESS',
        sheets,
      })
      .expect(201);
    return res.body as {
      id: string;
      sheets: {
        name: string;
        status: string;
        reason?: string;
        present: number[];
        fields: string[];
        missingRequired: string[];
        banned: string[];
      }[];
    };
  };

  const sendRows = (agent: Agent, id: string, rows: Cell[][], first = 2) =>
    agent
      .post(`${API}/imports/${id}/rows`)
      .send({
        sheet: SHEET,
        rows: rows.map((c, index) => ({ r: first + index, c })),
      })
      .expect(200);

  /** The usual way through: start, send, validate. Returns the import ready to confirm. */
  const staged = async (agent: Agent, rows: Cell[][]) => {
    const { id } = await startImport(agent);
    await sendRows(agent, id, rows);
    const validated = await agent
      .post(`${API}/imports/${id}/validate`)
      .expect(200);
    return { id, preview: validated.body, sheet: validated.body.sheets[0] };
  };

  const commit = async (agent: Agent, rows: Cell[][]) => {
    const { id } = await staged(agent, rows);
    const done = await agent.post(`${API}/imports/${id}/commit`).expect(200);
    return { id, result: done.body, sheet: done.body.sheets[0] };
  };

  const errorsOf = async (agent: Agent, id: string) =>
    (
      await agent
        .get(`${API}/imports/${id}/errors`)
        .query({ pageSize: 500 })
        .expect(200)
    ).body.items as {
      row: number;
      code: string;
      column: string | null;
      recordKey: string | null;
      severity: string;
      messageVi: string;
    }[];

  const getAgent = async (agent: Agent, code: string) =>
    (await agent.get(`${API}/agents/${code}`).expect(200)).body;

  beforeAll(async () => {
    app = await startApp();
    await seedDemoData(app, PASSWORD);
  });

  afterAll(async () => {
    await stopApp(app);
  });

  describe('agent tree', () => {
    it('section 27.2: the demo GAs have a tree, and users link to it (USER-7)', async () => {
      const head = await signIn(demoEmail(1, 'head'));
      const { items } = (await head.get(`${API}/agents/tree`).expect(200)).body;
      const fc = items.find(
        (item: { agentCode: string }) => item.agentCode === '00100004',
      );
      expect(fc).toMatchObject({
        depth: 3,
        ancestors: ['00100001', '00100002', '00100003'],
      });
      expect(fc.userId).toEqual(expect.any(String));

      const users = (
        await head
          .get(`${API}/users`)
          .query({ q: 'fc@ga1', pageSize: 50 })
          .expect(200)
      ).body.items;
      expect(users[0].agentName).toBe('Tư vấn viên 1');
    });

    it('SCOPE-6 + AGT-6: each role sees its own branch only', async () => {
      const head = await signIn(demoEmail(1, 'head'));
      for (const dto of [
        {
          agentCode: '00100090',
          name: 'UM ngang hàng',
          managerCode: '00100002',
        },
        {
          agentCode: '00100091',
          name: 'FC của UM khác',
          managerCode: '00100090',
        },
      ]) {
        await head
          .post(`${API}/agents`)
          .send({ ...dto, rank: 'UM', status: ACTIVE, startDate: '2024-01-01' })
          .expect(201);
      }
      const codes = async (email: string) => {
        const agent = await signIn(email);
        const { items } = (await agent.get(`${API}/agents/tree`).expect(200))
          .body;
        return items.map((item: { agentCode: string }) => item.agentCode);
      };

      expect(await codes(demoEmail(1, 'um'))).toEqual(['00100003', '00100004']);
      expect(await codes(demoEmail(1, 'fc'))).toEqual(['00100004']);
      const bm = await codes(demoEmail(1, 'bm'));
      expect(bm).toContain('00100091');
      expect(bm).not.toContain('00100001');
      // Marketing and Admin hold agents.view_all by default
      expect(await codes(demoEmail(1, 'admin'))).toContain('00100001');
      expect(await codes(demoEmail(1, 'head'))).toContain('00100091');

      const um = await signIn(demoEmail(1, 'um'));
      await um.get(`${API}/agents/00100004`).expect(200);
      await um.get(`${API}/agents/00100090`).expect(404);
      await um.get(`${API}/agents/00100002`).expect(404);
      const list = (await um.get(`${API}/agents`).expect(200)).body;
      expect(list.total).toBe(2);
      expect(list.items[1].managerName).toBe('Trưởng nhóm 1');
    });

    it('TEN-7: GA-1 cannot see or change an agent of GA-2', async () => {
      const head = await signIn(demoEmail(1, 'head'));
      await head.get(`${API}/agents/00200001`).expect(404);
      await head
        .patch(`${API}/agents/00200004`)
        .send({ name: 'Đổi tên' })
        .expect(404);
      await head
        .patch(`${API}/agents/00200004/manager`)
        .send({ managerCode: null })
        .expect(404);
      const { items } = (await head.get(`${API}/agents/tree`).expect(200)).body;
      for (const item of items) expect(item.agentCode).not.toMatch(/^002/);
    });

    it('TEN-5: searching cannot leave the tenant or the branch', async () => {
      const um = await signIn(demoEmail(1, 'um'));
      const found = async (q: string) =>
        (await um.get(`${API}/agents`).query({ q }).expect(200)).body.total;
      expect(await found('tu van vien')).toBe(1);
      expect(await found('Tư vấn')).toBe(1);
      expect(await found('00100004')).toBe(1);
      expect(await found('Giám đốc')).toBe(0);
      expect(await found('00200004')).toBe(0);
      expect(await found('.*')).toBe(0);
    });

    it('AGT-6: birth date and phone are for GA_HEAD and ADMIN only', async () => {
      const head = await signIn(demoEmail(1, 'head'));
      await head
        .patch(`${API}/agents/00100004`)
        .send({ phone: '+84900000004', dob: '1990-01-15' })
        .expect(200);
      expect(await getAgent(head, '00100004')).toMatchObject({
        phone: '0900000004',
        dob: '1990-01-15',
      });
      const admin = await signIn(demoEmail(1, 'admin'));
      expect(await getAgent(admin, '00100004')).toHaveProperty('phone');

      for (const key of ['um', 'fc']) {
        const body = await getAgent(
          await signIn(demoEmail(1, key)),
          '00100004',
        );
        expect(body, key).not.toHaveProperty('phone');
        expect(body, key).not.toHaveProperty('dob');
      }
      // AUD-4: the log names the field, never the value
      const audit = await connection
        .collection('auditEvents')
        .find({ entity: 'agent', entityId: '00100004' })
        .toArray();
      expect(JSON.stringify(audit)).not.toContain('0900000004');
      expect(JSON.stringify(audit)).toContain('phone');
    });

    it('AGT-5: only agents.edit_tree can enter or move agents by hand', async () => {
      const valid = {
        agentCode: '00100070',
        name: 'Nhập tay',
        rank: 'FC',
        status: ACTIVE,
        startDate: '2024-01-01',
      };
      for (const key of ['fc', 'um']) {
        const agent = await signIn(demoEmail(1, key));
        await agent.post(`${API}/agents`).send(valid).expect(403);
        await agent
          .patch(`${API}/agents/00100004/manager`)
          .send({ managerCode: null })
          .expect(403);
        await agent
          .patch(`${API}/agents/00100004`)
          .send({ name: 'x' })
          .expect(403);
      }
    });

    it('manual entry: validates input, refuses duplicates and unknown managers', async () => {
      const admin = await signIn(demoEmail(1, 'admin'));
      const valid = {
        agentCode: '00100071',
        name: 'Nhập tay',
        rank: 'FC',
        status: ACTIVE,
        startDate: '2024-01-01',
        managerCode: '00100003',
      };
      for (const patch of [
        { agentCode: 'ABC' },
        { name: '  ' },
        { rank: 'CEO' },
        { status: 'Nghỉ' },
        { startDate: '01/01/2024' },
        { startDate: '2024-02-30' },
        { dob: '2999-01-01' },
        { endDate: '2024-13-01' },
        { phone: 12345 },
        { extra: 'x' },
      ]) {
        await admin
          .post(`${API}/agents`)
          .send({ ...valid, ...patch })
          .expect(400);
      }
      const missing = await admin
        .post(`${API}/agents`)
        .send({ ...valid, managerCode: '999999' })
        .expect(400);
      expect(missing.body.error).toBe('manager_not_found');

      const created = await admin.post(`${API}/agents`).send(valid).expect(201);
      expect(created.body).toMatchObject({
        agentCode: '00100071',
        depth: 3,
        managerName: 'Trưởng nhóm 1',
        managerFixed: false,
      });
      const duplicate = await admin
        .post(`${API}/agents`)
        .send(valid)
        .expect(409);
      expect(duplicate.body.error).toBe('agent_exists');

      const updated = await admin
        .patch(`${API}/agents/00100071`)
        .send({ name: 'Tên mới', officeCode: 'HN01' })
        .expect(200);
      expect(updated.body).toMatchObject({
        name: 'Tên mới',
        officeCode: 'HN01',
      });
      const cleared = await admin
        .patch(`${API}/agents/00100071`)
        .send({ officeCode: null })
        .expect(200);
      expect(cleared.body.officeCode).toBeNull();
      await admin
        .patch(`${API}/agents/00100071`)
        .send({ name: null })
        .expect(400);
    });

    it('AGT-5: refuses unknown managers and cycles; a move rebuilds the branch', async () => {
      const head = await signIn(demoEmail(2, 'head'));
      const move = (code: string, managerCode: string | null) =>
        head.patch(`${API}/agents/${code}/manager`).send({ managerCode });

      const notFound = await move('00200003', '777').expect(400);
      expect(notFound.body.error).toBe('manager_not_found');
      const self = await move('00200003', '00200003').expect(409);
      expect(self.body.error).toBe('manager_cycle');
      const below = await move('00200002', '00200004').expect(409);
      expect(below.body.error).toBe('manager_cycle');

      // UM moves directly under the GAD, so the FC below moves with it
      const moved = await move('00200003', '00200001').expect(200);
      expect(moved.body).toMatchObject({
        managerFixed: true,
        ancestors: ['00200001'],
        depth: 1,
      });
      expect(await getAgent(head, '00200004')).toMatchObject({
        ancestors: ['00200001', '00200003'],
        depth: 2,
      });

      const audit = await connection
        .collection('auditEvents')
        .find({ entity: 'agent', entityId: '00200003', action: 'UPDATE' })
        .toArray();
      expect(audit.at(-1)?.meta).toEqual({
        before: { managerCode: '00200002' },
        after: { managerCode: '00200001' },
      });
    });

    it('AGT-5 + test 12: later imports keep a manual link, with a warning', async () => {
      const head = await signIn(demoEmail(2, 'head'));
      const { id, sheet } = await commit(head, [
        agentRow('UM: 00200003-Trưởng nhóm 2', 'BM: 00200002-Trưởng ban 2'),
      ]);
      expect(sheet.warnings).toBe(1);
      expect((await errorsOf(head, id))[0]).toMatchObject({
        code: 'manager_fixed_kept',
        severity: 'warning',
      });
      expect(await getAgent(head, '00200003')).toMatchObject({
        managerCode: '00200001',
        managerFixed: true,
      });
    });

    it('platform staff have no tree of their own', async () => {
      const admin = await signIn(
        process.env.PLATFORM_ADMIN_EMAIL!,
        process.env.PLATFORM_ADMIN_PASSWORD!,
      );
      await admin.get(`${API}/agents/tree`).expect(403);
      await admin.get(`${API}/imports`).expect(403);
      await admin.get(`${API}/imports/templates/SUCCESS.xlsx`).expect(403);
    });
  });

  describe('template', () => {
    const download = async (agent: Agent) => {
      const res = await agent
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
      return { workbook, res };
    };

    it('IMP-11: is a real workbook with instructions, lookups and text columns', async () => {
      const head = await signIn(demoEmail(1, 'head'));
      const { workbook, res } = await download(head);
      expect(res.get('Content-Type')).toContain('spreadsheetml');
      expect(res.get('Content-Disposition')).toContain('.xlsx');
      expect(workbook.worksheets.map((sheet) => sheet.name)).toEqual([
        '00_README',
        SHEET,
        '02_Clients',
        '03_Policies',
        '04_Policy_Products',
        '05_Applications',
        '07_Activities',
        '12_Lookups',
      ]);

      const sheet = workbook.getWorksheet(SHEET)!;
      expect((sheet.getRow(1).values as string[]).slice(1)).toEqual(HEADERS);
      // IMP-6: text format is what keeps leading zeros when people type into the file
      expect(sheet.getCell('A50').numFmt).toBe('@');
      expect(sheet.getCell('E2').dataValidation?.type).toBe('list');
      expect(sheet.getCell('E2').dataValidation?.formulae?.[0]).toContain(
        '12_Lookups',
      );
      expect(workbook.getWorksheet('12_Lookups')!.getCell('A2').value).toBe(
        ACTIVE,
      );
      const readme = JSON.stringify(
        workbook.getWorksheet('00_README')!.getSheetValues(),
      );
      for (const header of HEADERS) expect(readme).toContain(header);
    });

    it('test 28: the template as downloaded imports with no errors', async () => {
      const head = await signIn(demoEmail(2, 'head'));
      const { workbook } = await download(head);
      const sheet = workbook.getWorksheet(SHEET)!;
      const rows: Cell[][] = [];
      sheet.eachRow((row, number) => {
        if (number === 1) return;
        rows.push(
          HEADERS.map((_, index) => {
            const value = row.getCell(index + 1).value;
            return value === null ? '' : (value as string);
          }),
        );
      });
      expect(rows.length).toBe(3);

      const { id, preview, sheet: counts } = await staged(head, rows);
      expect(preview.errorsTotal).toBe(0);
      expect(preview.warningsTotal).toBe(0);
      expect(counts).toMatchObject({ found: 3, inserted: 3, rejected: 0 });
      await head.post(`${API}/imports/${id}/commit`).expect(200);
      expect(await getAgent(head, '9000001')).toMatchObject({
        ancestors: ['9000000', '9000002'],
        name: 'Nguyễn Thị A',
        rank: 'FC',
        status: ACTIVE,
        startDate: '2024-02-01',
        dob: '1990-01-15',
      });
    });

    it('is refused to anyone without imports.upload', async () => {
      const head = await signIn(demoEmail(1, 'head'));
      const { grants } = (await head.get(`${API}/permissions`).expect(200))
        .body;
      const withoutUpload = {
        ...grants,
        FC: grants.FC.filter((item: string) => item !== 'imports.upload'),
      };
      await head
        .put(`${API}/permissions`)
        .send({ grants: withoutUpload })
        .expect(204);
      const fc = await signIn(demoEmail(1, 'fc'));
      await fc.get(`${API}/imports/templates/SUCCESS.xlsx`).expect(403);
      await fc.post(`${API}/imports`).send({}).expect(403);
      await fc.get(`${API}/imports`).expect(403);
      await head.put(`${API}/permissions`).send({ grants }).expect(204);
    });

    it('answers 404 for any other template name', async () => {
      const head = await signIn(demoEmail(1, 'head'));
      await head.get(`${API}/imports/templates/OTHER.xlsx`).expect(404);
    });
  });

  describe('import flow', () => {
    it('IMP-2: nothing reaches the tree before the uploader confirms', async () => {
      const head = await signIn(demoEmail(1, 'head'));
      const { id, sheet, preview } = await staged(head, [
        agentRow('FC: 00100200-Mới Một', 'UM: 00100003-Trưởng nhóm 1'),
      ]);
      expect(preview.status).toBe('VALIDATED');
      expect(sheet).toMatchObject({ found: 1, inserted: 1 });
      await head.get(`${API}/agents/00100200`).expect(404);

      await head.post(`${API}/imports/${id}/commit`).expect(200);
      expect(await getAgent(head, '00100200')).toMatchObject({
        depth: 3,
        managerFixed: false,
      });
    });

    it('IMP-3: commit clears staging, writes the audit event, and runs only once', async () => {
      const head = await signIn(demoEmail(1, 'head'));
      const { id, result } = await commit(head, [
        agentRow('FC: 00100201-Mới Hai', 'UM: 00100003-Trưởng nhóm 1'),
      ]);
      expect(result.status).toBe('COMMITTED');
      expect(result.committedAt).toEqual(expect.any(String));

      const staging = await connection.collection('importRows').countDocuments({
        importId: id,
      });
      expect(staging).toBe(0);

      const event = await connection
        .collection('auditEvents')
        .findOne({ action: 'IMPORT', entityId: id });
      expect(event?.meta).toMatchObject({ inserted: 1, kind: 'SUCCESS' });

      const again = await head.post(`${API}/imports/${id}/commit`).expect(409);
      expect(again.body.error).toBe('import_not_validated');
      const moreRows = await head
        .post(`${API}/imports/${id}/rows`)
        .send({ sheet: SHEET, rows: [] })
        .expect(409);
      expect(moreRows.body.error).toBe('import_not_open');
      await head.post(`${API}/imports/${id}/validate`).expect(409);
    });

    it('commits only once even when confirmed twice at the same moment', async () => {
      const head = await signIn(demoEmail(1, 'head'));
      const { id } = await staged(head, [agentRow('FC: 00100210-Bấm Hai Lần')]);
      const results = await Promise.all([
        head.post(`${API}/imports/${id}/commit`),
        head.post(`${API}/imports/${id}/commit`),
      ]);
      expect(results.map((res) => res.status).sort((a, b) => a - b)).toEqual([
        200, 409,
      ]);
      const count = await connection
        .collection('agents')
        .countDocuments({ agentCode: '00100210' });
      expect(count).toBe(1);
    });

    it('commit needs validation first', async () => {
      const head = await signIn(demoEmail(1, 'head'));
      const { id } = await startImport(head);
      const res = await head.post(`${API}/imports/${id}/commit`).expect(409);
      expect(res.body.error).toBe('import_not_validated');
    });

    it('IMP-2: a new import cancels the previous open one and removes its staging', async () => {
      const head = await signIn(demoEmail(1, 'head'));
      const { id: first } = await staged(head, [agentRow('FC: 00100220-Cũ')]);
      await startImport(head);
      const old = await head.get(`${API}/imports/${first}`).expect(200);
      expect(old.body.status).toBe('FAILED');
      const res = await head.post(`${API}/imports/${first}/commit`).expect(409);
      expect(res.body.error).toBe('import_not_validated');
      await head.get(`${API}/agents/00100220`).expect(404);
    });

    it('a new import from someone else leaves my open import alone', async () => {
      const head = await signIn(demoEmail(1, 'head'));
      const admin = await signIn(demoEmail(1, 'admin'));
      const { id } = await staged(head, [agentRow('FC: 00100225-Của Chủ GA')]);
      await startImport(admin);
      await head.post(`${API}/imports/${id}/commit`).expect(200);
    });

    it('cancel discards the rows; a closed import cannot be cancelled', async () => {
      const head = await signIn(demoEmail(1, 'head'));
      const { id } = await staged(head, [agentRow('FC: 00100230-Hủy')]);
      await head.post(`${API}/imports/${id}/cancel`).expect(204);
      await head.get(`${API}/agents/00100230`).expect(404);
      const res = await head.post(`${API}/imports/${id}/cancel`).expect(409);
      expect(res.body.error).toBe('import_not_open');
      await head.post(`${API}/imports/${id}/commit`).expect(409);
    });

    it('test 12: creates managers from the reference, builds ancestors, keeps zeros', async () => {
      const head = await signIn(demoEmail(1, 'head'));
      const { sheet } = await commit(head, [
        agentRow('FC: 0010030-Nhân Viên', 'UM: 0010031-Trưởng Mới'),
        agentRow('UM: 0010031-Trưởng Mới', 'BM: 0010032-Chỉ Ở Cột Quản Lý'),
        agentRow('FC: 0010033-Quản Lý Chưa Có', 'BM: 0010039-Cũng Chưa Có'),
      ]);
      expect(sheet).toMatchObject({ inserted: 5, managersCreated: 2 });
      expect(await getAgent(head, '0010030')).toMatchObject({
        ancestors: ['0010032', '0010031'],
        depth: 2,
      });
      expect(await getAgent(head, '0010032')).toMatchObject({
        name: 'Chỉ Ở Cột Quản Lý',
        rank: 'BM',
        status: ACTIVE,
        depth: 0,
      });
    });

    it('test 12: a manager arriving in a later import joins the branches waiting for them', async () => {
      const head = await signIn(demoEmail(1, 'head'));
      const moved = await head
        .patch(`${API}/agents/0010039`)
        .send({ status: 'Ngưng hoạt động' })
        .expect(200);
      expect(moved.body.status).toBe('Ngưng hoạt động');

      await commit(head, [
        agentRow('BM: 0010039-Cũng Chưa Có', 'SUM: 0010040-Cấp Trên', {
          status: ACTIVE,
        }),
      ]);
      expect(await getAgent(head, '0010033')).toMatchObject({
        ancestors: ['0010040', '0010039'],
      });
    });

    it('test 12: splits a cycle, warns about it, and keeps the rest of the file', async () => {
      const head = await signIn(demoEmail(1, 'head'));
      const { id, sheet } = await commit(head, [
        agentRow('FC: 00100300-Vòng A', 'FC: 00100301-Vòng B'),
        agentRow('FC: 00100301-Vòng B', 'FC: 00100300-Vòng A'),
        agentRow('FC: 00100302-Dưới Vòng', 'FC: 00100300-Vòng A'),
      ]);
      expect(sheet).toMatchObject({ inserted: 3, rejected: 0, warnings: 2 });
      const warnings = await errorsOf(head, id);
      expect(warnings.map((item) => item.code)).toEqual([
        'manager_cycle_split',
        'manager_cycle_split',
      ]);
      expect(await getAgent(head, '00100300')).toMatchObject({
        depth: 0,
        managerCode: '00100301',
      });
      expect(await getAgent(head, '00100302')).toMatchObject({
        ancestors: ['00100300'],
      });
    });

    it('IMP-21: logs only fields that really changed, and skips unchanged rows', async () => {
      const head = await signIn(demoEmail(1, 'head'));
      const row = agentRow(
        'FC: 00100400-Theo Dõi',
        'UM: 00100003-Trưởng nhóm 1',
        {
          phone: '0900000400',
        },
      );
      await commit(head, [row]);

      const unchanged = await commit(head, [row]);
      expect(unchanged.sheet).toMatchObject({ skipped: 1, updated: 0 });

      const { id, sheet } = await commit(head, [
        agentRow('FC: 00100400-Theo Dõi', 'UM: 00100003-Trưởng nhóm 1', {
          phone: '0900000401',
        }),
      ]);
      expect(sheet).toMatchObject({ updated: 1 });
      const changes = await connection
        .collection('recordChanges')
        .find({ entityKey: '00100400' })
        .toArray();
      expect(
        changes.map(({ field, oldValue, newValue, importId }) => ({
          field,
          oldValue,
          newValue,
          importId: importId.toString(),
        })),
      ).toEqual([
        {
          field: 'phone',
          oldValue: '0900000400',
          newValue: '0900000401',
          importId: id,
        },
      ]);
    });

    it('IMP-5: a file without an optional column leaves that value alone', async () => {
      const head = await signIn(demoEmail(1, 'head'));
      await commit(head, [
        agentRow('FC: 00100410-Giữ Dữ Liệu', '', { phone: '0900000410' }),
      ]);
      const { id, sheets } = await startImport(head, [
        {
          name: SHEET,
          headers: [
            'Tư vấn tài chính',
            'Quản lý',
            'Trạng thái',
            'Ngày bắt đầu hoạt động',
          ],
        },
      ]);
      expect(sheets[0].fields).toEqual([
        'agent',
        'manager',
        'status',
        'startDate',
      ]);
      await sendRows(head, id, [
        ['FC: 00100410-Tên Mới', '', ACTIVE, '01/01/2024'],
      ]);
      await head.post(`${API}/imports/${id}/validate`).expect(200);
      await head.post(`${API}/imports/${id}/commit`).expect(200);
      expect(await getAgent(head, '00100410')).toMatchObject({
        name: 'Tên Mới',
        phone: '0900000410',
      });
    });

    it('section 20.5: refuses bad rows one by one and still imports the good ones', async () => {
      const head = await signIn(demoEmail(1, 'head'));
      const { id, sheet, preview } = await staged(head, [
        agentRow('FC: 00100500-Tốt'),
        agentRow('9000001'),
        agentRow('FC: 00100501-Sai Ngày', '', { start: '31/02/2024' }),
        agentRow('FC: 00100502-Sai Trạng Thái', '', { status: 'Nghỉ' }),
        agentRow(''),
        agentRow('FC: 00100503-Tự Quản', 'FC: 00100503-Tự Quản'),
        agentRow('FC: 00100500-Trùng'),
      ]);
      expect(sheet).toMatchObject({ found: 7, inserted: 1, rejected: 6 });
      expect(preview.errorsTotal).toBe(6);

      const errors = await errorsOf(head, id);
      expect(errors.map(({ row, code }) => [row, code])).toEqual([
        [3, 'invalid_agent_ref'],
        [4, 'invalid_date'],
        [5, 'invalid_list'],
        [6, 'required'],
        [7, 'self_manager'],
        [8, 'duplicate_key'],
      ]);
      // IMP-10: sheet, row, column, the key as written, and the reason in Vietnamese
      expect(errors[0]).toMatchObject({
        column: 'Tư vấn tài chính',
        recordKey: '9000001',
        severity: 'error',
      });
      expect(errors[0].messageVi).toContain('"9000001" sai định dạng');
      expect(errors[1].messageVi).toContain('Ngày "31/02/2024"');

      const done = await head.post(`${API}/imports/${id}/commit`).expect(200);
      expect(done.body.sheets[0]).toMatchObject({ inserted: 1, rejected: 6 });
      await head.get(`${API}/agents/00100500`).expect(200);
      await head.get(`${API}/agents/00100501`).expect(404);
    });

    it('IMP-10: the report downloads with every problem, and file text stays plain text', async () => {
      const head = await signIn(demoEmail(1, 'head'));
      const { id } = await staged(head, [
        agentRow('=HYPERLINK("http://evil.example","bấm")'),
      ]);
      const res = await head
        .get(`${API}/imports/${id}/report.xlsx`)
        .buffer(true)
        .parse((response, callback) => {
          const chunks: Buffer[] = [];
          response.on('data', (chunk: Buffer) => chunks.push(chunk));
          response.on('end', () => callback(null, Buffer.concat(chunks)));
        })
        .expect(200);
      const workbook = new ExcelJS.Workbook();
      await workbook.xlsx.load(res.body as never);
      const sheet = workbook.worksheets[0];
      expect(sheet.getCell('A2').value).toBe(SHEET);
      expect(sheet.getCell('B2').value).toBe(2);
      // A formula from the file must come back as a string, never as a formula cell
      expect(sheet.getCell('D2').type).toBe(ExcelJS.ValueType.String);
      expect(sheet.getCell('D2').value).toContain('=HYPERLINK');
    });
  });

  describe('sheet plan', () => {
    it('IMP-4: a missing column blocks only its sheet, and says which', async () => {
      const head = await signIn(demoEmail(1, 'head'));
      const { id, sheets } = await startImport(head, [
        { name: SHEET, headers: ['Tư vấn tài chính', 'Quản lý'] },
        { name: '02_Clients', headers: ['Mã khách hàng'] },
        { name: '06_Production_Monthly', headers: ['z'] },
        { name: '12_Lookups', headers: ['x'] },
        { name: 'Sheet1', headers: ['y'] },
      ]);
      expect(sheets.map(({ name, status }) => [name, status])).toEqual([
        [SHEET, 'BLOCKED'],
        ['02_Clients', 'BLOCKED'],
        ['06_Production_Monthly', 'LATER'],
        ['12_Lookups', 'IGNORED'],
        ['Sheet1', 'IGNORED'],
      ]);
      expect(sheets[1]).toMatchObject({ missingRequired: ['Bên Mua BH'] });
      expect(sheets[0]).toMatchObject({
        reason: 'missing_required_column',
        missingRequired: ['Trạng thái', 'Ngày bắt đầu hoạt động'],
      });
      const errors = await errorsOf(head, id);
      expect(errors.map((item) => item.code)).toEqual([
        'missing_required_column',
        'missing_required_column',
        'missing_required_column',
      ]);
      expect(errors[0].messageVi).toContain('"Trạng thái"');

      const refused = await head
        .post(`${API}/imports/${id}/rows`)
        .send({ sheet: SHEET, rows: [{ r: 2, c: [] }] })
        .expect(409);
      expect(refused.body.error).toBe('sheet_not_ready');
      await head
        .post(`${API}/imports/${id}/rows`)
        .send({ sheet: '02_Clients', rows: [{ r: 2, c: [] }] })
        .expect(409);
    });

    it('test 29: banned columns are reported and never mapped to a field', async () => {
      const head = await signIn(demoEmail(1, 'head'));
      const { id, sheets } = await startImport(head, [
        {
          name: SHEET,
          headers: ['Số CCCD', ...HEADERS, 'Tài khoản ngân hàng'],
        },
      ]);
      expect(sheets[0].status).toBe('READY');
      expect(sheets[0].banned).toEqual(['Số CCCD', 'Tài khoản ngân hàng']);
      expect(sheets[0].present[0]).toBe(1);
      expect(sheets[0].present).not.toContain(0);
      const errors = await errorsOf(head, id);
      expect(errors[0]).toMatchObject({
        row: 1,
        code: 'banned_column',
        severity: 'error',
      });
    });

    it('accepts headers in any order, case and spacing', async () => {
      const head = await signIn(demoEmail(1, 'head'));
      const { id, sheets } = await startImport(head, [
        {
          name: '01_agents',
          headers: [
            '  NGÀY BẮT ĐẦU  HOẠT ĐỘNG',
            'trạng thái',
            'tư vấn tài chính',
            'QUẢN LÝ',
          ],
        },
      ]);
      expect(sheets[0].name).toBe(SHEET);
      expect(sheets[0].status).toBe('READY');
      await sendRows(head, id, [
        ['05/05/2024', ACTIVE, 'FC: 00100600-Đảo Cột', ''],
      ]);
      await head.post(`${API}/imports/${id}/validate`).expect(200);
      await head.post(`${API}/imports/${id}/commit`).expect(200);
      expect((await getAgent(head, '00100600')).startDate).toBe('2024-05-05');
    });

    it('AGT-4: someone with no code and no tree permission cannot import this sheet', async () => {
      // Admin has no agent code; the GA takes the tree permission away from the role for a moment
      const head = await signIn(demoEmail(1, 'head'));
      const { grants } = (await head.get(`${API}/permissions`).expect(200))
        .body as { grants: Record<string, string[]> };
      await head
        .put(`${API}/permissions`)
        .send({
          grants: {
            ...grants,
            ADMIN: grants.ADMIN.filter(
              (permission) => permission !== 'imports.agent_tree',
            ),
          },
        })
        .expect(204);
      try {
        const admin = await signIn(demoEmail(1, 'admin'));
        const { id, sheets } = await startImport(admin);
        expect(sheets[0]).toMatchObject({
          status: 'BLOCKED',
          reason: 'sheet_not_allowed',
        });
        await admin
          .post(`${API}/imports/${id}/rows`)
          .send({ sheet: SHEET, rows: [] })
          .expect(409);
      } finally {
        await head.put(`${API}/permissions`).send({ grants }).expect(204);
      }
    });
  });

  describe('limits', () => {
    it('section 17.10: a full chunk of 500 rows fits; 501 rows or oversized cells do not', async () => {
      const head = await signIn(demoEmail(1, 'head'));
      const { id } = await startImport(head);
      const longRow = agentRow(`FC: 1-${'Tên rất dài '.repeat(30)}`);
      await sendRows(
        head,
        id,
        Array.from({ length: 500 }, (_, index) =>
          agentRow(`FC: ${70000 + index}-Đại lý ${index}`),
        ),
      );
      await head
        .post(`${API}/imports/${id}/rows`)
        .send({
          sheet: SHEET,
          rows: Array.from({ length: 501 }, (_, index) => ({
            r: index + 2,
            c: longRow,
          })),
        })
        .expect(400);

      const badCells: unknown[] = [
        ['x'.repeat(4002)],
        [{ $ne: 1 }],
        [true],
        Array(41).fill('x'),
        'không phải mảng',
      ];
      for (const c of badCells) {
        await head
          .post(`${API}/imports/${id}/rows`)
          .send({ sheet: SHEET, rows: [{ r: 2, c }] })
          .expect(400);
      }
      await head
        .post(`${API}/imports/${id}/rows`)
        .send({ sheet: SHEET, rows: [{ r: 0, c: [] }] })
        .expect(400);
      await head.post(`${API}/imports/${id}/cancel`).expect(204);
    });

    it('section 17.10: the 4 MB body is read only with a session cookie and never inflated, so strangers cannot block the API', async () => {
      const rows = {
        sheet: SHEET,
        rows: Array.from({ length: 3000 }, (_, index) => ({
          r: index + 2,
          c: agentRow(`FC: ${80000 + index}-Đại lý ${index}`),
        })),
      };
      const plain = Buffer.from(JSON.stringify(rows));
      const packed = gzipSync(plain);
      expect(plain.length).toBeGreaterThan(200_000);
      const post = (agent: Agent, body: Buffer) =>
        agent
          .post(`${API}/imports/any/rows`)
          .set('Content-Type', 'application/json')
          .send(body);

      // Without a session the default 100 KB limit applies, packed or not
      await post(http(), plain).expect(413);
      // Inflating stops at 100 KB; the aborted stream reports 400 or 413
      const stranger = await post(http(), packed).set(
        'Content-Encoding',
        'gzip',
      );
      expect([400, 413]).toContain(stranger.status);
      // With one, a packed body is refused before it is inflated
      const head = await signIn(demoEmail(1, 'head'));
      await post(head, packed).set('Content-Encoding', 'gzip').expect(415);
    });

    it('IMP-13: stops at 20,000 rows', async () => {
      const head = await signIn(demoEmail(1, 'head'));
      const { id } = await startImport(head);
      await ownerDb().query(
        `UPDATE imports SET sheets = jsonb_set(sheets, '{0,found}', '20000') WHERE id = $1`,
        [id],
      );
      const res = await head
        .post(`${API}/imports/${id}/rows`)
        .send({ sheet: SHEET, rows: [{ r: 2, c: agentRow('FC: 1-A') }] })
        .expect(400);
      expect(res.body.error).toBe('import_too_large');
      await head.post(`${API}/imports/${id}/cancel`).expect(204);
    });

    it('IMP-13: a file of 2,000 rows validates and commits within 30 seconds', async () => {
      const head = await signIn(demoEmail(1, 'head'));
      const started = Date.now();
      const { id } = await startImport(head);
      const rows = Array.from({ length: 2000 }, (_, index) =>
        agentRow(
          `FC: ${800000 + index}-Đại lý ${index}`,
          index === 0
            ? ''
            : `FC: ${800000 + Math.floor((index - 1) / 5)}-Đại lý`,
        ),
      );
      for (let start = 0; start < rows.length; start += 500) {
        await sendRows(head, id, rows.slice(start, start + 500), start + 2);
      }
      await head.post(`${API}/imports/${id}/validate`).expect(200);
      // Open question I: from 2,000 rows the write runs in batches, in the background
      const claimed = await head.post(`${API}/imports/${id}/commit`).expect(200);
      expect(claimed.body.status).toBe('COMMITTING');
      await app.get(ImportsService).waitForCommit(id);
      const done = await head.get(`${API}/imports/${id}`).expect(200);
      expect(done.body.status).toBe('COMMITTED');
      expect(done.body.sheets[0]).toMatchObject({
        found: 2000,
        inserted: 2000,
        rejected: 0,
      });
      expect(Date.now() - started).toBeLessThan(30_000);
      expect((await getAgent(head, '800006')).depth).toBe(2);
    }, 60_000);
  });

  describe('who can do what', () => {
    it('test 29 + AGT-4: an agent updates their branch, and other rows are refused individually', async () => {
      const um = await signIn(demoEmail(1, 'um'));
      const { id, sheet } = await commit(um, [
        agentRow('UM: 00100003-Trưởng nhóm 1', 'BM: 00100002-Trưởng ban 1'),
        agentRow(
          'FC: 00100004-Tư vấn viên đã đổi tên',
          'UM: 00100003-Trưởng nhóm 1',
        ),
        agentRow('BM: 00100002-Không Được Sửa'),
        agentRow('UM: 00100090-Ngang Hàng'),
        agentRow('FC: 00100700-Không Được Thêm', 'UM: 00100003-Trưởng nhóm 1'),
      ]);
      expect(sheet).toMatchObject({
        updated: 1,
        skipped: 1,
        rejected: 3,
        inserted: 0,
      });
      const errors = await errorsOf(um, id);
      expect(errors.map((item) => item.code)).toEqual([
        'out_of_scope',
        'out_of_scope',
        'out_of_scope',
      ]);
      const head = await signIn(demoEmail(1, 'head'));
      expect((await getAgent(head, '00100004')).name).toBe(
        'Tư vấn viên đã đổi tên',
      );
      expect((await getAgent(head, '00100002')).name).toBe('Trưởng ban 1');
      await head.get(`${API}/agents/00100700`).expect(404);
    });

    it('AGT-4: an agent cannot move anyone, and is told so', async () => {
      const um = await signIn(demoEmail(1, 'um'));
      const { id } = await commit(um, [
        agentRow(
          'FC: 00100004-Tư vấn viên đã đổi tên',
          'BM: 00100002-Trưởng ban 1',
        ),
      ]);
      expect((await errorsOf(um, id))[0].code).toBe('manager_change_ignored');
      expect((await getAgent(um, '00100004')).managerCode).toBe('00100003');
    });

    it('AGT-4: an FC not on the tree yet can create only their own row once', async () => {
      const head = await signIn(demoEmail(1, 'head'));
      const invited = await head
        .post(`${API}/users/invite`)
        .send({
          email: 'new.fc@test.local',
          name: 'FC Mới',
          roles: ['FC'],
          agentCode: '00100800',
        })
        .expect(201);
      // Decided 26/11/2026: an invite by someone who edits the tree adds the FC to it. An account
      // made before that, or by someone without agents.edit_tree, is not on the tree yet.
      expect(invited.body.addedToTree).toBe(true);
      await ownerDb().query(`DELETE FROM agents WHERE agent_code = '00100800'`);
      const agent = request.agent(app.getHttpServer());
      await agent
        .post(`${API}/invites/accept`)
        .send({
          token: invited.body.inviteUrl.split('/invite/')[1],
          password: PASSWORD,
        })
        .expect(201);

      const { sheet } = await commit(agent, [
        agentRow('FC: 00100800-FC Mới', 'UM: 00100003-Trưởng nhóm 1'),
        agentRow('FC: 00100801-Người Khác'),
      ]);
      expect(sheet).toMatchObject({ inserted: 1, rejected: 1 });
      expect(await getAgent(agent, '00100800')).toMatchObject({
        managerCode: '00100003',
        depth: 3,
      });
    });

    it('section 17.10 + IMP-12: writing is for the owner; reading follows imports.view_all', async () => {
      const fc = await signIn(demoEmail(1, 'fc'));
      const um = await signIn(demoEmail(1, 'um'));
      const admin = await signIn(demoEmail(1, 'admin'));
      const { id } = await staged(fc, [
        agentRow(
          'FC: 00100004-Tư vấn viên đã đổi tên',
          'UM: 00100003-Trưởng nhóm 1',
        ),
      ]);

      // Another uploader in the GA cannot even see it
      await um.get(`${API}/imports/${id}`).expect(404);
      await um.get(`${API}/imports/${id}/errors`).expect(404);
      await um.post(`${API}/imports/${id}/commit`).expect(404);

      // imports.view_all may read, but not act for the uploader
      const seen = await admin.get(`${API}/imports/${id}`).expect(200);
      expect(seen.body.canCommit).toBe(false);
      expect(seen.body.userName).toBe('Tư vấn viên 1');
      await admin.post(`${API}/imports/${id}/commit`).expect(404);
      await admin.post(`${API}/imports/${id}/cancel`).expect(404);

      const mine = (await fc.get(`${API}/imports`).expect(200)).body;
      expect(mine.items[0].id).toBe(id);
      expect(
        mine.items.every(
          (item: { userId: string }) => item.userId === mine.items[0].userId,
        ),
      ).toBe(true);
      const all = (
        await admin.get(`${API}/imports`).query({ pageSize: 50 }).expect(200)
      ).body;
      expect(
        new Set(all.items.map((item: { userId: string }) => item.userId)).size,
      ).toBeGreaterThan(1);
      await fc.post(`${API}/imports/${id}/cancel`).expect(204);
    });

    it('TEN-7: GA-2 gets 404 for an import of GA-1, for reading and for writing', async () => {
      const head1 = await signIn(demoEmail(1, 'head'));
      const head2 = await signIn(demoEmail(2, 'head'));
      const { id } = await staged(head1, [agentRow('FC: 00100900-Riêng GA 1')]);

      await head2.get(`${API}/imports/${id}`).expect(404);
      await head2.get(`${API}/imports/${id}/errors`).expect(404);
      await head2.get(`${API}/imports/${id}/report.xlsx`).expect(404);
      await head2.post(`${API}/imports/${id}/commit`).expect(404);
      await head2.post(`${API}/imports/${id}/cancel`).expect(404);
      await head2
        .post(`${API}/imports/${id}/rows`)
        .send({ sheet: SHEET, rows: [] })
        .expect(404);
      const list = (
        await head2.get(`${API}/imports`).query({ pageSize: 50 }).expect(200)
      ).body;
      expect(list.items.map((item: { id: string }) => item.id)).not.toContain(
        id,
      );
      await head1.post(`${API}/imports/${id}/cancel`).expect(204);
    });

    it('TEN-1: the same agent code can exist in two GAs independently', async () => {
      const head1 = await signIn(demoEmail(1, 'head'));
      const head2 = await signIn(demoEmail(2, 'head'));
      await commit(head1, [agentRow('FC: 5550000-Tên Ở GA 1')]);
      await commit(head2, [agentRow('FC: 5550000-Tên Ở GA 2')]);
      expect((await getAgent(head1, '5550000')).name).toBe('Tên Ở GA 1');
      expect((await getAgent(head2, '5550000')).name).toBe('Tên Ở GA 2');
    });

    it('routes need a session and a valid id', async () => {
      await http().get(`${API}/agents/tree`).expect(401);
      await http().get(`${API}/imports`).expect(401);
      const head = await signIn(demoEmail(1, 'head'));
      await head.get(`${API}/imports/not-an-id`).expect(400);
      await head
        .post(`${API}/imports`)
        .send({
          fileName: 'a',
          snapshotDate: 'hôm nay',
          kind: 'SUCCESS',
          sheets: [],
        })
        .expect(400);
      await head
        .post(`${API}/imports`)
        .send({
          fileName: 'a',
          snapshotDate: '2026-11-06',
          kind: 'OTHER',
          sheets: [],
        })
        .expect(400);
    });
  });
});
