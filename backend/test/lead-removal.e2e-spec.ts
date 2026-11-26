import type { INestApplication } from '@nestjs/common';
import request from 'supertest';
import { startApp, stopApp } from './support/app.js';
import { connection } from './support/collections.js';
import { LeadRemovalService } from '../src/modules/leads/lead-removal.service.js';
import { demoEmail, seedDemoData } from '../src/seed/demo-data.js';

const API = '/api/v1';
const PASSWORD = 'demo-password-123';
const FC = '00100004';
type Agent = ReturnType<typeof request.agent>;

/** LEAD-40, LEAD-41, PDP-6: deleting, restoring, erasing and merging leads (slice 3b). */
describe('Deleting and merging leads (e2e)', () => {
  let app: INestApplication;
  let head: Agent;
  let fc: Agent;
  let head2: Agent;
  let tenantId: string;

  const as = async (key: string, ga = 1) => {
    const agent = request.agent(app.getHttpServer());
    await agent
      .post(`${API}/auth/sign-in/email`)
      .send({ email: demoEmail(ga, key), password: PASSWORD })
      .expect(200);
    return agent;
  };
  const create = async (fullName: string, phone: string) =>
    (
      await head
        .post(`${API}/leads`)
        .send({
          fullName,
          phone,
          source: 'Facebook',
          consent: true,
          assignedAgentCode: FC,
        })
        .expect(201)
    ).body.id as string;
  const raw = (id: string) =>
    connection.collection('leads').findOne({ _id: id });
  const tasksOf = (id: string) =>
    connection.collection('tasks').find({ leadId: id }).toArray();

  beforeAll(async () => {
    app = await startApp();
    await seedDemoData(app, PASSWORD);
    [head, fc, head2] = await Promise.all([
      as('head'),
      as('fc'),
      as('head', 2),
    ]);
    tenantId = String((await head.get(`${API}/me`).expect(200)).body.tenant.id);
  });

  afterAll(async () => {
    await stopApp(app);
  });

  it('LEAD-40: a soft-deleted lead leaves every list and comes back with its tasks', async () => {
    const id = await create('Lead Tạo Nhầm', '0936000001');
    const before = (await head.get(`${API}/leads/counts`).expect(200)).body
      .all as number;
    await fc
      .delete(`${API}/leads/${id}`)
      .send({ reason: 'x', mode: 'SOFT' })
      .expect(403);
    await head
      .delete(`${API}/leads/${id}`)
      .send({ reason: 'Tạo nhầm', mode: 'OTHER' })
      .expect(400);
    await head
      .delete(`${API}/leads/${id}`)
      .send({ reason: 'Tạo nhầm', mode: 'SOFT' })
      .expect(204);

    await head.get(`${API}/leads/${id}`).expect(404);
    await fc.get(`${API}/leads/${id}`).expect(404);
    expect((await head.get(`${API}/leads/counts`).expect(200)).body.all).toBe(
      before - 1,
    );
    expect((await tasksOf(id)).map((task) => task.status)).toEqual([
      'CANCELLED',
    ]);
    const bin = (await head.get(`${API}/leads/deleted`).expect(200)).body;
    expect(bin.items[0]).toMatchObject({
      id,
      fullName: 'Lead Tạo Nhầm',
      phone: '0936000001',
      reason: 'Tạo nhầm',
      deletedBy: 'Giám đốc điều hành 1',
      mergedInto: null,
    });
    await fc.get(`${API}/leads/deleted`).expect(403);

    await head.post(`${API}/leads/${id}/restore`).expect(204);
    const back = (await fc.get(`${API}/leads/${id}`).expect(200)).body;
    expect(back.lead.phone).toBe('0936000001');
    expect((await tasksOf(id)).map((task) => task.status)).toEqual(['OPEN']);
    expect(
      await connection
        .collection('auditEvents')
        .countDocuments({ entity: 'lead', entityId: id, action: 'DELETE' }),
    ).toBe(1);
  });

  it('LEAD-40: the number is free while the lead is in the bin; restoring then needs it back', async () => {
    const id = await create('Lead Giữ Số', '0936000002');
    await head
      .delete(`${API}/leads/${id}`)
      .send({ reason: 'Tạo nhầm', mode: 'SOFT' })
      .expect(204);
    const other = await create('Lead Mới Cùng Số', '0936000002');
    const { body } = await head.post(`${API}/leads/${id}/restore`).expect(409);
    expect(body.error).toBe('phone_exists');
    // TEN-7
    await head2.post(`${API}/leads/${id}/restore`).expect(404);
    await head2
      .delete(`${API}/leads/${other}`)
      .send({ reason: 'x', mode: 'SOFT' })
      .expect(404);
  });

  it('LEAD-40: after 30 days a lead cannot come back, and the purge removes it with its notes', async () => {
    const id = await create('Lead Quá Hạn', '0936000003');
    await fc
      .post(`${API}/leads/${id}/notes`)
      .send({ body: 'Ghi chú sẽ bị xóa' })
      .expect(201);
    await head
      .delete(`${API}/leads/${id}`)
      .send({ reason: 'Tạo nhầm', mode: 'SOFT' })
      .expect(204);
    await connection
      .collection('leads')
      .updateOne(
        { _id: id },
        { $set: { deletedAt: new Date(Date.now() - 31 * 86_400_000) } },
      );
    const { body } = await head.post(`${API}/leads/${id}/restore`).expect(409);
    expect(body.error).toBe('lead_not_restorable');
    expect(
      (await head.get(`${API}/leads/deleted`).expect(200)).body.items.some(
        (item: { id: string }) => item.id === id,
      ),
    ).toBe(false);

    expect(await app.get(LeadRemovalService).purge({ tenantId })).toBe(1);
    expect(await raw(id)).toBeNull();
    expect(
      await connection
        .collection('interactions')
        .countDocuments({ leadId: id }),
    ).toBe(0);
    expect(
      await connection
        .collection('auditEvents')
        .countDocuments({ entity: 'lead', 'meta.purged': 1 }),
    ).toBe(1);
  });

  it('PDP-6: erasing on request removes personal data for good and keeps the statistics', async () => {
    const id = await create('Khách Yêu Cầu Xóa', '0936000004');
    await fc
      .post(`${API}/leads/${id}/notes`)
      .send({ body: 'Khách kể về bệnh tiểu đường' })
      .expect(201);
    await head
      .post(`${API}/leads/${id}/comments`)
      .send({ body: 'Gọi lại cho khách' })
      .expect(201);
    // Text that lives on in history rows and tasks: an edited note, a stage note, a task title
    const edited = (
      await fc
        .post(`${API}/leads/${id}/notes`)
        .send({ body: 'Khách nói nhà ở Thủ Đức' })
        .expect(201)
    ).body.id as string;
    await fc
      .patch(`${API}/leads/${id}/notes/${edited}`)
      .send({ body: 'Đã gọi' })
      .expect(204);
    await fc
      .patch(`${API}/leads/${id}`)
      .send({ stage: 'CONTACTED', stageNote: 'Chị Lan hẹn tuần sau' })
      .expect(200);
    await fc
      .post(`${API}/leads/${id}/tasks`)
      .send({ title: 'Gọi chị Lan', dueAt: new Date(Date.now() + 86_400_000) })
      .expect(201);
    await head
      .delete(`${API}/leads/${id}`)
      .send({ reason: 'Khách yêu cầu xóa dữ liệu', mode: 'PDP' })
      .expect(204);

    await head.get(`${API}/leads/${id}`).expect(404);
    const stored = await raw(id);
    expect(stored).toMatchObject({
      fullName: '',
      phone: `erased:${id}`,
      stage: 'CONTACTED',
      source: expect.any(String),
    });
    expect(stored!.erasedAt).toBeInstanceOf(Date);
    const texts = JSON.stringify([
      await connection
        .collection('interactions')
        .find({ leadId: id })
        .toArray(),
      await connection.collection('comments').find({ leadId: id }).toArray(),
      await connection.collection('leadHistory').find({ leadId: id }).toArray(),
      await tasksOf(id),
    ]);
    expect(texts).not.toMatch(
      /tiểu đường|Gọi lại|Khách Yêu Cầu|0936000004|Thủ Đức|Chị Lan|chị Lan/,
    );
    // The change of stage itself stays for the statistics
    expect(texts).toContain('CONTACTED');
    // Not in the bin, so it cannot be restored
    await head.post(`${API}/leads/${id}/restore`).expect(404);
  });

  it('LEAD-41: merging moves the history to the kept lead; the other cannot come back', async () => {
    const keep = await create('Lead Số Mới', '0936000005');
    const gone = await create('Lead Số Cũ', '0936000006');
    await fc
      .post(`${API}/leads/${gone}/notes`)
      .send({ body: 'Đã gọi số cũ' })
      .expect(201);
    await head
      .post(`${API}/leads/${gone}/comments`)
      .send({ body: 'Khách đổi số rồi' })
      .expect(201);
    await head
      .patch(`${API}/leads/${gone}`)
      .send({ email: 'khach@example.com' })
      .expect(200);

    await fc
      .post(`${API}/leads/merge`)
      .send({ keepId: keep, mergeId: gone })
      .expect(403);
    await head
      .post(`${API}/leads/merge`)
      .send({ keepId: keep, mergeId: keep })
      .expect(400);
    await head
      .post(`${API}/leads/merge`)
      .send({ keepId: keep, mergeId: gone })
      .expect(204);

    const { body } = await head.get(`${API}/leads/${keep}`).expect(200);
    expect(body.lead.email).toBe('khach@example.com');
    expect(
      body.interactions.map((note: { note: string }) => note.note),
    ).toContain('Đã gọi số cũ');
    expect(
      body.comments.map((comment: { body: string }) => comment.body),
    ).toContain('Khách đổi số rồi');
    expect(
      body.history.some(
        (item: { field: string; oldValue: string }) =>
          item.field === 'merge' && item.oldValue === '0936000006',
      ),
    ).toBe(true);
    // PDP-3: a line manager sees the merged number masked, as on the phone field
    const um = await as('um');
    const forUm = (await um.get(`${API}/leads/${keep}`).expect(200)).body;
    expect(forUm.lead.phone).toBe('0936***005');
    expect(
      forUm.history.find((item: { field: string }) => item.field === 'merge')
        ?.oldValue,
    ).toBe('0936***006');
    // Only the kept lead's own automatic task stays open
    expect(
      (await tasksOf(keep)).filter((task) => task.status === 'OPEN'),
    ).toHaveLength(1);

    await head.get(`${API}/leads/${gone}`).expect(404);
    const bin = (await head.get(`${API}/leads/deleted`).expect(200)).body
      .items as { id: string; mergedInto: string }[];
    expect(bin.find((item) => item.id === gone)?.mergedInto).toBe(keep);
    const restore = await head.post(`${API}/leads/${gone}/restore`).expect(409);
    expect(restore.body.error).toBe('lead_not_restorable');
    expect(
      await connection.collection('auditEvents').countDocuments({
        entity: 'lead',
        $or: [{ 'meta.mergedInto': keep }, { 'meta.mergedFrom': gone }],
      }),
    ).toBe(2);
  });

  it('LEAD-41: two leads linked to different clients are not merged', async () => {
    const a = await create('Lead Khách A', '0936000007');
    const b = await create('Lead Khách B', '0936000008');
    const client = async (policyNo: string, name: string) =>
      (
        await fc
          .post(`${API}/clients`)
          .send({ policyNo, role: 'PO', name })
          .expect(201)
      ).body.id as string;
    await connection
      .collection('leads')
      .updateOne(
        { _id: a },
        { $set: { clientId: await client('960000001', 'Khách A') } },
      );
    await connection
      .collection('leads')
      .updateOne(
        { _id: b },
        { $set: { clientId: await client('960000002', 'Khách B') } },
      );
    const { body } = await head
      .post(`${API}/leads/merge`)
      .send({ keepId: a, mergeId: b })
      .expect(409);
    expect(body.error).toBe('lead_merge_conflict');
  });
});
