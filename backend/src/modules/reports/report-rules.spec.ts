import {
  buildReportTree,
  countActivities,
  daysSince,
  thisMonth,
  vietnamRange,
} from './report-rules.js';

const agents = [
  { agentCode: 'BM1', name: 'Bình', rank: 'BM', managerCode: null },
  { agentCode: 'UM1', name: 'Uyên', rank: 'UM', managerCode: 'BM1' },
  { agentCode: 'FC1', name: 'An', rank: 'FC', managerCode: 'UM1' },
  { agentCode: 'FC2', name: 'Bảo', rank: 'FC', managerCode: 'BM1' },
];

describe('report layout (RPT-1, RPT-3)', () => {
  it('test 46: a group row with the team total, the manager on a row of their own, sub-teams, then individuals', () => {
    const { rows, total } = buildReportTree(
      agents,
      new Map([
        ['BM1', { total: 1 }],
        ['UM1', { total: 2 }],
        ['FC1', { total: 3 }],
        ['FC2', { total: 4 }],
      ]),
      { total: 5 },
    );
    expect(
      rows.map((row) => [row.key, row.depth, row.groupKind, row.values.total]),
    ).toEqual([
      ['group:BM1', 0, 'BRANCH', 10],
      ['agent:BM1', 1, null, 1],
      ['group:UM1', 1, 'DEPARTMENT', 5],
      ['agent:UM1', 2, null, 2],
      ['agent:FC1', 2, null, 3],
      ['agent:FC2', 1, null, 4],
      ['unassigned', 0, null, 5],
    ]);
    expect(total).toEqual({ total: 15 });
  });

  it('RPT-3: a FC sees one row; a manager sees their own branch only', () => {
    expect(
      buildReportTree([agents[2]], new Map([['FC1', { total: 3 }]])).rows,
    ).toEqual([expect.objectContaining({ key: 'agent:FC1', depth: 0 })]);
    const um = buildReportTree(agents.slice(1, 3), new Map()).rows;
    expect(um.map((row) => row.key)).toEqual([
      'group:UM1',
      'agent:UM1',
      'agent:FC1',
    ]);
  });
});

describe('periods (RPT-4, RPT-8)', () => {
  it('test 47: a month is half-open in Vietnam time: the last day counts, the 1st of the next does not', () => {
    const { start, end } = vietnamRange('2026-12-01', '2026-12-31');
    expect(start.toISOString()).toBe('2026-11-30T17:00:00.000Z');
    expect(end.toISOString()).toBe('2026-12-31T17:00:00.000Z');
    const inside = new Date('2026-12-31T16:59:59.999Z'); // 23:59 on 31/12 in Vietnam
    const outside = new Date('2026-12-31T17:00:00.000Z'); // 00:00 on 01/01
    expect(inside >= start && inside < end).toBe(true);
    expect(outside < end).toBe(false);
  });

  it('RPT-4: this month by default, from the Vietnam date', () => {
    expect(thisMonth(new Date('2026-12-31T18:00:00Z'))).toEqual({
      from: '2027-01-01',
      to: '2027-01-31',
    });
    expect(thisMonth(new Date('2028-02-10T00:00:00Z'))).toEqual({
      from: '2028-02-01',
      to: '2028-02-29',
    });
  });
});

describe('R2 activities', () => {
  it('test 33: one person, type and day counts once across sources; zalo calls are ZALO; draft and rejected are left out', () => {
    const at = new Date('2026-11-10T03:00:00Z');
    const counts = countActivities({
      crm: [
        { agentCode: 'FC1', type: 'CALL', occurredAt: at, phone: '0912345678' },
        { agentCode: 'FC1', type: 'CALL', occurredAt: at, phone: '0912345678' },
        {
          agentCode: 'FC1',
          type: 'MEETING',
          occurredAt: at,
          phone: '0912345678',
        },
        // No phone: each one counts
        { agentCode: 'FC1', type: 'CALL', occurredAt: at },
        { agentCode: 'FC1', type: 'CALL', occurredAt: at },
        {
          agentCode: 'FC1',
          type: 'SEMINAR',
          occurredAt: at,
          phone: '0912345678',
        },
      ],
      success: [
        {
          agentCode: 'FC1',
          activityType: 'CALL',
          activityDate: '2026-11-10',
          status: 'approved',
          phoneKey: '0912***678',
        },
        {
          agentCode: 'FC1',
          activityType: 'CALL',
          callType: 'Zalo',
          activityDate: '2026-11-10',
          status: 'approved',
          phoneKey: '0912***678',
        },
        {
          agentCode: 'FC1',
          activityType: 'CALL',
          activityDate: '2026-11-11',
          status: 'submitted',
          phoneKey: '0912***678',
        },
        {
          agentCode: 'FC1',
          activityType: 'COACHING',
          activityDate: '2026-11-10',
          status: 'draft',
        },
      ],
    });
    expect(counts.get('FC1')).toEqual({
      CALL: 4,
      MEETING: 1,
      SEMINAR: 1,
      ZALO: 1,
      total: 7,
      fromCrm: 5,
      fromSuccess: 2,
    });
  });
});

describe('R5 pipeline', () => {
  it('whole days in the stage, never negative', () => {
    const now = new Date('2026-11-10T12:00:00Z');
    expect(daysSince(new Date('2026-11-05T13:00:00Z'), now)).toBe(4);
    expect(daysSince(new Date('2026-11-11T00:00:00Z'), now)).toBe(0);
  });
});
