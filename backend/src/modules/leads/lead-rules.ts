import { normalizeName } from '../../common/normalize.js';

/** Section 18.9 */
export const LEAD_STAGES = [
  'NEW',
  'CONTACTED',
  'APPOINTMENT',
  'MET',
  'PROPOSAL',
  'SUBMITTED',
  'ISSUED',
  'LOST',
] as const;
export type LeadStage = (typeof LEAD_STAGES)[number];

/** OPT-2: the system interest codes. A GA adds its own in the catalogue (OPT-3). */
export const LEAD_INTERESTS = [
  'NOT_REACHED',
  'UNDETERMINED',
  'NOT_INTERESTED',
  'LIFE',
  'HEALTH_CARD',
] as const;
export type SystemInterest = (typeof LEAD_INTERESTS)[number];
/** A code from the GA's catalogue: a system code or one the GA added. */
export type LeadInterest = string;

/** OPT-2 + OPT-7: only these four care codes drive the stage. */
export const LEAD_CARE_STATUSES = [
  'CARING',
  'WON',
  'DROPPED',
  'NOT_INTERESTED',
] as const;
export type SystemCareStatus = (typeof LEAD_CARE_STATUSES)[number];
export type LeadCareStatus = string;

export const isSystemCare = (
  value: string | null | undefined,
): value is SystemCareStatus =>
  !!value && (LEAD_CARE_STATUSES as readonly string[]).includes(value);

export const LEAD_ORIGINS = [
  'GA',
  'IMPORT',
  'FC_OWN',
  'PUBLIC_FORM',
  'REFERRAL',
] as const;
export type LeadOrigin = (typeof LEAD_ORIGINS)[number];

const HOUR_MS = 60 * 60 * 1000;
/** LEAD-29: the default; each GA sets its own in its settings (section 5.2). */
export const CONTACT_DEADLINE_MS = 48 * HOUR_MS;
export const deadlineMs = (hours: number): number => hours * HOUR_MS;
/** LEAD-22: the automatic task names the GA's own deadline. */
export const contactTaskTitle = (hours: number): string =>
  `Liên hệ khách hàng trong ${hours} giờ`;
export const NEXT_ACTION_TASK_TITLE = 'Liên hệ tiếp theo lịch hẹn';

/**
 * LEAD-17. OPT-7: a care status the GA added is only a label, so it neither closes the lead nor
 * moves it on; only the four system codes count here.
 */
export function stageFor(
  care: LeadCareStatus | null | undefined,
  interest: LeadInterest | null | undefined,
  current: LeadStage,
): LeadStage {
  const systemCare = isSystemCare(care) ? care : null;
  if (systemCare === 'WON')
    return current === 'ISSUED' ? 'ISSUED' : 'SUBMITTED';
  if (systemCare === 'DROPPED' || systemCare === 'NOT_INTERESTED')
    return 'LOST';
  if ((current === 'NEW' || current === 'LOST') && (systemCare || interest)) {
    return 'CONTACTED';
  }
  return current;
}

/** PDP-3: `0912***678`. */
export const maskPhone = (phone: string): string =>
  `${phone.slice(0, 4)}***${phone.slice(-3)}`;

/** LEAD-29 */
export function isOverdue(
  lead: {
    assignedAgentCode?: string | null;
    assignedAt?: Date | null;
    firstContactAt?: Date | null;
    interest?: string | null;
    careStatus?: string | null;
  },
  now: number,
  deadline = CONTACT_DEADLINE_MS,
): boolean {
  return (
    !!lead.assignedAgentCode &&
    !!lead.assignedAt &&
    now - lead.assignedAt.getTime() > deadline &&
    !lead.firstContactAt &&
    !lead.interest &&
    !lead.careStatus
  );
}

export const APPLICATION_NO = /^[A-Za-z0-9]{4,20}$/; // LEAD-11
export const POLICY_NO = /^\d{9}$/; // LEAD-11

const INTEREST_WORDS: Record<SystemInterest, readonly string[]> = {
  NOT_REACHED: ['Chưa nghe máy', 'Không nghe máy', 'Knm'],
  UNDETERMINED: ['Chưa xác định'],
  NOT_INTERESTED: [
    'Không quan tâm',
    'Không có nhu cầu',
    'Không còn nhu cầu',
    'Kcnc',
  ],
  LIFE: ['Quan tâm nhân thọ', 'Nhân thọ', 'Quan tâm nhân thọ net'],
  HEALTH_CARD: [
    'Quan tâm thẻ rời',
    'Thẻ rời',
    'Thẻ rời nội trú',
    'Thẻ rời nội+ngoại',
    'Rời nội trú',
    'Rời nội ngoại trú',
  ],
};

const CARE_WORDS: Record<SystemCareStatus, readonly string[]> = {
  CARING: ['Đang chăm sóc', 'Chăm sóc thêm', 'Hẹn gọi lại', 'Quan tâm'],
  WON: ['Đã chốt'],
  DROPPED: ['Chốt xịt', 'Dừng chăm sóc', 'Đã mua bên khác'],
  NOT_INTERESTED: ['Không quan tâm', 'Không còn nhu cầu', 'Kcnc'],
};

function fromWords<T extends string>(
  value: string,
  words: Record<T, readonly string[]>,
): T | null {
  const wanted = normalizeName(value.replace(/_/g, ' '));
  for (const code of Object.keys(words) as T[]) {
    if (
      normalizeName(code.replace(/_/g, ' ')) === wanted ||
      words[code].some((word) => normalizeName(word) === wanted)
    ) {
      return code;
    }
  }
  return null;
}

/**
 * IMP-25 + OPT-10: how a GA writes its values in a file. `labels` maps the normalised label of each
 * shown catalogue value to its code; `hidden` holds the codes the GA has hidden (OPT-8).
 */
export interface ImportLabels {
  labels: ReadonlyMap<string, string>;
  hidden: ReadonlySet<string>;
}

/** The GA's own label first, then the system synonyms; a hidden value is not accepted. */
function fromCatalogue<T extends string>(
  value: string,
  words: Record<T, readonly string[]>,
  catalogue?: ImportLabels,
): string | null {
  const own = catalogue?.labels.get(normalizeName(value));
  if (own) return own;
  const code = fromWords(value, words);
  return code && !catalogue?.hidden.has(code) ? code : null;
}

/** LEAD-10 and LEAD-12: both kinds of interest in one cell count as life insurance. */
export function parseInterest(
  value: string,
  catalogue?: ImportLabels,
): LeadInterest | null {
  const normalized = normalizeName(value);
  if (
    normalized.includes('NHAN THO') &&
    normalized.includes('THE ROI') &&
    !catalogue?.hidden.has('LIFE')
  ) {
    return 'LIFE';
  }
  return fromCatalogue(value, INTEREST_WORDS, catalogue);
}

/** LEAD-11 */
export const parseCareStatus = (
  value: string,
  catalogue?: ImportLabels,
): LeadCareStatus | null => fromCatalogue(value, CARE_WORDS, catalogue);

export interface Handover {
  agentCode: string;
  from: Date;
  /** null while the agent still holds the lead. */
  to: Date | null;
  /** Whole days held, up to now for the current holder. */
  days: number;
  /** Contacts (CALL, ZALO, MEETING) this agent recorded while holding the lead. */
  contacts: number;
}

const DAY_MS = 24 * 60 * 60 * 1000;

/**
 * LEAD-28 "Lịch sử phụ trách": who held the lead, when, for how long and how many contacts they
 * made, from the `assignee` history rows in order. A lead that arrived already assigned (its first
 * row moves it away from someone) counts that first holder from the moment the lead was created.
 */
export function handoverHistory(input: {
  rows: readonly {
    oldValue?: string | null;
    newValue?: string | null;
    changedAt: Date;
  }[];
  contacts: readonly { agentCode?: string | null; occurredAt: Date }[];
  currentAgent?: string | null;
  createdAt: Date;
  assignedAt?: Date | null;
  now: Date;
}): Handover[] {
  const rows = [...input.rows].sort(
    (a, b) => a.changedAt.getTime() - b.changedAt.getTime(),
  );
  const spans: { agentCode: string; from: Date; to: Date | null }[] = [];
  if (rows.length === 0) {
    if (input.currentAgent)
      spans.push({
        agentCode: input.currentAgent,
        from: input.assignedAt ?? input.createdAt,
        to: null,
      });
  } else {
    if (rows[0].oldValue)
      spans.push({
        agentCode: rows[0].oldValue,
        from: input.createdAt,
        to: rows[0].changedAt,
      });
    rows.forEach((row, index) => {
      if (row.newValue)
        spans.push({
          agentCode: row.newValue,
          from: row.changedAt,
          to: rows[index + 1]?.changedAt ?? null,
        });
    });
  }
  return spans.map((span) => {
    const end = span.to ?? input.now;
    return {
      ...span,
      days: Math.max(
        0,
        Math.floor((end.getTime() - span.from.getTime()) / DAY_MS),
      ),
      contacts: input.contacts.filter(
        (contact) =>
          contact.agentCode === span.agentCode &&
          contact.occurredAt >= span.from &&
          (span.to === null || contact.occurredAt < span.to),
      ).length,
    };
  });
}

/** LEAD-32: linking opens at PROPOSAL, or once the lead is won. */
export const canLinkLead = (lead: {
  stage: string;
  careStatus?: string | null;
}): boolean =>
  ['PROPOSAL', 'SUBMITTED', 'ISSUED'].includes(lead.stage) ||
  lead.careStatus === 'WON';
