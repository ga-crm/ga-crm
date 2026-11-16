import { maskPhone } from '../leads/lead-rules.js';

/** Additive figures of one row; groups add them up (RPT-1). Rates are worked out on screen. */
export type Metrics = Record<string, number>;

export const addMetrics = (target: Metrics, source: Metrics): Metrics => {
  for (const [key, value] of Object.entries(source))
    target[key] = (target[key] ?? 0) + value;
  return target;
};

export interface TreeAgent {
  agentCode: string;
  name: string;
  rank: string;
  managerCode?: string | null;
}

/** RPT-1: "Ban kinh doanh" for a BM, "Phòng kinh doanh" for a UM or SUM, otherwise "Nhóm". */
export type GroupKind = 'BRANCH' | 'DEPARTMENT' | 'TEAM';
export const groupKindOf = (rank: string): GroupKind =>
  rank === 'BM'
    ? 'BRANCH'
    : rank === 'UM' || rank === 'SUM'
      ? 'DEPARTMENT'
      : 'TEAM';

export interface ReportRow {
  key: string;
  /** `item`: a row of a report not laid out by agent, such as the funnel by source (R3). */
  kind: 'group' | 'agent' | 'unassigned' | 'item';
  agentCode: string | null;
  name: string | null;
  groupKind: GroupKind | null;
  depth: number;
  parentKey: string | null;
  values: Metrics;
}

/**
 * RPT-1: rows follow the agent tree the person sees. A manager with a team gets a group row with the
 * team's total, then their own figures on a row of their own, then sub-teams, then individuals.
 * Someone with no team is one row. `unassigned` adds "Chưa phân công" at the end (RPT-3).
 */
export function buildReportTree(
  agents: readonly TreeAgent[],
  metrics: ReadonlyMap<string, Metrics>,
  unassigned?: Metrics,
): { rows: ReportRow[]; total: Metrics } {
  const inScope = new Set(agents.map((agent) => agent.agentCode));
  const children = new Map<string, TreeAgent[]>();
  const roots: TreeAgent[] = [];
  for (const agent of agents) {
    if (agent.managerCode && inScope.has(agent.managerCode))
      children.set(agent.managerCode, [
        ...(children.get(agent.managerCode) ?? []),
        agent,
      ]);
    else roots.push(agent);
  }
  const byName = (a: TreeAgent, b: TreeAgent) =>
    a.name.localeCompare(b.name, 'vi') ||
    a.agentCode.localeCompare(b.agentCode);
  const own = (code: string): Metrics => ({ ...metrics.get(code) });

  const rows: ReportRow[] = [];
  /** Adds an agent's rows and returns the total of their whole branch. */
  const visit = (
    agent: TreeAgent,
    depth: number,
    parentKey: string | null,
  ): Metrics => {
    const team = [...(children.get(agent.agentCode) ?? [])].sort(byName);
    if (team.length === 0) {
      const values = own(agent.agentCode);
      rows.push({
        key: `agent:${agent.agentCode}`,
        kind: 'agent',
        agentCode: agent.agentCode,
        name: agent.name,
        groupKind: null,
        depth,
        parentKey,
        values,
      });
      return values;
    }
    const groupKey = `group:${agent.agentCode}`;
    const group: ReportRow = {
      key: groupKey,
      kind: 'group',
      agentCode: agent.agentCode,
      name: agent.name,
      groupKind: groupKindOf(agent.rank),
      depth,
      parentKey,
      values: {},
    };
    rows.push(group);
    const mine = own(agent.agentCode);
    rows.push({
      key: `agent:${agent.agentCode}`,
      kind: 'agent',
      agentCode: agent.agentCode,
      name: agent.name,
      groupKind: null,
      depth: depth + 1,
      parentKey: groupKey,
      values: mine,
    });
    const total = { ...mine };
    // Sub-teams before individuals
    const managers = team.filter((member) => children.has(member.agentCode));
    const individuals = team.filter(
      (member) => !children.has(member.agentCode),
    );
    for (const member of [...managers, ...individuals])
      addMetrics(total, visit(member, depth + 1, groupKey));
    group.values = total;
    return total;
  };

  const total: Metrics = {};
  for (const root of [...roots].sort(byName))
    addMetrics(total, visit(root, 0, null));
  if (unassigned) {
    rows.push({
      key: 'unassigned',
      kind: 'unassigned',
      agentCode: null,
      name: null,
      groupKind: null,
      depth: 0,
      parentKey: null,
      values: unassigned,
    });
    addMetrics(total, unassigned);
  }
  return { rows, total };
}

const DAY_MS = 86_400_000;
const VN_OFFSET_MS = 7 * 3_600_000;

/** DATA-2: the Vietnam day of an instant, `YYYY-MM-DD`. */
export const vietnamDay = (at: Date): string =>
  new Date(at.getTime() + VN_OFFSET_MS).toISOString().slice(0, 10);

/**
 * RPT-8: from the start of the first day to the start of the day after the last, in Vietnam time,
 * so the last day of a month (December too) counts and the 1st of the next does not.
 */
export function vietnamRange(
  from: string,
  to: string,
): { start: Date; end: Date } {
  const start = new Date(`${from}T00:00:00+07:00`);
  const end = new Date(new Date(`${to}T00:00:00+07:00`).getTime() + DAY_MS);
  return { start, end };
}

/** RPT-4: this month in Vietnam, the default period. */
export function thisMonth(now: Date): { from: string; to: string } {
  const today = vietnamDay(now);
  const [year, month] = today.split('-').map(Number);
  const last = new Date(Date.UTC(year, month, 0)).getUTCDate();
  const pad = (value: number) => String(value).padStart(2, '0');
  return {
    from: `${today.slice(0, 7)}-01`,
    to: `${year}-${pad(month)}-${pad(last)}`,
  };
}

/** R2: the columns, in the order of section 13.2. */
export const ACTIVITY_TYPES = [
  'CALL',
  'ZALO',
  'MEETING',
  'SEMINAR',
  'PROPOSAL',
  'SOCIAL_POST',
  'CHECKIN',
  'COACHING',
  'OTHER',
] as const;
/** R2: contacts with one person the same day count once, across and within sources. */
const ONCE_A_DAY = new Set(['CALL', 'ZALO', 'MEETING']);

/**
 * R2: activities per agent per Vietnam day, from CRM contacts (on leads and clients) and from
 * 07_Activities. Draft and rejected Success rows are left out; a Success call of type "zalo" is
 * ZALO. A CRM contact wins over a Success row of the same person, type and day.
 */
export function countActivities(input: {
  crm: readonly {
    agentCode: string;
    type: string;
    occurredAt: Date;
    phone?: string | null;
  }[];
  success: readonly {
    agentCode: string;
    activityType: string;
    callType?: string | null;
    activityDate: string;
    status: string;
    phoneKey?: string | null;
  }[];
}): Map<string, Metrics> {
  const result = new Map<string, Metrics>();
  const seen = new Set<string>();
  const add = (
    agentCode: string,
    type: string,
    day: string,
    phoneKey: string | null | undefined,
    source: 'fromCrm' | 'fromSuccess',
  ) => {
    if (ONCE_A_DAY.has(type) && phoneKey) {
      const key = `${agentCode}|${day}|${type}|${phoneKey}`;
      if (seen.has(key)) return;
      seen.add(key);
    }
    const row = result.get(agentCode) ?? {};
    row[type] = (row[type] ?? 0) + 1;
    row.total = (row.total ?? 0) + 1;
    row[source] = (row[source] ?? 0) + 1;
    result.set(agentCode, row);
  };
  for (const item of input.crm)
    add(
      item.agentCode,
      item.type,
      vietnamDay(item.occurredAt),
      item.phone ? maskPhone(item.phone) : null,
      'fromCrm',
    );
  for (const item of input.success) {
    if (item.status === 'draft' || item.status === 'rejected') continue;
    const type =
      item.activityType === 'CALL' &&
      item.callType?.trim().toLowerCase() === 'zalo'
        ? 'ZALO'
        : item.activityType;
    add(item.agentCode, type, item.activityDate, item.phoneKey, 'fromSuccess');
  }
  return result;
}

/** R5: the stages a lead is still being worked in; ISSUED and LOST have left the pipeline. */
export const PIPELINE_STAGES = [
  'NEW',
  'CONTACTED',
  'APPOINTMENT',
  'MET',
  'PROPOSAL',
  'SUBMITTED',
] as const;

/** R5: whole days a lead has been in its stage. */
export const daysSince = (since: Date, now: Date): number =>
  Math.max(0, Math.floor((now.getTime() - since.getTime()) / DAY_MS));
