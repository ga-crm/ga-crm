import type { INestApplication } from '@nestjs/common';
import request from 'supertest';
import { startApp, stopApp } from './support/app.js';
import { clientIdOf } from './support/clients.js';
import { connection } from './support/collections.js';
import { demoEmail, seedDemoData } from '../src/seed/demo-data.js';

const API = '/api/v1';
const PASSWORD = 'demo-password-123';
const FC = '00100004';
/** A second FC under the UM, with no user account. */
const FC2 = '00100094';
/** A FC in another branch, under the BM but not under the UM. */
const PEER = '00100095';
/** The code a Success file gives the client with a policy, adopted by the hand-added record. */
const WITH_POLICY_CODE = '7000000001';
/** A uuid no client has. */
const UNKNOWN_ID = '00000000-0000-4000-8000-000000000001';
type Agent = ReturnType<typeof request.agent>;
type Cell = string | number | null;

const policyBody = (patch: Record<string, unknown> = {}) => ({
  status: 'Đang hiệu lực',
  effectiveDate: '2024-06-01',
  maturityDate: '2044-06-01',
  premiumFrequency: 'Năm',
  basePremiumVnd: 12_000_000,
  ...patch,
});

/** Section 10.4 (ASG), CUS-15 "Lịch sử" and section 12.5 (07_Activities): slice 4d. */
describe('Client assignment, history and Success activities (e2e)', () => {
  let app: INestApplication;
  let head: Agent;
  let fc: Agent;
  let um: Agent;
  let head2: Agent;
  // Client ids, known once the clients are added
  let WITH_POLICY: string;
  let NO_POLICY: string;
  let PEERS_CLIENT: string;

  const as = async (key: string, ga = 1) => {
    const agent = request.agent(app.getHttpServer());
    await agent
      .post(`${API}/auth/sign-in/email`)
      .send({ email: demoEmail(ga, key), password: PASSWORD })
      .expect(200);
    return agent;
  };
  const assign = (agent: Agent, body: Record<string, unknown>) =>
    agent.post(`${API}/clients/assign`).send(body);
  const stored = (clientId: string) =>
    connection.collection('clients').findOne({ _id: clientId });
  const manualOf = async (clientId: string) =>
    (
      ((await stored(clientId))?.agentLinks ?? []) as {
        agentCode: string;
        source: string;
      }[]
    )
      .filter((link) => link.source === 'MANUAL')
      .map((link) => link.agentCode);

  /** IMP-3: start, send each sheet, validate and commit. */
  const importFile = async (
    agent: Agent,
    sheets: { name: string; headers: string[]; rows: Cell[][] }[],
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
    await agent.post(`${API}/imports/${id}/validate`).expect(200);
    const done = (await agent.post(`${API}/imports/${id}/commit`).expect(200))
      .body;
    const problems = (
      await agent
        .get(`${API}/imports/${id}/errors`)
        .query({ pageSize: 200 })
        .expect(200)
    ).body.items as { row: number; code: string }[];
    const sheetOf = (name: string) =>
      done.sheets.find((item: { name: string }) => item.name === name);
    return { id, problems, sheetOf };
  };

  beforeAll(async () => {
    app = await startApp();
    await seedDemoData(app, PASSWORD);
    [head, fc, um, head2] = await Promise.all([
      as('head'),
      as('fc'),
      as('um'),
      as('head', 2),
    ]);
    for (const [agentCode, managerCode] of [
      [FC2, '00100003'],
      [PEER, '00100002'],
    ])
      await head
        .post(`${API}/agents`)
        .send({
          agentCode,
          name: `FC ${agentCode}`,
          rank: 'FC',
          status: 'Đang hoạt động',
          startDate: '2024-01-01',
          managerCode,
        })
        .expect(201);
    const add = async (agent: Agent, body: Record<string, unknown>) =>
      (await agent.post(`${API}/clients`).send(body).expect(201)).body
        .id as string;
    WITH_POLICY = await add(fc, {
      policyNo: '700000001',
      role: 'PO',
      name: 'Khách Có Hợp Đồng',
    });
    await fc
      .patch(`${API}/clients/${WITH_POLICY}/policies/700000001`)
      .send(policyBody())
      .expect(204);
    // Every client is added on a policy; one entered by mistake is deleted (POL-7), so this client
    // is left with the manual link only
    NO_POLICY = await add(fc, {
      policyNo: '700000002',
      role: 'PO',
      name: 'Khách Chưa Có Hợp Đồng',
    });
    await fc
      .delete(`${API}/clients/${NO_POLICY}/policies/700000002`)
      .expect(204);
    PEERS_CLIENT = await add(head, {
      policyNo: '700000003',
      role: 'PO',
      name: 'Khách Nhánh Khác',
      agentCode: PEER,
    });
  });

  afterAll(async () => {
    await stopApp(app);
  });

  describe('assignment', () => {
    it('ASG-1 + ASG-7: only GA_HEAD or clients.assign; an agent cannot, even for their own client; Marketing and Admin never', async () => {
      for (const agent of [fc, um, await as('admin'), await as('admin')])
        await assign(agent, {
          clientIds: [NO_POLICY],
          agentCode: FC2,
        }).expect(403);
      expect(await manualOf(NO_POLICY)).toEqual([FC]);
    });

    it('ASG-2 + ASG-6: a new assignment replaces the one manual link, and is audited with the agent and the count', async () => {
      const { body } = await assign(head, {
        clientIds: [WITH_POLICY, NO_POLICY],
        agentCode: FC2,
      }).expect(200);
      expect(body).toEqual({ assigned: 2, requested: 0 });
      expect(await manualOf(NO_POLICY)).toEqual([FC2]);
      expect(await stored(NO_POLICY)).toMatchObject({
        visibleAgentCodes: [FC2],
        ownerAgentCodes: [FC2],
      });
      // The FC kept nothing else on this client, so it left their book
      await fc.get(`${API}/clients/${NO_POLICY}`).expect(404);
      // The policy still makes the other client theirs too
      expect((await stored(WITH_POLICY))?.ownerAgentCodes).toEqual(
        expect.arrayContaining([FC, FC2]),
      );
      const audit = await connection
        .collection('auditEvents')
        .findOne({ action: 'ASSIGN', entity: 'client' });
      expect(audit?.meta).toMatchObject({ agentCode: FC2, count: 2 });

      await assign(head, { clientIds: [NO_POLICY], agentCode: FC }).expect(200);
      expect(await manualOf(NO_POLICY)).toEqual([FC]);
      await fc.get(`${API}/clients/${NO_POLICY}`).expect(200);
    });

    it('ASG-3: unassigning removes only the manual link; the policy keeps its agent', async () => {
      await assign(head, {
        clientIds: [WITH_POLICY],
        agentCode: null,
      }).expect(200);
      expect(await manualOf(WITH_POLICY)).toEqual([]);
      expect((await stored(WITH_POLICY))?.ownerAgentCodes).toEqual([FC]);
      const policy = await connection
        .collection('policies')
        .findOne({ policyNo: '700000001' });
      expect(policy).toMatchObject({
        servicingAgentCode: FC,
        currentAgentCodes: [FC],
      });
    });

    it('ASG-4 + TEN-7: a client outside the GA is 404 and nothing changes; an unknown agent is agent_not_found', async () => {
      await assign(head, {
        clientIds: [NO_POLICY, UNKNOWN_ID],
        agentCode: FC2,
      }).expect(404);
      await assign(head2, { clientIds: [NO_POLICY], agentCode: null }).expect(
        404,
      );
      expect(await manualOf(NO_POLICY)).toEqual([FC]);
      expect(
        (
          await assign(head, {
            clientIds: [NO_POLICY],
            agentCode: '00999999',
          }).expect(400)
        ).body.error,
      ).toBe('agent_not_found');
      // The agent must be named (null to unassign), and at most 200 clients, by id
      await assign(head, { clientIds: [NO_POLICY] }).expect(400);
      await assign(head, { clientIds: ['7000000002'], agentCode: FC }).expect(
        400,
      );
      await assign(head, {
        clientIds: Array.from(
          { length: 201 },
          (_, index) =>
            `00000000-0000-4000-8000-${String(index).padStart(12, '0')}`,
        ),
        agentCode: FC,
      }).expect(400);
    });

    it('ASG-1 (changed 27/11/2026): a manager granted clients.assign reaches only the clients they see', async () => {
      const { grants } = (await head.get(`${API}/permissions`).expect(200))
        .body;
      await head
        .put(`${API}/permissions`)
        .send({ grants: { ...grants, UM: [...grants.UM, 'clients.assign'] } })
        .expect(204);
      const manager = await as('um');
      // The FC's client is no longer in the line manager's sight
      await assign(manager, {
        clientIds: [NO_POLICY],
        agentCode: FC2,
      }).expect(404);
      await assign(head, { clientIds: [NO_POLICY], agentCode: FC2 }).expect(
        200,
      );
      expect(await manualOf(NO_POLICY)).toEqual([FC2]);
      await assign(manager, {
        clientIds: [PEERS_CLIENT],
        agentCode: FC2,
      }).expect(404);
      await assign(manager, {
        clientIds: [NO_POLICY],
        agentCode: PEER,
      }).expect(404);
      await head.put(`${API}/permissions`).send({ grants }).expect(204);
      await assign(head, { clientIds: [NO_POLICY], agentCode: FC }).expect(200);
    });
  });

  describe('history', () => {
    it('CUS-15: hand edits, assignments and file changes, newest first, with who and which file', async () => {
      await fc
        .patch(`${API}/clients/${WITH_POLICY}`)
        .send({ tier: 'Bạc' })
        .expect(204);
      await fc
        .patch(`${API}/clients/${WITH_POLICY}/policies/700000001`)
        .send(policyBody({ status: 'Mất hiệu lực' }))
        .expect(204);
      // The file names the holder of their policy by a code, which the hand-added client adopts
      // (MAN-8); the policy row repeats what is stored, so only the tier changes
      await importFile(head, [
        {
          name: '02_Clients',
          headers: ['Mã Khách Hàng', 'Bên Mua BH', 'Nhóm Khách Hàng'],
          rows: [[WITH_POLICY_CODE, 'Khách Có Hợp Đồng', 'Vàng']],
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
            'Định kỳ đóng phí',
            'Phí định kỳ/cơ bản định kỳ',
          ],
          rows: [
            [
              '700000001',
              WITH_POLICY_CODE,
              FC,
              'Khách Có Hợp Đồng',
              'Khách Có Hợp Đồng',
              'Mất hiệu lực',
              '01/06/2024',
              '01/06/2044',
              'Năm',
              '12000000',
            ],
          ],
        },
      ]);
      expect(await clientIdOf(WITH_POLICY_CODE)).toBe(WITH_POLICY);
      const { body } = await head
        .get(`${API}/clients/${WITH_POLICY}`)
        .expect(200);
      const rows = body.history as {
        entity: string;
        field: string;
        oldValue: string | null;
        newValue: string | null;
        fileName: string | null;
        changedBy: string;
      }[];
      // Older rows are the policy being filled in when it was added
      expect(
        rows
          .slice(0, 5)
          .map((row) => [row.entity, row.field, row.oldValue, row.newValue]),
      ).toEqual([
        ['client', 'tier', 'Bạc', 'Vàng'],
        ['policy', 'status', 'Đang hiệu lực', 'Mất hiệu lực'],
        ['client', 'tier', null, 'Bạc'],
        ['client', 'manualAgent', FC2, null],
        ['client', 'manualAgent', FC, FC2],
      ]);
      expect(rows[0].fileName).toBe('success.xlsx');
      expect(rows[1].fileName).toBeNull();
      expect(body.userNames[rows[0].changedBy]).toBe('Giám đốc điều hành 1');
      expect(body.userNames[rows[1].changedBy]).toBe('Tư vấn viên 1');
      await head2.get(`${API}/clients/${WITH_POLICY}`).expect(404);
    });
  });

  describe('07_Activities', () => {
    const HEADERS = [
      'activity_id',
      'agent_code',
      'activity_type_id',
      'started_at',
      'status',
      'customer_phone',
      'call_type',
    ];
    const sheet = (rows: Cell[][]) => ({
      name: '07_Activities',
      headers: HEADERS,
      rows,
    });
    const activity = (activityId: string) =>
      connection.collection('successActivities').findOne({ activityId });

    it('section 12.5 + IMP-31 + IMP-32: keyed by activity id, owned by agent_code, with the Vietnam day and the masked phone', async () => {
      const first = await importFile(fc, [
        sheet([
          [
            'ACT-1',
            FC,
            '2 Calls',
            '09/11/2026 23:30',
            'approved',
            '0912 345 678',
            'zalo',
          ],
          ['ACT-2', PEER, '4', '10/11/2026 09:00', 'submitted', '', ''],
          ['ACT-3', FC, '9', '10/11/2026 09:00', 'approved', '', ''],
          ['ACT-4', FC, 'Meetings', '10/11/2026 10:00', 'unknown', '', ''],
        ]),
      ]);
      expect(first.sheetOf('07_Activities')).toMatchObject({
        found: 4,
        inserted: 1,
        rejected: 3,
      });
      expect(
        first.problems
          .map((problem) => [problem.row, problem.code])
          .sort((a, b) => Number(a[0]) - Number(b[0])),
      ).toEqual([
        [3, 'out_of_scope'],
        [4, 'invalid_activity_type'],
        [5, 'invalid_list'],
      ]);
      const stored = await activity('ACT-1');
      expect(stored).toMatchObject({
        agentCode: FC,
        activityType: 'CALL',
        status: 'approved',
        customerPhone: '0912345678',
        callType: 'zalo',
        // 23:30 in Vietnam is 16:30 UTC, still the 9th
        activityDate: '2026-11-09',
        phoneKey: '0912***678',
      });
      expect(stored?.startedAt).toEqual(new Date('2026-11-09T16:30:00.000Z'));

      // The same row again changes nothing; a new status updates it
      const again = await importFile(fc, [
        sheet([
          [
            'ACT-1',
            FC,
            '2',
            '09/11/2026 23:30',
            'approved',
            '0912345678',
            'zalo',
          ],
        ]),
      ]);
      expect(again.sheetOf('07_Activities')).toMatchObject({
        skipped: 1,
        inserted: 0,
      });
      const locked = await importFile(fc, [
        sheet([['ACT-1', FC, '2', '09/11/2026 23:30', 'locked', '', '']]),
      ]);
      expect(locked.sheetOf('07_Activities')).toMatchObject({ updated: 1 });
      // IMP-5: blank cells keep what is stored
      expect(await activity('ACT-1')).toMatchObject({
        status: 'locked',
        callType: 'zalo',
      });
    });

    it('TEN-1: the same Success id in another GA is its own record', async () => {
      await head2
        .post(`${API}/agents`)
        .send({
          agentCode: '00200099',
          name: 'FC GA Hai',
          rank: 'FC',
          status: 'Đang hoạt động',
          startDate: '2024-01-01',
        })
        .expect(201);
      const other = await importFile(head2, [
        sheet([
          ['ACT-1', '00200099', '1', '10/11/2026 08:00', 'draft', '', ''],
        ]),
      ]);
      expect(other.sheetOf('07_Activities')).toMatchObject({ inserted: 1 });
      expect(
        await connection
          .collection('successActivities')
          .countDocuments({ activityId: 'ACT-1' }),
      ).toBe(2);
      expect(await activity('ACT-1')).toMatchObject({ agentCode: FC });
    });
  });
});
