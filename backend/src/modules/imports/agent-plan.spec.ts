import {
  type ExistingAgent,
  planAgents,
  type UploaderScope,
} from './agent-plan.js';
import type { ParsedAgentRow } from './cells.js';

const STATUS = 'Đang hoạt động';
const row = (
  rowNo: number,
  agentCode: string,
  managerCode: string | null = null,
  patch: Partial<ParsedAgentRow> = {},
) => ({
  rowNo,
  data: {
    agentCode,
    name: `Đại lý ${agentCode}`,
    rank: 'FC',
    managerCode,
    ...(managerCode && {
      managerName: `Quản lý ${managerCode}`,
      managerRank: 'BM',
    }),
    status: STATUS,
    startDate: '2024-01-01',
    ...patch,
  } as ParsedAgentRow,
});
const agent = (
  agentCode: string,
  managerCode?: string,
  patch: Partial<ExistingAgent> = {},
): ExistingAgent => ({
  agentCode,
  name: `Đại lý ${agentCode}`,
  rank: 'FC',
  status: STATUS,
  startDate: '2024-01-01',
  managerCode,
  ...patch,
});
const tree = (...agents: ExistingAgent[]) =>
  new Map(agents.map((item) => [item.agentCode, item]));
const ADMIN: UploaderScope = { canEditTree: true, downline: new Set() };
const issueCodes = (plan: ReturnType<typeof planAgents>) =>
  plan.issues.map((issue) => issue.code);

describe('planAgents with imports.agent_tree', () => {
  it('AGT-4: creates agents and managers that only appear in the Manager column', () => {
    const plan = planAgents([row(2, '1', '9')], tree(), ADMIN);
    expect(plan.counts).toMatchObject({
      inserted: 2,
      managersCreated: 1,
      rejected: 0,
    });
    expect(plan.writes.find((write) => write.code === '9')?.values).toEqual({
      name: 'Quản lý 9',
      rank: 'BM',
      status: STATUS,
    });
  });

  it('AGT-4: a full row later in the file wins over the Manager column reference', () => {
    const plan = planAgents(
      [row(2, '1', '9'), row(3, '9', null, { name: 'Tên đúng' })],
      tree(),
      ADMIN,
    );
    expect(plan.counts).toMatchObject({ inserted: 2, managersCreated: 0 });
    expect(plan.writes.find((write) => write.code === '9')?.values.name).toBe(
      'Tên đúng',
    );
  });

  it('creates a manager once even when many rows name them', () => {
    const plan = planAgents(
      [row(2, '1', '9'), row(3, '2', '9')],
      tree(),
      ADMIN,
    );
    expect(plan.counts).toMatchObject({ inserted: 3, managersCreated: 1 });
  });

  it('IMP-9: the first row of a key wins', () => {
    const plan = planAgents(
      [
        row(3, '1', null, { name: 'Sau' }),
        row(2, '1', null, { name: 'Trước' }),
      ],
      tree(),
      ADMIN,
    );
    expect(plan.writes[0].values.name).toBe('Trước');
    expect(plan.counts.rejected).toBe(1);
    expect(plan.issues[0]).toMatchObject({
      row: 3,
      code: 'duplicate_key',
      severity: 'error',
    });
  });

  it('IMP-21: records only fields that really changed, and skips rows with no change', () => {
    const plan = planAgents(
      [row(2, '1', '9', { name: 'Tên mới' }), row(3, '2', '9')],
      tree(agent('9'), agent('1', '9'), agent('2', '9')),
      ADMIN,
    );
    expect(plan.counts).toMatchObject({ updated: 1, skipped: 1, inserted: 0 });
    expect(plan.writes[0].changes).toEqual([
      { field: 'name', oldValue: 'Đại lý 1', newValue: 'Tên mới' },
    ]);
    expect(plan.seen).toEqual(['1', '2']);
  });

  it('IMP-5: an absent column keeps the value; a blank cell in a present column clears it', () => {
    const current = agent('1', undefined, {
      phone: '0900000001',
      officeCode: 'HN',
    });
    const plan = planAgents(
      [row(2, '1', null, { officeCode: null })],
      tree(current),
      ADMIN,
    );
    expect(plan.writes[0].cleared).toEqual(['officeCode']);
    expect(plan.writes[0].values).not.toHaveProperty('phone');
    expect(plan.writes[0].changes).toEqual([
      { field: 'officeCode', oldValue: 'HN', newValue: null },
    ]);
  });

  it('AGT-5: a link fixed by hand is kept, with a warning', () => {
    const plan = planAgents(
      [row(2, '1', '8')],
      tree(agent('1', '9', { managerFixed: true }), agent('8'), agent('9')),
      ADMIN,
    );
    expect(issueCodes(plan)).toEqual(['manager_fixed_kept']);
    expect(plan.counts).toMatchObject({ warnings: 1, skipped: 1, updated: 0 });
  });

  it('AGT-5: no warning when the file agrees with the fixed link', () => {
    const plan = planAgents(
      [row(2, '1', '9')],
      tree(agent('1', '9', { managerFixed: true }), agent('9')),
      ADMIN,
    );
    expect(issueCodes(plan)).toEqual([]);
  });

  it('can move an unfixed agent, and clear a manager', () => {
    const plan = planAgents(
      [row(2, '1', '8'), row(3, '2', null)],
      tree(agent('1', '9'), agent('2', '9'), agent('8'), agent('9')),
      ADMIN,
    );
    expect(
      plan.writes.find((write) => write.code === '1')?.values.managerCode,
    ).toBe('8');
    expect(plan.writes.find((write) => write.code === '2')?.cleared).toEqual([
      'managerCode',
    ]);
  });

  it('AGT-3: warns about a cycle the file would create, on the rows that cause it', () => {
    const plan = planAgents(
      [row(2, '1', '2'), row(3, '2', '1')],
      tree(),
      ADMIN,
    );
    expect(plan.counts.rejected).toBe(0);
    expect(plan.issues.map((issue) => [issue.row, issue.code])).toEqual([
      [2, 'manager_cycle_split'],
      [3, 'manager_cycle_split'],
    ]);
  });

  it('AGT-3: warns on the row that closes a cycle, without naming agents outside the file', () => {
    const plan = planAgents([row(2, '1', '2')], tree(agent('2', '1')), ADMIN);
    expect(plan.issues).toEqual([
      expect.objectContaining({
        row: 2,
        key: '1',
        code: 'manager_cycle_split',
      }),
    ]);
  });

  it('AGT-3: an old cycle elsewhere on the tree is not reported on an unrelated upload', () => {
    const plan = planAgents(
      [row(2, '5')],
      tree(agent('1', '2'), agent('2', '1'), agent('5')),
      ADMIN,
    );
    expect(plan.issues).toEqual([]);
  });
});

describe('planAgents without imports.agent_tree', () => {
  const um: UploaderScope = {
    canEditTree: false,
    agentCode: '5',
    downline: new Set(['6']),
  };
  const current = tree(
    agent('4'),
    agent('5', '4'),
    agent('6', '5'),
    agent('7', '4'),
  );

  it('AGT-4: updates own and downline rows only, refusing others one row at a time', () => {
    const plan = planAgents(
      [
        row(2, '5', '4', { name: 'Tôi' }),
        row(3, '6', '5', { name: 'Cấp dưới' }),
        row(4, '7', '4', { name: 'Đồng cấp' }),
      ],
      current,
      um,
    );
    expect(plan.counts).toMatchObject({ updated: 2, rejected: 1 });
    expect(plan.issues).toEqual([
      expect.objectContaining({
        row: 4,
        code: 'out_of_scope',
        severity: 'error',
      }),
    ]);
  });

  it('AGT-4: cannot add new agents or managers', () => {
    const plan = planAgents([row(2, '8', '5'), row(3, '6', '99')], current, um);
    expect(plan.counts).toMatchObject({
      inserted: 0,
      rejected: 1,
      managersCreated: 0,
    });
    expect(plan.writes.flatMap((write) => write.code)).not.toContain('99');
  });

  it('AGT-4: cannot change a manager, and is told so', () => {
    const plan = planAgents([row(2, '6', '4')], current, um);
    expect(issueCodes(plan)).toEqual(['manager_change_ignored']);
    expect(plan.counts).toMatchObject({ updated: 0, skipped: 1 });
  });

  it("AGT-4: a first upload may create the uploader's own row, but nobody else's", () => {
    const fc: UploaderScope = {
      canEditTree: false,
      agentCode: '20',
      downline: new Set(),
    };
    const plan = planAgents(
      [row(2, '20', '999'), row(3, '21', '20')],
      tree(),
      fc,
    );
    expect(plan.counts).toMatchObject({
      inserted: 1,
      rejected: 1,
      managersCreated: 0,
    });
    expect(plan.writes[0].values.managerCode).toBe('999');
  });

  it('section 12.2: an uploader without an agent code writes nothing', () => {
    const plan = planAgents([row(2, '5', '4')], current, {
      canEditTree: false,
      downline: new Set(),
    });
    expect(plan.counts.rejected).toBe(1);
  });
});
