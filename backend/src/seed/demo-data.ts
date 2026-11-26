import type { INestApplicationContext } from '@nestjs/common';
import { Role } from '../common/rbac.js';
import { normalizeName } from '../common/normalize.js';
import { PlatformDb } from '../core/tenancy/platform-db.js';
import { Product } from '../modules/products/product.entity.js';
import { AgentsService } from '../modules/agents/agents.service.js';
import {
  AGENT_STATUSES,
  type AgentRank,
} from '../modules/agents/infrastructure/agent.entity.js';
import { Tenant } from '../modules/tenants/infrastructure/tenant.entity.js';
import { TenantsService } from '../modules/tenants/tenants.service.js';
import { UsersService } from '../modules/users/users.service.js';

const HIERARCHY: {
  key: string;
  name: string;
  roles: Role[];
  agentSuffix?: string;
}[] = [
  // Decided 27/11/2026: the former GA head is a GA director without an agent code
  { key: 'head', name: 'Giám đốc điều hành', roles: [Role.GAD] },
  { key: 'admin', name: 'Quản trị viên', roles: [Role.Admin] },
  { key: 'gad', name: 'Giám đốc GA', roles: [Role.GAD], agentSuffix: '01' },
  { key: 'bm', name: 'Trưởng ban', roles: [Role.BM], agentSuffix: '02' },
  {
    key: 'um',
    name: 'Trưởng nhóm',
    roles: [Role.UM, Role.FC],
    agentSuffix: '03',
  },
  { key: 'fc', name: 'Tư vấn viên', roles: [Role.FC], agentSuffix: '04' },
];

const AGENT_RANK_BY_KEY: Record<string, AgentRank> = {
  gad: 'SUM',
  bm: 'BM',
  um: 'UM',
  fc: 'FC',
};

/**
 * The demo GAs, one per region. `number` drives the e-mails (`head@ga1.gacrm.local`), agent codes
 * (`00100001`) and phones, so GA 1 and GA 2 stay the two GAs the tests compare (TEN-7).
 */
export const DEMO_TENANTS = [
  { number: 1, gaCode: 'GA-HN', name: 'Tổng đại lý khu vực Hà Nội' },
  { number: 2, gaCode: 'GA-HCM', name: 'Tổng đại lý khu vực Hồ Chí Minh' },
  { number: 3, gaCode: 'GA-MT', name: 'Tổng đại lý khu vực Miền Trung' },
  { number: 4, gaCode: 'GA-MN', name: 'Tổng đại lý khu vực Miền Nam' },
  { number: 5, gaCode: 'GA-MB', name: 'Tổng đại lý khu vực Miền Bắc' },
] as const;

export const demoEmail = (ga: number, key: string): string =>
  `${key}@ga${ga}.gacrm.local`;

/**
 * TENANT-5: a demo product catalogue. The first three keep the codes of the programmes GAs started
 * with (PRG-2), so policies entered before the catalogue existed link to it; the others are named
 * after DLVN products the project owner showed, with made-up demo codes, not DLVN's real ones.
 */
export const DEMO_PRODUCTS = [
  {
    productCode: 'AN_TAM_SONG_HANH',
    productName: 'An Tâm Song Hành',
    productRole: 'Chính',
    category: 'Nhân thọ',
  },
  {
    productCode: 'BH_CHAM_SOC_SUC_KHOE',
    productName: 'BH Chăm Sóc Sức Khoẻ',
    productRole: 'Bổ trợ',
    category: 'Sức khỏe',
  },
  {
    productCode: 'BH_TAI_NAN_CAO_CAP',
    productName: 'BH Tai Nạn Cao Cấp',
    productRole: 'Bổ trợ',
    category: 'Tai nạn',
  },
  {
    productCode: 'DEMO-ULP-01',
    productName: 'Sản phẩm bảo hiểm Liên kết đơn vị An Phát Đầu Tư Thịnh Vượng',
    productRole: 'Chính',
    category: 'Liên kết đơn vị',
  },
  {
    productCode: 'DEMO-HC-01',
    productName:
      'Bảo Hiểm Chăm Sóc Sức Khỏe Toàn Cầu 24/7 - Quyền lợi điều trị Nội trú Cao cấp - Đồng chi trả 30%',
    productRole: 'Bổ trợ',
    category: 'Sức khỏe',
  },
  {
    productCode: 'DEMO-HC-02',
    productName:
      'Bảo Hiểm Chăm Sóc Sức Khỏe Toàn Cầu 24/7 - Quyền lợi điều trị Ngoại trú Phổ thông',
    productRole: 'Bổ trợ',
    category: 'Sức khỏe',
  },
  {
    productCode: 'DEMO-HOSP-01',
    productName: 'Bảo Hiểm Hỗ Trợ Viện Phí',
    productRole: 'Bổ trợ',
    category: 'Sức khỏe',
  },
] as const;

/** Section 27.2 fixture: the regional GAs, each with a full hierarchy. Skips a GA that already exists. */
export async function seedDemoData(
  app: INestApplicationContext,
  password: string,
): Promise<string[]> {
  const tenants = app.get(TenantsService);
  const users = app.get(UsersService);
  const agents = app.get(AgentsService);
  const platformDb = app.get(PlatformDb);
  const created: string[] = [];

  // TENANT-5: the shared catalogue, added once (products the platform already has stay as they are)
  await platformDb.run('platform-console', async (db) => {
    const now = new Date();
    await db
      .createQueryBuilder()
      .insert()
      .into(Product)
      .values(
        DEMO_PRODUCTS.map((product) => ({
          ...product,
          nameNorm: normalizeName(product.productName),
          ruleStatus: 'DRAFT' as const,
          active: true,
          createdAt: now,
          updatedAt: now,
        })),
      )
      .orIgnore()
      .execute();
  });

  for (const { number, gaCode, name } of DEMO_TENANTS) {
    const code = (suffix: string) => `00${number}000${suffix}`;
    const existing = await platformDb.run('platform-console', (db) =>
      db.getRepository(Tenant).findOneBy({ gaCode }),
    );
    const tenant =
      existing ??
      (await platformDb.run('platform-console', (db) =>
        tenants.create({ gaCode, name }, db),
      ));

    // AGT-2: each agent role reports to the one above it. A GA with a tree is left alone.
    const chain = HIERARCHY.filter((person) => person.agentSuffix);
    await agents.seedDemo(
      { tenantId: tenant.id },
      chain.map((person, index) => ({
        agentCode: code(person.agentSuffix!),
        name: `${person.name} ${number}`,
        rank: AGENT_RANK_BY_KEY[person.key],
        status: AGENT_STATUSES[0],
        startDate: '2024-01-01',
        managerCode: index > 0 ? code(chain[index - 1].agentSuffix!) : null,
      })),
    );
    if (existing) continue;

    for (const { key, name: userName, roles, agentSuffix } of HIERARCHY) {
      const email = demoEmail(number, key);
      await users.createActive(tenant.id, {
        email,
        name: `${userName} ${number}`,
        roles,
        agentCode: agentSuffix ? code(agentSuffix) : undefined,
        password,
      });
      created.push(email);
    }
  }
  return created;
}
