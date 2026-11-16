import { normalizeName, parsePhone } from '../../common/normalize.js';
import {
  AGENT_RANKS,
  type AgentRank,
} from '../agents/infrastructure/agent.entity.js';
import { normalizePhone } from '../agents/agents.service.js';
import {
  type ImportLabels,
  type LeadCareStatus,
  type LeadInterest,
  parseCareStatus,
  parseInterest,
} from '../leads/lead-rules.js';
import type { ImportKind } from './infrastructure/import.entities.js';
import type { ParsedLeadRow } from './lead-plan.js';
import type { SheetTemplate, TemplateColumn } from './templates.js';

export type Cell = string | number | null;

const MAX_TEXT = 500; // Section 19.1

export const normalizeHeader = (value: string): string =>
  value.normalize('NFC').replace(/\s+/g, ' ').trim().toLowerCase();

const BANNED_ALWAYS = [
  'CCCD',
  'CMND',
  'CAN CUOC',
  'CHUNG MINH',
  'HO CHIEU',
  'PASSPORT',
  'TAI KHOAN',
  'NGAN HANG',
  'BANK',
];
const BANNED_IN_SUCCESS = ['BENH', 'SUC KHOE', 'HEALTH'];

/** Section 19.10. Called only for headers outside the template. */
export function isBannedHeader(
  header: string,
  kind: ImportKind = 'SUCCESS',
): boolean {
  const normalized = normalizeName(header);
  // PDP-2: a GA's own lead file may hold health notes
  const words =
    kind === 'LEADS' ? BANNED_ALWAYS : [...BANNED_ALWAYS, ...BANNED_IN_SUCCESS];
  return words.some((word) => normalized.includes(word));
}

export interface SheetColumnMatch {
  fields: string[];
  present: number[];
  missingRequired: string[];
  banned: string[];
}

/** Section 19.1: which file column feeds which template field, and what the file must not contain. */
export function matchColumns(
  template: SheetTemplate,
  headers: readonly string[],
  kind: ImportKind = 'SUCCESS',
  chosen?: Readonly<Record<string, number>>,
): SheetColumnMatch {
  const fieldByHeader = new Map<string, TemplateColumn>();
  for (const column of template.columns) {
    for (const name of [column.header, ...(column.aliases ?? [])]) {
      fieldByHeader.set(normalizeHeader(name), column);
    }
  }
  const isTemplateHeader = (header: string) =>
    fieldByHeader.has(normalizeHeader(header));

  const fields: string[] = [];
  const present: number[] = [];
  const banned: string[] = [];
  // IMP-23: a person's choice of column overrides the match by name
  const chosenField = new Map(
    Object.entries(chosen ?? {}).map(([field, index]) => [index, field]),
  );
  const known = new Set(template.columns.map((column) => column.field));
  headers.forEach((header, index) => {
    const picked = chosenField.get(index);
    const column =
      chosen !== undefined
        ? template.columns.find(
            (item) => item.field === picked && known.has(picked),
          )
        : fieldByHeader.get(normalizeHeader(header));
    if (
      header.trim() &&
      isBannedHeader(header, kind) &&
      !isTemplateHeader(header)
    ) {
      // Never read, even if someone maps it by mistake
      banned.push(header.trim());
    } else if (column) {
      // The first column wins when a file repeats a header
      if (!fields.includes(column.field)) {
        fields.push(column.field);
        present.push(index);
      }
    }
  });

  const missingRequired = template.columns
    .filter((column) => column.requiredColumn && !fields.includes(column.field))
    .map((column) => column.header);
  return { fields, present, missingRequired, banned };
}

export interface AgentRef {
  rank: AgentRank;
  code: string;
  name: string;
}

/** AGT-2 */
export function parseAgentRef(value: string): AgentRef | null {
  const match = /^(\w+):\s*(\d+)-(.+)$/.exec(value.trim());
  if (!match) return null;
  const rank = match[1].toUpperCase() as AgentRank;
  if (!AGENT_RANKS.includes(rank)) return null;
  const name = match[3].trim();
  return name ? { rank, code: match[2], name } : null;
}

/** IMP-8 + DATA-2: `dd/mm/yyyy` in, `YYYY-MM-DD` out. A day that is not on the calendar is refused. */
export function parseDate(value: string): string | null {
  const match = /^(\d{1,2})\/(\d{1,2})\/(\d{4})$/.exec(value.trim());
  if (!match) return null;
  const [day, month, year] = [match[1], match[2], match[3]].map(Number);
  const date = new Date(Date.UTC(year, month - 1, day));
  if (
    date.getUTCFullYear() !== year ||
    date.getUTCMonth() !== month - 1 ||
    date.getUTCDate() !== day
  ) {
    return null;
  }
  const pad = (part: number) => String(part).padStart(2, '0');
  return `${year}-${pad(month)}-${pad(day)}`;
}

/** IMP-7 */
function matchList(value: string, list: readonly string[]): string | undefined {
  const wanted = normalizeHeader(value);
  return list.find((item) => normalizeHeader(item) === wanted);
}

export interface CellIssue {
  column: string;
  code: string;
  value?: string;
}

export interface ParsedAgentRow {
  agentCode: string;
  name: string;
  rank: AgentRank;
  managerCode: string | null;
  managerName?: string;
  managerRank?: AgentRank;
  status: string;
  /** Only columns the file has appear here, so a missing column never erases data (IMP-5). */
  gender?: string | null;
  dob?: string | null;
  phone?: string | null;
  startDate: string;
  endDate?: string | null;
  officeCode?: string | null;
}

const asText = (cell: Cell | undefined): string =>
  cell === null || cell === undefined
    ? ''
    : String(cell).normalize('NFC').trim();

/** Section 19.2: every cell of one row. Returns the record, or the reasons it cannot be used. */
export function parseAgentRow(
  template: SheetTemplate,
  fields: readonly string[],
  cells: readonly Cell[],
): { data: ParsedAgentRow | null; key: string; issues: CellIssue[] } {
  const issues: CellIssue[] = [];
  const raw = new Map(
    fields.map((field, index) => [field, asText(cells[index])]),
  );
  const values: Record<string, string | null> = {};
  let agent: AgentRef | null = null;
  let manager: AgentRef | null = null;

  for (const column of template.columns) {
    if (!raw.has(column.field)) continue;
    const text = raw.get(column.field)!;
    if (!text) {
      if (column.requiredColumn && !column.allowBlank) {
        issues.push({ column: column.header, code: 'required' });
      }
      values[column.field] = null;
      continue;
    }
    if (text.length > MAX_TEXT) {
      issues.push({ column: column.header, code: 'too_long' });
      continue;
    }
    if (column.type === 'agentRef') {
      const parsed = parseAgentRef(text);
      if (!parsed) {
        issues.push({
          column: column.header,
          code: 'invalid_agent_ref',
          value: text,
        });
      } else if (column.field === 'agent') {
        agent = parsed;
      } else {
        manager = parsed;
      }
    } else if (column.type === 'date') {
      const parsed = parseDate(text);
      if (!parsed)
        issues.push({
          column: column.header,
          code: 'invalid_date',
          value: text,
        });
      else values[column.field] = parsed;
    } else if (column.type === 'list') {
      const parsed = matchList(text, column.list ?? []);
      if (!parsed)
        issues.push({
          column: column.header,
          code: 'invalid_list',
          value: text,
        });
      else values[column.field] = parsed;
    } else {
      values[column.field] =
        column.field === 'phone' ? normalizePhone(text) : text;
    }
  }

  const resolvedAgent = agent as AgentRef | null;
  const resolvedManager = manager as AgentRef | null;
  if (resolvedAgent && resolvedManager?.code === resolvedAgent.code) {
    issues.push({ column: 'Quản lý', code: 'self_manager' });
  }
  const key = resolvedAgent?.code ?? raw.get('agent') ?? '';
  if (issues.length > 0 || !resolvedAgent) return { data: null, key, issues };

  const optional = Object.fromEntries(
    ['gender', 'dob', 'phone', 'endDate', 'officeCode']
      .filter((field) => field in values)
      .map((field) => [field, values[field]]),
  );
  return {
    data: {
      agentCode: resolvedAgent.code,
      name: resolvedAgent.name,
      rank: resolvedAgent.rank,
      managerCode: resolvedManager?.code ?? null,
      managerName: resolvedManager?.name,
      managerRank: resolvedManager?.rank,
      status: values.status!,
      startDate: values.startDate!,
      ...optional,
    },
    key,
    issues,
  };
}

/** IMP-8: `13000000`, `13.000.000` and `13,000,000`. */
export function parseWholeNumber(cell: Cell | undefined): number | null {
  if (typeof cell === 'number') {
    return Number.isInteger(cell) && cell >= 0 ? cell : null;
  }
  const text = asText(cell);
  if (!/^\d{1,3}([.,]\d{3})*$|^\d+$/.test(text)) return null;
  return Number(text.replace(/[.,]/g, ''));
}

/** IMP-7 */
export function parseYesNo(value: string): boolean | null {
  const normalized = normalizeName(value);
  if (['CO', 'YES', 'Y', '1'].includes(normalized)) return true;
  if (['CHUA', 'NO', 'N', '0', 'KHONG'].includes(normalized)) return false;
  return null;
}

export interface RowIssue extends CellIssue {
  severity: 'error' | 'warning';
}

/** Section 19.7. Blank cells stay absent, because a blank never overwrites the CRM (IMP-27). */
export function parseLeadRow(
  template: SheetTemplate,
  fields: readonly string[],
  cells: readonly Cell[],
  catalogue?: { interest: ImportLabels; care_status: ImportLabels },
): { data: ParsedLeadRow | null; key: string; issues: RowIssue[] } {
  const issues: RowIssue[] = [];
  const fail = (column: TemplateColumn, code: string, value?: string) =>
    issues.push({ column: column.header, code, value, severity: 'error' });
  const values: Record<string, unknown> = {};
  let key = '';

  for (const column of template.columns) {
    const index = fields.indexOf(column.field);
    if (index < 0) continue;
    const cell = cells[index];
    const text = asText(cell);
    if (!text) {
      if (column.requiredColumn) fail(column, 'required');
      continue;
    }
    if (text.length > (column.maxLength ?? MAX_TEXT)) {
      fail(column, 'too_long');
      continue;
    }

    switch (column.type) {
      case 'phone': {
        key = text;
        // IMP-6: Excel turns a phone into a number and drops its leading zero
        const restored = /^[1-9]\d{8}$/.test(text);
        const phone = parsePhone(restored ? `0${text}` : text);
        if (!phone) {
          fail(column, 'invalid_phone', text);
          break;
        }
        values.phone = phone;
        key = phone;
        if (restored) {
          issues.push({
            column: column.header,
            code: 'padded_key',
            value: phone,
            severity: 'warning',
          });
        }
        break;
      }
      case 'date': {
        const parsed = parseDate(text);
        if (parsed) values[column.field] = parsed;
        else fail(column, 'invalid_date', text);
        break;
      }
      case 'int': {
        const parsed = parseWholeNumber(cell);
        if (parsed === null) fail(column, 'invalid_number', text);
        else values[column.field] = parsed;
        break;
      }
      case 'yesNo': {
        const parsed = parseYesNo(text);
        if (parsed === null) fail(column, 'invalid_yes_no', text);
        else values[column.field] = parsed;
        break;
      }
      case 'interest': {
        const parsed: LeadInterest | null = parseInterest(
          text,
          catalogue?.interest,
        );
        if (parsed) values[column.field] = parsed;
        else fail(column, 'invalid_list', text);
        break;
      }
      case 'care': {
        const parsed: LeadCareStatus | null = parseCareStatus(
          text,
          catalogue?.care_status,
        );
        if (parsed) values[column.field] = parsed;
        else fail(column, 'invalid_list', text);
        break;
      }
      default:
        values[column.field] = text;
    }
  }

  return issues.some((issue) => issue.severity === 'error')
    ? { data: null, key, issues }
    : { data: values as unknown as ParsedLeadRow, key, issues };
}
