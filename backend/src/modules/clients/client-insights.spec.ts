import {
  coverage,
  coverageGroup,
  insuredOf,
  listFlags,
  inverseRelation,
  personKey,
  signals,
  titleCase,
} from './client-insights.js';
import type { InsightPolicy } from './client-insights.js';

const ME = '0000000001';
const policy = (patch: Partial<InsightPolicy> = {}): InsightPolicy => ({
  policyNo: '000000001',
  status: 'Đang hiệu lực',
  holderClientId: ME,
  insuredClientId: ME,
  insuredName: 'NGUYỄN VĂN KHÁCH',
  maturityDate: '2044-06-01',
  basePremiumVnd: 12_000_000,
  clients: [
    { clientId: ME, role: 'PO' },
    { clientId: ME, role: 'LI' },
  ],
  products: [],
  ...patch,
});

describe('coverage (COV)', () => {
  it('COV-3: category first, then the name; otherwise main is life and a rider is other', () => {
    expect(
      coverageGroup({
        productName: 'BH Chăm Sóc Sức Khoẻ',
        productRole: 'Bổ trợ',
      }),
    ).toBe('HEALTH');
    expect(
      coverageGroup({
        productName: 'BH Tai Nạn Cao Cấp',
        productRole: 'Bổ trợ',
      }),
    ).toBe('ACCIDENT');
    expect(
      coverageGroup({
        productName: 'Bệnh hiểm nghèo 2.0',
        productRole: 'Bổ trợ',
      }),
    ).toBe('CI');
    expect(
      coverageGroup({ productName: 'An Tâm Song Hành', productRole: 'Chính' }),
    ).toBe('LIFE');
    expect(
      coverageGroup({
        productName: 'Quyền lợi bổ sung',
        productRole: 'Bổ trợ',
      }),
    ).toBe('OTHER');
    expect(
      coverageGroup({
        productName: 'Tai nạn',
        category: 'Thai sản',
        productRole: 'Bổ trợ',
      }),
    ).toBe('MATERNITY');
  });

  it('COV-1: a line belongs to its client code, to another named person, or to the main insured', () => {
    const p = policy();
    expect(
      insuredOf(p, { productCode: 'A', insuredClientId: null, productRole: 'Chính' })
        .key,
    ).toBe(ME);
    expect(
      insuredOf(p, {
        productCode: 'A',
        insuredClientId: '0000000002',
        productRole: 'Chính',
      }).key,
    ).toBe('0000000002');
    expect(
      insuredOf(p, {
        productCode: 'A',
        insuredClientId: null,
        productRole: 'Chính',
        insuredName: 'Bé An',
      }).key,
    ).toBe(personKey(null, 'Bé An'));
    expect(
      insuredOf(p, {
        productCode: 'A',
        insuredClientId: null,
        productRole: 'Chính',
        insuredName: 'nguyễn văn khách',
      }).key,
    ).toBe(ME);
  });

  it('COV-1 + COV-4 + COV-5: sums of products in force per group; gaps only with product detail', () => {
    const rows = coverage(
      [
        policy({
          products: [
            {
              productCode: 'A',
              insuredClientId: null,
              productRole: 'Chính',
              productName: 'An Tâm Song Hành',
              sumAssuredVnd: 500,
            },
            {
              productCode: 'B',
              insuredClientId: null,
              productRole: 'Bổ trợ',
              productName: 'BH Chăm Sóc Sức Khoẻ',
              sumAssuredVnd: 100,
            },
            {
              productCode: 'C',
              insuredClientId: null,
              productRole: 'Bổ trợ',
              productName: 'BH Chăm Sóc Sức Khoẻ',
              sumAssuredVnd: 50,
            },
            // A product that ended counts as detail but adds no cover
            {
              productCode: 'D',
              insuredClientId: null,
              productRole: 'Bổ trợ',
              productName: 'BH Tai Nạn',
              sumAssuredVnd: 70,
              status: 'Mất hiệu lực',
            },
            {
              productCode: 'E',
              insuredClientId: null,
              productRole: 'Bổ trợ',
              productName: 'BH Tai Nạn',
              sumAssuredVnd: 30,
              insuredName: 'Bé An',
            },
          ],
        }),
        // A lapsed policy adds nothing
        policy({
          policyNo: '000000002',
          status: 'Mất hiệu lực',
          products: [
            {
              productCode: 'F',
              insuredClientId: null,
              productRole: 'Bổ trợ',
              productName: 'Ung thư',
              sumAssuredVnd: 999,
            },
          ],
        }),
      ],
      [
        { key: ME, name: 'Nguyễn Văn Khách', clientId: ME },
        { key: personKey(null, 'Bé An'), name: 'Bé An', clientId: null },
        { key: '0000000009', name: 'Vợ', clientId: '0000000009' },
      ],
    );
    expect(rows[0]).toMatchObject({
      groups: { LIFE: 500, HEALTH: 150 },
      hasDetail: true,
      gaps: ['CI', 'ACCIDENT'],
    });
    expect(rows[1]).toMatchObject({
      groups: { ACCIDENT: 30 },
      gaps: ['HEALTH', 'CI'],
    });
    // COV-4: nothing known about this person, so no gap is claimed
    expect(rows[2]).toMatchObject({ groups: {}, hasDetail: false, gaps: [] });
  });
});

describe('signals (section 10.11)', () => {
  const TODAY = '2026-11-10';
  const codes = (list: { code: string }[]) => list.map((item) => item.code);

  it('premium due in 30 days, unpaid, APL, maturity in 12 months, for the right role', () => {
    const list = signals({
      client: { id: ME },
      policies: [
        policy({
          premiumDueDate: '2026-12-10',
          unpaidPremiumVnd: 5,
          aplDebtVnd: 7,
          maturityDate: '2027-11-10',
        }),
        // Too far, or a policy where the client is only insured: no premium signal
        policy({ policyNo: '000000002', premiumDueDate: '2026-12-11' }),
        policy({
          policyNo: '000000003',
          premiumDueDate: '2026-11-20',
          clients: [{ clientId: ME, role: 'LI' }],
          maturityDate: '2027-01-01',
        }),
      ],
      coverage: [],
      family: [],
      today: TODAY,
    });
    expect(codes(list)).toEqual([
      'PREMIUM_DUE',
      'UNPAID',
      'APL',
      'MATURITY',
      'MATURITY',
    ]);
    expect(list[0].values).toEqual({
      policyNo: '000000001',
      date: '2026-12-10',
      amount: 12_000_000,
    });
  });

  it('not active beats the Success lapsed count; birthday this month; D-Connect not used', () => {
    const lapsed = signals({
      client: {
        id: ME,
        lapsedPolicies: 2,
        birthMonth: 11,
        birthDayMonth: '25/11',
        usesDconnect: false,
      },
      policies: [],
      coverage: [],
      family: [],
      today: TODAY,
    });
    expect(codes(lapsed)).toEqual(['LAPSED', 'BIRTHDAY', 'NO_DCONNECT']);
    const notActive = signals({
      client: { id: ME, lapsedPolicies: 2 },
      policies: [policy({ status: 'Mất hiệu lực' })],
      coverage: [],
      family: [],
      today: TODAY,
    });
    expect(notActive).toEqual([
      {
        code: 'NOT_ACTIVE',
        values: { policyNo: '000000001', status: 'Mất hiệu lực' },
      },
    ]);
  });

  it('BIRTHDAY: from the birth date when Success sends no day and month', () => {
    const list = signals({
      client: { id: ME, birthMonth: 11, dob: '1990-11-03' },
      policies: [],
      coverage: [],
      family: [],
      today: TODAY,
    });
    expect(list).toEqual([{ code: 'BIRTHDAY', values: { date: '03/11' } }]);
  });

  it('SIG-1: a row carries the list tabs its signals belong to', () => {
    expect(
      listFlags([
        { code: 'APL', values: {} },
        { code: 'LAPSED', values: {} },
      ]),
    ).toEqual({
      due: false,
      debt: true,
      maturity: false,
      birthday: false,
      lapsed: true,
    });
  });

  it('gaps of anyone with detail, and family members without cover', () => {
    const list = signals({
      client: { id: ME },
      policies: [],
      coverage: [
        {
          key: ME,
          name: 'Khách',
          clientId: ME,
          groups: { LIFE: 1 },
          hasDetail: true,
          gaps: ['HEALTH', 'CI', 'ACCIDENT'],
        },
        {
          key: 'name:BE AN',
          name: 'Bé An',
          clientId: null,
          groups: {},
          hasDetail: false,
          gaps: [],
        },
      ],
      family: [{ key: 'name:BE AN', name: 'Bé An' }],
      today: TODAY,
    });
    expect(list).toEqual([
      { code: 'GAP', values: { name: 'Khách', groups: 'HEALTH,CI,ACCIDENT' } },
      { code: 'FAMILY_UNCOVERED', values: { name: 'Bé An' } },
    ]);
  });
});

describe('family helpers', () => {
  it('FAM-2: child and parent swap; the rest are symmetric', () => {
    expect(inverseRelation('CHILD')).toBe('PARENT');
    expect(inverseRelation('PARENT')).toBe('CHILD');
    expect(inverseRelation('SPOUSE')).toBe('SPOUSE');
  });

  it('FAM-5: names from a policy get capitals on each word', () => {
    expect(titleCase('NGUYỄN VĂN  KHÁCH')).toBe('Nguyễn Văn Khách');
  });
});
