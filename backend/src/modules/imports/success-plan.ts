import { normalizeName } from '../../common/normalize.js';
import type { Reach } from '../../common/rbac.js';
import {
  HIDDEN_FIELDS,
  type LinkSource,
} from '../clients/client.constants.js';
import type {
  PolicyAgent,
  PolicyClient,
  PolicyProduct,
} from '../clients/infrastructure/client.entities.js';
import type { PlanIssue } from './agent-plan.js';

export const SUCCESS_SHEETS = {
  clients: '02_Clients',
  policies: '03_Policies',
  products: '04_Policy_Products',
  applications: '05_Applications',
} as const;
type SheetName = (typeof SUCCESS_SHEETS)[keyof typeof SUCCESS_SHEETS];

/** Section 19.3. Only cells the file has appear (IMP-5). */
export interface ParsedClientRow {
  clientCode: string;
  name: string;
  tier?: string;
  activePolicies?: number;
  lapsedPolicies?: number;
  dob?: string;
  gender?: string;
  maritalStatus?: string;
  loyaltyPoints?: number;
  usesDconnect?: boolean;
  /** ISO string while staged. */
  dconnectLastLoginAt?: string;
  idUpdated?: boolean;
  ekycRegistered?: boolean;
  ekycRegisteredAt?: string;
  birthDayMonth?: string;
}

/** Section 19.4 */
export interface ParsedPolicyRow {
  policyNo: string;
  holderClientCode: string;
  insuredClientCode?: string;
  agentCode: string;
  holderName: string;
  insuredName: string;
  status: string;
  effectiveDate: string;
  maturityDate: string;
  splitPercent?: number;
  premiumFrequency: string;
  premiumDueDate?: string;
  plannedPremiumVnd?: number;
  basePremiumVnd: number;
  unpaidPremiumVnd?: number;
  aplDebtVnd?: number;
  hasBeneficiary?: boolean;
  contactAddress?: string;
  sumAssuredVnd?: number;
  graceEndDate?: string;
  assignmentType?: string;
  assignmentDate?: string;
  advancePremiumVnd?: number;
  totalPaidPremiumVnd?: number;
  basicPremiumVnd?: number;
  topUpPremiumVnd?: number;
}

/** Section 19.5 */
export interface ParsedProductRow {
  policyNo: string;
  productCode: string;
  productName?: string;
  productRole: string;
  insuredCode?: string;
  sumAssuredVnd?: number;
  annualPremiumVnd?: number;
  plan?: string;
  startDate?: string;
  status?: string;
}

/** Section 19.5 */
export interface ParsedApplicationRow {
  applicationNo: string;
  policyNo?: string;
  agentCode: string;
  clientCode?: string;
  holderName: string;
  createdDate: string;
  receivedDate?: string;
  status: string;
  issuedDate?: string;
  productCode?: string;
  apeVnd?: number;
}

type Row<T> = { rowNo: number; data: T };

/**
 * The planner works with the client codes of the file (DATA-1): they are what joins its sheets and
 * what finds a person again (`clients.success_code`). `imports.service.ts` turns stored ids into
 * codes before planning and the codes back into ids before writing (decided 25/11/2026).
 */
export type CodedPolicyClient = Omit<PolicyClient, 'clientId'> & {
  clientCode: string;
};
/** PRD-3: `insuredCode` "" = the main insured, or a person known only by name. */
export type CodedPolicyProduct = Omit<PolicyProduct, 'insuredClientId'> & {
  insuredCode: string;
};
type Fields = Record<string, unknown>;

export interface ExistingClient extends Fields {
  clientCode: string;
  visibleAgentCodes: string[];
}

export interface ExistingPolicy extends Fields {
  policyNo: string;
  servicingAgentCode?: string;
  agents: PolicyAgent[];
  clients: CodedPolicyClient[];
  products: CodedPolicyProduct[];
  currentAgentCodes: string[];
}

export interface ExistingApplication extends Fields {
  applicationNo: string;
  agentCode: string;
}

/** Section 12.2: who may write what. GA_HEAD counts as tenant-wide. */
export interface SuccessUploader {
  tenantWide: boolean;
  reach: Reach;
  agentCode?: string;
  /** The uploader's own code and their downline (SCOPE-2). */
  scope: ReadonlySet<string>;
}

export interface SuccessPlanInput {
  clients: readonly Row<ParsedClientRow>[];
  policies: readonly Row<ParsedPolicyRow>[];
  products: readonly Row<ParsedProductRow>[];
  applications: readonly Row<ParsedApplicationRow>[];
  existingClients: ReadonlyMap<string, ExistingClient>;
  existingPolicies: ReadonlyMap<string, ExistingPolicy>;
  existingApplications: ReadonlyMap<string, ExistingApplication>;
  /** Agents on the tree, plus those the file's 01_Agents adds. */
  knownAgents: ReadonlySet<string>;
  uploader: SuccessUploader;
  now: Date;
}

/** IMP-21 */
export interface FieldChange {
  entity: 'client' | 'policy' | 'policy_product' | 'application';
  entityKey: string;
  field: string;
  oldValue?: string;
  newValue?: string;
}

export interface SheetCounts {
  inserted: number;
  updated: number;
  rejected: number;
  skipped: number;
  warnings: number;
  managersCreated: number;
}

export interface SheetResult {
  counts: SheetCounts;
  issues: PlanIssue[];
}

export interface PolicyState extends Fields {
  policyNo: string;
  servicingAgentCode?: string;
  agents: PolicyAgent[];
  currentAgentCodes: string[];
  clients: CodedPolicyClient[];
  products: CodedPolicyProduct[];
}

export interface SuccessPlan {
  sheets: Partial<Record<SheetName, SheetResult>>;
  clients: {
    clientCode: string;
    isNew: boolean;
    set: Fields;
    link?: { agentCode: string; source: LinkSource };
  }[];
  /** CUS-1: a policy holder or applicant the file names without a 02_Clients row. */
  implicitClients: { clientCode: string; name: string }[];
  policies: { isNew: boolean; state: PolicyState }[];
  applications: { applicationNo: string; isNew: boolean; set: Fields }[];
  changes: FieldChange[];
  /** Clients whose agent links must be worked out again after the write. */
  touchedClients: string[];
  /**
   * Decided 25/11/2026: a client added by hand has no Success code. When the file names a new code
   * as the holder or main insured of a policy that person is on, the code becomes theirs, so the
   * file updates them instead of making a second client (MAN-8). Filled in by `imports.service.ts`.
   */
  adoptions: { clientCode: string; clientId: string }[];
}

/** A stored person without a Success code, as the planner sees them: `id:<client id>`. */
export const storedRef = (clientId: string) => `id:${clientId}`;
/** The client id behind `storedRef`, or null for a real Success code. */
export const refId = (code: string): string | null =>
  code.startsWith('id:') ? code.slice(3) : null;

const POLICY_FIELDS = [
  'holderClientCode',
  'insuredClientCode',
  'holderName',
  'insuredName',
  'status',
  'effectiveDate',
  'maturityDate',
  'premiumFrequency',
  'premiumDueDate',
  'plannedPremiumVnd',
  'basePremiumVnd',
  'unpaidPremiumVnd',
  'aplDebtVnd',
  'hasBeneficiary',
  'contactAddress',
  'sumAssuredVnd',
  'graceEndDate',
  'assignmentType',
  'assignmentDate',
  'advancePremiumVnd',
  'totalPaidPremiumVnd',
  'basicPremiumVnd',
  'topUpPremiumVnd',
] as const;
const PRODUCT_FIELDS = [
  'productName',
  'productRole',
  'sumAssuredVnd',
  'annualPremiumVnd',
  'plan',
  'startDate',
  'status',
] as const;

const asText = (value: unknown): string | undefined =>
  value === undefined || value === null
    ? undefined
    : value instanceof Date
      ? value.toISOString()
      : typeof value === 'object'
        ? JSON.stringify(value)
        : String(value as string | number | boolean);

/** IMP-21: the set of agents of a policy in one string, e.g. `9000001:60;9000003:40`. */
export const agentsText = (agents: readonly PolicyAgent[]): string =>
  agents
    .filter((agent) => !agent.endedAt)
    .map((agent) => `${agent.agentCode}:${agent.splitPercent ?? ''}`)
    .sort()
    .join(';');

/** CUS-2: the month of a birthday, for "birthday this month" (SIG-1). */
export function birthMonthOf(fields: {
  birthDayMonth?: string;
  dob?: string;
}): number | undefined {
  if (fields.birthDayMonth) return Number(fields.birthDayMonth.slice(3, 5));
  if (fields.dob) return Number(fields.dob.slice(5, 7));
  return undefined;
}

function newSheet(): SheetResult {
  return {
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
}

/**
 * Sections 12.2 and 12.3 as one pure function: what sheets 02-05 of one Success file would do.
 * Validation and commit both run it, so the preview never drifts from what is written.
 */
export function planSuccess(input: SuccessPlanInput): SuccessPlan {
  const { uploader, now } = input;
  const plan: SuccessPlan = {
    sheets: {},
    clients: [],
    implicitClients: [],
    policies: [],
    applications: [],
    changes: [],
    touchedClients: [],
    adoptions: [],
  };
  const touched = new Set<string>();
  const inScope = (agentCode: string) =>
    uploader.tenantWide || uploader.scope.has(agentCode);

  /** A row's problems; an error rejects it, a warning only marks it. */
  const reporter = (sheet: SheetResult, rowNo: number, key: string) => {
    let rejected = false;
    let warned = false;
    return {
      error(code: string, column?: string) {
        sheet.issues.push({ row: rowNo, column, code, key, severity: 'error' });
        if (!rejected) sheet.counts.rejected++;
        rejected = true;
      },
      warn(code: string, column?: string) {
        sheet.issues.push({
          row: rowNo,
          column,
          code,
          key,
          severity: 'warning',
        });
        if (!warned) sheet.counts.warnings++;
        warned = true;
      },
      get rejected() {
        return rejected;
      },
    };
  };
  const change = (
    entity: FieldChange['entity'],
    entityKey: string,
    field: string,
    before: unknown,
    after: unknown,
  ): boolean => {
    const oldValue = asText(before);
    const newValue = asText(after);
    if (oldValue === newValue) return false;
    // Personal data: the history says it changed, without the value
    const hide = (value: string | undefined) =>
      value !== undefined && HIDDEN_FIELDS.has(field) ? '***' : value;
    plan.changes.push({
      entity,
      entityKey,
      field,
      oldValue: hide(oldValue),
      newValue: hide(newValue),
    });
    return true;
  };

  // ---- 03_Policies (IMP-15 to IMP-19) -----------------------------------------------------
  const states = new Map<string, PolicyState>();
  const fromFile = new Set<string>();
  /** Clients the uploader's own accepted rows name, for the 02_Clients scope rule. */
  const clientsOfMine = new Set<string>();

  if (input.policies.length > 0) {
    const sheet = newSheet();
    plan.sheets[SUCCESS_SHEETS.policies] = sheet;
    const seen = new Set<string>();
    const groups = new Map<string, Row<ParsedPolicyRow>[]>();
    for (const row of input.policies) {
      const { policyNo, agentCode } = row.data;
      const report = reporter(sheet, row.rowNo, policyNo);
      // IMP-9: same policy and agent twice; the first row wins
      const rowKey = `${policyNo}:${agentCode}`;
      if (seen.has(rowKey)) report.error('duplicate_key', 'Mã đại lý');
      else if (!input.knownAgents.has(agentCode))
        report.error('agent_not_found', 'Mã đại lý');
      else if (!inScope(agentCode)) report.error('out_of_scope', 'Mã đại lý');
      seen.add(rowKey);
      if (report.rejected) continue;
      groups.set(policyNo, [...(groups.get(policyNo) ?? []), row]);
    }

    for (const [policyNo, rows] of groups) {
      // IMP-16: a GA file lists every agent and adds up to 100%; nobody may go over 100%
      const splits = rows.map((row) => row.data.splitPercent);
      const total = splits.reduce<number>(
        (sum, value) => sum + (value ?? 0),
        0,
      );
      const allBlank = splits.every((value) => value === undefined);
      const complete =
        uploader.tenantWide &&
        ((allBlank && rows.length === 1) ||
          (!allBlank && Math.abs(total - 100) < 0.01));
      const invalid = total > 100.01 || (uploader.tenantWide && !complete);
      if (invalid) {
        for (const row of rows)
          reporter(sheet, row.rowNo, policyNo).error(
            'split_total',
            'Tỉ lệ chia',
          );
        continue;
      }

      const existing = input.existingPolicies.get(policyNo);
      const first = rows[0].data;
      const state: PolicyState = existing
        ? {
            ...existing,
            agents: existing.agents.map((agent) => ({ ...agent })),
            clients: existing.clients.map((link) => ({ ...link })),
            products: existing.products.map((product) => ({ ...product })),
          }
        : {
            policyNo,
            agents: [],
            currentAgentCodes: [],
            clients: [],
            products: [],
          };
      let changed = !existing;

      // IMP-18: the first row of a policy carries its fields
      for (const field of POLICY_FIELDS) {
        if (!(field in first)) continue;
        const value = first[field];
        if (
          existing &&
          change('policy', policyNo, field, existing[field], value)
        )
          changed = true;
        state[field] = value;
      }
      state.holderNameNorm = normalizeName(first.holderName);
      state.insuredNameNorm = normalizeName(first.insuredName);

      // IMP-15 + IMP-17: the agents of the file join or are updated; a complete set ends the rest
      const before = agentsText(state.agents);
      for (const row of rows) {
        const link = state.agents.find(
          (agent) => agent.agentCode === row.data.agentCode,
        );
        const split =
          row.data.splitPercent ??
          (complete && rows.length === 1 ? 100 : undefined);
        if (link) {
          if (split !== undefined) link.splitPercent = split;
          delete link.endedAt;
          link.lastSeenAt = now;
        } else {
          state.agents.push({
            agentCode: row.data.agentCode,
            splitPercent: split,
            isServicing: false,
            startedAt: now,
            lastSeenAt: now,
          });
        }
      }
      if (complete) {
        const inFile = new Set(rows.map((row) => row.data.agentCode));
        for (const agent of state.agents) {
          if (!agent.endedAt && !inFile.has(agent.agentCode))
            agent.endedAt = now;
        }
      }

      // CUS-12: the largest share serves; on a tie the current one stays, then file order
      const current = state.agents.filter((agent) => !agent.endedAt);
      const shares = current.flatMap((agent) =>
        agent.splitPercent === undefined ? [] : [agent.splitPercent],
      );
      const top = shares.length > 0 ? Math.max(...shares) : undefined;
      const candidates = current.filter(
        (agent) => top === undefined || agent.splitPercent === top,
      );
      const fileOrder = rows.map((row) => row.data.agentCode);
      const servicing =
        candidates.find(
          (agent) => agent.agentCode === state.servicingAgentCode,
        ) ??
        [...candidates].sort(
          (a, b) =>
            (fileOrder.indexOf(a.agentCode) + 1 || Infinity) -
            (fileOrder.indexOf(b.agentCode) + 1 || Infinity),
        )[0];
      for (const agent of state.agents)
        agent.isServicing = agent === servicing && !agent.endedAt;
      if (
        existing?.servicingAgentCode &&
        servicing?.agentCode !== existing.servicingAgentCode
      ) {
        reporter(sheet, rows[0].rowNo, policyNo).warn('servicing_changed');
      }
      state.servicingAgentCode = servicing?.agentCode;
      state.currentAgentCodes = current.map((agent) => agent.agentCode);
      if (
        existing &&
        change('policy', policyNo, 'agents', before, agentsText(state.agents))
      )
        changed = true;

      // IMP-19 + CUS-11: the holder and main insured; a new one ends the old link
      const setRole = (clientCode: string, role: 'PO' | 'LI') => {
        for (const link of state.clients) {
          if (
            link.role === role &&
            link.source === 'POLICY' &&
            !link.endedAt &&
            link.clientCode !== clientCode
          ) {
            link.endedAt = now;
            touched.add(link.clientCode);
          }
        }
        const same = state.clients.find(
          (link) =>
            link.clientCode === clientCode &&
            link.role === role &&
            link.source === 'POLICY',
        );
        if (same) delete same.endedAt;
        else state.clients.push({ clientCode, role, source: 'POLICY' });
        touched.add(clientCode);
      };
      setRole(first.holderClientCode, 'PO');
      if (first.insuredClientCode) setRole(first.insuredClientCode, 'LI');
      clientsOfMine.add(first.holderClientCode);
      if (first.insuredClientCode) clientsOfMine.add(first.insuredClientCode);

      states.set(policyNo, state);
      fromFile.add(policyNo);
      plan.policies.push({ isNew: !existing, state });
      // Each row is one agent's share of the policy, so every row counts
      const bucket = !existing ? 'inserted' : changed ? 'updated' : 'skipped';
      sheet.counts[bucket] += rows.length;
    }
  }

  // ---- 04_Policy_Products (PRD-5, PRD-6) ---------------------------------------------------
  if (input.products.length > 0) {
    const sheet = newSheet();
    plan.sheets[SUCCESS_SHEETS.products] = sheet;
    const seen = new Set<string>();
    for (const row of input.products) {
      const { policyNo, productCode } = row.data;
      const insuredCode = row.data.insuredCode ?? '';
      const report = reporter(sheet, row.rowNo, policyNo);
      const key = `${policyNo}/${productCode}/${insuredCode}`;
      if (seen.has(key)) {
        report.error('duplicate_key', 'product_code');
        continue;
      }
      seen.add(key);

      let state = states.get(policyNo);
      if (!state) {
        const existing = input.existingPolicies.get(policyNo);
        // Section 12.2: the policy is in this file, or already stored and in scope
        if (
          !existing ||
          !(
            uploader.tenantWide ||
            existing.currentAgentCodes.some((code) => uploader.scope.has(code))
          )
        ) {
          report.error('policy_not_found', 'Số HĐBH');
          continue;
        }
        state = {
          ...existing,
          products: existing.products.map((product) => ({ ...product })),
          clients: existing.clients.map((link) => ({ ...link })),
          agents: existing.agents.map((agent) => ({ ...agent })),
        };
        states.set(policyNo, state);
        plan.policies.push({ isNew: false, state });
      }

      // Section 19.5: blank means the main insured, which a line entered by hand names by code
      const main = state.insuredClientCode as string | undefined;
      const samePerson = (stored: string) =>
        stored === insuredCode ||
        (!!main &&
          ((stored === main && insuredCode === '') ||
            (stored === '' && insuredCode === main)));
      const product = state.products.find(
        (item) =>
          item.productCode === productCode && samePerson(item.insuredCode),
      );
      if (!product) {
        const fresh: CodedPolicyProduct = {
          productCode,
          insuredCode,
          productRole: row.data.productRole,
        };
        for (const field of PRODUCT_FIELDS) {
          if (field in row.data)
            (fresh as unknown as Fields)[field] = row.data[field];
        }
        state.products.push(fresh);
        sheet.counts.inserted++;
      } else {
        let changed = false;
        for (const field of PRODUCT_FIELDS) {
          if (!(field in row.data)) continue;
          if (
            change(
              'policy_product',
              key,
              field,
              product[field],
              row.data[field],
            )
          )
            changed = true;
          (product as unknown as Fields)[field] = row.data[field];
        }
        if (changed) sheet.counts.updated++;
        else sheet.counts.skipped++;
      }
      // IMP-19: the insured person of a product is an LI of the policy
      if (
        insuredCode &&
        !state.clients.some(
          (link) =>
            link.clientCode === insuredCode &&
            link.role === 'LI' &&
            !link.endedAt,
        )
      ) {
        state.clients.push({
          clientCode: insuredCode,
          role: 'LI',
          source: 'PRODUCT',
        });
      }
      if (insuredCode) touched.add(insuredCode);
    }
  }

  // ---- 05_Applications (section 12.2) ------------------------------------------------------
  if (input.applications.length > 0) {
    const sheet = newSheet();
    plan.sheets[SUCCESS_SHEETS.applications] = sheet;
    const seen = new Set<string>();
    for (const row of input.applications) {
      const { applicationNo, agentCode } = row.data;
      const report = reporter(sheet, row.rowNo, applicationNo);
      const existing = input.existingApplications.get(applicationNo);
      if (seen.has(applicationNo)) report.error('duplicate_key', 'Số HSYCBH');
      else if (!input.knownAgents.has(agentCode))
        report.error('agent_not_found', 'Mã đại lý');
      else if (!inScope(agentCode)) report.error('out_of_scope', 'Mã đại lý');
      else if (existing && !inScope(existing.agentCode))
        report.error('owned_by_other', 'Số HSYCBH');
      seen.add(applicationNo);
      if (report.rejected) continue;

      const set: Fields = {
        ...row.data,
        holderNameNorm: normalizeName(row.data.holderName),
      };
      let changed = !existing;
      if (existing) {
        for (const [field, value] of Object.entries(row.data)) {
          if (
            field !== 'applicationNo' &&
            change('application', applicationNo, field, existing[field], value)
          )
            changed = true;
        }
        if (typeof existing.clientCode === 'string')
          touched.add(existing.clientCode);
      }
      if (row.data.clientCode) {
        touched.add(row.data.clientCode);
        clientsOfMine.add(row.data.clientCode);
      }
      plan.applications.push({ applicationNo, isNew: !existing, set });
      if (!existing) sheet.counts.inserted++;
      else if (changed) sheet.counts.updated++;
      else sheet.counts.skipped++;
    }
  }

  // ---- 02_Clients (CUS-4, section 12.2) ----------------------------------------------------
  const listed = new Set<string>();
  if (input.clients.length > 0) {
    const sheet = newSheet();
    plan.sheets[SUCCESS_SHEETS.clients] = sheet;
    // A FC's file is their own client book; anyone wider only gets to see the clients
    const link: { agentCode: string; source: LinkSource } | undefined =
      uploader.agentCode
        ? {
            agentCode: uploader.agentCode,
            source:
              !uploader.tenantWide && uploader.reach === 'OWN'
                ? 'CLIENTS_SHEET'
                : 'CLIENTS_SHEET_SCOPE',
          }
        : undefined;
    for (const row of input.clients) {
      const { clientCode } = row.data;
      const report = reporter(sheet, row.rowNo, clientCode);
      const existing = input.existingClients.get(clientCode);
      if (listed.has(clientCode))
        report.error('duplicate_key', 'Mã Khách Hàng');
      else if (
        !uploader.tenantWide &&
        existing &&
        !existing.visibleAgentCodes.some((code) => uploader.scope.has(code)) &&
        !clientsOfMine.has(clientCode)
      )
        report.error('client_out_of_scope', 'Mã Khách Hàng');
      listed.add(clientCode);
      if (report.rejected) continue;

      const set: Fields = {
        ...row.data,
        nameNorm: normalizeName(row.data.name),
      };
      const month = birthMonthOf(row.data);
      if (month !== undefined) set.birthMonth = month;
      let changed = !existing;
      if (existing) {
        for (const [field, value] of Object.entries(row.data)) {
          if (
            field !== 'clientCode' &&
            change('client', clientCode, field, existing[field], value)
          )
            changed = true;
        }
      }
      touched.add(clientCode);
      plan.clients.push({ clientCode, isNew: !existing, set, link });
      if (!existing) sheet.counts.inserted++;
      else if (changed) sheet.counts.updated++;
      else sheet.counts.skipped++;
    }
  }

  // CUS-1: a holder or applicant with no client record yet gets one from the file
  const implicit = new Map<string, string>();
  for (const { state } of plan.policies) {
    const code = state.holderClientCode as string | undefined;
    if (
      code &&
      fromFile.has(state.policyNo) &&
      !input.existingClients.has(code) &&
      !listed.has(code)
    )
      implicit.set(code, state.holderName as string);
  }
  for (const { set } of plan.applications) {
    const code = set.clientCode as string | undefined;
    if (
      code &&
      !input.existingClients.has(code) &&
      !listed.has(code) &&
      !implicit.has(code)
    )
      implicit.set(code, set.holderName as string);
  }
  plan.implicitClients = [...implicit].map(([clientCode, name]) => ({
    clientCode,
    name,
  }));
  for (const code of implicit.keys()) touched.add(code);

  plan.touchedClients = [...touched];
  return plan;
}
