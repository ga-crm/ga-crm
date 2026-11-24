import {
  ageBandOf,
  birthDayMonthOf,
  buildProductLines, policyDeletable } from './client-rules.js';

// TENANT-5: products of the shared catalogue, by code
const products = new Map([
  [
    'P001',
    { productCode: 'P001', productName: 'An Tâm Song Hành', productRole: 'Chính' },
  ],
  [
    'P002',
    {
      productCode: 'P002',
      productName: 'BH Tai Nạn Cao Cấp',
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

  it('PRD-2 + PRD-6 (TENANT-5): names, roles and the DLVN code come from the product catalogue; a line may change the role', () => {
    const result = buildProductLines({
      lines: [
        {
          productCode: 'P001',
          sumAssuredVnd: 500_000_000,
          termYears: 20,
        },
        { productCode: 'P002', productRole: 'Chính' },
      ],
      products,
      mainInsured: main,
    });
    expect(result).toEqual({
      products: [
        expect.objectContaining({
          productCode: 'P001',
          productName: 'An Tâm Song Hành',
          productRole: 'Chính',
          insuredClientId: 'client-1',
          insuredName: 'Nguyễn Văn Khách',
          termYears: 20,
        }),
        expect.objectContaining({
          productCode: 'P002',
          productRole: 'Chính',
        }),
      ],
    });
  });

  it('PRD-3 + PRD-4: another person keeps a name but no client code; a programme repeats only for different people', () => {
    const ok = buildProductLines({
      lines: [
        { productCode: 'P002' },
        {
          productCode: 'P002',
          insuredName: 'Nguyễn Bé An',
          insuredDob: '2015-04-02',
          insuredGender: 'Nữ',
        },
      ],
      products,
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
          { productCode: 'P002' },
          {
            productCode: 'P002',
            insuredName: 'nguyễn văn khách',
          },
        ],
        products,
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
