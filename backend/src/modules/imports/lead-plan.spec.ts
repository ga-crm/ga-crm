import { parseLeadRow, parseWholeNumber, parseYesNo } from './cells.js';
import {
  type ExistingLead,
  matchAgent,
  type ParsedLeadRow,
  planLeads,
  rowInstant,
} from './lead-plan.js';
import { LEADS_SHEET } from './templates.js';

const AGENTS = [
  { agentCode: '00100001', name: 'Nguyễn Văn Minh' },
  { agentCode: '00100002', name: 'Trần Thị Trang' },
  { agentCode: '00100003', name: 'Lê Thị Trang' },
];
const row = (rowNo: number, patch: Partial<ParsedLeadRow> = {}) => ({
  rowNo,
  data: {
    phone: '0900000001',
    fullName: 'Khách',
    source: 'Facebook',
    ...patch,
  } as ParsedLeadRow,
});
const existing = (patch: Partial<ExistingLead> = {}) =>
  new Map([
    [
      '0900000001',
      {
        id: 'lead1',
        phone: '0900000001',
        stage: 'NEW',
        consentMarketing: false,
        updatedAt: rowInstant('2026-11-01'),
        ...patch,
      } as ExistingLead,
    ],
  ]);
const plan = (
  rows: ReturnType<typeof row>[],
  current = new Map<string, ExistingLead>(),
  mapping: Record<string, string | null> = {},
  locked = new Set<string>(),
) => planLeads(rows, current, AGENTS, mapping, locked);

describe('matchAgent', () => {
  it('IMP-24: by code, full name without marks, or a short name that fits one agent', () => {
    expect(matchAgent('00100001', AGENTS)?.name).toBe('Nguyễn Văn Minh');
    expect(matchAgent('nguyen van minh', AGENTS)?.agentCode).toBe('00100001');
    expect(matchAgent('Minh', AGENTS)?.agentCode).toBe('00100001');
    expect(matchAgent('FC Minh', AGENTS)?.agentCode).toBe('00100001');
    expect(matchAgent('TVV Minh', AGENTS)?.agentCode).toBe('00100001');
  });

  it('IMP-24: a name fitting two agents is left for the person to choose', () => {
    expect(matchAgent('Trang', AGENTS)).toBeNull();
    expect(matchAgent('FC Trang', AGENTS)).toBeNull();
    expect(matchAgent('Trần Thị Trang', AGENTS)?.agentCode).toBe('00100002');
    expect(matchAgent('Không Ai', AGENTS)).toBeNull();
  });
});

describe('planLeads: new leads', () => {
  it('IMP-28: creates the lead, assigns it and asks for a contact', () => {
    const result = plan([
      row(2, {
        agentValue: 'Minh',
        rowDate: '2026-11-02',
        progressNote: 'Đã gọi',
        campaignName: 'CD1',
        consent: true,
      }),
    ]);
    expect(result.counts).toMatchObject({ inserted: 1, updated: 0 });
    expect(result.campaignNames).toEqual(['CD1']);
    expect(result.writes[0]).toMatchObject({
      assignTo: '00100001',
      createTask: true,
      note: 'Đã gọi',
      rowDate: '2026-11-02',
      values: { consentMarketing: true, stage: 'NEW' },
    });
  });

  it('LEAD-22: a row that already has a care status needs no contact task', () => {
    const result = plan([row(2, { agentValue: 'Minh', careStatus: 'CARING' })]);
    expect(result.writes[0].createTask).toBe(false);
    expect(result.writes[0].values.stage).toBe('CONTACTED');
  });

  it('IMP-24: an unknown name stays unassigned; an unknown code refuses the row', () => {
    const named = plan([row(2, { agentValue: 'Không Ai' })]);
    expect(named.counts).toMatchObject({ inserted: 1, rejected: 0 });
    expect(named.writes[0].assignTo).toBeUndefined();
    expect(named.writes[0].createTask).toBe(false);

    const coded = plan([row(2, { agentValue: '99999' })]);
    expect(coded.counts).toMatchObject({ inserted: 0, rejected: 1 });
    expect(coded.issues[0]).toMatchObject({
      code: 'agent_not_found',
      severity: 'error',
    });
  });

  it("IMP-24: the person's choice beats any match, including leaving it unassigned", () => {
    const chosen = plan([row(2, { agentValue: 'Trang' })], undefined, {
      Trang: '00100003',
    });
    expect(chosen.writes[0].assignTo).toBe('00100003');
    const none = plan([row(2, { agentValue: 'Minh' })], undefined, {
      Minh: null,
    });
    expect(none.writes[0].assignTo).toBeUndefined();
    const stale = plan([row(2, { agentValue: 'Minh' })], undefined, {
      Minh: '424242',
    });
    expect(stale.counts.rejected).toBe(1);
  });

  it('IMP-9: the first row of a phone wins', () => {
    const result = plan([
      row(3, { fullName: 'Sau' }),
      row(2, { fullName: 'Trước' }),
    ]);
    expect(result.writes[0].values.fullName).toBe('Trước');
    expect(result.issues[0]).toMatchObject({ row: 3, code: 'duplicate_key' });
  });
});

describe('planLeads: existing leads', () => {
  it('IMP-26: a row without a date, an older one or the same day keeps the CRM data', () => {
    for (const rowDate of [undefined, '2026-10-30', '2026-11-01']) {
      const result = plan([row(2, { rowDate, fullName: 'Đổi' })], existing());
      expect(result.writes, rowDate).toEqual([]);
      expect(result.counts, rowDate).toMatchObject({
        skipped: 1,
        updated: 0,
        warnings: 0,
      });
      expect(result.issues[0], rowDate).toMatchObject({
        code: 'lead_not_newer',
        severity: 'skipped',
      });
    }
  });

  it('IMP-26: a change made on the CRM that same day still wins', () => {
    const edited = existing({ updatedAt: new Date('2026-11-02T03:00:00Z') });
    expect(
      plan([row(2, { rowDate: '2026-11-02' })], edited).counts.skipped,
    ).toBe(1);
  });

  it('IMP-29: a later row updates the lead with a warning, and logs what changed', () => {
    const result = plan(
      [
        row(2, {
          rowDate: '2026-11-02',
          interest: 'LIFE',
          careStatus: 'WON',
          progressNote: 'Mới',
        }),
      ],
      existing({ interest: 'NOT_REACHED', progressNote: 'Cũ' }),
    );
    expect(result.counts).toMatchObject({ updated: 1, warnings: 1 });
    expect(result.issues[0]).toMatchObject({
      code: 'lead_exists',
      severity: 'warning',
    });
    expect(result.writes[0].note).toBe('Mới');
    expect(result.writes[0].history).toEqual([
      { field: 'interest', oldValue: 'NOT_REACHED', newValue: 'LIFE' },
      { field: 'careStatus', oldValue: undefined, newValue: 'WON' },
      { field: 'stage', oldValue: 'NEW', newValue: 'SUBMITTED' },
    ]);
  });

  it('IMP-27: blank cells never clear the CRM, and consent is only ever given', () => {
    const result = plan(
      [row(2, { rowDate: '2026-11-02', consent: false })],
      existing({
        stage: 'CONTACTED',
        consentMarketing: true,
        interest: 'LIFE',
        careStatus: 'CARING',
        progressNote: 'Giữ',
      }),
    );
    const { values, note, history } = result.writes[0];
    expect(values).not.toHaveProperty('interest');
    expect(values).not.toHaveProperty('careStatus');
    expect(values).not.toHaveProperty('progressNote');
    expect(values).not.toHaveProperty('consentMarketing');
    expect(note).toBeUndefined();
    expect(history).toEqual([]);

    const grant = plan(
      [row(2, { rowDate: '2026-11-02', consent: true })],
      existing(),
    );
    expect(grant.writes[0].values.consentMarketing).toBe(true);
  });

  it('NOTE-7: an unchanged progress note makes no new note', () => {
    const result = plan(
      [row(2, { rowDate: '2026-11-02', progressNote: 'Giữ' })],
      existing({ progressNote: 'Giữ' }),
    );
    expect(result.writes[0].note).toBeUndefined();
  });

  it('LEAD-22: moving a lead through a file assigns again; the same agent does nothing', () => {
    const moved = plan(
      [row(2, { rowDate: '2026-11-02', agentValue: 'Minh' })],
      existing({ assignedAgentCode: '00100002' }),
    );
    expect(moved.writes[0]).toMatchObject({
      assignTo: '00100001',
      previousAgent: '00100002',
      createTask: true,
    });

    const same = plan(
      [row(2, { rowDate: '2026-11-02', agentValue: 'Minh' })],
      existing({ assignedAgentCode: '00100001' }),
    );
    expect(same.writes[0].assignTo).toBeUndefined();
    expect(same.writes[0].createTask).toBe(false);
  });

  it('LEAD-9: a locked self-sourced lead cannot move by file, but its row is otherwise refused alone', () => {
    const locked = plan(
      [
        row(2, { rowDate: '2026-11-02', agentValue: 'Minh' }),
        row(3, { phone: '0900000002', agentValue: 'Minh' }),
      ],
      existing({ assignedAgentCode: '00100002' }),
      {},
      new Set(['lead1']),
    );
    expect(locked.counts).toMatchObject({ rejected: 1, inserted: 1 });
    expect(locked.issues[0]).toMatchObject({ row: 2, code: 'own_lead_locked' });

    const unmoved = plan(
      [
        row(2, {
          rowDate: '2026-11-02',
          agentValue: 'Trần Thị Trang',
          fullName: 'Tên mới',
        }),
      ],
      existing({ assignedAgentCode: '00100002' }),
      {},
      new Set(['lead1']),
    );
    expect(unmoved.counts).toMatchObject({ updated: 1, rejected: 0 });
  });
});

describe('parseLeadRow', () => {
  const FIELDS = [
    'phone',
    'fullName',
    'source',
    'rowDate',
    'interest',
    'careStatus',
    'age',
    'valueVnd',
    'consent',
    'progressNote',
    'extraInfo',
  ];
  const parse = (patch: Record<string, string | number | null> = {}) =>
    parseLeadRow(
      LEADS_SHEET,
      FIELDS,
      FIELDS.map(
        (field) =>
          ({ phone: '0912345678', fullName: 'A', source: 'B', ...patch })[
            field
          ] ?? null,
      ),
    );
  const codes = (result: ReturnType<typeof parse>) =>
    result.issues.map((issue) => issue.code);

  it('reads labels, numbers and dates, leaving blank cells out', () => {
    const { data, key } = parse({
      rowDate: '02/11/2026',
      interest: 'Knm',
      careStatus: 'Hẹn gọi lại',
      age: '35',
      valueVnd: '13.000.000',
      consent: 'Có',
    });
    expect(key).toBe('0912345678');
    expect(data).toEqual({
      phone: '0912345678',
      fullName: 'A',
      source: 'B',
      rowDate: '2026-11-02',
      interest: 'NOT_REACHED',
      careStatus: 'CARING',
      age: 35,
      valueVnd: 13000000,
      consent: true,
    });
  });

  it('DATA-4: normalises phones and refuses what is not one', () => {
    expect(parse({ phone: '+84 912 345 678' }).data?.phone).toBe('0912345678');
    expect(parse({ phone: '84912345678' }).data?.phone).toBe('0912345678');
    for (const phone of ['12345', 'abc', '0912345', '09123456789']) {
      expect(codes(parse({ phone })), phone).toEqual(['invalid_phone']);
    }
  });

  it('IMP-6: a phone Excel turned into a number gets its zero back, with a warning', () => {
    const result = parse({ phone: 912345678 });
    expect(result.data?.phone).toBe('0912345678');
    expect(result.issues[0]).toMatchObject({
      code: 'padded_key',
      severity: 'warning',
      value: '0912345678',
    });
  });

  it('section 19.7: requires name, phone and source', () => {
    expect(codes(parse({ fullName: '' }))).toEqual(['required']);
    expect(codes(parse({ phone: null }))).toEqual(['required']);
    expect(codes(parse({ source: ' ' }))).toEqual(['required']);
  });

  it('section 20.5: reports each bad cell', () => {
    expect(
      codes(
        parse({
          rowDate: '31/02/2026',
          interest: 'Có thể',
          careStatus: 'Chưa rõ',
          age: '-1',
          valueVnd: 'nhiều',
          consent: 'Có lẽ',
        }),
      ),
    ).toEqual([
      'invalid_date',
      'invalid_list',
      'invalid_list',
      'invalid_number',
      'invalid_number',
      'invalid_yes_no',
    ]);
  });

  it('section 19.7: long text limits differ by column', () => {
    expect(codes(parse({ progressNote: 'x'.repeat(4000) }))).toEqual([]);
    expect(codes(parse({ progressNote: 'x'.repeat(4001) }))).toEqual([
      'too_long',
    ]);
    expect(codes(parse({ extraInfo: 'x'.repeat(2001) }))).toEqual(['too_long']);
    expect(codes(parse({ fullName: 'x'.repeat(501) }))).toEqual(['too_long']);
  });

  it('PDP-2: a health note in the progress column is kept as written', () => {
    expect(
      parse({ progressNote: 'Khách bị tiểu đường' }).data?.progressNote,
    ).toBe('Khách bị tiểu đường');
  });
});

describe('cell helpers', () => {
  it('IMP-8: whole numbers in the formats people write', () => {
    expect(parseWholeNumber('13000000')).toBe(13000000);
    expect(parseWholeNumber('13.000.000')).toBe(13000000);
    expect(parseWholeNumber('13,000,000')).toBe(13000000);
    expect(parseWholeNumber(35)).toBe(35);
    for (const bad of ['1.5', '12.34', '-3', 'abc', 1.5, -1]) {
      expect(parseWholeNumber(bad), String(bad)).toBeNull();
    }
  });

  it('IMP-7: yes and no in every accepted form', () => {
    for (const yes of ['Có', 'có', 'YES', 'y', '1'])
      expect(parseYesNo(yes), yes).toBe(true);
    for (const no of ['Chưa', 'No', 'n', '0', 'Không'])
      expect(parseYesNo(no), no).toBe(false);
    expect(parseYesNo('Có lẽ')).toBeNull();
  });
});
