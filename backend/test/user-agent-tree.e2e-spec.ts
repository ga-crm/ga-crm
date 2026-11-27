import type { INestApplication } from '@nestjs/common';
import request from 'supertest';
import { startApp, stopApp } from './support/app.js';
import { connection } from './support/collections.js';
import { demoEmail, seedDemoData } from '../src/seed/demo-data.js';

const API = '/api/v1';
const PASSWORD = 'demo-password-123';
const UM = '00100003';
const BM = '00100002';
type Agent = ReturnType<typeof request.agent>;
type TreeItem = {
  agentCode: string;
  name: string;
  rank: string;
  managerCode: string | null;
  ancestors: string[];
  depth: number;
};

/**
 * Decided 26/11/2026: a staff member added by hand (an account with an agent role, ROLE-2) joins
 * the agent tree when the account is saved, so they show in the agent pickers (AGT-9), own
 * clients, and give their manager a line (SCOPE-1). Before, only agents from an 01_Agents file
 * were on the tree.
 */
describe('Accounts added by hand join the agent tree (e2e)', () => {
  let app: INestApplication;
  let head: Agent;
  let um: Agent;
  let head2: Agent;

  const as = async (key: string, ga = 1) => {
    const agent = request.agent(app.getHttpServer());
    await agent
      .post(`${API}/auth/sign-in/email`)
      .send({ email: demoEmail(ga, key), password: PASSWORD })
      .expect(200);
    return agent;
  };
  const tree = async (agent: Agent) =>
    (await agent.get(`${API}/agents/tree`).expect(200)).body
      .items as TreeItem[];
  const invite = (agent: Agent, body: Record<string, unknown>) =>
    agent.post(`${API}/users/invite`).send(body);

  beforeAll(async () => {
    app = await startApp();
    await seedDemoData(app, PASSWORD);
    [head, um, head2] = await Promise.all([
      as('head'),
      as('um'),
      as('head', 2),
    ]);
  });

  afterAll(async () => {
    await stopApp(app);
  });

  it('an invited FC with a new code joins the tree under the manager picked, and can own a client', async () => {
    const invited = await invite(head, {
      email: 'fc.tay@test.local',
      name: 'Tư Vấn Nhập Tay',
      roles: ['FC'],
      agentCode: '00100091',
      managerCode: UM,
    }).expect(201);
    expect(invited.body.addedToTree).toBe(true);

    const added = (await tree(head)).find(
      (agent) => agent.agentCode === '00100091',
    );
    expect(added).toMatchObject({
      name: 'Tư Vấn Nhập Tay',
      rank: 'FC',
      managerCode: UM,
      ancestors: expect.arrayContaining([UM, BM]),
    });
    expect(added!.ancestors.at(-1)).toBe(UM);

    // SCOPE-1: the manager's line now holds them
    expect((await tree(um)).map((agent) => agent.agentCode)).toContain(
      '00100091',
    );
    // The users list no longer warns that the code is not on the tree (USER-7)
    const listed = (
      await head.get(`${API}/users`).query({ q: 'fc.tay' }).expect(200)
    ).body.items as { agentName: string | null }[];
    expect(listed[0].agentName).toBe('Tư Vấn Nhập Tay');

    // AGT-9: the client form takes them as the owner
    await head
      .post(`${API}/clients`)
      .send({
        policyNo: '500000091',
        role: 'PO',
        name: 'Khách Của Tư Vấn Mới',
        agentCode: '00100091',
      })
      .expect(201);

    // AUD-3: the agent's creation is audited with where it came from
    expect(
      await connection.collection('auditEvents').countDocuments({
        entity: 'agent',
        action: 'CREATE',
        entityId: '00100091',
      }),
    ).toBe(1);
  });

  it('the rank follows the highest agent role; a manager is required; the director is never granted', async () => {
    // Decided 27/11/2026: someone is above every new agent, so none starts a branch
    const missing = await invite(head, {
      email: 'khong.quan.ly@test.local',
      name: 'Không Quản Lý',
      roles: ['FC', 'UM'],
      agentCode: '00100092',
    }).expect(400);
    expect(missing.body.error).toBe('manager_required');
    await invite(head, {
      email: 'khong.quan.ly@test.local',
      name: 'Trưởng Nhóm Nhập Tay',
      roles: ['FC', 'UM'],
      agentCode: '00100092',
      managerCode: BM,
    }).expect(201);
    expect(
      (await tree(head)).find((agent) => agent.agentCode === '00100092'),
    ).toMatchObject({ rank: 'UM', managerCode: BM });
    // The GA's one director comes from the platform
    const director = await invite(head, {
      email: 'giam.doc.hai@test.local',
      name: 'Giám Đốc Thứ Hai',
      roles: ['GAD'],
      agentCode: '00100088',
    }).expect(403);
    expect(director.body.error).toBe('director_by_platform');
  });

  it('a code already on the tree is left as it is; the manager field changes nothing', async () => {
    // An agent added on the tree first ("Thêm đại lý"), then their account
    await head
      .post(`${API}/agents`)
      .send({
        agentCode: '00100096',
        name: 'Đại Lý Có Sẵn',
        rank: 'FC',
        status: 'Đang hoạt động',
        startDate: '2026-01-01',
        managerCode: UM,
      })
      .expect(201);
    const invited = await invite(head, {
      email: 'co.san@test.local',
      name: 'Tên Tài Khoản Khác',
      roles: ['UM'],
      agentCode: '00100096',
      managerCode: BM,
    }).expect(201);
    expect(invited.body.addedToTree).toBe(false);
    // Name, rank and manager stay as the tree has them
    expect(
      (await tree(head)).find((agent) => agent.agentCode === '00100096'),
    ).toMatchObject({ name: 'Đại Lý Có Sẵn', rank: 'FC', managerCode: UM });

    // A staff role takes no place on the tree, whatever code it carries
    const staff = await invite(head, {
      email: 'nhan.vien@test.local',
      name: 'Nhân Viên Văn Phòng',
      roles: ['ADMIN'],
      agentCode: '00100093',
    }).expect(201);
    expect(staff.body.addedToTree).toBe(false);
    expect(
      (await tree(head)).some((agent) => agent.agentCode === '00100093'),
    ).toBe(false);
  });

  it('editing an account onto an agent role with a new code adds it then', async () => {
    const id = (
      await invite(head, {
        email: 'sau.nay@test.local',
        name: 'Trưởng Nhóm Sau Này',
        roles: ['ADMIN'],
      }).expect(201)
    ).body.user.id as string;

    const saved = await head
      .patch(`${API}/users/${id}`)
      .send({ roles: ['UM'], agentCode: '00100094', managerCode: BM })
      .expect(200);
    expect(saved.body).toMatchObject({ agentCode: '00100094', addedToTree: true });
    expect(
      (await tree(head)).find((agent) => agent.agentCode === '00100094'),
    ).toMatchObject({ rank: 'UM', managerCode: BM });

    // Saving again changes nothing on the tree
    const again = await head
      .patch(`${API}/users/${id}`)
      .send({ name: 'Trưởng Nhóm Đổi Tên', managerCode: UM })
      .expect(200);
    expect(again.body.addedToTree).toBe(false);
    expect(
      (await tree(head)).find((agent) => agent.agentCode === '00100094'),
    ).toMatchObject({ name: 'Trưởng Nhóm Sau Này', managerCode: BM });
  });

  it('the direct manager must rank above the account (SUM > BM > UM > SA > FC)', async () => {
    // A UM under another UM, or under an FC, is refused, and nothing is written
    for (const managerCode of [UM, '00100004']) {
      const refused = await invite(head, {
        email: `cap.thap.${managerCode}@test.local`,
        name: 'Trưởng Nhóm Sai Cấp',
        roles: ['UM'],
        agentCode: '00100097',
        managerCode,
      }).expect(400);
      expect(refused.body.error).toBe('manager_rank_too_low');
    }
    expect(
      (await tree(head)).some((agent) => agent.agentCode === '00100097'),
    ).toBe(false);
    // A BM is above a UM
    await invite(head, {
      email: 'cap.dung@test.local',
      name: 'Trưởng Nhóm Đúng Cấp',
      roles: ['UM'],
      agentCode: '00100097',
      managerCode: BM,
    }).expect(201);
  });

  it('an unknown manager, or one of another GA (TEN-7), refuses the whole save', async () => {
    const refused = await invite(head, {
      email: 'sai.quanly@test.local',
      name: 'Sai Quản Lý',
      roles: ['FC'],
      agentCode: '00100095',
      managerCode: '00199999',
    }).expect(400);
    expect(refused.body.error).toBe('manager_not_found');
    // Nothing was written: no account and no agent
    expect(
      await connection
        .collection('users')
        .countDocuments({ email: 'sai.quanly@test.local' }),
    ).toBe(0);
    expect(
      (await tree(head)).some((agent) => agent.agentCode === '00100095'),
    ).toBe(false);

    await invite(head2, {
      email: 'ga2.tay@test.local',
      name: 'Tư Vấn GA Hai',
      roles: ['FC'],
      agentCode: '00200091',
      managerCode: UM,
    }).expect(400);
    // GA-2 does not see GA-1's new agent
    expect(
      (await tree(head2)).some((agent) => agent.agentCode === '00100091'),
    ).toBe(false);
  });
});
