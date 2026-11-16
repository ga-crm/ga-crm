import type { INestApplication } from '@nestjs/common';
import request from 'supertest';
import { startApp, stopApp } from './support/app.js';
import { connection } from './support/collections.js';
import { demoEmail, seedDemoData } from '../src/seed/demo-data.js';

const API = '/api/v1';
const PASSWORD = 'demo-password-123';
const FC = '00100004';
type Agent = ReturnType<typeof request.agent>;
type Column = {
  stage: string;
  total: number;
  items: { id: string; canWork: boolean; phone: string }[];
};

/** LEAD-19 kanban, NOTE-8 editing notes, LEAD-38 saved filters (slice 3c). */
describe('Lead board, note editing and saved filters (e2e)', () => {
  let app: INestApplication;
  let head: Agent;
  let fc: Agent;
  let um: Agent;
  let head2: Agent;
  let leadId: string;

  const as = async (key: string, ga = 1) => {
    const agent = request.agent(app.getHttpServer());
    await agent
      .post(`${API}/auth/sign-in/email`)
      .send({ email: demoEmail(ga, key), password: PASSWORD })
      .expect(200);
    return agent;
  };
  const board = async (agent: Agent, query: Record<string, string> = {}) =>
    (await agent.get(`${API}/leads/board`).query(query).expect(200)).body
      .columns as Column[];
  const history = async (id: string) =>
    (await fc.get(`${API}/leads/${id}`).expect(200)).body.history as {
      field: string;
      oldValue: string | null;
      newValue: string | null;
      note: string | null;
    }[];

  beforeAll(async () => {
    app = await startApp();
    await seedDemoData(app, PASSWORD);
    [head, fc, um, head2] = await Promise.all([
      as('head'),
      as('fc'),
      as('um'),
      as('head', 2),
    ]);
    for (const [index, name] of ['Lead Bảng 1', 'Lead Bảng 2'].entries()) {
      const id = (
        await head
          .post(`${API}/leads`)
          .send({
            fullName: name,
            phone: `093700000${index}`,
            source: 'Facebook',
            consent: true,
            assignedAgentCode: FC,
          })
          .expect(201)
      ).body.id as string;
      leadId ??= id;
    }
  });

  afterAll(async () => {
    await stopApp(app);
  });

  it('LEAD-19: the board has a column per stage with totals that match the list', async () => {
    const columns = await board(head);
    expect(columns.map((column) => column.stage)).toEqual([
      'NEW',
      'CONTACTED',
      'APPOINTMENT',
      'MET',
      'PROPOSAL',
      'SUBMITTED',
      'ISSUED',
      'LOST',
    ]);
    const counts = (await head.get(`${API}/leads/counts`).expect(200)).body;
    expect(columns.reduce((sum, column) => sum + column.total, 0)).toBe(
      counts.all,
    );
    // The same filters as the list
    const mine = await board(fc, { q: 'Lead Bảng' });
    expect(mine[0].items.map((item) => item.canWork)).toEqual([true, true]);
    // A line manager sees the cards but cannot move them, and sees phones masked (PDP-3)
    const managed = (await board(um, { q: 'Lead Bảng' }))[0].items;
    expect(managed.every((item) => !item.canWork)).toBe(true);
    expect(managed[0].phone).toContain('***');
    expect(
      (await board(head2)).reduce((sum, column) => sum + column.total, 0),
    ).toBe(0);
  });

  it('LEAD-19: manual moves keep their rules, and a note goes into the history', async () => {
    await fc
      .patch(`${API}/leads/${leadId}`)
      .send({ stage: 'APPOINTMENT', stageNote: 'Khách hẹn thứ Sáu' })
      .expect(200);
    const row = (await history(leadId)).find(
      (item) => item.field === 'stage' && item.newValue === 'APPOINTMENT',
    );
    expect(row?.note).toBe('Khách hẹn thứ Sáu');
    expect(
      (await board(fc, { q: 'Lead Bảng' }))
        .find((column) => column.stage === 'APPOINTMENT')!
        .items.map((item) => item.id),
    ).toEqual([leadId]);

    const lost = await fc
      .patch(`${API}/leads/${leadId}`)
      .send({ stage: 'LOST' })
      .expect(400);
    expect(lost.body.error).toBe('lost_reason_required');
    const won = await fc
      .patch(`${API}/leads/${leadId}`)
      .send({ stage: 'SUBMITTED' })
      .expect(400);
    expect(won.body.error).toBe('won_needs_numbers');
    await fc
      .patch(`${API}/leads/${leadId}`)
      .send({ stage: 'ISSUED' })
      .expect(403);
    const { body } = await fc
      .patch(`${API}/leads/${leadId}`)
      .send({ stage: 'SUBMITTED', applicationNo: 'HS12345' })
      .expect(200);
    expect(body).toMatchObject({ stage: 'SUBMITTED', careStatus: 'WON' });
  });

  it('NOTE-8: the author edits a note within 24 hours; the old text stays in the history', async () => {
    const id = (
      await fc
        .post(`${API}/leads/${leadId}/notes`)
        .send({ body: 'Khách thích gói 500 triệu' })
        .expect(201)
    ).body.id as string;
    await fc
      .patch(`${API}/leads/${leadId}/notes/${id}`)
      .send({ body: 'Khách thích gói 300 triệu' })
      .expect(204);
    const { body } = await fc.get(`${API}/leads/${leadId}`).expect(200);
    const note = body.interactions.find(
      (item: { id: string }) => item.id === id,
    );
    expect(note.note).toBe('Khách thích gói 300 triệu');
    expect(note.editedAt).toEqual(expect.any(String));
    expect(
      (await history(leadId)).find((item) => item.field === 'noteEdited'),
    ).toMatchObject({
      oldValue: 'Khách thích gói 500 triệu',
      newValue: 'Khách thích gói 300 triệu',
    });

    // Someone else, even a lead manager, cannot change it
    const other = await head
      .patch(`${API}/leads/${leadId}/notes/${id}`)
      .send({ body: 'x' })
      .expect(403);
    expect(other.body.error).toBe('note_not_editable');
    await head2
      .patch(`${API}/leads/${leadId}/notes/${id}`)
      .send({ body: 'x' })
      .expect(404);

    await connection
      .collection('interactions')
      .updateOne(
        { _id: id },
        { $set: { createdAt: new Date(Date.now() - 25 * 3_600_000) } },
      );
    const late = await fc
      .patch(`${API}/leads/${leadId}/notes/${id}`)
      .send({ body: 'Quá hạn sửa' })
      .expect(403);
    expect(late.body.error).toBe('note_not_editable');
  });

  it('NOTE-8: a plain note can be deleted, a recorded contact cannot', async () => {
    const note = (
      await fc
        .post(`${API}/leads/${leadId}/notes`)
        .send({ body: 'Ghi nhầm lead' })
        .expect(201)
    ).body.id as string;
    const call = (
      await fc
        .post(`${API}/leads/${leadId}/activities`)
        .send({ type: 'CALL', note: 'Gọi được khách' })
        .expect(201)
    ).body.id as string;
    await fc.delete(`${API}/leads/${leadId}/notes/${call}`).expect(403);
    await fc
      .patch(`${API}/leads/${leadId}/notes/${call}`)
      .send({ body: 'Gọi được khách, hẹn gặp', outcome: 'Hẹn gặp' })
      .expect(204);
    await fc.delete(`${API}/leads/${leadId}/notes/${note}`).expect(204);
    const { body } = await fc.get(`${API}/leads/${leadId}`).expect(200);
    const ids = body.interactions.map((item: { id: string }) => item.id);
    expect(ids).not.toContain(note);
    expect(
      body.interactions.find((item: { id: string }) => item.id === call),
    ).toMatchObject({ note: 'Gọi được khách, hẹn gặp', outcome: 'Hẹn gặp' });
    expect(
      (await history(leadId)).find((item) => item.field === 'noteDeleted')
        ?.oldValue,
    ).toBe('Ghi nhầm lead');
  });

  it('LEAD-38: filters are saved per person, named once, and private', async () => {
    const saved = (
      await fc
        .post(`${API}/leads/filters`)
        .send({
          name: 'Facebook quá hạn',
          query: { source: 'FACEBOOK', tab: 'overdue', page: '3' },
        })
        .expect(201)
    ).body.id as string;
    const { body } = await fc.get(`${API}/leads/filters`).expect(200);
    expect(body.items).toEqual([
      {
        id: saved,
        name: 'Facebook quá hạn',
        query: { source: 'FACEBOOK', tab: 'overdue' },
      },
    ]);
    const duplicate = await fc
      .post(`${API}/leads/filters`)
      .send({ name: 'Facebook quá hạn', query: {} })
      .expect(409);
    expect(duplicate.body.error).toBe('filter_exists');
    await fc
      .post(`${API}/leads/filters`)
      .send({ name: 'Sai', query: { 'bad-key': 'x' } })
      .expect(400);
    expect(
      (await um.get(`${API}/leads/filters`).expect(200)).body.items,
    ).toEqual([]);
    await um.delete(`${API}/leads/filters/${saved}`).expect(404);
    await head2.delete(`${API}/leads/filters/${saved}`).expect(404);
    await fc.delete(`${API}/leads/filters/${saved}`).expect(204);

    for (let index = 0; index < 20; index += 1)
      await fc
        .post(`${API}/leads/filters`)
        .send({ name: `Bộ lọc ${index}`, query: {} })
        .expect(201);
    const limit = await fc
      .post(`${API}/leads/filters`)
      .send({ name: 'Bộ lọc 21', query: {} })
      .expect(409);
    expect(limit.body.error).toBe('filter_limit');
  });
});
