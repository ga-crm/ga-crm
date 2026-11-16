import {
  handoverHistory,
  isOverdue,
  maskPhone,
  parseCareStatus,
  parseInterest,
  stageFor,
} from './lead-rules.js';

const HOUR = 3_600_000;

describe('stageFor', () => {
  it.each([
    ['WON', undefined, 'NEW', 'SUBMITTED'],
    ['WON', undefined, 'MET', 'SUBMITTED'],
    ['WON', undefined, 'ISSUED', 'ISSUED'],
    ['DROPPED', undefined, 'PROPOSAL', 'LOST'],
    ['NOT_INTERESTED', undefined, 'NEW', 'LOST'],
    ['CARING', undefined, 'NEW', 'CONTACTED'],
    ['CARING', undefined, 'LOST', 'CONTACTED'],
    [undefined, 'LIFE', 'NEW', 'CONTACTED'],
    [undefined, 'NOT_REACHED', 'LOST', 'CONTACTED'],
    ['CARING', 'LIFE', 'MET', 'MET'],
    [undefined, undefined, 'NEW', 'NEW'],
    [undefined, undefined, 'LOST', 'LOST'],
    [undefined, 'LIFE', 'PROPOSAL', 'PROPOSAL'],
  ] as const)(
    'LEAD-17: care %s, interest %s, stage %s gives %s',
    (care, interest, current, expected) => {
      expect(stageFor(care, interest, current)).toBe(expected);
    },
  );
});

describe('Danh mục lead in the rules', () => {
  it('OPT-7: a care status the GA added never closes or opens the lead', () => {
    expect(stageFor('HEN_GOI_LAI', undefined, 'NEW')).toBe('NEW');
    expect(stageFor('HEN_GOI_LAI', undefined, 'PROPOSAL')).toBe('PROPOSAL');
    expect(stageFor('HEN_GOI_LAI', 'LIFE', 'NEW')).toBe('CONTACTED');
    // An interest the GA added still counts as a classification (LEAD-13)
    expect(stageFor(undefined, 'QUAN_TAM_HUU_TRI', 'NEW')).toBe('CONTACTED');
  });

  it('IMP-25 + OPT-10: a file may use the labels the GA renamed or added', () => {
    const catalogue = {
      labels: new Map([
        ['NHAN THO NET', 'LIFE'],
        ['QUAN TAM HUU TRI', 'QUAN_TAM_HUU_TRI'],
      ]),
      hidden: new Set<string>(),
    };
    expect(parseInterest('Nhân thọ net', catalogue)).toBe('LIFE');
    expect(parseInterest('quan tâm HƯU TRÍ', catalogue)).toBe(
      'QUAN_TAM_HUU_TRI',
    );
    // The system synonyms keep working next to the GA's own labels
    expect(parseInterest('Knm', catalogue)).toBe('NOT_REACHED');
    expect(parseInterest('Hưu trí', catalogue)).toBeNull();
  });

  it('OPT-8: a hidden value is not accepted from a file', () => {
    const catalogue = { labels: new Map(), hidden: new Set(['CARING']) };
    expect(parseCareStatus('Đang chăm sóc', catalogue)).toBeNull();
    expect(parseCareStatus('Đã chốt', catalogue)).toBe('WON');
    expect(
      parseInterest('Nhân thọ + thẻ rời', {
        labels: new Map(),
        hidden: new Set(['LIFE']),
      }),
    ).toBeNull();
  });
});

describe('maskPhone', () => {
  it('PDP-3', () => {
    expect(maskPhone('0912345678')).toBe('0912***678');
  });
});

describe('isOverdue', () => {
  const now = Date.now();
  const assigned = {
    assignedAgentCode: '1',
    assignedAt: new Date(now - 49 * HOUR),
  };

  it('LEAD-29: assigned over 48 hours ago and never contacted', () => {
    expect(isOverdue(assigned, now)).toBe(true);
  });

  it('LEAD-29: not within 48 hours, not unassigned, not once contacted or classified', () => {
    expect(
      isOverdue({ ...assigned, assignedAt: new Date(now - 47 * HOUR) }, now),
    ).toBe(false);
    expect(isOverdue({ assignedAt: assigned.assignedAt }, now)).toBe(false);
    expect(isOverdue({ ...assigned, firstContactAt: new Date() }, now)).toBe(
      false,
    );
    expect(isOverdue({ ...assigned, interest: 'NOT_REACHED' }, now)).toBe(
      false,
    );
    expect(isOverdue({ ...assigned, careStatus: 'CARING' }, now)).toBe(false);
  });
});

describe('labels in GA files', () => {
  it.each([
    ['Không nghe máy', 'NOT_REACHED'],
    ['KNM', 'NOT_REACHED'],
    ['chưa nghe máy', 'NOT_REACHED'],
    ['Chưa xác định', 'UNDETERMINED'],
    ['Kcnc', 'NOT_INTERESTED'],
    ['Không có nhu cầu', 'NOT_INTERESTED'],
    ['Nhân thọ', 'LIFE'],
    ['Quan tâm nhân thọ net', 'LIFE'],
    ['Thẻ rời nội+ngoại', 'HEALTH_CARD'],
    ['Rời nội ngoại trú', 'HEALTH_CARD'],
    ['Nhân thọ và thẻ rời', 'LIFE'],
    ['HEALTH_CARD', 'HEALTH_CARD'],
  ])('LEAD-10 and LEAD-12: %s means %s', (label, code) => {
    expect(parseInterest(label)).toBe(code);
  });

  it.each([
    ['Chăm sóc thêm', 'CARING'],
    ['Hẹn gọi lại', 'CARING'],
    ['Quan tâm', 'CARING'],
    ['Đã chốt', 'WON'],
    ['Dừng chăm sóc', 'DROPPED'],
    ['Đã mua bên khác', 'DROPPED'],
    ['Kcnc', 'NOT_INTERESTED'],
  ])('LEAD-11: %s means %s', (label, code) => {
    expect(parseCareStatus(label)).toBe(code);
  });

  it('IMP-25: anything else is refused', () => {
    expect(parseInterest('Rất quan tâm')).toBeNull();
    expect(parseCareStatus('Có thể')).toBeNull();
  });
});

describe('handoverHistory', () => {
  const day = (n: number) => new Date(Date.UTC(2026, 10, n, 3));
  const contact = (agentCode: string, n: number) => ({
    agentCode,
    occurredAt: day(n),
  });

  it('LEAD-28 + test 27: who held the lead, from when to when, days held and contacts made then', () => {
    const rows = handoverHistory({
      rows: [
        { oldValue: null, newValue: 'A', changedAt: day(1) },
        { oldValue: 'A', newValue: 'B', changedAt: day(4) },
        { oldValue: 'B', newValue: 'A', changedAt: day(9) },
      ],
      // A's contact on day 5 was made after handing over, so it does not count for that span
      contacts: [
        contact('A', 2),
        contact('A', 3),
        contact('A', 5),
        contact('B', 6),
        contact('A', 10),
      ],
      currentAgent: 'A',
      createdAt: day(1),
      now: day(12),
    });
    expect(rows).toEqual([
      { agentCode: 'A', from: day(1), to: day(4), days: 3, contacts: 2 },
      { agentCode: 'B', from: day(4), to: day(9), days: 5, contacts: 1 },
      { agentCode: 'A', from: day(9), to: null, days: 3, contacts: 1 },
    ]);
  });

  it('LEAD-28: a lead that arrived assigned starts with its first holder from creation', () => {
    expect(
      handoverHistory({
        rows: [{ oldValue: 'A', newValue: 'B', changedAt: day(5) }],
        contacts: [],
        currentAgent: 'B',
        createdAt: day(1),
        now: day(5),
      }).map((row) => [row.agentCode, row.from, row.to, row.contacts]),
    ).toEqual([
      ['A', day(1), day(5), 0],
      ['B', day(5), null, 0],
    ]);
    // No assignment history at all: the current holder since it was assigned
    expect(
      handoverHistory({
        rows: [],
        contacts: [contact('C', 3)],
        currentAgent: 'C',
        createdAt: day(1),
        assignedAt: day(2),
        now: day(3),
      }),
    ).toEqual([
      { agentCode: 'C', from: day(2), to: null, days: 1, contacts: 1 },
    ]);
  });

  it("LEAD-28: an unassigned stretch is nobody's, and an unassigned lead has no rows", () => {
    const rows = handoverHistory({
      rows: [
        { oldValue: null, newValue: 'A', changedAt: day(1) },
        { oldValue: 'A', newValue: null, changedAt: day(2) },
        { oldValue: null, newValue: 'B', changedAt: day(6) },
      ],
      contacts: [],
      currentAgent: 'B',
      createdAt: day(1),
      now: day(6),
    });
    expect(rows.map((row) => [row.agentCode, row.days])).toEqual([
      ['A', 1],
      ['B', 0],
    ]);
    expect(
      handoverHistory({
        rows: [],
        contacts: [],
        createdAt: day(1),
        now: day(2),
      }),
    ).toEqual([]);
  });
});
