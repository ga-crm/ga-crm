import { parsePhone } from '../../common/normalize.js';
import { maskPhone } from '../leads/lead-rules.js';
import type { SuccessActivityType } from './infrastructure/import.entities.js';
import type { SheetResult } from './success-plan.js';

/** Section 19.6. Only cells the file has appear (IMP-5); timestamps are ISO strings. */
export interface ParsedActivityRow {
  activityId: string;
  agentCode: string;
  leaderCode?: string;
  officeCode?: string;
  programCode?: string;
  programMonth?: number;
  activityType: SuccessActivityType;
  subActivityTitle?: string;
  recordMode?: string;
  startedAt: string;
  endedAt?: string;
  durationSeconds?: number;
  status: string;
  customerId?: string;
  customerName?: string;
  customerPhone?: string;
  activityMethod?: string;
  callType?: string;
  callOutcome?: string;
  callPhoneHash?: string;
  contentNote?: string;
  locationName?: string;
}

export interface ActivityPlanInput {
  rows: readonly { rowNo: number; data: ParsedActivityRow }[];
  /** Stored activities with the same ids. */
  existing: ReadonlyMap<
    string,
    Record<string, unknown> & { agentCode: string }
  >;
  /** Agents on the tree, plus those the file's 01_Agents adds. */
  knownAgents: ReadonlySet<string>;
  uploader: { tenantWide: boolean; scope: ReadonlySet<string> };
}

export interface ActivityPlan {
  sheet: SheetResult;
  activities: {
    activityId: string;
    isNew: boolean;
    set: Record<string, unknown>;
  }[];
}

/** IMP-32: the Vietnam day of an instant, `YYYY-MM-DD`. */
export const vietnamDate = (iso: string): string =>
  new Date(Date.parse(iso) + 7 * 3_600_000).toISOString().slice(0, 10);

/**
 * IMP-32: the key that lets R2 count one contact once: the masked customer phone, else the call
 * hash, else the customer id when it is a phone number.
 */
export function phoneKeyOf(row: {
  customerPhone?: string;
  callPhoneHash?: string;
  customerId?: string;
}): string | undefined {
  if (row.customerPhone) return maskPhone(row.customerPhone);
  if (row.callPhoneHash) return row.callPhoneHash;
  const fromId = row.customerId ? parsePhone(row.customerId) : null;
  return fromId ? maskPhone(fromId) : undefined;
}

/** Stored values are text, numbers or dates (07_Activities has no nested fields). */
const comparable = (value: unknown): string | undefined =>
  value === undefined || value === null
    ? undefined
    : value instanceof Date
      ? value.toISOString()
      : String(value as string | number | boolean);

/**
 * Section 12.5 as one pure function: what 07_Activities of one file would write. Rows key on the
 * Success activity id and belong to `agent_code`, so the scope rules match sheets 03-05.
 */
export function planActivities(input: ActivityPlanInput): ActivityPlan {
  const sheet: SheetResult = {
    counts: {
      inserted: 0,
      updated: 0,
      rejected: 0,
      skipped: 0,
      warnings: 0,
      managersCreated: 0,
    },
    issues: [],
  };
  const plan: ActivityPlan = { sheet, activities: [] };
  const inScope = (agentCode: string) =>
    input.uploader.tenantWide || input.uploader.scope.has(agentCode);
  const seen = new Set<string>();

  for (const { rowNo, data } of input.rows) {
    const { activityId, agentCode } = data;
    const existing = input.existing.get(activityId);
    // IMP-9: the first row with an id wins
    const problem: [string, string] | null = seen.has(activityId)
      ? ['duplicate_key', 'activity_id']
      : !input.knownAgents.has(agentCode)
        ? ['agent_not_found', 'agent_code']
        : !inScope(agentCode)
          ? ['out_of_scope', 'agent_code']
          : existing && !inScope(existing.agentCode)
            ? ['owned_by_other', 'activity_id']
            : null;
    seen.add(activityId);
    if (problem) {
      sheet.issues.push({
        row: rowNo,
        column: problem[1],
        code: problem[0],
        key: activityId,
        severity: 'error',
      });
      sheet.counts.rejected++;
      continue;
    }

    const set: Record<string, unknown> = {
      ...data,
      activityDate: vietnamDate(data.startedAt),
    };
    const phoneKey = phoneKeyOf(data);
    if (phoneKey) set.phoneKey = phoneKey;

    // Stored timestamps come back as dates, which compare by their ISO form like the file's
    const changed =
      !existing ||
      Object.entries(set).some(
        ([field, value]) => comparable(existing[field]) !== comparable(value),
      );
    plan.activities.push({ activityId, isNew: !existing, set });
    if (!existing) sheet.counts.inserted++;
    else if (changed) sheet.counts.updated++;
    else sheet.counts.skipped++;
  }
  return plan;
}
