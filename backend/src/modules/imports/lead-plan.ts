import { normalizeName } from '../../common/normalize.js';
import {
  type LeadCareStatus,
  type LeadInterest,
  type LeadStage,
  stageFor,
} from '../leads/lead-rules.js';
import type { PlanIssue } from './agent-plan.js';

/** One file row after its cells were checked (section 19.7). Blank cells are simply absent. */
export interface ParsedLeadRow {
  phone: string;
  fullName: string;
  source: string;
  rowDate?: string;
  agentValue?: string;
  externalId?: string;
  phoneSource?: string;
  region?: string;
  interest?: LeadInterest;
  careStatus?: LeadCareStatus;
  campaignName?: string;
  progressNote?: string;
  lostReason?: string;
  messageStatus?: string;
  registeredAt?: string;
  gender?: string;
  email?: string;
  age?: number;
  province?: string;
  valueVnd?: number;
  extraInfo?: string;
  refLink?: string;
  productInterest?: string;
  productSecondary?: string;
  consent?: boolean;
}

export interface ExistingLead {
  id: string;
  phone: string;
  stage: LeadStage;
  interest?: LeadInterest;
  careStatus?: LeadCareStatus;
  assignedAgentCode?: string;
  progressNote?: string;
  consentMarketing: boolean;
  updatedAt: Date;
}

export interface LeadHistoryRow {
  field: string;
  oldValue?: string;
  newValue?: string;
}

export interface LeadWrite {
  rowNo: number;
  /** Absent for a new lead. */
  leadId?: string;
  values: Omit<
    ParsedLeadRow,
    'rowDate' | 'agentValue' | 'consent' | 'campaignName'
  > & {
    stage: LeadStage;
    consentMarketing?: boolean;
  };
  campaignName?: string;
  rowDate?: string;
  /** undefined means the assignment stays as it is. */
  assignTo?: string;
  /** LEAD-22: a row that already has a care status needs no contact task. */
  createTask: boolean;
  previousAgent?: string;
  note?: string;
  history: LeadHistoryRow[];
}

export interface LeadPlan {
  writes: LeadWrite[];
  issues: PlanIssue[];
  campaignNames: string[];
  counts: {
    inserted: number;
    updated: number;
    rejected: number;
    skipped: number;
    warnings: number;
    managersCreated: number;
  };
}

export interface KnownAgent {
  agentCode: string;
  name: string;
}

const NOT_A_PERSON_WORD = /^(FC|TVV|TU VAN VIEN|TU VAN)\s+/;

/**
 * IMP-24: by code, by full name, or by the short name people write in these files ("Minh", "FC Trang").
 * A value that fits more than one agent is left for the person to choose.
 */
export function matchAgent(
  value: string,
  agents: readonly KnownAgent[],
): KnownAgent | null {
  const raw = value.trim();
  const byCode = agents.find((agent) => agent.agentCode === raw);
  if (byCode) return byCode;

  const byName = (name: string) =>
    agents.filter((agent) => normalizeName(agent.name) === name);
  const whole = byName(normalizeName(raw));
  if (whole.length > 0) return whole.length === 1 ? whole[0] : null;

  const wanted = normalizeName(raw).replace(NOT_A_PERSON_WORD, '');
  if (!wanted) return null;
  const exact = byName(wanted);
  if (exact.length === 1) return exact[0];
  if (exact.length > 1) return null;
  const partial = agents.filter((agent) =>
    normalizeName(agent.name).split(' ').includes(wanted),
  );
  return partial.length === 1 ? partial[0] : null;
}

/** IMP-26: a date-only file row counts as midnight in Vietnam. */
export const rowInstant = (date: string): Date =>
  new Date(`${date}T00:00:00+07:00`);

const COPIED = [
  'fullName',
  'source',
  'externalId',
  'phoneSource',
  'region',
  'lostReason',
  'messageStatus',
  'registeredAt',
  'gender',
  'email',
  'age',
  'province',
  'valueVnd',
  'extraInfo',
  'refLink',
  'productInterest',
  'productSecondary',
] as const;

/**
 * Section 12.4 as a pure function: what these rows would do to these leads. Validation runs it for the
 * preview, and commit runs it again on fresh data inside the transaction.
 */
export function planLeads(
  rows: readonly { rowNo: number; data: ParsedLeadRow }[],
  existing: ReadonlyMap<string, ExistingLead>,
  agents: readonly KnownAgent[],
  agentMapping: Readonly<Record<string, string | null>>,
  lockedLeadIds: ReadonlySet<string>,
): LeadPlan {
  const issues: PlanIssue[] = [];
  const writes: LeadWrite[] = [];
  const counts = {
    inserted: 0,
    updated: 0,
    rejected: 0,
    skipped: 0,
    warnings: 0,
    managersCreated: 0,
  };
  const seen = new Set<string>();
  const campaignNames = new Set<string>();
  const codes = new Set(agents.map((agent) => agent.agentCode));

  const reject = (row: number, key: string, code: string, column?: string) => {
    issues.push({ row, key, code, column, severity: 'error' });
    counts.rejected++;
  };

  for (const { rowNo, data } of [...rows].sort((a, b) => a.rowNo - b.rowNo)) {
    const key = data.phone;
    // IMP-9
    if (seen.has(key)) {
      reject(rowNo, key, 'duplicate_key');
      continue;
    }
    seen.add(key);

    // IMP-24: the person's choice first, then a match. An unknown name leaves the lead unassigned,
    // but an unknown code is a mistake in the file and refuses the row.
    let assignTo: string | undefined;
    if (data.agentValue) {
      const mapped = agentMapping[data.agentValue];
      if (mapped !== undefined) {
        if (mapped !== null && !codes.has(mapped)) {
          reject(rowNo, key, 'agent_not_found', 'Mã đại lý');
          continue;
        }
        assignTo = mapped ?? undefined;
      } else {
        const match = matchAgent(data.agentValue, agents);
        if (match) assignTo = match.agentCode;
        else if (/^\d+$/.test(data.agentValue)) {
          reject(rowNo, key, 'agent_not_found', 'Mã đại lý');
          continue;
        }
      }
    }

    const current = existing.get(key);
    if (current) {
      // IMP-26: same day means the CRM wins, since the file has no time of day
      if (!data.rowDate || rowInstant(data.rowDate) <= current.updatedAt) {
        issues.push({
          row: rowNo,
          key,
          code: 'lead_not_newer',
          severity: 'skipped',
        });
        counts.skipped++;
        continue;
      }
      // LEAD-9
      const moving =
        assignTo !== undefined && assignTo !== current.assignedAgentCode;
      if (moving && lockedLeadIds.has(current.id)) {
        reject(rowNo, key, 'own_lead_locked', 'Mã đại lý');
        continue;
      }

      issues.push({
        row: rowNo,
        key,
        code: 'lead_exists',
        severity: 'warning',
      });
      counts.warnings++;
      counts.updated++;

      const history: LeadHistoryRow[] = [];
      const interest = data.interest ?? current.interest;
      const careStatus = data.careStatus ?? current.careStatus;
      if (data.interest && data.interest !== current.interest) {
        history.push({
          field: 'interest',
          oldValue: current.interest,
          newValue: data.interest,
        });
      }
      if (data.careStatus && data.careStatus !== current.careStatus) {
        history.push({
          field: 'careStatus',
          oldValue: current.careStatus,
          newValue: data.careStatus,
        });
      }
      const stage = stageFor(careStatus, interest, current.stage);
      if (stage !== current.stage) {
        history.push({
          field: 'stage',
          oldValue: current.stage,
          newValue: stage,
        });
      }
      if (data.campaignName) campaignNames.add(data.campaignName);

      writes.push({
        rowNo,
        leadId: current.id,
        values: {
          phone: key,
          fullName: data.fullName,
          source: data.source,
          ...copied(data),
          ...(data.interest && { interest: data.interest }),
          ...(data.careStatus && { careStatus: data.careStatus }),
          ...(data.progressNote && { progressNote: data.progressNote }),
          // IMP-27: a file can give consent but never take it away
          ...(data.consent &&
            !current.consentMarketing && { consentMarketing: true }),
          stage,
        },
        campaignName: data.campaignName,
        rowDate: data.rowDate,
        ...(moving && { assignTo, previousAgent: current.assignedAgentCode }),
        createTask: moving && !careStatus,
        // NOTE-7: only when the text changed
        note:
          data.progressNote && data.progressNote !== current.progressNote
            ? data.progressNote
            : undefined,
        history,
      });
      continue;
    }

    counts.inserted++;
    if (data.campaignName) campaignNames.add(data.campaignName);
    writes.push({
      rowNo,
      values: {
        phone: key,
        fullName: data.fullName,
        source: data.source,
        ...copied(data),
        ...(data.interest && { interest: data.interest }),
        ...(data.careStatus && { careStatus: data.careStatus }),
        ...(data.progressNote && { progressNote: data.progressNote }),
        consentMarketing: !!data.consent,
        stage: stageFor(data.careStatus, data.interest, 'NEW'),
      },
      campaignName: data.campaignName,
      rowDate: data.rowDate,
      assignTo,
      createTask: !!assignTo && !data.careStatus,
      note: data.progressNote,
      history: [],
    });
  }

  return { writes, issues, campaignNames: [...campaignNames], counts };
}

function copied(data: ParsedLeadRow): Partial<ParsedLeadRow> {
  const values: Record<string, unknown> = {};
  for (const field of COPIED) {
    if (data[field] !== undefined) values[field] = data[field];
  }
  return values;
}
