import type { INestApplication } from '@nestjs/common';
import request from 'supertest';
import { startApp, stopApp } from './support/app.js';
import { connection } from './support/collections.js';
import { demoEmail, seedDemoData } from '../src/seed/demo-data.js';

const API = '/api/v1';
const PASSWORD = 'demo-password-123';
const FC = '00100004';
type Agent = ReturnType<typeof request.agent>;
interface Option {
  id: string;
  kind: string;
  code: string;
  label: string;
  isOpportunity: boolean;
  isFinal: boolean;
  active: boolean;
  sortOrder: number;
  builtIn: boolean;
}

/** Section 5.3: the lead catalogue (OPT), with required scenarios 13-17 of section 23.2. */
describe('Lead catalogue (e2e)', () => {
  let app: INestApplication;
  let phoneCounter = 0;
  const nextPhone = () => `08${String(20000000 + ++phoneCounter).slice(-8)}`;

  const as = async (key: string, ga = 1) => {
    const agent = request.agent(app.getHttpServer());
    await agent
      .post(`${API}/auth/sign-in/email`)
      .send({ email: demoEmail(ga, key), password: PASSWORD })
      .expect(200);
    return agent;
  };
  const options = async (agent: Agent): Promise<Option[]> =>
    (await agent.get(`${API}/lead-options`).expect(200)).body.items;
  const find = async (agent: Agent, kind: string, code: string) =>
    (await options(agent)).find(
      (item) => item.kind === kind && item.code === code,
    )!;
  const add = (agent: Agent, body: Record<string, unknown>) =>
    agent.post(`${API}/lead-options`).send(body);
  const edit = (agent: Agent, id: string, body: Record<string, unknown>) =>
    agent.patch(`${API}/lead-options/${id}`).send(body);
  const newLead = async (agent: Agent, patch: Record<string, unknown> = {}) =>
    (
      await agent
        .post(`${API}/leads`)
        .send({
          fullName: 'Khách Danh Mục',
          phone: nextPhone(),
          source: 'Facebook',
          consent: false,
          ...patch,
        })
        .expect(201)
    ).body.id as string;
  const updateLead = (
    agent: Agent,
    id: string,
    body: Record<string, unknown>,
  ) => agent.patch(`${API}/leads/${id}`).send(body);
  const rawLead = (id: string) =>
    connection.collection('leads').findOne({ _id: id });

  let head: Agent;
  let admin: Agent;
  let fc: Agent;
  let marketing: Agent;

  beforeAll(async () => {
    app = await startApp();
    await seedDemoData(app, PASSWORD);
    head = await as('head');
    admin = await as('admin');
    fc = await as('fc');
    marketing = await as('marketing');
  });

  afterAll(async () => {
    await stopApp(app);
  });

  it('test 13 + OPT-2: every GA starts with the system values, readable by everyone (OPT-9)', async () => {
    const items = await options(fc);
    const codes = (kind: string) =>
      items.filter((item) => item.kind === kind).map((item) => item.code);
    expect(codes('interest')).toEqual([
      'NOT_REACHED',
      'UNDETERMINED',
      'NOT_INTERESTED',
      'LIFE',
      'HEALTH_CARD',
    ]);
    expect(codes('care_status')).toEqual([
      'CARING',
      'WON',
      'DROPPED',
      'NOT_INTERESTED',
    ]);
    expect(items.find((item) => item.code === 'LIFE')).toMatchObject({
      label: 'Quan tâm nhân thọ',
      isOpportunity: true,
      isFinal: true,
      builtIn: true,
      active: true,
    });
    expect(items.find((item) => item.code === 'UNDETERMINED')).toMatchObject({
      isOpportunity: false,
      isFinal: false,
    });
    // Concurrent first reads in another GA create each value once
    const other = await as('fc', 2);
    await Promise.all([options(other), options(other), options(other)]);
    expect(
      await connection.collection('leadOptions').countDocuments({
        tenantId: (await connection
          .collection('tenants')
          .findOne({ gaCode: 'GA-HCM' }))!._id,
        builtIn: true,
      }),
    ).toBe(9);
  });

  it('PERM-3: only GA_HEAD edits the catalogue; the API refuses everyone else', async () => {
    const life = await find(head, 'interest', 'LIFE');
    for (const agent of [admin, fc, marketing]) {
      await add(agent, { kind: 'interest', label: 'Thử' }).expect(403);
      await edit(agent, life.id, { label: 'Thử' }).expect(403);
      await agent.delete(`${API}/lead-options/${life.id}`).expect(403);
    }
  });

  it('test 13 + OPT-3 + OPT-12: a GA_HEAD adds a value, its code comes from the label, and leads can carry it', async () => {
    const created = (
      await add(head, {
        kind: 'interest',
        label: '  Quan tâm hưu trí ',
        isOpportunity: true,
      }).expect(201)
    ).body;
    expect(created).toMatchObject({
      kind: 'interest',
      code: 'QUAN_TAM_HUU_TRI',
      label: 'Quan tâm hưu trí',
      isOpportunity: true,
      isFinal: false,
      builtIn: false,
      active: true,
      sortOrder: 6,
    });
    const audit = await connection.collection('auditEvents').findOne({
      entity: 'lead_option',
      entityId: created.id,
      action: 'CREATE',
    });
    expect(audit?.meta).toMatchObject({ code: 'QUAN_TAM_HUU_TRI' });

    const id = await newLead(fc);
    await updateLead(fc, id, { interest: 'QUAN_TAM_HUU_TRI' }).expect(200);
    const lead = await rawLead(id);
    expect(lead?.interest).toBe('QUAN_TAM_HUU_TRI');
    // LEAD-13: an interest the GA added is a classification like any other
    expect(lead?.stage).toBe('CONTACTED');
    expect(lead?.firstContactAt).toBeInstanceOf(Date);

    // A source's code is its label, since files write sources as text
    const source = (
      await add(head, { kind: 'source', label: 'TikTok' }).expect(201)
    ).body;
    expect(source.code).toBe('TikTok');
    // Flags belong to interest only
    const care = (
      await add(head, {
        kind: 'care_status',
        label: 'Hẹn gọi lại',
        isFinal: true,
      }).expect(201)
    ).body;
    expect(care).toMatchObject({ code: 'HEN_GOI_LAI', isFinal: false });
  });

  it('OPT-4: labels that differ only in case or marks are the same value', async () => {
    await add(head, { kind: 'interest', label: 'Quan Tam Huu Tri' }).expect(
      409,
    );
    // A label that turns into a system code collides too
    expect(
      (await add(head, { kind: 'interest', label: 'life' }).expect(409)).body
        .error,
    ).toBe('option_exists');
    await add(head, { kind: 'source', label: 'tiktok' }).expect(409);
    await add(head, { kind: 'interest', label: '!!!' }).expect(400);
    await add(head, { kind: 'interest', label: 'x'.repeat(61) }).expect(400);
    await add(head, { kind: 'bogus', label: 'Thử' }).expect(400);

    const caring = await find(head, 'care_status', 'CARING');
    const renamed = await edit(head, caring.id, { label: 'chốt xịt' }).expect(
      409,
    );
    expect(renamed.body.error).toBe('option_exists');
  });

  it('test 15 + OPT-3: renaming changes the label only; leads keep their code', async () => {
    const id = await newLead(fc);
    await updateLead(fc, id, { interest: 'UNDETERMINED' }).expect(200);
    const option = await find(head, 'interest', 'UNDETERMINED');
    const { body } = await edit(head, option.id, {
      label: 'Cần gọi lại để hỏi',
    }).expect(200);
    expect(body).toMatchObject({
      code: 'UNDETERMINED',
      label: 'Cần gọi lại để hỏi',
    });
    expect((await rawLead(id))?.interest).toBe('UNDETERMINED');
    const audit = await connection.collection('auditEvents').findOne({
      entity: 'lead_option',
      entityId: option.id,
      action: 'UPDATE',
    });
    expect(audit?.meta.before.label).toBe('Chưa xác định');
    expect(audit?.meta.after.label).toBe('Cần gọi lại để hỏi');
  });

  it('test 15 + OPT-5: system values and values in use cannot be deleted, only hidden', async () => {
    const life = await find(head, 'interest', 'LIFE');
    expect(
      (await head.delete(`${API}/lead-options/${life.id}`).expect(409)).body
        .error,
    ).toBe('option_built_in');

    const used = (
      await add(head, { kind: 'interest', label: 'Quan tâm đầu tư' }).expect(
        201,
      )
    ).body;
    const id = await newLead(fc);
    await updateLead(fc, id, { interest: used.code }).expect(200);
    expect(
      (await head.delete(`${API}/lead-options/${used.id}`).expect(409)).body
        .error,
    ).toBe('option_in_use');

    const unused = (
      await add(head, { kind: 'care_status', label: 'Chờ duyệt' }).expect(201)
    ).body;
    await head.delete(`${API}/lead-options/${unused.id}`).expect(204);
    expect((await options(head)).some((item) => item.id === unused.id)).toBe(
      false,
    );
    expect(
      await connection.collection('auditEvents').countDocuments({
        entity: 'lead_option',
        entityId: unused.id,
        action: 'DELETE',
      }),
    ).toBe(1);
  });

  it('test 14 + OPT-8 + LEAD-15: unknown and hidden values are refused; a hidden value a lead carries stays valid', async () => {
    const id = await newLead(fc);
    expect(
      (await updateLead(fc, id, { interest: 'BOGUS' }).expect(400)).body.error,
    ).toBe('unknown_option');
    expect(
      (await updateLead(fc, id, { careStatus: 'BOGUS' }).expect(400)).body
        .error,
    ).toBe('unknown_option');

    await updateLead(fc, id, { careStatus: 'CARING' }).expect(200);
    const caring = await find(head, 'care_status', 'CARING');
    await edit(head, caring.id, { active: false }).expect(200);
    try {
      // Editing another field of a lead that carries the hidden value works
      await updateLead(fc, id, { province: 'Hà Nội' }).expect(200);
      await updateLead(fc, id, { careStatus: 'CARING' }).expect(200);
      // But nobody can choose it again
      const other = await newLead(fc);
      expect(
        (await updateLead(fc, other, { careStatus: 'CARING' }).expect(400)).body
          .error,
      ).toBe('unknown_option');
      // The hidden value still shows with its label
      expect(await find(fc, 'care_status', 'CARING')).toMatchObject({
        label: 'Đang chăm sóc',
        active: false,
      });
    } finally {
      await edit(head, caring.id, { active: true }).expect(200);
    }
  });

  it('test 16 + OPT-7: a care status the GA added is only a label and never moves the stage', async () => {
    const id = await newLead(fc);
    await updateLead(fc, id, { careStatus: 'HEN_GOI_LAI' }).expect(200);
    let lead = await rawLead(id);
    expect(lead?.careStatus).toBe('HEN_GOI_LAI');
    expect(lead?.stage).toBe('NEW');

    // From a closed lead, a GA label does not reopen it either
    await updateLead(fc, id, {
      careStatus: 'DROPPED',
      lostReason: 'Đã mua bên khác',
    }).expect(200);
    expect((await rawLead(id))?.stage).toBe('LOST');
    await updateLead(fc, id, { careStatus: 'HEN_GOI_LAI' }).expect(200);
    lead = await rawLead(id);
    expect(lead?.stage).toBe('LOST');
    expect(lead?.careStatus).toBe('HEN_GOI_LAI');
  });

  it('test 16 + OPT-6 + LEAD-14: the lock follows the flag of each interest value', async () => {
    const locked = (
      await add(head, {
        kind: 'interest',
        label: 'Đã mua nơi khác',
        isFinal: true,
      }).expect(201)
    ).body;
    const id = await newLead(fc);
    await updateLead(fc, id, { interest: locked.code }).expect(200);
    expect(
      (await fc.get(`${API}/leads/${id}`).expect(200)).body.interestLocked,
    ).toBe(true);
    expect(
      (await updateLead(fc, id, { interest: 'LIFE' }).expect(409)).body.error,
    ).toBe('interest_locked');
    // A lead manager may still change it
    await updateLead(marketing, id, { interest: 'UNDETERMINED' }).expect(200);

    // Clearing the flag on a system value opens it for agents
    const life = await find(head, 'interest', 'LIFE');
    await edit(head, life.id, { isFinal: false }).expect(200);
    try {
      const open = await newLead(fc);
      await updateLead(fc, open, { interest: 'LIFE' }).expect(200);
      await updateLead(fc, open, { interest: 'NOT_REACHED' }).expect(200);
    } finally {
      await edit(head, life.id, { isFinal: true }).expect(200);
    }
  });

  it('OPT-13: a known source keeps its catalogue spelling; a hidden one is refused; a new one joins', async () => {
    const id = await newLead(marketing, { source: 'tiktok' });
    expect((await rawLead(id))?.source).toBe('TikTok');

    const tiktok = await find(head, 'source', 'TikTok');
    await edit(head, tiktok.id, { active: false }).expect(200);
    const hidden = await marketing
      .post(`${API}/leads`)
      .send({
        fullName: 'A',
        phone: nextPhone(),
        source: 'TikTok',
        consent: false,
      })
      .expect(400);
    expect(hidden.body.error).toBe('unknown_option');

    await newLead(marketing, { source: 'Hội chợ' });
    expect(await find(head, 'source', 'Hội chợ')).toMatchObject({
      active: true,
      builtIn: false,
    });
  });

  it('test 17 + IMP-25 + OPT-10: a lead file may use labels the GA renamed or added; its new sources join the catalogue', async () => {
    const HEADERS = [
      'SỐ ĐIỆN THOẠI',
      'TÊN KHÁCH HÀNG',
      'Nguồn',
      'Mã đại lý',
      'Tình Trạng TVV',
      'Trạng Thái Hiện Tại TVV',
    ];
    const renamed = nextPhone();
    const added = nextPhone();
    const synonym = nextPhone();
    const unknown = nextPhone();
    const rows = [
      [renamed, 'Khách Đổi Tên', 'Facebook', FC, 'cần gọi lại để hỏi', null],
      [
        added,
        'Khách Tự Thêm',
        'Triển lãm',
        FC,
        'Quan tâm hưu trí',
        'Hẹn gọi lại',
      ],
      [synonym, 'Khách Từ Đồng Nghĩa', 'facebook', FC, 'Knm', 'Dừng chăm sóc'],
      [unknown, 'Khách Lạ', 'Facebook', FC, 'Quan tâm vũ trụ', null],
    ];
    const { id } = (
      await marketing
        .post(`${API}/imports`)
        .send({
          fileName: 'danh-muc.xlsx',
          snapshotDate: '2026-11-09',
          kind: 'LEADS',
          sheets: [{ name: 'Lead', headers: HEADERS }],
        })
        .expect(201)
    ).body;
    await marketing
      .post(`${API}/imports/${id}/rows`)
      .send({ sheet: 'Lead', rows: rows.map((c, i) => ({ r: i + 2, c })) })
      .expect(200);
    await marketing.post(`${API}/imports/${id}/validate`).expect(200);
    await marketing.post(`${API}/imports/${id}/commit`).expect(200);

    const byPhone = (phone: string) =>
      connection.collection('leads').findOne({ phone });
    expect(await byPhone(renamed)).toMatchObject({ interest: 'UNDETERMINED' });
    expect(await byPhone(added)).toMatchObject({
      interest: 'QUAN_TAM_HUU_TRI',
      careStatus: 'HEN_GOI_LAI',
      source: 'Triển lãm',
    });
    // The system synonyms still work, and the source keeps the catalogue's spelling
    expect(await byPhone(synonym)).toMatchObject({
      interest: 'NOT_REACHED',
      careStatus: 'DROPPED',
      source: 'Facebook',
    });
    expect(await byPhone(unknown)).toBeNull();
    const problems = (
      await marketing
        .get(`${API}/imports/${id}/errors`)
        .query({ pageSize: 50 })
        .expect(200)
    ).body.items as { row: number; code: string }[];
    expect(problems).toContainEqual(
      expect.objectContaining({ row: 5, code: 'invalid_list' }),
    );
    expect(await find(head, 'source', 'Triển lãm')).toMatchObject({
      active: true,
    });
  });

  it('test 15 + TEN-7: GA-2 has its own catalogue and gets 404 for GA-1 values', async () => {
    const head2 = await as('head', 2);
    const ga1Value = await find(head, 'interest', 'QUAN_TAM_HUU_TRI');
    const ga2 = await options(head2);
    expect(ga2.some((item) => item.code === 'QUAN_TAM_HUU_TRI')).toBe(false);
    expect(ga2.find((item) => item.code === 'UNDETERMINED')?.label).toBe(
      'Chưa xác định',
    );
    await edit(head2, ga1Value.id, { label: 'Chiếm' }).expect(404);
    await head2.delete(`${API}/lead-options/${ga1Value.id}`).expect(404);

    // A GA-2 lead cannot take a value only GA-1 has
    const fc2 = await as('fc', 2);
    const id = await newLead(fc2);
    expect(
      (await updateLead(fc2, id, { interest: 'QUAN_TAM_HUU_TRI' }).expect(400))
        .body.error,
    ).toBe('unknown_option');
  });

  it('a platform admin has no tenant catalogue', async () => {
    const platform = request.agent(app.getHttpServer());
    await platform
      .post(`${API}/auth/sign-in/email`)
      .send({
        email: process.env.PLATFORM_ADMIN_EMAIL,
        password: process.env.PLATFORM_ADMIN_PASSWORD,
      })
      .expect(200);
    await platform.get(`${API}/lead-options`).expect(403);
  });
});
