import type { CareRecordKind, ReferralResult } from './client.constants.js';

export interface Issue {
  path: string;
  message: string;
}

/**
 * Decided 26/11/2026: what each kind of care record must say. A claim says where it was made, a
 * gift what it was, and cash on signing how much; everything else is optional.
 */
export function careRecordIssues(record: {
  kind: CareRecordKind;
  title: string | null;
  place: string | null;
  amountVnd: number | null;
}): Issue[] {
  const issues: Issue[] = [];
  const required = (path: 'title' | 'place' | 'amountVnd') => {
    const value = record[path];
    if (value === null || value === '' || value === 0)
      issues.push({ path, message: 'required' });
  };
  if (record.kind === 'CLAIM') required('place');
  if (record.kind === 'GIFT' || record.kind === 'SIGNING_GIFT')
    required('title');
  if (record.kind === 'SIGNING_CASH') required('amountVnd');
  return issues;
}

/** A premium belongs to a referral that succeeded. */
export function referralIssues(referral: {
  result: ReferralResult;
  premiumVnd: number | null;
}): Issue[] {
  return referral.premiumVnd !== null && referral.result !== 'SUCCESS'
    ? [{ path: 'premiumVnd', message: 'only_when_success' }]
    : [];
}

/**
 * Decided 26/11/2026: how many people a client referred, how many of those became policies, and
 * the premium those brought.
 */
export function summarizeReferrals(
  referrals: readonly { result: ReferralResult; premiumVnd: number | null }[],
) {
  const of = (result: ReferralResult) =>
    referrals.filter((item) => item.result === result).length;
  return {
    total: referrals.length,
    success: of('SUCCESS'),
    pending: of('PENDING'),
    failed: of('FAILED'),
    premiumVnd: referrals
      .filter((item) => item.result === 'SUCCESS')
      .reduce((sum, item) => sum + (item.premiumVnd ?? 0), 0),
  };
}

/** What a client received on signing, cash apart from gifts (decided 26/11/2026). */
export function summarizeSigning(
  records: readonly { kind: CareRecordKind; amountVnd: number | null }[],
) {
  const of = (kind: CareRecordKind) =>
    records.filter((item) => item.kind === kind);
  const sum = (items: readonly { amountVnd: number | null }[]) =>
    items.reduce((total, item) => total + (item.amountVnd ?? 0), 0);
  return {
    cashVnd: sum(of('SIGNING_CASH')),
    gifts: of('SIGNING_GIFT').length,
    giftValueVnd: sum(of('SIGNING_GIFT')),
  };
}
