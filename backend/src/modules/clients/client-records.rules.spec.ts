import {
  careRecordIssues,
  referralIssues,
  summarizeReferrals,
  summarizeSigning,
} from './client-records.rules.js';

const record = (patch: Partial<Parameters<typeof careRecordIssues>[0]>) => ({
  kind: 'VISIT' as const,
  title: null,
  place: null,
  amountVnd: null,
  ...patch,
});

describe('careRecordIssues (decided 26/11/2026)', () => {
  it('a claim says where, a gift what, cash on signing how much', () => {
    expect(careRecordIssues(record({ kind: 'CLAIM' }))).toEqual([
      { path: 'place', message: 'required' },
    ]);
    expect(
      careRecordIssues(record({ kind: 'CLAIM', place: 'Bệnh viện Mẫu' })),
    ).toEqual([]);
    for (const kind of ['GIFT', 'SIGNING_GIFT'] as const)
      expect(careRecordIssues(record({ kind }))).toEqual([
        { path: 'title', message: 'required' },
      ]);
    expect(
      careRecordIssues(record({ kind: 'SIGNING_CASH', amountVnd: 0 })),
    ).toEqual([{ path: 'amountVnd', message: 'required' }]);
    expect(
      careRecordIssues(record({ kind: 'SIGNING_CASH', amountVnd: 500_000 })),
    ).toEqual([]);
  });

  it('a seminar, a health check and a visit need only their date', () => {
    for (const kind of ['SEMINAR', 'HEALTH_CHECK', 'VISIT'] as const)
      expect(careRecordIssues(record({ kind }))).toEqual([]);
  });
});

describe('referrals (decided 26/11/2026)', () => {
  it('a premium belongs to a successful referral', () => {
    expect(
      referralIssues({ result: 'PENDING', premiumVnd: 1_000_000 }),
    ).toEqual([{ path: 'premiumVnd', message: 'only_when_success' }]);
    expect(
      referralIssues({ result: 'SUCCESS', premiumVnd: 1_000_000 }),
    ).toEqual([]);
    expect(referralIssues({ result: 'FAILED', premiumVnd: null })).toEqual([]);
  });

  it('counts referrals, the successful ones and the premium they brought', () => {
    expect(
      summarizeReferrals([
        { result: 'SUCCESS', premiumVnd: 12_000_000 },
        { result: 'SUCCESS', premiumVnd: null },
        { result: 'PENDING', premiumVnd: null },
        { result: 'FAILED', premiumVnd: null },
      ]),
    ).toEqual({
      total: 4,
      success: 2,
      pending: 1,
      failed: 1,
      premiumVnd: 12_000_000,
    });
    expect(summarizeReferrals([])).toMatchObject({ total: 0, premiumVnd: 0 });
  });
});

describe('summarizeSigning (decided 26/11/2026)', () => {
  it('keeps cash apart from gifts', () => {
    expect(
      summarizeSigning([
        { kind: 'SIGNING_CASH', amountVnd: 2_000_000 },
        { kind: 'SIGNING_CASH', amountVnd: 500_000 },
        { kind: 'SIGNING_GIFT', amountVnd: 300_000 },
        { kind: 'SIGNING_GIFT', amountVnd: null },
        { kind: 'GIFT', amountVnd: 900_000 },
      ]),
    ).toEqual({ cashVnd: 2_500_000, gifts: 2, giftValueVnd: 300_000 });
  });
});
