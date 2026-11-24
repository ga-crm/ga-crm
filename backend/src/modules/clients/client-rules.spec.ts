import {
  ageBandOf,
  birthDayMonthOf,
  buildProductLines, policyDeletable } from './client-rules.js';

const programs = new Map([
  [
    'AN_TAM_SONG_HANH',
    {
      code: 'AN_TAM_SONG_HANH',
      label: 'An Tâm Song Hành',
      productRole: 'Chính',
      productCode: 'P001',
    },
  ],
  [
    'BH_TAI_NAN_CAO_CAP',
    {
      code: 'BH_TAI_NAN_CAO_CAP',
      label: 'BH Tai Nạn Cao Cấp',
      productRole: 'Bổ trợ',
    },
  ],
]);
const main = { clientId: 'client-1', name: 'Nguyễn Văn Khách' };

describe('client rules', () => {
  it('MAN-2: the age band and birthday follow the birth date', () => {
    expect(ageBandOf('2010-11-11', '2026-11-10')).toBe('<18');
    expect(ageBandOf('2008-11-10', '2026-11-10')).toBe('18-29');
    expect(ageBandOf('1986-11-11', '2026-11-10')).toBe('30-39');
    expect(ageBandOf('1986-11-10', '2026-11-10')).toBe('40-49');
    expect(ageBandOf('1960-01-01', '2026-11-10')).toBe('60+');
    expect(birthDayMonthOf('1985-05-12')).toBe('12/05');
  });

  it('PRD-2 + PRD-6 + PRG-7: names and roles come from the catalogue; the DLVN code wins when known', () => {
    const result = buildProductLines({
      lines: [
        {
          programCode: 'AN_TAM_SONG_HANH',
          sumAssuredVnd: 500_000_000,
          termYears: 20,
        },
        { programCode: 'BH_TAI_NAN_CAO_CAP', productRole: 'Chính' },
      ],
      programs,
      mainInsured: main,
    });
    expect(result).toEqual({
      products: [
        expect.objectContaining({
          productCode: 'P001',
          programCode: 'AN_TAM_SONG_HANH',
          productName: 'An Tâm Song Hành',
          productRole: 'Chính',
          insuredClientId: 'client-1',
          insuredName: 'Nguyễn Văn Khách',
          termYears: 20,
        }),
        expect.objectContaining({
          productCode: 'BH_TAI_NAN_CAO_CAP',
          productRole: 'Chính',
        }),
      ],
    });
  });

  it('PRD-3 + PRD-4: another person keeps a name but no client code; a programme repeats only for different people', () => {
    const ok = buildProductLines({
      lines: [
        { programCode: 'BH_TAI_NAN_CAO_CAP' },
        {
          programCode: 'BH_TAI_NAN_CAO_CAP',
          insuredName: 'Nguyễn Bé An',
          insuredDob: '2015-04-02',
          insuredGender: 'Nữ',
        },
      ],
      programs,
      mainInsured: main,
    });
    expect('products' in ok && ok.products[1]).not.toHaveProperty(
      'insuredClientId',
    );
    expect('products' in ok && ok.products[1]).toMatchObject({
      insuredName: 'Nguyễn Bé An',
      insuredGender: 'Nữ',
    });
    expect(
      buildProductLines({
        lines: [
          { programCode: 'BH_TAI_NAN_CAO_CAP' },
          {
            programCode: 'BH_TAI_NAN_CAO_CAP',
            insuredName: 'nguyễn văn khách',
          },
        ],
        programs,
        mainInsured: main,
      }),
    ).toEqual({ repeated: 1 });
  });
});

describe('POL-7: deleting a policy entered by hand', () => {
  const now = new Date('2026-11-14T10:00:00Z');
  const daysAgo = (days: number) => new Date(now.getTime() - days * 86_400_000);

  it('allows a hand-entered policy no import has touched, up to 7 days old', () => {
    expect(policyDeletable({ origin: 'MANUAL', lastImportId: null, createdAt: daysAgo(7) }, now)).toBe(true);
    expect(policyDeletable({ origin: 'MANUAL', lastImportId: null, createdAt: daysAgo(7.01) }, now)).toBe(false);
  });

  it('never allows one from Success, or one an import has since written', () => {
    expect(policyDeletable({ origin: 'IMPORT', lastImportId: 'i', createdAt: daysAgo(1) }, now)).toBe(false);
    expect(policyDeletable({ origin: 'MANUAL', lastImportId: 'i', createdAt: daysAgo(1) }, now)).toBe(false);
  });
});
