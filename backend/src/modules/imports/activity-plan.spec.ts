import { phoneKeyOf, planActivities, vietnamDate } from './activity-plan.js';
import type { ParsedActivityRow } from './activity-plan.js';
import { parseActivityType } from './success-cells.js';

const row = (
  rowNo: number,
  patch: Partial<ParsedActivityRow> = {},
): { rowNo: number; data: ParsedActivityRow } => ({
  rowNo,
  data: {
    activityId: `ACT-${rowNo}`,
    agentCode: '00100004',
    activityType: 'CALL',
    startedAt: '2026-11-09T17:30:00.000Z',
    status: 'approved',
    ...patch,
  },
});
const uploader = { tenantWide: false, scope: new Set(['00100004']) };
const knownAgents = new Set(['00100004', '00100005']);

describe('07_Activities (section 12.5)', () => {
  it('IMP-31: the type as a number, a number with its name, or the name alone', () => {
    expect(parseActivityType('2')).toBe('CALL');
    expect(parseActivityType('2 Calls')).toBe('CALL');
    expect(parseActivityType('Calls')).toBe('CALL');
    expect(parseActivityType('7 - Proposal')).toBe('PROPOSAL');
    expect(parseActivityType('1 Check-in')).toBe('CHECKIN');
    expect(parseActivityType('3 social posts')).toBe('SOCIAL_POST');
    // Out of range, unknown, or a number and a name that disagree
    expect(parseActivityType('8')).toBeNull();
    expect(parseActivityType('Gọi')).toBeNull();
    expect(parseActivityType('4 Calls')).toBeNull();
  });

  it('IMP-32: the Vietnam day of the start, and the key that groups one contact', () => {
    // 00:30 on 10/11 in Vietnam is still 09/11 in UTC
    expect(vietnamDate('2026-11-09T17:30:00.000Z')).toBe('2026-11-10');
    expect(
      phoneKeyOf({ customerPhone: '0912345678', callPhoneHash: 'h' }),
    ).toBe('0912***678');
    expect(
      phoneKeyOf({ callPhoneHash: 'abc123', customerId: '0912345678' }),
    ).toBe('abc123');
    expect(phoneKeyOf({ customerId: '+84 912 345 678' })).toBe('0912***678');
    expect(phoneKeyOf({ customerId: 'KH-001' })).toBeUndefined();
  });

  it('keys on the activity id; agent and scope rules as for sheets 03-05', () => {
    const plan = planActivities({
      rows: [
        row(2, { customerPhone: '0912345678' }),
        row(3, { activityId: 'ACT-2' }),
        row(4, { agentCode: '00100099' }),
        row(5, { agentCode: '00100005' }),
        row(6, { activityId: 'OLD-OTHER' }),
        row(7, { activityId: 'OLD-MINE', status: 'locked' }),
        row(8, { activityId: 'OLD-SAME' }),
      ],
      existing: new Map([
        ['OLD-OTHER', { activityId: 'OLD-OTHER', agentCode: '00100005' }],
        [
          'OLD-MINE',
          {
            activityId: 'OLD-MINE',
            agentCode: '00100004',
            status: 'approved',
          },
        ],
        [
          'OLD-SAME',
          {
            activityId: 'OLD-SAME',
            agentCode: '00100004',
            activityType: 'CALL',
            status: 'approved',
            startedAt: new Date('2026-11-09T17:30:00.000Z'),
            activityDate: '2026-11-10',
          },
        ],
      ]),
      knownAgents,
      uploader,
    });
    expect(plan.sheet.issues.map((issue) => [issue.row, issue.code])).toEqual([
      [3, 'duplicate_key'],
      [4, 'agent_not_found'],
      [5, 'out_of_scope'],
      [6, 'owned_by_other'],
    ]);
    expect(plan.sheet.counts).toMatchObject({
      inserted: 1,
      updated: 1,
      skipped: 1,
      rejected: 4,
    });
    expect(plan.activities[0].set).toMatchObject({
      activityDate: '2026-11-10',
      phoneKey: '0912***678',
    });
  });

  it('section 12.2: GA_HEAD and imports.tenant_wide write for any agent of the GA', () => {
    const plan = planActivities({
      rows: [row(2, { agentCode: '00100005' })],
      existing: new Map(),
      knownAgents,
      uploader: { tenantWide: true, scope: new Set() },
    });
    expect(plan.sheet.counts.inserted).toBe(1);
  });
});
