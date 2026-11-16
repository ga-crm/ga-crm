import { buildTree } from '../agents/agent-tree.js';
import type {
  AgentRank,
  AgentStatus,
} from '../agents/infrastructure/agent.entity.js';
import type { ParsedAgentRow } from './cells.js';

export interface ExistingAgent {
  agentCode: string;
  name: string;
  rank: AgentRank;
  status: AgentStatus;
  managerCode?: string;
  managerFixed?: boolean;
  gender?: string;
  dob?: string;
  phone?: string;
  startDate?: string;
  endDate?: string;
  officeCode?: string;
}

export interface UploaderScope {
  /** `imports.agent_tree`: may create any agent and set managers (AGT-4). */
  canEditTree: boolean;
  agentCode?: string;
  /** The uploader's own branch, computed on the server (SCOPE-2). */
  downline: ReadonlySet<string>;
}

export interface PlanIssue {
  row: number;
  column?: string;
  code: string;
  key: string;
  severity: 'error' | 'warning' | 'skipped';
}

export interface AgentChange {
  field: string;
  oldValue: string | null;
  newValue: string | null;
}

export interface AgentWrite {
  code: string;
  isNew: boolean;
  values: Partial<ExistingAgent>;
  cleared: string[];
  changes: AgentChange[];
}

export interface AgentPlan {
  writes: AgentWrite[];
  /** Every agent the file mentions, changed or not. */
  seen: string[];
  issues: PlanIssue[];
  counts: {
    inserted: number;
    updated: number;
    rejected: number;
    skipped: number;
    warnings: number;
    managersCreated: number;
  };
}

const COPIED_FIELDS = [
  'name',
  'rank',
  'status',
  'startDate',
  'gender',
  'dob',
  'phone',
  'endDate',
  'officeCode',
] as const;

/**
 * Sections 15.2 and 22.2, as a pure function: what these rows would do to this tree. Validation runs
 * it for the preview, and commit runs it again on fresh data inside the transaction.
 */
export function planAgents(
  rows: readonly { rowNo: number; data: ParsedAgentRow }[],
  existing: ReadonlyMap<string, ExistingAgent>,
  scope: UploaderScope,
): AgentPlan {
  const issues: PlanIssue[] = [];
  const writes: AgentWrite[] = [];
  const seen = new Set<string>();
  const accepted = new Set<string>();
  const rowOf = new Map<string, number>();
  const finalManager = new Map<string, string | undefined>();
  const counts = {
    inserted: 0,
    updated: 0,
    rejected: 0,
    skipped: 0,
    warnings: 0,
    managersCreated: 0,
  };

  const reject = (row: number, key: string, code: string, column?: string) => {
    issues.push({ row, key, code, column, severity: 'error' });
    counts.rejected++;
  };
  const warn = (row: number, key: string, code: string, column?: string) => {
    issues.push({ row, key, code, column, severity: 'warning' });
    counts.warnings++;
  };

  for (const { rowNo, data } of [...rows].sort((a, b) => a.rowNo - b.rowNo)) {
    const code = data.agentCode;
    // IMP-9
    if (accepted.has(code)) {
      reject(rowNo, code, 'duplicate_key');
      continue;
    }
    const current = existing.get(code);
    if (!scope.canEditTree) {
      // AGT-4: an agent's own row may be created once; anything else must already be in their branch
      const own = code === scope.agentCode;
      if (current ? !own && !scope.downline.has(code) : !own) {
        reject(rowNo, code, 'out_of_scope');
        continue;
      }
    }
    accepted.add(code);
    seen.add(code);
    rowOf.set(code, rowNo);

    let managerCode = data.managerCode ?? undefined;
    if (current && managerCode !== current.managerCode) {
      if (current.managerFixed) {
        // AGT-5
        warn(rowNo, code, 'manager_fixed_kept', 'Quản lý');
        managerCode = current.managerCode;
      } else if (!scope.canEditTree) {
        warn(rowNo, code, 'manager_change_ignored', 'Quản lý');
        managerCode = current.managerCode;
      }
    }
    finalManager.set(code, managerCode);

    const values: Partial<ExistingAgent> = {};
    const cleared: string[] = [];
    const changes: AgentChange[] = [];
    const compare = (field: string, next: string | null | undefined) => {
      if (next === undefined) return; // IMP-5: the file has no such column
      const before =
        (current?.[field as keyof ExistingAgent] as string | undefined) ?? null;
      if ((next ?? null) === before) return;
      if (next === null) cleared.push(field);
      else (values as Record<string, unknown>)[field] = next;
      changes.push({ field, oldValue: before, newValue: next });
    };
    for (const field of COPIED_FIELDS) compare(field, data[field]);
    compare('managerCode', managerCode ?? null);

    if (!current) {
      counts.inserted++;
      writes.push({ code, isNew: true, values, cleared: [], changes: [] });
    } else if (changes.length > 0) {
      counts.updated++;
      writes.push({ code, isNew: false, values, cleared, changes });
    } else {
      counts.skipped++;
    }
  }

  // AGT-4: a manager that only appears in the Manager column is created from that reference
  if (scope.canEditTree) {
    for (const { data } of rows) {
      const code = data.managerCode;
      if (!code || !accepted.has(data.agentCode)) continue;
      if (existing.has(code) || accepted.has(code) || seen.has(code)) continue;
      seen.add(code);
      finalManager.set(code, undefined);
      counts.inserted++;
      counts.managersCreated++;
      writes.push({
        code,
        isNew: true,
        values: {
          name: data.managerName,
          rank: data.managerRank,
          status: 'Đang hoạt động',
        },
        cleared: [],
        changes: [],
      });
    }
  }

  // AGT-3: report what the rebuild will split off, while it can still be fixed in the file
  const nodes = new Map<string, string | undefined>();
  for (const agent of existing.values())
    nodes.set(agent.agentCode, agent.managerCode);
  for (const [code, manager] of finalManager) nodes.set(code, manager);
  const { cycles } = buildTree(
    [...nodes].map(([agentCode, managerCode]) => ({ agentCode, managerCode })),
  );
  // Only rows of this file: an old cycle elsewhere is not this upload's doing, and naming its agents
  // would show codes outside the uploader's branch
  for (const code of cycles) {
    const row = rowOf.get(code);
    if (row !== undefined) warn(row, code, 'manager_cycle_split', 'Quản lý');
  }

  return { writes, seen: [...seen], issues, counts };
}
