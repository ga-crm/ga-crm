import { normalizeName } from '../../common/normalize.js';
import { LEAD_STAGES } from '../leads/lead-rules.js';
import type { LeadStage } from '../leads/lead-rules.js';

export { canLinkLead } from '../leads/lead-rules.js';

export type LinkReason = 'NAME' | 'PHONE' | 'GENDER' | 'AGE' | 'APPLICATION';

const addDays = (date: string, days: number) =>
  new Date(Date.parse(`${date}T00:00:00Z`) + days * 86_400_000)
    .toISOString()
    .slice(0, 10);

/** Whole years between a `YYYY-MM-DD` birth date and today. */
const ageOn = (dob: string, today: string): number => {
  const years = Number(today.slice(0, 4)) - Number(dob.slice(0, 4));
  return today.slice(5) < dob.slice(5) ? years - 1 : years;
};

/** CUS-2: the bands Success uses. */
const bandOf = (age: number): string =>
  age < 18
    ? '<18'
    : age < 30
      ? '18-29'
      : age < 40
        ? '30-39'
        : age < 50
          ? '40-49'
          : age < 60
            ? '50-59'
            : '60+';

/**
 * LEAD-32: how likely a client is the person a lead became. Same name 0.6, same phone 0.4, same
 * gender 0.1, same age band (or at most 3 years apart) 0.1, an application made within 60 days
 * after the lead 0.2; at most 1.
 */
export function linkScore(
  lead: {
    nameNorm: string;
    phone: string;
    gender?: string | null;
    dob?: string | null;
    age?: number | null;
    leadDate: string;
  },
  client: {
    nameNorm: string;
    phone?: string | null;
    gender?: string | null;
    dob?: string | null;
    ageBand?: string | null;
  },
  applications: readonly { createdDate: string }[],
  today: string,
): { score: number; reasons: LinkReason[] } {
  const reasons: LinkReason[] = [];
  let score = 0;
  if (lead.nameNorm === client.nameNorm) {
    score += 0.6;
    reasons.push('NAME');
  }
  if (client.phone && client.phone === lead.phone) {
    score += 0.4;
    reasons.push('PHONE');
  }
  if (
    lead.gender &&
    client.gender &&
    normalizeName(lead.gender) === normalizeName(client.gender)
  ) {
    score += 0.1;
    reasons.push('GENDER');
  }
  const leadAge = lead.dob ? ageOn(lead.dob, today) : (lead.age ?? null);
  const clientAge = client.dob ? ageOn(client.dob, today) : null;
  const sameAge =
    leadAge !== null &&
    (clientAge !== null
      ? Math.abs(leadAge - clientAge) <= 3
      : !!client.ageBand && bandOf(leadAge) === client.ageBand);
  if (sameAge) {
    score += 0.1;
    reasons.push('AGE');
  }
  const until = addDays(lead.leadDate, 60);
  if (
    applications.some(
      (item) => item.createdDate >= lead.leadDate && item.createdDate <= until,
    )
  ) {
    score += 0.2;
    reasons.push('APPLICATION');
  }
  return { score: Math.min(1, Math.round(score * 100) / 100), reasons };
}

/** CUS-13 */
const ISSUED_APPLICATION = 'Đã phát hành hợp đồng';

/**
 * LEAD-33: the stage Success data puts a linked lead at, or null when it would not move. The
 * application the agent named counts; without one, those made since the lead. An issued
 * application, or a policy the client holds that started since the lead, means ISSUED. A lead never
 * moves back, and a lost lead is left alone.
 */
export function stageFromSuccess(
  lead: {
    stage: LeadStage;
    leadDate: string;
    applicationNo?: string | null;
    policyNo?: string | null;
  },
  data: {
    applications: readonly {
      applicationNo: string;
      status: string;
      createdDate: string;
      issuedDate?: string | null;
      policyNo?: string | null;
    }[];
    /** Policies the client holds (PO). */
    policies: readonly { policyNo: string; effectiveDate: string }[];
  },
): { stage: LeadStage; applicationNo?: string; policyNo?: string } | null {
  if (lead.stage === 'LOST') return null;
  const relevant = data.applications.filter((item) =>
    lead.applicationNo
      ? item.applicationNo === lead.applicationNo
      : item.createdDate >= lead.leadDate,
  );
  const issuedApplication = relevant.find(
    (item) => item.status === ISSUED_APPLICATION || !!item.issuedDate,
  );
  const policy =
    data.policies.find((item) => item.policyNo === lead.policyNo) ??
    data.policies.find(
      (item) =>
        item.policyNo === issuedApplication?.policyNo ||
        item.effectiveDate >= lead.leadDate,
    );
  const target: LeadStage | null =
    issuedApplication || policy
      ? 'ISSUED'
      : relevant.length > 0
        ? 'SUBMITTED'
        : null;
  if (!target) return null;
  if (LEAD_STAGES.indexOf(target) <= LEAD_STAGES.indexOf(lead.stage))
    return null;
  const application = issuedApplication ?? relevant[0];
  return {
    stage: target,
    applicationNo: application?.applicationNo,
    policyNo: policy?.policyNo ?? issuedApplication?.policyNo ?? undefined,
  };
}
