import { canLinkLead, linkScore, stageFromSuccess } from './lead-link.js';

const TODAY = '2026-11-10';
const lead = {
  nameNorm: 'NGUYEN VAN AN',
  phone: '0912345678',
  gender: 'Nam',
  dob: '1990-05-01',
  leadDate: '2026-09-01',
};

describe('lead - client link (section 8.8)', () => {
  it('LEAD-32: linking opens at PROPOSAL, or once the lead is won', () => {
    expect(canLinkLead({ stage: 'MET' })).toBe(false);
    expect(canLinkLead({ stage: 'MET', careStatus: 'WON' })).toBe(true);
    expect(canLinkLead({ stage: 'PROPOSAL' })).toBe(true);
    expect(canLinkLead({ stage: 'ISSUED' })).toBe(true);
    expect(canLinkLead({ stage: 'LOST' })).toBe(false);
  });

  it('LEAD-32: name 0.6, phone 0.4, gender 0.1, age 0.1, a fresh application 0.2, at most 1', () => {
    expect(
      linkScore(
        lead,
        {
          nameNorm: 'NGUYEN VAN AN',
          phone: '0912345678',
          gender: 'Nam',
          dob: '1992-01-01',
        },
        [{ createdDate: '2026-10-15' }],
        TODAY,
      ),
    ).toEqual({
      score: 1,
      reasons: ['NAME', 'PHONE', 'GENDER', 'AGE', 'APPLICATION'],
    });
    expect(
      linkScore(
        lead,
        { nameNorm: 'NGUYEN VAN AN', gender: 'Nữ', ageBand: '30-39' },
        // Before the lead, and more than 60 days after it: neither counts
        [{ createdDate: '2026-08-31' }, { createdDate: '2026-11-01' }],
        TODAY,
      ),
    ).toEqual({ score: 0.7, reasons: ['NAME', 'AGE'] });
    // Four years apart is not the same age
    expect(
      linkScore(
        lead,
        { nameNorm: 'KHAC', dob: '1986-01-01', phone: '0912345678' },
        [],
        TODAY,
      ),
    ).toEqual({ score: 0.4, reasons: ['PHONE'] });
  });

  it('LEAD-33: an application since the lead means SUBMITTED; an issued one or a new policy, ISSUED', () => {
    const base = { stage: 'PROPOSAL' as const, leadDate: '2026-09-01' };
    const application = {
      applicationNo: 'A0001',
      status: 'Đang chờ NB xử lý',
      createdDate: '2026-09-10',
    };
    expect(
      stageFromSuccess(base, { applications: [application], policies: [] }),
    ).toEqual({ stage: 'SUBMITTED', applicationNo: 'A0001' });
    expect(
      stageFromSuccess(base, {
        applications: [
          {
            ...application,
            status: 'Đã phát hành hợp đồng',
            policyNo: '000000009',
          },
        ],
        policies: [{ policyNo: '000000009', effectiveDate: '2026-10-01' }],
      }),
    ).toEqual({
      stage: 'ISSUED',
      applicationNo: 'A0001',
      policyNo: '000000009',
    });
    // An old policy and an old application belong to before the lead
    expect(
      stageFromSuccess(base, {
        applications: [{ ...application, createdDate: '2026-01-01' }],
        policies: [{ policyNo: '000000001', effectiveDate: '2020-01-01' }],
      }),
    ).toBeNull();
    // The application the agent named wins over dates
    expect(
      stageFromSuccess(
        { ...base, applicationNo: 'OLD1' },
        {
          applications: [
            {
              ...application,
              applicationNo: 'OLD1',
              createdDate: '2026-01-01',
            },
          ],
          policies: [],
        },
      ),
    ).toEqual({ stage: 'SUBMITTED', applicationNo: 'OLD1' });
  });

  it('LEAD-33: never moves back, and leaves a lost lead alone', () => {
    const data = {
      applications: [
        { applicationNo: 'A0001', status: 'x', createdDate: '2026-09-10' },
      ],
      policies: [],
    };
    expect(
      stageFromSuccess({ stage: 'SUBMITTED', leadDate: '2026-09-01' }, data),
    ).toBeNull();
    expect(
      stageFromSuccess({ stage: 'LOST', leadDate: '2026-09-01' }, data),
    ).toBeNull();
    expect(
      stageFromSuccess({ stage: 'NEW', leadDate: '2026-09-01' }, data)?.stage,
    ).toBe('SUBMITTED');
  });
});
