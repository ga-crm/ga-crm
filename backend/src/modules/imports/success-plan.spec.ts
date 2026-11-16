import type { PolicyAgent } from '../clients/infrastructure/client.entities.js';
import {
  parseDateTime,
  parseDayMonth,
  parseKey,
  parsePercent,
  parseSuccessRow,
} from './success-cells.js';
import type {
  ExistingPolicy,
  ParsedPolicyRow,
  SuccessPlanInput,
} from './success-plan.js';
import { agentsText, planSuccess } from './success-plan.js';
import { CLIENTS_SHEET } from './templates.js';

const NOW = new Date('2026-11-10T03:00:00Z');
const FC = '9000001';
const FC2 = '9000003';
const UM = '9000002';
const OTHER = '9000099';

const policyRow = (patch: Partial<ParsedPolicyRow> = {}): ParsedPolicyRow => ({
  policyNo: '000000001',
  holderClientCode: '0000000001',
  insuredClientCode: '0000000001',
  agentCode: FC,
  holderName: 'Nguyễn Văn Khách',
  insuredName: 'Nguyễn Văn Khách',
  status: 'Đang hiệu lực',
  effectiveDate: '2024-06-01',
  maturityDate: '2044-06-01',
  premiumFrequency: 'Năm',
  basePremiumVnd: 12_000_000,
  ...patch,
});

const existingPolicy = (
  agents: Partial<PolicyAgent>[],
  servicing?: string,
): ExistingPolicy => ({
  ...policyRow(),
  holderNameNorm: 'NGUYEN VAN KHACH',
  insuredNameNorm: 'NGUYEN VAN KHACH',
  servicingAgentCode: servicing,
  agents: agents.map((agent) => ({
    agentCode: agent.agentCode!,
    splitPercent: agent.splitPercent,
    isServicing: agent.agentCode === servicing,
    startedAt: new Date('2024-01-01'),
    endedAt: agent.endedAt,
  })),
  currentAgentCodes: agents
    .filter((agent) => !agent.endedAt)
    .map((agent) => agent.agentCode!),
  clients: [
    { clientCode: '0000000001', role: 'PO', source: 'POLICY' },
    { clientCode: '0000000001', role: 'LI', source: 'POLICY' },
  ],
  products: [],
});

const fcUploader = {
  tenantWide: false,
  reach: 'OWN' as const,
  agentCode: FC,
  scope: new Set([FC]),
};
const gaUploader = {
  tenantWide: true,
  reach: 'TENANT' as const,
  scope: new Set<string>(),
};

const input = (patch: Partial<SuccessPlanInput>): SuccessPlanInput => ({
  clients: [],
  policies: [],
  products: [],
  applications: [],
  existingClients: new Map(),
  existingPolicies: new Map(),
  existingApplications: new Map(),
  knownAgents: new Set([FC, FC2, UM]),
  uploader: fcUploader,
  now: NOW,
  ...patch,
});
const rows = <T>(...items: T[]) =>
  items.map((data, index) => ({ rowNo: index + 2, data }));
const codes = (plan: ReturnType<typeof planSuccess>, sheet: string) =>
  plan.sheets[sheet as '03_Policies']!.issues.map((issue) => [
    issue.row,
    issue.code,
  ]);

describe('Success cells', () => {
  it('IMP-6: keys keep their leading zeros, and lost ones come back with a warning', () => {
    expect(parseKey('clientKey', '0000000001')).toEqual({
      key: '0000000001',
      padded: false,
    });
    expect(parseKey('clientKey', '1')).toEqual({
      key: '0000000001',
      padded: true,
    });
    expect(parseKey('policyKey', '1234')).toEqual({
      key: '000001234',
      padded: true,
    });
    expect(parseKey('clientKey', '12345678901')).toBeNull();
    expect(parseKey('clientKey', 'ABC')).toBeNull();
    expect(parseKey('applicationKey', 'A0001')).toEqual({
      key: 'A0001',
      padded: false,
    });
    expect(parseKey('applicationKey', 'A0')).toBeNull();
  });

  it('IMP-8: percentages, date-times and day-months in the formats people write', () => {
    expect(parsePercent('60%')).toBe(60);
    expect(parsePercent('60')).toBe(60);
    expect(parsePercent('0.6')).toBe(60);
    expect(parsePercent(0.6)).toBe(60);
    expect(parsePercent(1)).toBe(100);
    expect(parsePercent('120%')).toBeNull();
    expect(parseDateTime('01/11/2026 08:30')).toBe('2026-11-01T01:30:00.000Z');
    expect(parseDateTime('2026-11-01T08:30:00+07:00')).toBe(
      '2026-11-01T01:30:00.000Z',
    );
    expect(parseDateTime('31/02/2026 08:30')).toBeNull();
    expect(parseDayMonth('9/5')).toBe('09/05');
    expect(parseDayMonth('29/02')).toBe('29/02');
    expect(parseDayMonth('31/04')).toBeNull();
  });

  it('IMP-5 + IMP-7: blank cells stay absent; lists ignore case; bad cells are refused one by one', () => {
    const fields = ['clientCode', 'name', 'tier', 'phone', 'usesDconnect'];
    const ok = parseSuccessRow(
      CLIENTS_SHEET,
      fields,
      ['1', 'Khách', 'vàng', '', 'Có'],
      'clientCode',
    );
    expect(ok.data).toEqual({
      clientCode: '0000000001',
      name: 'Khách',
      tier: 'Vàng',
      usesDconnect: true,
    });
    expect(ok.issues).toEqual([
      expect.objectContaining({ code: 'padded_key', severity: 'warning' }),
    ]);
    const bad = parseSuccessRow(
      CLIENTS_SHEET,
      fields,
      ['0000000002', '', 'Đồng', '', 'Hm'],
      'clientCode',
    );
    expect(bad.data).toBeNull();
    expect(bad.key).toBe('0000000002');
    expect(bad.issues.map((issue) => issue.code)).toEqual([
      'required',
      'invalid_list',
      'invalid_yes_no',
    ]);
  });
});

describe('planSuccess: 03_Policies', () => {
  it("section 12.2: an agent must exist and be in the uploader's scope; a repeated row is refused", () => {
    const plan = planSuccess(
      input({
        policies: rows(
          policyRow(),
          policyRow(),
          policyRow({ policyNo: '000000002', agentCode: OTHER }),
          policyRow({ policyNo: '000000003', agentCode: UM }),
        ),
      }),
    );
    expect(codes(plan, '03_Policies')).toEqual([
      [3, 'duplicate_key'],
      [4, 'agent_not_found'],
      [5, 'out_of_scope'],
    ]);
    expect(plan.policies.map((item) => item.state.policyNo)).toEqual([
      '000000001',
    ]);
  });

  it("IMP-15: a FC file only touches the FC's own share; other agents stay", () => {
    const existing = existingPolicy(
      [
        { agentCode: UM, splitPercent: 60 },
        { agentCode: FC, splitPercent: 40 },
      ],
      UM,
    );
    const plan = planSuccess(
      input({
        policies: rows(policyRow({ splitPercent: 50 })),
        existingPolicies: new Map([['000000001', existing]]),
      }),
    );
    const { state } = plan.policies[0];
    expect(agentsText(state.agents)).toBe(`${FC}:50;${UM}:60`);
    expect(state.servicingAgentCode).toBe(UM);
    expect(plan.changes).toContainEqual(
      expect.objectContaining({
        field: 'agents',
        oldValue: `${FC}:40;${UM}:60`,
        newValue: `${FC}:50;${UM}:60`,
      }),
    );
  });

  it('IMP-16: a GA file must add up to 100%; a single row may leave the split blank', () => {
    const plan = planSuccess(
      input({
        uploader: gaUploader,
        policies: rows(
          policyRow({ policyNo: '000000001', agentCode: FC, splitPercent: 60 }),
          policyRow({
            policyNo: '000000001',
            agentCode: FC2,
            splitPercent: 30,
          }),
          policyRow({ policyNo: '000000002', agentCode: FC }),
          policyRow({ policyNo: '000000003', agentCode: FC }),
          policyRow({ policyNo: '000000003', agentCode: FC2 }),
        ),
      }),
    );
    expect(codes(plan, '03_Policies')).toEqual([
      [2, 'split_total'],
      [3, 'split_total'],
      [5, 'split_total'],
      [6, 'split_total'],
    ]);
    expect(
      plan.policies.map((item) => [
        item.state.policyNo,
        agentsText(item.state.agents),
      ]),
    ).toEqual([['000000002', `${FC}:100`]]);
  });

  it('IMP-16: nobody may go over 100%, not even a FC', () => {
    const plan = planSuccess(
      input({
        uploader: {
          ...fcUploader,
          reach: 'DOWNLINE',
          agentCode: UM,
          scope: new Set([UM, FC]),
        },
        policies: rows(
          policyRow({ agentCode: UM, splitPercent: 70 }),
          policyRow({ agentCode: FC, splitPercent: 40 }),
        ),
      }),
    );
    expect(codes(plan, '03_Policies')).toEqual([
      [2, 'split_total'],
      [3, 'split_total'],
    ]);
  });

  it('IMP-17 + CUS-12: a complete set ends missing agents; the largest share serves, with a warning when it changes', () => {
    const existing = existingPolicy([{ agentCode: UM, splitPercent: 100 }], UM);
    const plan = planSuccess(
      input({
        uploader: gaUploader,
        policies: rows(
          policyRow({ agentCode: FC, splitPercent: 70 }),
          policyRow({ agentCode: FC2, splitPercent: 30 }),
        ),
        existingPolicies: new Map([['000000001', existing]]),
      }),
    );
    const { state } = plan.policies[0];
    expect(
      state.agents.find((agent) => agent.agentCode === UM)?.endedAt,
    ).toEqual(NOW);
    expect(state.currentAgentCodes).toEqual([FC, FC2]);
    expect(state.servicingAgentCode).toBe(FC);
    expect(codes(plan, '03_Policies')).toEqual([[2, 'servicing_changed']]);
    expect(plan.sheets['03_Policies']!.counts).toMatchObject({
      updated: 2,
      warnings: 1,
      rejected: 0,
    });
  });

  it('CUS-12: on a tie the current servicing agent stays; for a new policy the first row wins', () => {
    const existing = existingPolicy(
      [
        { agentCode: FC, splitPercent: 50 },
        { agentCode: FC2, splitPercent: 50 },
      ],
      FC2,
    );
    const tie = planSuccess(
      input({
        uploader: gaUploader,
        policies: rows(
          policyRow({ agentCode: FC, splitPercent: 50 }),
          policyRow({ agentCode: FC2, splitPercent: 50 }),
        ),
        existingPolicies: new Map([['000000001', existing]]),
      }),
    );
    expect(tie.policies[0].state.servicingAgentCode).toBe(FC2);
    const fresh = planSuccess(
      input({
        uploader: gaUploader,
        policies: rows(
          policyRow({ agentCode: FC2, splitPercent: 50 }),
          policyRow({ agentCode: FC, splitPercent: 50 }),
        ),
      }),
    );
    expect(fresh.policies[0].state.servicingAgentCode).toBe(FC2);
  });

  it('IMP-19 + CUS-11: a new holder ends the old link and both clients are worked out again', () => {
    const plan = planSuccess(
      input({
        policies: rows(policyRow({ holderClientCode: '0000000002' })),
        existingPolicies: new Map([
          [
            '000000001',
            existingPolicy([{ agentCode: FC, splitPercent: 100 }], FC),
          ],
        ]),
      }),
    );
    const { clients } = plan.policies[0].state;
    expect(clients).toContainEqual({
      clientCode: '0000000001',
      role: 'PO',
      source: 'POLICY',
      endedAt: NOW,
    });
    expect(clients).toContainEqual({
      clientCode: '0000000002',
      role: 'PO',
      source: 'POLICY',
    });
    expect(plan.touchedClients).toEqual(
      expect.arrayContaining(['0000000001', '0000000002']),
    );
  });

  it('IMP-21: only fields that change are recorded; an unchanged policy is skipped', () => {
    const existing = existingPolicy([{ agentCode: FC, splitPercent: 100 }], FC);
    const same = planSuccess(
      input({
        policies: rows(policyRow({ splitPercent: 100 })),
        existingPolicies: new Map([['000000001', existing]]),
      }),
    );
    expect(same.changes).toEqual([]);
    expect(same.sheets['03_Policies']!.counts.skipped).toBe(1);
    const moved = planSuccess(
      input({
        policies: rows(
          policyRow({ splitPercent: 100, status: 'Mất hiệu lực' }),
        ),
        existingPolicies: new Map([['000000001', existing]]),
      }),
    );
    expect(moved.changes).toEqual([
      {
        entity: 'policy',
        entityKey: '000000001',
        field: 'status',
        oldValue: 'Đang hiệu lực',
        newValue: 'Mất hiệu lực',
      },
    ]);
  });
});

describe('planSuccess: 04, 05 and 02', () => {
  it('section 12.2: a product needs its policy in the file or stored in scope; GA fields are kept (PRD-5)', () => {
    const existing = existingPolicy([{ agentCode: UM, splitPercent: 100 }], UM);
    existing.products = [
      {
        productCode: 'P001',
        insuredCode: '',
        productRole: 'Chính',
        sumAssuredVnd: 1,
        insuredName: 'Bé An',
        termYears: 20,
      },
    ];
    const outside = planSuccess(
      input({
        products: rows({
          policyNo: '000000001',
          productCode: 'P001',
          productRole: 'Chính',
        }),
        existingPolicies: new Map([['000000001', existing]]),
      }),
    );
    expect(codes(outside, '04_Policy_Products')).toEqual([
      [2, 'policy_not_found'],
    ]);

    const plan = planSuccess(
      input({
        uploader: gaUploader,
        products: rows(
          {
            policyNo: '000000001',
            productCode: 'P001',
            productRole: 'Chính',
            sumAssuredVnd: 500_000_000,
          },
          {
            policyNo: '000000001',
            productCode: 'R002',
            productRole: 'Bổ trợ',
            insuredCode: '0000000009',
          },
          {
            policyNo: '000000001',
            productCode: 'R002',
            productRole: 'Bổ trợ',
            insuredCode: '0000000009',
          },
        ),
        existingPolicies: new Map([['000000001', existing]]),
      }),
    );
    const { products, clients } = plan.policies[0].state;
    expect(products[0]).toMatchObject({
      sumAssuredVnd: 500_000_000,
      insuredName: 'Bé An',
      termYears: 20,
    });
    expect(products).toHaveLength(2);
    expect(clients).toContainEqual({
      clientCode: '0000000009',
      role: 'LI',
      source: 'PRODUCT',
    });
    expect(codes(plan, '04_Policy_Products')).toEqual([[4, 'duplicate_key']]);
    expect(plan.sheets['04_Policy_Products']!.counts).toMatchObject({
      inserted: 1,
      updated: 1,
      rejected: 1,
    });
  });

  it('section 12.2: an application of an agent outside scope cannot be overwritten', () => {
    const plan = planSuccess(
      input({
        applications: rows({
          applicationNo: 'A0001',
          agentCode: FC,
          holderName: 'Khách',
          createdDate: '2024-05-10',
          status: 'Đang chờ NB xử lý',
        }),
        existingApplications: new Map([
          ['A0001', { applicationNo: 'A0001', agentCode: UM }],
        ]),
      }),
    );
    expect(codes(plan, '05_Applications')).toEqual([[2, 'owned_by_other']]);
  });

  it("CUS-4 + section 12.2: a FC file makes clients theirs; a stranger's client needs a policy of theirs in the file", () => {
    const stranger = {
      clientCode: '0000000005',
      name: 'Khách Lạ',
      visibleAgentCodes: [UM],
    };
    const refused = planSuccess(
      input({
        clients: rows({ clientCode: '0000000005', name: 'Khách Lạ' }),
        existingClients: new Map([['0000000005', stranger]]),
      }),
    );
    expect(codes(refused, '02_Clients')).toEqual([[2, 'client_out_of_scope']]);

    const accepted = planSuccess(
      input({
        clients: rows({
          clientCode: '0000000005',
          name: 'Khách Lạ',
          dob: '1985-05-12',
        }),
        policies: rows(policyRow({ holderClientCode: '0000000005' })),
        existingClients: new Map([['0000000005', stranger]]),
      }),
    );
    expect(accepted.clients[0]).toMatchObject({
      clientCode: '0000000005',
      link: { agentCode: FC, source: 'CLIENTS_SHEET' },
      set: { birthMonth: 5, nameNorm: 'KHACH LA' },
    });
  });

  it('CUS-4: a manager or GA file only lets them see the clients; a file without an agent code adds no link', () => {
    const manager = planSuccess(
      input({
        uploader: {
          tenantWide: false,
          reach: 'DOWNLINE',
          agentCode: UM,
          scope: new Set([UM, FC]),
        },
        clients: rows({ clientCode: '0000000006', name: 'Khách' }),
      }),
    );
    expect(manager.clients[0].link).toEqual({
      agentCode: UM,
      source: 'CLIENTS_SHEET_SCOPE',
    });
    const marketing = planSuccess(
      input({
        uploader: gaUploader,
        clients: rows({ clientCode: '0000000006', name: 'Khách' }),
      }),
    );
    expect(marketing.clients[0].link).toBeUndefined();
  });

  it('CUS-1: a policy holder without a client row gets a client record from the policy', () => {
    const plan = planSuccess(
      input({
        policies: rows(
          policyRow({
            holderClientCode: '0000000007',
            holderName: 'Trần Thị Mua',
          }),
        ),
      }),
    );
    expect(plan.implicitClients).toEqual([
      { clientCode: '0000000007', name: 'Trần Thị Mua' },
    ]);
  });

  it('section 19.5 + POL-5: a blank insured code in the file is the main insured a hand-entered line names', () => {
    const existing = existingPolicy([{ agentCode: FC, splitPercent: 100 }], FC);
    existing.products = [
      {
        productCode: 'P001',
        insuredCode: '0000000001',
        productRole: 'Chính',
        programCode: 'AN_TAM_SONG_HANH',
        insuredName: 'Nguyễn Văn Khách',
        termYears: 20,
      },
    ];
    const plan = planSuccess(
      input({
        products: rows({
          policyNo: '000000001',
          productCode: 'P001',
          productRole: 'Chính',
          sumAssuredVnd: 600_000_000,
        }),
        existingPolicies: new Map([['000000001', existing]]),
      }),
    );
    expect(plan.policies[0].state.products).toEqual([
      expect.objectContaining({
        productCode: 'P001',
        insuredCode: '0000000001',
        sumAssuredVnd: 600_000_000,
        termYears: 20,
        programCode: 'AN_TAM_SONG_HANH',
      }),
    ]);
  });
});
