import {
  isBannedHeader,
  matchColumns,
  normalizeHeader,
  parseAgentRef,
  parseAgentRow,
  parseDate,
} from './cells.js';
import {
  AGENTS_SHEET,
  APPLICATIONS_SHEET,
  classifySheet,
  CLIENTS_SHEET,
  LEADS_SHEET,
} from './templates.js';

const FIELDS = AGENTS_SHEET.columns.map((column) => column.field);
const REQUIRED = [
  '',
  'FC: 9000001-Nguyễn Thị A',
  '',
  '',
  'Đang hoạt động',
  '',
  '01/02/2024',
  '',
  '',
];
const row = (patch: Record<string, string | number | null> = {}) =>
  parseAgentRow(
    AGENTS_SHEET,
    FIELDS,
    FIELDS.map((field, index) =>
      field in patch ? patch[field] : REQUIRED[index],
    ),
  );
const codes = (result: ReturnType<typeof row>) =>
  result.issues.map((issue) => issue.code);

describe('parseAgentRef', () => {
  it('AGT-2: reads rank, code and name, keeping leading zeros (DATA-1)', () => {
    expect(parseAgentRef('FC: 0090001-Nguyễn Thị A')).toEqual({
      rank: 'FC',
      code: '0090001',
      name: 'Nguyễn Thị A',
    });
    expect(parseAgentRef('  sum:9000000-Lê - Văn C ')).toEqual({
      rank: 'SUM',
      code: '9000000',
      name: 'Lê - Văn C',
    });
  });

  it('refuses anything else, including unknown ranks', () => {
    for (const value of [
      '9000001',
      'FC 9000001-A',
      'FC: abc-A',
      'FC: 900-',
      'CEO: 900-A',
      '',
    ]) {
      expect(parseAgentRef(value), value).toBeNull();
    }
  });
});

describe('parseDate', () => {
  it('IMP-8: stores dd/mm/yyyy as YYYY-MM-DD (DATA-2)', () => {
    expect(parseDate('15/01/1990')).toBe('1990-01-15');
    expect(parseDate('1/2/2024')).toBe('2024-02-01');
    expect(parseDate('29/02/2024')).toBe('2024-02-29');
  });

  it('IMP-8: refuses days that are not on the calendar, and other formats', () => {
    for (const value of [
      '31/02/2024',
      '29/02/2023',
      '00/01/2024',
      '12/13/2024',
      '2024-01-15',
      '15-01-2024',
      '45000',
    ]) {
      expect(parseDate(value), value).toBeNull();
    }
  });
});

describe('headers', () => {
  it('section 19.1: ignores case, extra spaces and composition form', () => {
    expect(normalizeHeader('  TRẠNG   THÁI ')).toBe(
      normalizeHeader('Trạng thái'),
    );
    expect(normalizeHeader('Trạng thái'.normalize('NFD'))).toBe(
      normalizeHeader('Trạng thái'),
    );
  });

  it('section 19.10: spots banned columns with or without Vietnamese marks', () => {
    for (const header of [
      'Số CCCD',
      'cmnd',
      'Căn cước',
      'Hộ chiếu',
      'Số tài khoản',
      'Ngân hàng',
      'Bank name',
      'Tình trạng sức khỏe',
      'Bệnh nền',
    ]) {
      expect(isBannedHeader(header), header).toBe(true);
    }
    for (const header of ['Ghi chú', 'Email', 'Địa chỉ']) {
      expect(isBannedHeader(header), header).toBe(false);
    }
  });

  it('PDP-2: a lead file may hold health notes, but never ID or bank columns', () => {
    expect(isBannedHeader('Tình trạng sức khỏe', 'LEADS')).toBe(false);
    expect(isBannedHeader('Bệnh nền', 'LEADS')).toBe(false);
    expect(isBannedHeader('Số CCCD', 'LEADS')).toBe(true);
    expect(isBannedHeader('Tài khoản ngân hàng', 'LEADS')).toBe(true);
  });

  it("IMP-23: a person's choice of columns replaces the match by name, but never reads a banned one", () => {
    const match = matchColumns(
      LEADS_SHEET,
      ['Khách', 'Số', 'Kênh quảng cáo', 'Số CCCD'],
      'LEADS',
      { fullName: 0, phone: 1, source: 2, extraInfo: 3 },
    );
    expect(match.fields).toEqual(['fullName', 'phone', 'source']);
    expect(match.present).toEqual([0, 1, 2]);
    expect(match.banned).toEqual(['Số CCCD']);
    expect(match.missingRequired).toEqual([]);
  });

  it('IMP-1: never maps a banned column, and reports it', () => {
    const match = matchColumns(AGENTS_SHEET, [
      'Tư vấn tài chính',
      'Số CCCD',
      'Quản lý',
      'Trạng thái',
      'Ngày bắt đầu hoạt động',
    ]);
    expect(match.banned).toEqual(['Số CCCD']);
    expect(match.present).toEqual([0, 2, 3, 4]);
    expect(match.fields).toEqual(['agent', 'manager', 'status', 'startDate']);
    expect(match.missingRequired).toEqual([]);
  });

  it('IMP-4: lists the required columns that are missing', () => {
    expect(matchColumns(AGENTS_SHEET, ['Quản lý']).missingRequired).toEqual([
      'Tư vấn tài chính',
      'Trạng thái',
      'Ngày bắt đầu hoạt động',
    ]);
  });

  it('reads the first column when a file repeats a header', () => {
    const match = matchColumns(AGENTS_SHEET, ['Trạng thái', 'Trạng thái']);
    expect(match.present).toEqual([0]);
  });
});

describe('classifySheet', () => {
  it('IMP-3 + IMP-33: tells the Success sheets from later and reference sheets', () => {
    expect(classifySheet('01_agents')).toBe(AGENTS_SHEET);
    expect(classifySheet('02_Clients')).toBe(CLIENTS_SHEET);
    expect(classifySheet('05_applications')).toBe(APPLICATIONS_SHEET);
    expect(classifySheet('06_Production_Monthly')).toBe('LATER');
    expect(classifySheet('10_Anything')).toBe('LATER');
    expect(classifySheet('12_Lookups')).toBe('IGNORED');
    expect(classifySheet('Sheet1')).toBe('IGNORED');
  });
});

describe('parseAgentRow', () => {
  it('reads a complete row', () => {
    const result = parseAgentRow(AGENTS_SHEET, FIELDS, [
      'BM: 9000002-Trần Văn B',
      'FC: 009-Nguyễn Thị A',
      'Nữ',
      '15/01/1990',
      'đang   HOẠT động',
      '+84 900 000 001',
      '01/02/2024',
      '',
      'HN01',
    ]);
    expect(result.issues).toEqual([]);
    expect(result.data).toEqual({
      agentCode: '009',
      name: 'Nguyễn Thị A',
      rank: 'FC',
      managerCode: '9000002',
      managerName: 'Trần Văn B',
      managerRank: 'BM',
      gender: 'Nữ',
      dob: '1990-01-15',
      status: 'Đang hoạt động',
      phone: '0900000001',
      startDate: '2024-02-01',
      endDate: null,
      officeCode: 'HN01',
    });
  });

  it('IMP-5: a column the file does not have is left out, so it cannot erase data', () => {
    const { data } = parseAgentRow(
      AGENTS_SHEET,
      ['manager', 'agent', 'status', 'startDate'],
      ['', 'FC: 1-A', 'Đang hoạt động', '01/02/2024'],
    );
    expect(data).toMatchObject({ agentCode: '1', managerCode: null });
    expect(data).not.toHaveProperty('phone');
    expect(data).not.toHaveProperty('dob');
  });

  it('section 19.1: a blank required cell is an error, except the manager of a top-level agent', () => {
    expect(codes(row())).toEqual([]);
    expect(codes(row({ agent: '' }))).toEqual(['required']);
    expect(codes(row({ status: null }))).toEqual(['required']);
    expect(codes(row({ startDate: '  ' }))).toEqual(['required']);
  });

  it('reports every bad cell of a row, and keeps what was written for the report', () => {
    const result = row({
      manager: 'sai',
      agent: '9000001',
      dob: '31/02/1990',
      status: 'Nghỉ',
      startDate: 'hôm nay',
    });
    expect(codes(result)).toEqual([
      'invalid_agent_ref',
      'invalid_agent_ref',
      'invalid_date',
      'invalid_list',
      'invalid_date',
    ]);
    expect(result.key).toBe('9000001');
    expect(result.data).toBeNull();
  });

  it('section 20.5: refuses an agent managing themselves and text that is too long', () => {
    expect(codes(row({ manager: 'FC: 9000001-Nguyễn Thị A' }))).toEqual([
      'self_manager',
    ]);
    expect(codes(row({ gender: 'x'.repeat(501) }))).toEqual(['too_long']);
  });

  it('IMP-6: a number from Excel is read as text, and a date in the wrong type is refused', () => {
    expect(codes(row({ gender: 12 }))).toEqual([]);
    expect(codes(row({ startDate: 45000 }))).toEqual(['invalid_date']);
  });

  it('DATA-4: keeps a phone it cannot normalise, because section 19.2 types the column as text', () => {
    expect(row({ phone: '0900.000.001' }).data?.phone).toBe('0900000001');
    expect(row({ phone: '84900000001' }).data?.phone).toBe('0900000001');
    expect(row({ phone: 'nội bộ 12' }).data?.phone).toBe('nội bộ 12');
  });
});
