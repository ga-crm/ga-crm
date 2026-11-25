import type { INestApplication } from '@nestjs/common';
import request from 'supertest';
import { startApp, stopApp } from './support/app.js';
import { connection } from './support/collections.js';
import { demoEmail, seedDemoData } from '../src/seed/demo-data.js';

const API = '/api/v1';
const PASSWORD = 'demo-password-123';
type Agent = ReturnType<typeof request.agent>;

/** Decided 26/11/2026: a lead's province, commune and street address after the 1/7/2025 reform. */
describe('Lead address (e2e)', () => {
  let app: INestApplication;
  let marketing: Agent;
  let marketing2: Agent;
  let phone = 909_100_000;

  const as = async (email: string) => {
    const agent = request.agent(app.getHttpServer());
    await agent
      .post(`${API}/auth/sign-in/email`)
      .send({ email, password: PASSWORD })
      .expect(200);
    return agent;
  };
  const create = (agent: Agent, body: Record<string, unknown>) =>
    agent.post(`${API}/leads`).send({
      fullName: 'Khách Có Địa Chỉ',
      phone: `0${++phone}`,
      source: 'Facebook',
      consent: true,
      ...body,
    });
  const detail = async (agent: Agent, id: string) =>
    (await agent.get(`${API}/leads/${id}`).expect(200)).body.lead as Record<
      string,
      unknown
    >;

  beforeAll(async () => {
    app = await startApp();
    await seedDemoData(app, PASSWORD);
    [marketing, marketing2] = await Promise.all([
      as(demoEmail(1, 'marketing')),
      as(demoEmail(2, 'marketing')),
    ]);
  });

  afterAll(async () => {
    await stopApp(app);
  });

  it('lists the 34 provinces and the communes of one, without the district level', async () => {
    const provinces = (await marketing.get(`${API}/geo/provinces`).expect(200))
      .body.items as { code: string; name: string; fullName: string }[];
    expect(provinces).toHaveLength(34);
    expect(provinces).toContainEqual({
      code: '01',
      name: 'Hà Nội',
      fullName: 'Thành phố Hà Nội',
    });
    const wards = (
      await marketing.get(`${API}/geo/provinces/01/wards`).expect(200)
    ).body.items as { code: string; name: string }[];
    expect(wards).toContainEqual(
      expect.objectContaining({ code: '00004', name: 'Ba Đình' }),
    );
    await marketing.get(`${API}/geo/provinces/99/wards`).expect(404);
    await request(app.getHttpServer()).get(`${API}/geo/provinces`).expect(401);
  });

  it('keeps the province, commune and address; a commune must belong to its province', async () => {
    const id = (
      await create(marketing, {
        provinceCode: '01',
        wardCode: '00004',
        addressLine: '12 Phố Mẫu',
      }).expect(201)
    ).body.id as string;
    expect(await detail(marketing, id)).toMatchObject({
      provinceCode: '01',
      provinceName: 'Hà Nội',
      province: 'Hà Nội',
      wardCode: '00004',
      wardName: 'Ba Đình',
      addressLine: '12 Phố Mẫu',
    });

    const refused = async (body: Record<string, unknown>, path: string) => {
      const res = await create(marketing, body).expect(400);
      expect(res.body).toMatchObject({
        error: 'unknown_place',
        issues: [{ path }],
      });
    };
    // A commune of another province, a commune without a province, a province that is not one
    await refused({ provinceCode: '79', wardCode: '00004' }, 'wardCode');
    await refused({ wardCode: '00004' }, 'wardCode');
    await refused({ provinceCode: '99' }, 'provinceCode');

    // Another province drops the commune of the old one; the history names both
    await marketing
      .patch(`${API}/leads/${id}`)
      .send({ provinceCode: '79' })
      .expect(200);
    expect(await detail(marketing, id)).toMatchObject({
      provinceCode: '79',
      provinceName: 'Hồ Chí Minh',
      wardCode: null,
      addressLine: '12 Phố Mẫu',
    });
    const history = (await marketing.get(`${API}/leads/${id}`).expect(200))
      .body.history as { field: string; oldValue: string; newValue: string }[];
    expect(history).toContainEqual(
      expect.objectContaining({ field: 'ward', oldValue: 'Ba Đình' }),
    );
    expect(history).toContainEqual(
      expect.objectContaining({
        field: 'province',
        oldValue: 'Hà Nội',
        newValue: 'Hồ Chí Minh',
      }),
    );
  });

  it('a typed province name links to the province; the list filters by province and commune (TEN-7)', async () => {
    const typed = (
      await create(marketing, { province: 'tp. hồ chí minh' }).expect(201)
    ).body.id as string;
    expect(await detail(marketing, typed)).toMatchObject({
      provinceCode: '79',
    });
    const inWard = (
      await create(marketing, {
        provinceCode: '01',
        wardCode: '00004',
      }).expect(201)
    ).body.id as string;

    const ids = async (agent: Agent, query: Record<string, string>) =>
      (
        (await agent.get(`${API}/leads`).query(query).expect(200)).body
          .items as { id: string }[]
      ).map((item) => item.id);
    expect(await ids(marketing, { province: '79' })).toContain(typed);
    expect(await ids(marketing, { province: '79' })).not.toContain(inWard);
    expect(await ids(marketing, { province: '01', ward: '00004' })).toContain(
      inWard,
    );
    await marketing.get(`${API}/leads`).query({ province: 'HN' }).expect(400);
    // GA-2 filters its own leads only
    expect(await ids(marketing2, { province: '79' })).not.toContain(typed);
  });

  it('PDP-6: erasing a lead wipes its street address and commune, and keeps the province', async () => {
    const id = (
      await create(marketing, {
        provinceCode: '01',
        wardCode: '00004',
        addressLine: '12 Phố Mẫu',
      }).expect(201)
    ).body.id as string;
    await marketing
      .delete(`${API}/leads/${id}`)
      .send({ reason: 'Khách yêu cầu xóa dữ liệu', mode: 'PDP' })
      .expect(204);
    // The test shim leaves out empty columns
    const erased = await connection.collection('leads').findOne({ _id: id });
    expect(erased).toMatchObject({ provinceCode: '01' });
    expect(erased).not.toHaveProperty('wardCode');
    expect(erased).not.toHaveProperty('addressLine');
  });
});
