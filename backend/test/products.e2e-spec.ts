import type { INestApplication } from '@nestjs/common';
import request from 'supertest';
import { startApp, stopApp } from './support/app.js';
import { connection } from './support/collections.js';
import { demoEmail, seedDemoData } from '../src/seed/demo-data.js';

const API = '/api/v1';
const PASSWORD = 'demo-password-123';
const PEER = '00100095';
type Agent = ReturnType<typeof request.agent>;

/** TENANT-5 (decided 25/11/2026): the shared product catalogue, and what it links to. */
describe('Product catalogue (e2e)', () => {
  let app: INestApplication;
  let platform: Agent;
  let head: Agent;
  let fc: Agent;
  let marketing: Agent;
  let head2: Agent;

  const as = async (email: string, password = PASSWORD) => {
    const agent = request.agent(app.getHttpServer());
    await agent
      .post(`${API}/auth/sign-in/email`)
      .send({ email, password })
      .expect(200);
    return agent;
  };
  const save = (
    agent: Agent,
    rows: Record<string, unknown>[],
    fromFile = false,
  ) => agent.post(`${API}/platform/products`).send({ rows, fromFile });
  const product = (code: string, name: string, patch = {}) => ({
    productCode: code,
    productName: name,
    productRole: 'Bổ trợ',
    category: 'Sức khỏe',
    ...patch,
  });

  beforeAll(async () => {
    app = await startApp();
    await seedDemoData(app, PASSWORD);
    platform = await as(
      process.env.PLATFORM_ADMIN_EMAIL!,
      process.env.PLATFORM_ADMIN_PASSWORD!,
    );
    [head, fc, marketing, head2] = await Promise.all([
      as(demoEmail(1, 'head')),
      as(demoEmail(1, 'fc')),
      as(demoEmail(1, 'admin')),
      as(demoEmail(2, 'head')),
    ]);
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

  it('TENANT-5: only the Platform Admin writes; a file upserts by code and is audited as an import', async () => {
    for (const agent of [head, fc])
      await save(agent, [product('HV-01', 'Hỗ Trợ Viện Phí')]).expect(403);

    expect(
      (
        await save(
          platform,
          [
            product('HV-01', 'Hỗ Trợ Viện Phí'),
            product('ULP-01', 'An Phát Đầu Tư Thịnh Vượng', {
              productRole: 'Chính',
              category: 'Liên kết đơn vị',
              fitRule: 'Tuổi 18-60',
            }),
          ],
          true,
        ).expect(200)
      ).body,
    ).toEqual({ inserted: 2, updated: 0 });
    // The same code again updates it; a blank cell clears nothing it did not name
    expect(
      (
        await save(
          platform,
          [product('HV-01', 'Bảo Hiểm Hỗ Trợ Viện Phí', { minEntryAge: '1' })],
          true,
        ).expect(200)
      ).body,
    ).toEqual({ inserted: 0, updated: 1 });
    expect(
      await connection.collection('products').findOne({ productCode: 'HV-01' }),
    ).toMatchObject({
      productName: 'Bảo Hiểm Hỗ Trợ Viện Phí',
      minEntryAge: 1,
      active: true,
    });
    expect(
      await connection
        .collection('auditEvents')
        .countDocuments({ entity: 'products', action: 'IMPORT' }),
    ).toBe(2);
    // A file naming one code twice is refused as a whole
    await save(platform, [product('X-1', 'A'), product('X-1', 'B')]).expect(
      400,
    );
    await save(platform, [product('bad code!', 'A')]).expect(400);
  });

  it('TENANT-5: everyone in a GA reads the shown products, never their matching rules', async () => {
    const { items } = (await fc.get(`${API}/products`).expect(200)).body as {
      items: Record<string, unknown>[];
    };
    const ulp = items.find((item) => item.productCode === 'ULP-01');
    expect(ulp).toMatchObject({
      productName: 'An Phát Đầu Tư Thịnh Vượng',
      productRole: 'Chính',
    });
    expect(ulp).not.toHaveProperty('fitRule');
    expect(JSON.stringify(items)).not.toMatch(
      /fitRule|triggerEvent|ruleStatus/,
    );

    await platform
      .patch(`${API}/platform/products/HV-01`)
      .send({ active: false })
      .expect(204);
    expect(
      (
        (await fc.get(`${API}/products`).expect(200)).body.items as {
          productCode: string;
        }[]
      ).some((item) => item.productCode === 'HV-01'),
    ).toBe(false);
    await platform
      .patch(`${API}/platform/products/KHONG_CO`)
      .send({ active: false })
      .expect(404);
  });

  it("TENANT-5: a policy names its products; the product page lists the policies in the viewer's scope (CUS-8, TEN-7)", async () => {
    const add = async (
      agent: Agent,
      policyNo: string,
      body: Record<string, unknown>,
    ) =>
      (
        await agent
          .post(`${API}/clients`)
          .send({ policyNo, role: 'PO', ...body })
          .expect(201)
      ).body.id as string;
    const mine = await add(fc, '700000001', { name: 'Khách Có ULP' });
    await fc
      .patch(`${API}/clients/${mine}/policies/700000001`)
      .send({
        status: 'Đang hiệu lực',
        products: [{ productCode: 'ULP-01', sumAssuredVnd: 500_000_000 }],
      })
      .expect(204);
    const theirs = await add(head, '700000002', {
      name: 'Khách Nhánh Khác',
      agentCode: PEER,
    });
    await head
      .patch(`${API}/clients/${theirs}/policies/700000002`)
      .send({ products: [{ productCode: 'ULP-01' }] })
      .expect(204);
    // A hidden product is not offered for a new line
    expect(
      (
        await fc
          .patch(`${API}/clients/${mine}/policies/700000001`)
          .send({ products: [{ productCode: 'HV-01' }] })
          .expect(400)
      ).body.error,
    ).toBe('unknown_product');

    // The client page names the product from the catalogue
    const client = (await fc.get(`${API}/clients/${mine}`).expect(200)).body;
    expect(client.policies[0].products[0]).toMatchObject({
      productCode: 'ULP-01',
      catalogueName: 'An Phát Đầu Tư Thịnh Vượng',
    });

    const page = async (agent: Agent) =>
      (await agent.get(`${API}/products/ULP-01`).expect(200)).body as {
        product: { productName: string };
        policies: { policyNo: string; people: { name: string }[] }[] | null;
      };
    expect((await page(fc)).policies?.map((item) => item.policyNo)).toEqual([
      '700000001',
    ]);
    expect((await page(fc)).policies?.[0].people).toEqual([
      expect.objectContaining({
        clientId: mine,
        name: 'Khách Có ULP',
        roles: ['PO', 'LI'],
      }),
    ]);
    expect(
      (await page(head)).policies?.map((item) => item.policyNo).sort(),
    ).toEqual(['700000001', '700000002']);
    // Marketing has no client book: the product, without policies (CUS-5)
    expect((await page(marketing)).policies).toBeNull();
    // GA-2 reads the same catalogue but none of GA-1's policies
    expect((await page(head2)).policies).toEqual([]);
    await fc.get(`${API}/products/KHONG_CO`).expect(404);
  });

  it('TENANT-5: a lead may name the product it is interested in; the list filters by it', async () => {
    const lead = (
      await fc
        .post(`${API}/leads`)
        .send({
          fullName: 'Lead Quan Tâm ULP',
          phone: '0909000777',
          source: 'Facebook',
          consent: true,
          productCode: 'ULP-01',
        })
        .expect(201)
    ).body.id as string;
    expect(
      (
        await fc
          .post(`${API}/leads`)
          .send({
            fullName: 'Lead Sản Phẩm Ẩn',
            phone: '0909000778',
            source: 'Facebook',
            consent: true,
            productCode: 'HV-01',
          })
          .expect(400)
      ).body.error,
    ).toBe('unknown_product');
    const detail = (await fc.get(`${API}/leads/${lead}`).expect(200)).body;
    expect(detail.lead).toMatchObject({
      productCode: 'ULP-01',
      productName: 'An Phát Đầu Tư Thịnh Vượng',
    });
    const listed = (
      await fc.get(`${API}/leads`).query({ product: 'ULP-01' }).expect(200)
    ).body.items as { id: string }[];
    expect(listed.map((item) => item.id)).toEqual([lead]);
    // Cleared with null
    await fc
      .patch(`${API}/leads/${lead}`)
      .send({ productCode: null })
      .expect(200);
    expect(
      (await fc.get(`${API}/leads`).query({ product: 'ULP-01' }).expect(200))
        .body.items,
    ).toEqual([]);
  });
});
