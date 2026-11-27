import type { INestApplicationContext } from '@nestjs/common';
import { hashPassword } from '../common/crypto.js';
import { actorOf, Role } from '../common/rbac.js';
import type { Actor, Scope } from '../common/rbac.js';
import { rowsOf } from '../core/persistence/sql.js';
import { PlatformDb } from '../core/tenancy/platform-db.js';
import { TenantDb } from '../core/tenancy/tenant-db.js';
import { AgentsService } from '../modules/agents/agents.service.js';
import {
  AGENT_STATUSES,
  type AgentRank,
} from '../modules/agents/infrastructure/agent.entity.js';
import { ClientEditorService } from '../modules/clients/client-editor.service.js';
import { ImportsService } from '../modules/imports/imports.service.js';
import type {
  LeadCareStatus,
  LeadInterest,
} from '../modules/leads/lead-rules.js';
import { LeadsService } from '../modules/leads/leads.service.js';
import { Tenant } from '../modules/tenants/infrastructure/tenant.entity.js';
import { TenantsService } from '../modules/tenants/tenants.service.js';
import { UsersService } from '../modules/users/users.service.js';
import { DEMO_TENANTS, demoEmail } from './demo-data.js';

const DAY_MS = 24 * 60 * 60 * 1000;
const ACTIVE = AGENT_STATUSES[0];
const INACTIVE = AGENT_STATUSES[1];

/** The password of every demo account. Local demos only: the seed refuses to run in production. */
export const DEMO_PASSWORD = 'Demo@2026';

interface AgentSeed {
  suffix: string;
  name?: string;
  rank?: AgentRank;
  manager?: string;
  gender: string;
  dob: string;
  startDate: string;
  office: string;
  endDate?: string;
}

/** The hierarchy of demo-data.ts, then more people so branches and counts are worth looking at. */
const AGENTS: AgentSeed[] = [
  {
    suffix: '01',
    gender: 'Nam',
    dob: '1975-03-20',
    startDate: '2018-01-15',
    office: 'HN01',
  },
  {
    suffix: '02',
    gender: 'Nữ',
    dob: '1980-07-10',
    startDate: '2019-06-01',
    office: 'HN01',
  },
  {
    suffix: '03',
    gender: 'Nam',
    dob: '1986-11-02',
    startDate: '2021-03-15',
    office: 'HN02',
  },
  {
    suffix: '04',
    gender: 'Nữ',
    dob: '1993-05-25',
    startDate: '2023-02-01',
    office: 'HN02',
  },
  {
    suffix: '05',
    name: 'Phạm Thu Hà',
    rank: 'FC',
    manager: '03',
    gender: 'Nữ',
    dob: '1995-08-14',
    startDate: '2023-09-01',
    office: 'HN02',
  },
  {
    suffix: '06',
    name: 'Đỗ Minh Tuấn',
    rank: 'FC',
    manager: '03',
    gender: 'Nam',
    dob: '1991-12-03',
    startDate: '2022-11-15',
    office: 'HN02',
  },
  {
    suffix: '07',
    name: 'Hoàng Anh Dũng',
    rank: 'UM',
    manager: '02',
    gender: 'Nam',
    dob: '1984-02-18',
    startDate: '2020-04-01',
    office: 'HP01',
  },
  {
    suffix: '08',
    name: 'Vũ Thị Mai',
    rank: 'FC',
    manager: '07',
    gender: 'Nữ',
    dob: '1996-06-30',
    startDate: '2024-01-10',
    office: 'HP01',
  },
  {
    suffix: '09',
    name: 'Bùi Quang Huy',
    rank: 'SA',
    manager: '07',
    gender: 'Nam',
    dob: '1990-09-09',
    startDate: '2022-05-20',
    office: 'HP01',
  },
  {
    suffix: '10',
    name: 'Ngô Thị Lan',
    rank: 'FC',
    manager: '07',
    gender: 'Nữ',
    dob: '1988-01-22',
    startDate: '2021-07-01',
    office: 'HP01',
    endDate: '2026-06-30',
  },
];

const EXTRA_USERS = [
  { key: 'fc2', suffix: '05' },
  { key: 'fc3', suffix: '06' },
  { key: 'um2', suffix: '07', roles: [Role.UM, Role.FC] },
  { key: 'fc4', suffix: '08' },
];

const CAMPAIGNS = [
  { name: 'Facebook quý 4', type: 'ADS' },
  { name: 'Hội thảo Hành trình an tâm', type: 'SEMINAR' },
  { name: 'Khách giới thiệu 2026', type: 'REFERRAL' },
];
const SOURCES = ['Facebook', 'Zalo', 'Giới thiệu', 'Hội thảo', 'Website'];
const PLACES = ['Hà Nội', 'Hải Phòng', 'Đà Nẵng', 'TP.HCM', 'Cần Thơ'];
const FAMILY = [
  'Nguyễn',
  'Trần',
  'Lê',
  'Phạm',
  'Hoàng',
  'Vũ',
  'Đặng',
  'Bùi',
  'Đỗ',
  'Ngô',
];
const MIDDLE_F = ['Thị', 'Thu', 'Ngọc', 'Minh'];
const MIDDLE_M = ['Văn', 'Đức', 'Quang', 'Minh'];
const GIVEN_F = ['Lan', 'Hương', 'Mai', 'Trang', 'Linh', 'Thảo'];
const GIVEN_M = ['Nam', 'Hùng', 'Tuấn', 'Long', 'Khoa', 'Sơn'];
const PRODUCTS = ['An Tâm Trọn Đời', 'Thẻ sức khỏe Vàng', 'Tích lũy Giáo dục'];

type Scenario =
  | 'new'
  | 'overdue'
  | 'caring'
  | 'appointment'
  | 'proposal'
  | 'won'
  | 'issued'
  | 'dropped'
  | 'notInterested'
  | 'notReached'
  | 'unassigned'
  | 'own';

/** One of each situation the screens can show, several times over. */
const SCENARIOS: Scenario[] = [
  ...Array<Scenario>(5).fill('new'),
  ...Array<Scenario>(4).fill('overdue'),
  ...Array<Scenario>(6).fill('caring'),
  ...Array<Scenario>(3).fill('appointment'),
  ...Array<Scenario>(3).fill('proposal'),
  ...Array<Scenario>(4).fill('won'),
  ...Array<Scenario>(1).fill('issued'),
  ...Array<Scenario>(3).fill('dropped'),
  ...Array<Scenario>(2).fill('notInterested'),
  ...Array<Scenario>(3).fill('notReached'),
  ...Array<Scenario>(5).fill('unassigned'),
  ...Array<Scenario>(3).fill('own'),
];

const iso = (date: Date) => date.toISOString().slice(0, 10);

function personOf(index: number) {
  const female = index % 2 === 0;
  const pick = <T>(list: readonly T[], at: number) => list[at % list.length];
  return {
    female,
    name: [
      pick(FAMILY, index),
      pick(female ? MIDDLE_F : MIDDLE_M, index + 1),
      pick(female ? GIVEN_F : GIVEN_M, index >> 1),
    ].join(' '),
  };
}

export interface ShowcaseCounts {
  agents: number;
  users: number;
  leads: number;
  clients: number;
}

/**
 * Fills a demo GA so every screen has something to show. Everything goes through the real services,
 * so history, tasks and the audit log are what the app itself would have written. Dates are then moved
 * back, because a lead that looks overdue has to have been assigned days ago. Runs once per GA.
 */
export async function seedShowcase(
  app: INestApplicationContext,
  password: string,
): Promise<ShowcaseCounts> {
  const platformDb = app.get(PlatformDb);
  const tenantDb = app.get(TenantDb);
  const tenants = app.get(TenantsService);
  const users = app.get(UsersService);
  const agents = app.get(AgentsService);
  const leads = app.get(LeadsService);
  const imports = app.get(ImportsService);
  const clientEditor = app.get(ClientEditorService);
  const counts: ShowcaseCounts = { agents: 0, users: 0, leads: 0, clients: 0 };

  for (const { number, gaCode } of DEMO_TENANTS) {
    const tenant = await platformDb.run('platform-console', (db) =>
      db.getRepository(Tenant).findOneBy({ gaCode }),
    );
    if (!tenant) continue;
    const scope: Scope = { tenantId: tenant.id };
    // Within the GA, so the setup steps below can use row-level security like the app does
    const sql = <T>(text: string, params: unknown[] = []) =>
      tenantDb.run(scope, (db) => rowsOf<T>(db, text, params));
    const [seeded] = await sql<{ id: string }>(
      `SELECT id FROM campaigns WHERE tenant_id = $1 AND name = $2`,
      [scope.tenantId, CAMPAIGNS[0].name],
    );
    if (seeded) continue;

    const code = (suffix: string) => `00${number}000${suffix}`;
    const email = (key: string) => demoEmail(number, key);
    const { grants } = await tenants.getSettings(scope);
    const actorFor = async (key: string): Promise<Actor> => {
      const [user] = await sql<{
        id: string;
        name: string;
        roles: string[];
        agentCode: string | null;
      }>(
        `SELECT id, name, roles, agent_code AS "agentCode" FROM users
          WHERE tenant_id = $1 AND email = $2`,
        [scope.tenantId, email(key)],
      );
      return actorOf(
        { ...user, email: email(key), tenantId: scope.tenantId },
        grants,
      );
    };
    const head = await actorFor('head');
    // Decided 26/11/2026: Admin does what Marketing did (leads, campaigns, lead files)
    const marketing = await actorFor('admin');

    // Agents: fill what the fixture left empty, and add the rest of the tree
    for (const seed of AGENTS) {
      const agentCode = code(seed.suffix);
      const details = {
        gender: seed.gender,
        dob: seed.dob,
        phone: `09${number}00000${seed.suffix}`,
        officeCode: seed.office,
        startDate: seed.startDate,
      };
      const existing = await agents.get(head, agentCode).catch(() => null);
      if (existing) {
        const missing = Object.fromEntries(
          Object.entries(details).filter(
            ([field]) => !existing[field as keyof typeof existing],
          ),
        );
        if (Object.keys(missing).length > 0)
          await agents.update(head, agentCode, missing);
      } else {
        await agents.create(head, {
          agentCode,
          name: `${seed.name} ${number}`,
          rank: seed.rank!,
          status: seed.endDate ? INACTIVE : ACTIVE,
          managerCode: code(seed.manager!),
          endDate: seed.endDate,
          ...details,
        });
        counts.agents++;
      }
    }

    // Users: more agents who can sign in, one invite still pending, one account locked
    for (const { key, suffix, roles } of EXTRA_USERS) {
      const [known] = await sql<{ id: string }>(
        `SELECT id FROM users WHERE tenant_id = $1 AND email = $2`,
        [scope.tenantId, email(key)],
      );
      if (known) continue;
      const seed = AGENTS.find((agent) => agent.suffix === suffix)!;
      await users.createActive(scope.tenantId, {
        email: email(key),
        name: `${seed.name} ${number}`,
        roles: roles ?? [Role.FC],
        agentCode: code(suffix),
        password,
      });
      counts.users++;
    }
    // USER-13: a FC who left; archiving freed their agent code for the new FC invited below
    const departed = await users.createActive(scope.tenantId, {
      email: email('fc.danghi'),
      name: `Đỗ Văn Tâm ${number}`,
      roles: [Role.FC],
      agentCode: code('09'),
      password,
    });
    await users.archive(scope, head, departed.id, 'Nghỉ việc');
    await users.invite(scope, head, {
      email: email('fc.moi'),
      name: `Bùi Quang Huy ${number}`,
      roles: [Role.FC],
      agentCode: code('09'),
    });
    const locked = await users.createActive(scope.tenantId, {
      email: email('fc.nghi'),
      name: `Ngô Thị Lan ${number}`,
      roles: [Role.FC],
      agentCode: code('10'),
      password,
    });
    await users.disable(scope, head, locked.id);
    counts.users += 3;

    const now = Date.now();
    const signedIn = [
      'head',
      'admin',
      'bm',
      'um',
      'fc',
      'fc2',
      'um2',
    ];
    for (const [index, key] of signedIn.entries())
      await sql(
        `UPDATE users SET last_login_at = $3 WHERE tenant_id = $1 AND email = $2`,
        [scope.tenantId, email(key), new Date(now - index * 5 * 3_600_000)],
      );

    const inserted = await sql<{ id: string; name: string }>(
      `INSERT INTO campaigns (tenant_id, name, type, status)
         SELECT $1, name, type, 'ACTIVE' FROM unnest($2::text[], $3::text[]) AS c (name, type)
       RETURNING id, name`,
      [
        scope.tenantId,
        CAMPAIGNS.map((campaign) => campaign.name),
        CAMPAIGNS.map((campaign) => campaign.type),
      ],
    );
    const campaigns = CAMPAIGNS.map((campaign) =>
      inserted.find((row) => row.name === campaign.name)!,
    );

    // Leads
    const fieldAgents = ['fc', 'fc2', 'fc3', 'fc4', 'um'];
    const workers = new Map<string, Actor>();
    for (const key of fieldAgents) workers.set(key, await actorFor(key));
    const manager = await actorFor('um');

    for (const [index, scenario] of SCENARIOS.entries()) {
      const person = personOf(index + number);
      const province = PLACES[index % PLACES.length];
      const source = SOURCES[index % SOURCES.length];
      const campaign = campaigns[index % campaigns.length];
      const birthYear = 1965 + ((index * 3) % 35);
      const phone = `08${number}1${String(100000 + index).slice(-6)}`;
      const workerKey = fieldAgents[index % fieldAgents.length];
      const worker = workers.get(workerKey)!;
      const base = {
        fullName: person.name,
        phone,
        source,
        consent: index % 3 !== 0,
        email: `khach${number}${index}@example.com`,
        province,
        gender: person.female ? 'Nữ' : 'Nam',
        dob: `${birthYear}-${String((index % 12) + 1).padStart(2, '0')}-15`,
        note: `Khách quan tâm ${PRODUCTS[index % PRODUCTS.length].toLowerCase()}, nhờ tư vấn thêm.`,
      };
      const created =
        scenario === 'own'
          ? await leads.create(workers.get('fc')!, base)
          : await leads.create(marketing, {
              ...base,
              campaignId: campaign.id,
              ...(scenario !== 'unassigned' && {
                assignedAgentCode: worker.agentCode ?? undefined,
              }),
            });
      const id = created.id;
      const acting = scenario === 'own' ? workers.get('fc')! : worker;
      const daysAgo =
        scenario === 'new' || scenario === 'unassigned'
          ? index % 2
          : 3 + (index % 25);
      const started = new Date(now - daysAgo * DAY_MS - DAY_MS / 4);
      const contactAt = (days: number) =>
        new Date(Math.min(started.getTime() + days * DAY_MS, now - 3_600_000));
      const contact = (
        type: 'CALL' | 'ZALO' | 'MEETING',
        note: string,
        days: number,
        outcome?: string,
      ) =>
        leads.addActivity(acting, id, {
          type,
          note,
          outcome,
          occurredAt: contactAt(days),
        });
      const setStatus = (
        interest?: LeadInterest,
        careStatus?: LeadCareStatus,
        extra: object = {},
      ) => leads.update(acting, id, { interest, careStatus, ...extra });

      switch (scenario) {
        case 'caring':
          await contact(
            'CALL',
            'Đã gọi giới thiệu sản phẩm, khách muốn tìm hiểu thêm.',
            0.5,
            'Nghe máy',
          );
          await setStatus(index % 2 ? 'LIFE' : 'HEALTH_CARD', 'CARING');
          await leads.update(acting, id, {
            nextActionAt: new Date(now + ((index % 6) + 1) * DAY_MS),
          });
          await leads.addTask(acting, id, {
            title: 'Gửi bảng minh họa quyền lợi',
            dueAt: new Date(now + (index % 3 ? 1 : -1) * 2 * DAY_MS),
          });
          break;
        case 'appointment':
          await contact(
            'ZALO',
            'Nhắn Zalo hẹn lịch gặp, khách đồng ý.',
            0.5,
            'Đã hẹn',
          );
          await setStatus('LIFE', 'CARING', { stage: 'APPOINTMENT' });
          await leads.update(acting, id, {
            nextActionAt: new Date(now + 2 * DAY_MS),
          });
          break;
        case 'proposal':
          await contact(
            'MEETING',
            'Gặp trực tiếp, đã tư vấn giải pháp cho gia đình.',
            1,
            'Khách cân nhắc',
          );
          await setStatus('LIFE', 'CARING', { stage: 'PROPOSAL' });
          break;
        case 'won':
          await contact(
            'MEETING',
            'Khách đồng ý tham gia, đã nộp hồ sơ.',
            2,
            'Đồng ý',
          );
          await setStatus('LIFE', 'WON', {
            applicationNo: `HS${number}${String(1000 + index)}`,
            policyNo:
              index % 2 ? `0${number}${String(1000000 + index)}` : undefined,
          });
          break;
        case 'issued':
          await contact(
            'MEETING',
            'Hợp đồng đã phát hành, bàn giao cho khách.',
            3,
            'Hoàn tất',
          );
          await setStatus('LIFE', 'WON', {
            applicationNo: `HS${number}${String(2000 + index)}`,
          });
          await leads.update(marketing, id, { stage: 'ISSUED' });
          break;
        case 'dropped':
          await contact(
            'CALL',
            'Khách cho biết đã tham gia ở công ty khác.',
            1,
            'Từ chối',
          );
          await setStatus('LIFE', 'DROPPED', { lostReason: 'Đã mua bên khác' });
          break;
        case 'notInterested':
          await contact(
            'CALL',
            'Khách chưa có nhu cầu lúc này.',
            0.5,
            'Từ chối',
          );
          await setStatus('NOT_INTERESTED', 'NOT_INTERESTED');
          break;
        case 'notReached':
          await contact(
            'CALL',
            'Gọi hai lần không nghe máy, sẽ thử lại.',
            0.5,
            'Không nghe máy',
          );
          await setStatus('NOT_REACHED');
          break;
        case 'own':
          await contact(
            'ZALO',
            'Khách do người quen giới thiệu trực tiếp.',
            0.5,
            'Đang trao đổi',
          );
          await setStatus('UNDETERMINED', 'CARING');
          break;
        default:
      }

      // CMT: the line manager coaches, so the "new comment" tab has content
      if (scenario === 'caring' || scenario === 'overdue') {
        const [leadRow] = await sql<{ assignedAgentCode: string | null }>(
          `SELECT assigned_agent_code AS "assignedAgentCode" FROM leads
            WHERE tenant_id = $1 AND id = $2`,
          [scope.tenantId, id],
        );
        const coach =
          leadRow?.assignedAgentCode === manager.agentCode
            ? marketing
            : manager;
        await leads
          .addComment(coach, id, {
            body: 'Em ưu tiên gọi sớm lead này nhé, khách có tiềm năng.',
          })
          .catch(() =>
            leads.addComment(marketing, id, {
              body: 'Nhờ em ưu tiên gọi sớm lead này.',
            }),
          );
      }

      // The fields only a GA's own file carries, then the dates that make a lead look its age
      const assigned = scenario !== 'unassigned';
      const seen = assigned && scenario !== 'new' && scenario !== 'overdue';
      await sql(
        `UPDATE leads SET
            external_id = $3, phone_source = $4, age = $5, registered_at = $6,
            product_interest = $7, product_secondary = $8, value_vnd = $9, ref_link = $10,
            extra_info = $11, message_status = $12, progress_note = $13, lead_date = $17,
            created_at = $14, updated_at = $14,
            assigned_at = CASE WHEN $15 THEN $14 ELSE assigned_at END,
            -- A few agents have opened their leads, so "newly assigned" is not everything
            assignee_seen_at = CASE WHEN $16 THEN $14 ELSE assignee_seen_at END,
            assignee_viewed_at = CASE WHEN $16 THEN $14 ELSE assignee_viewed_at END
          WHERE tenant_id = $1 AND id = $2`,
        [
          scope.tenantId,
          id,
          `DEMO-${number}${String(index + 1).padStart(3, '0')}`,
          index % 2 ? 'Form đăng ký' : 'Danh sách hội thảo',
          new Date(now).getFullYear() - birthYear,
          iso(started),
          PRODUCTS[index % PRODUCTS.length],
          PRODUCTS[(index + 1) % PRODUCTS.length],
          5_000_000 + index * 1_000_000,
          'https://example.com/chien-dich',
          'Khách tiện liên hệ sau 18 giờ.',
          index % 2 ? 'Đã gửi' : 'Chưa gửi',
          base.note,
          started,
          assigned,
          seen,
          iso(started),
        ],
      );
      await sql(
        `UPDATE lead_history SET changed_at = $3 WHERE tenant_id = $1 AND lead_id = $2`,
        [scope.tenantId, id, started],
      );
      await sql(
        `UPDATE interactions SET occurred_at = $3
          WHERE tenant_id = $1 AND lead_id = $2 AND initial`,
        [scope.tenantId, id, started],
      );
      await sql(
        `UPDATE tasks SET due_at = $3
          WHERE tenant_id = $1 AND lead_id = $2 AND source = 'AUTO_ASSIGN'`,
        [scope.tenantId, id, new Date(started.getTime() + 2 * DAY_MS)],
      );
      counts.leads++;
    }
    // Import history: a finished file with mistakes in it, so the report has something to show
    const leadHeaders = [
      'SỐ ĐIỆN THOẠI',
      'TÊN KHÁCH HÀNG',
      'Nguồn',
      'NGÀY CẬP NHẬT LEAD',
      'Mã đại lý',
      'Tình Trạng TVV',
      'Trạng Thái Hiện Tại TVV',
      'Chiến Dịch',
      'TIẾN ĐỘ TƯ VẤN TVV',
      'ĐỒNG Ý LIÊN HỆ',
    ];
    const fileDate = new Intl.DateTimeFormat('en-GB', {
      timeZone: 'Asia/Ho_Chi_Minh',
    }).format(new Date(now - 2 * DAY_MS));
    const leadRows = [
      [
        `08${number}2000001`,
        'Lý Thị Hồng',
        'Facebook',
        fileDate,
        code('04'),
        'Chưa xác định',
        'Hẹn gọi lại',
        CAMPAIGNS[0].name,
        'Khách hẹn gọi lại cuối tuần.',
        'Có',
      ],
      [
        `08${number}2000002`,
        'Mai Văn Phúc',
        'Website',
        fileDate,
        'Không Rõ Tên',
        'Knm',
        null,
        CAMPAIGNS[0].name,
        null,
        'Chưa',
      ],
      [
        '12345',
        'Sai Số Điện Thoại',
        'Zalo',
        fileDate,
        null,
        null,
        null,
        null,
        null,
        null,
      ],
      [
        `08${number}2000004`,
        'Sai Nhãn',
        'Zalo',
        fileDate,
        null,
        'Có thể',
        null,
        null,
        null,
        null,
      ],
      [
        `08${number}2000001`,
        'Lý Thị Hồng Trùng',
        'Facebook',
        fileDate,
        null,
        null,
        null,
        null,
        null,
        null,
      ],
    ];
    const leadImport = await imports.create(marketing, {
      fileName: 'chia-lead-mau.xlsx',
      snapshotDate: iso(new Date(now - 2 * DAY_MS)),
      kind: 'LEADS',
      sheets: [{ name: 'Chia Lead', headers: leadHeaders }],
    });
    await imports.addRows(marketing, leadImport.id, {
      sheet: 'Chia Lead',
      rows: leadRows.map((c, offset) => ({ r: offset + 2, c })),
    });
    await imports.validate(marketing, leadImport.id);
    await imports.commit(marketing, leadImport.id);
    counts.leads += 2;

    // And one waiting for confirmation, so the preview screen can be tried without a file
    const admin = await actorFor('admin');
    const pending = await imports.create(admin, {
      fileName: 'cay-dai-ly-cho-xac-nhan.xlsx',
      snapshotDate: iso(new Date(now)),
      kind: 'SUCCESS',
      sheets: [
        {
          name: '01_Agents',
          headers: [
            'Quản lý',
            'Tư vấn tài chính',
            'Trạng thái',
            'Ngày bắt đầu hoạt động',
          ],
        },
      ],
    });
    await imports.addRows(admin, pending.id, {
      sheet: '01_Agents',
      rows: [
        {
          r: 2,
          c: [
            `UM: ${code('07')}-Hoàng Anh Dũng ${number}`,
            `FC: ${code('11')}-Đại Lý Mới ${number}`,
            ACTIVE,
            '01/11/2026',
          ],
        },
        { r: 3, c: ['', '9000001', 'Nghỉ', '31/02/2026'] },
      ],
    });
    await imports.validate(admin, pending.id);

    // Slice 4b: clients and policies entered by hand, so the client screens have something to show.
    // A client is added on a policy by its number and role (decided 25/11/2026), then the policy is
    // filled in; policy 1 is a family one: the father pays, the mother and daughter are insured.
    const policyNo = (n: number) => `0${number}000000${n}`;
    const fcActor = workers.get('fc')!;
    // Typed loosely: the editor's DTO classes are not built by hand anywhere else
    const policy = (patch: Record<string, unknown> = {}): never =>
      ({
        status: 'Đang hiệu lực',
        effectiveDate: '2024-06-01',
        maturityDate: '2044-06-01',
        premiumFrequency: 'Năm',
        basePremiumVnd: 18_000_000,
        premiumDueDate: iso(new Date(now + 20 * DAY_MS)),
        // The policy page's detail and premium fields (decided 25/11/2026)
        contactAddress: `${number}2 Đường Mẫu, Phường Mẫu, TP.HCM`,
        graceEndDate: iso(new Date(now + 80 * DAY_MS)),
        plannedPremiumVnd: 18_000_000,
        totalPaidPremiumVnd: 36_000_000,
        basicPremiumVnd: 18_000_000,
        products: [
          {
            productCode: 'AN_TAM_SONG_HANH',
            sumAssuredVnd: 600_000_000,
            termYears: 20,
            annualPremiumVnd: 15_000_000,
          },
        ],
        ...patch,
      }) as never;
    const holder = async (
      actor: typeof fcActor,
      n: number,
      person: Record<string, unknown>,
      fields?: never,
    ) => {
      const { id } = await clientEditor.create(actor, {
        policyNo: policyNo(n),
        role: 'PO',
        ...person,
      } as never);
      if (fields)
        await clientEditor.updatePolicy(actor, id, policyNo(n), fields);
      return id;
    };
    await holder(
      fcActor,
      1,
      {
        name: `Võ Thành Đạt ${number}`,
        phone: '0909123401',
        dob: '1984-03-15',
        gender: 'Nam',
        maritalStatus: 'Đã kết hôn',
        tier: 'Vàng',
        usesDconnect: true,
      },
      policy({
        products: [
          {
            productCode: 'AN_TAM_SONG_HANH',
            sumAssuredVnd: 800_000_000,
            termYears: 20,
            annualPremiumVnd: 18_000_000,
          },
          {
            productCode: 'BH_CHAM_SOC_SUC_KHOE',
            sumAssuredVnd: 200_000_000,
            annualPremiumVnd: 3_000_000,
          },
          {
            productCode: 'BH_CHAM_SOC_SUC_KHOE',
            insuredName: `Võ Gia Hân ${number}`,
            insuredDob: '2016-08-20',
            insuredGender: 'Nữ',
            sumAssuredVnd: 100_000_000,
            annualPremiumVnd: 1_500_000,
          },
        ],
      }),
    );
    for (const person of [
      { name: `Phan Thị Lan ${number}`, dob: '1987-07-04', gender: 'Nữ' },
      { name: `Võ Gia Hân ${number}`, dob: '2016-08-20', gender: 'Nữ' },
    ])
      await clientEditor.create(fcActor, {
        policyNo: policyNo(1),
        role: 'LI',
        ...person,
      } as never);
    await holder(
      fcActor,
      2,
      {
        name: `Đinh Thị Mai ${number}`,
        dob: '1992-11-02',
        gender: 'Nữ',
        tier: 'Bạc',
        usesDconnect: false,
      },
      policy({
        premiumFrequency: 'Quý',
        basePremiumVnd: 4_500_000,
        unpaidPremiumVnd: 4_500_000,
        products: [
          {
            productCode: 'BH_TAI_NAN_CAO_CAP',
            sumAssuredVnd: 300_000_000,
            annualPremiumVnd: 1_200_000,
          },
        ],
      }),
    );
    await holder(
      fcActor,
      3,
      {
        name: `Lý Quốc Huy ${number}`,
        dob: '1968-01-25',
        gender: 'Nam',
        tier: 'Kim Cương',
      },
      policy({ status: 'Mất hiệu lực', premiumDueDate: '2026-01-15' }),
    );
    // A policy known only by its number so far
    await holder(workers.get('fc2')!, 4, {
      name: `Tạ Thu Trang ${number}`,
      dob: '1995-06-30',
      gender: 'Nữ',
      tier: 'Thân thiết',
    });
    await holder(
      head,
      5,
      {
        name: `Hà Minh Tuấn ${number}`,
        dob: '1979-09-09',
        gender: 'Nam',
        agentCode: code('03'),
      },
      policy(),
    );
    counts.clients += 7;
  }
  return counts;
}

/**
 * Every demo account signs in with one known password, so a demo needs no digging through `.env`.
 * Also forgets failed sign-ins, so an earlier mistake cannot leave an account locked. Disabled and
 * archived accounts keep their status, so they still cannot sign in.
 */
export async function applyDemoPasswords(
  app: INestApplicationContext,
  password: string,
  platformAdminEmail: string,
): Promise<void> {
  const passwordHash = await hashPassword(password);
  await app.get(PlatformDb).run('platform-console', async (db) => {
    await db.query(
      `UPDATE users SET password_hash = $1
        WHERE status <> 'INVITED'
          AND (email ~ '@ga[12]\\.gacrm\\.local$' OR email = $2)`,
      [passwordHash, platformAdminEmail.toLowerCase()],
    );
    await db.query(`DELETE FROM login_attempts`);
  });
}
