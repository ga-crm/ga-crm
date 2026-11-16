import {
  APPLICATION_KEY,
  CLIENT_CODE,
  POLICY_NO,
  PRODUCT_KEY,
} from '../clients/client.constants.js';
import { normalizeName, parsePhone } from '../../common/normalize.js';
import type { Cell, RowIssue } from './cells.js';
import { parseDate, parseWholeNumber, parseYesNo } from './cells.js';
import { SUCCESS_ACTIVITY_TYPES } from './infrastructure/import.entities.js';
import type { SuccessActivityType } from './infrastructure/import.entities.js';
import type { CellType, SheetTemplate, TemplateColumn } from './templates.js';

const MAX_TEXT = 500; // Section 19.1

const asText = (cell: Cell | undefined): string =>
  cell === null || cell === undefined
    ? ''
    : String(cell).normalize('NFC').trim();

const normalizeList = (value: string) =>
  value.normalize('NFC').replace(/\s+/g, ' ').trim().toLowerCase();

/** IMP-6: the length each kind of key is padded back to, and the code a bad one reports. */
const KEYS: Partial<
  Record<CellType, { pattern: RegExp; length?: number; code: string }>
> = {
  clientKey: { pattern: CLIENT_CODE, length: 10, code: 'invalid_key_client' },
  policyKey: { pattern: POLICY_NO, length: 9, code: 'invalid_key_policy' },
  agentKey: { pattern: /^\d{1,20}$/, code: 'invalid_key_agent' },
  applicationKey: { pattern: APPLICATION_KEY, code: 'invalid_key_application' },
  productKey: { pattern: PRODUCT_KEY, code: 'invalid_key_product' },
};

/**
 * IMP-6: a key Excel turned into a number lost its leading zeros. Digits shorter than the template
 * length get them back, with a warning; anything else that does not match is refused.
 */
export function parseKey(
  type: CellType,
  value: string,
): { key: string; padded: boolean } | null {
  const rule = KEYS[type];
  if (!rule) return null;
  if (rule.pattern.test(value)) return { key: value, padded: false };
  if (rule.length && /^\d+$/.test(value) && value.length < rule.length) {
    return { key: value.padStart(rule.length, '0'), padded: true };
  }
  return null;
}

/**
 * IMP-8: `60%`, `60` and `0.6` all mean sixty percent. A number cell of at most 1 is a fraction,
 * because that is how Excel stores a cell formatted as a percentage.
 */
export function parsePercent(cell: Cell | undefined): number | null {
  if (typeof cell === 'number') {
    const value = cell <= 1 ? cell * 100 : cell;
    return value >= 0 && value <= 100 ? Math.round(value * 100) / 100 : null;
  }
  const text = asText(cell).replace(',', '.');
  const match = /^(\d+(?:\.\d+)?)\s*(%?)$/.exec(text);
  if (!match) return null;
  const number = Number(match[1]);
  const value =
    !match[2] && text.includes('.') && number <= 1 ? number * 100 : number;
  return value >= 0 && value <= 100 ? Math.round(value * 100) / 100 : null;
}

/**
 * IMP-8: `dd/mm/yyyy hh:mm` in Vietnam time, or an ISO timestamp with its zone. Returns an ISO
 * string, so staged rows stay plain JSON.
 */
export function parseDateTime(value: string): string | null {
  const local =
    /^(\d{1,2}\/\d{1,2}\/\d{4})\s+(\d{1,2}):(\d{2})(?::(\d{2}))?$/.exec(
      value.trim(),
    );
  if (local) {
    const date = parseDate(local[1]);
    const [hours, minutes, seconds] = [local[2], local[3], local[4] ?? '0'].map(
      Number,
    );
    if (!date || hours > 23 || minutes > 59 || seconds > 59) return null;
    const pad = (part: number) => String(part).padStart(2, '0');
    return new Date(
      `${date}T${pad(hours)}:${pad(minutes)}:${pad(seconds)}+07:00`,
    ).toISOString();
  }
  if (/^\d{4}-\d{2}-\d{2}T.+(Z|[+-]\d{2}:?\d{2})$/.test(value.trim())) {
    const date = new Date(value.trim());
    return Number.isNaN(date.getTime()) ? null : date.toISOString();
  }
  return null;
}

/** IMP-31: the English names Success writes next to (or instead of) the number. */
const ACTIVITY_NAMES: [SuccessActivityType, readonly string[]][] = [
  ['CHECKIN', ['CHECKIN', 'CHECK IN', 'CHECK-IN', 'CHECKINS']],
  ['CALL', ['CALL', 'CALLS']],
  [
    'SOCIAL_POST',
    ['SOCIAL_POST', 'SOCIAL POST', 'SOCIAL POSTS', 'POST', 'POSTS'],
  ],
  ['MEETING', ['MEETING', 'MEETINGS', 'MEET']],
  ['COACHING', ['COACHING', 'COACH']],
  ['OTHER', ['OTHER', 'OTHERS']],
  ['PROPOSAL', ['PROPOSAL', 'PROPOSALS']],
];

/**
 * IMP-31: `activity_type_id` as 1-7, as a number followed by its name ("2 Calls"), or as the name
 * alone ("Calls"). A number and a name that disagree are refused rather than guessed.
 */
export function parseActivityType(value: string): SuccessActivityType | null {
  const match = /^(\d+)?\s*[-.:)]?\s*(.*)$/.exec(value.trim());
  if (!match) return null;
  const byNumber = match[1]
    ? SUCCESS_ACTIVITY_TYPES[Number(match[1]) - 1]
    : undefined;
  if (match[1] && !byNumber) return null;
  const name = normalizeName(match[2] ?? '');
  const byName = name
    ? ACTIVITY_NAMES.find(([, names]) => names.includes(name))?.[0]
    : undefined;
  if (name && !byName) return null;
  if (byNumber && byName && byNumber !== byName) return null;
  return byNumber ?? byName ?? null;
}

/** IMP-8: `dd/mm`, a day that exists in some year (29/02 included). */
export function parseDayMonth(value: string): string | null {
  const match = /^(\d{1,2})\/(\d{1,2})$/.exec(value.trim());
  if (!match) return null;
  const [day, month] = [Number(match[1]), Number(match[2])];
  const date = new Date(Date.UTC(2024, month - 1, day));
  if (date.getUTCMonth() !== month - 1 || date.getUTCDate() !== day) {
    return null;
  }
  return `${String(day).padStart(2, '0')}/${String(month).padStart(2, '0')}`;
}

/**
 * Section 19.3-19.5: every cell of one row of 02-05. Blank cells stay absent, so a missing value
 * never erases what is stored (IMP-5). Returns the record, or the reasons it cannot be used.
 */
export function parseSuccessRow(
  template: SheetTemplate,
  fields: readonly string[],
  cells: readonly Cell[],
  keyField: string,
): { data: Record<string, unknown> | null; key: string; issues: RowIssue[] } {
  const issues: RowIssue[] = [];
  const fail = (column: TemplateColumn, code: string, value?: string) =>
    issues.push({ column: column.header, code, value, severity: 'error' });
  const values: Record<string, unknown> = {};

  for (const column of template.columns) {
    const index = fields.indexOf(column.field);
    if (index < 0) continue;
    const cell = cells[index];
    const text = asText(cell);
    if (!text) {
      if (column.requiredColumn && !column.allowBlank) fail(column, 'required');
      continue;
    }
    if (text.length > (column.maxLength ?? MAX_TEXT)) {
      fail(column, 'too_long');
      continue;
    }
    switch (column.type) {
      case 'clientKey':
      case 'policyKey':
      case 'agentKey':
      case 'applicationKey':
      case 'productKey': {
        const parsed = parseKey(column.type, text);
        if (!parsed) {
          fail(column, KEYS[column.type]!.code, text);
          break;
        }
        values[column.field] = parsed.key;
        if (parsed.padded) {
          issues.push({
            column: column.header,
            code: 'padded_key',
            value: parsed.key,
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
      case 'datetime': {
        const parsed = parseDateTime(text);
        if (parsed) values[column.field] = parsed;
        else fail(column, 'invalid_datetime', text);
        break;
      }
      case 'dayMonth': {
        const parsed = parseDayMonth(text);
        if (parsed) values[column.field] = parsed;
        else fail(column, 'invalid_day_month', text);
        break;
      }
      case 'int': {
        const parsed = parseWholeNumber(cell);
        if (parsed === null) fail(column, 'invalid_number', text);
        else values[column.field] = parsed;
        break;
      }
      case 'percent': {
        const parsed = parsePercent(cell);
        if (parsed === null) fail(column, 'invalid_percent', text);
        else values[column.field] = parsed;
        break;
      }
      case 'yesNo': {
        const parsed = parseYesNo(text);
        if (parsed === null) fail(column, 'invalid_yes_no', text);
        else values[column.field] = parsed;
        break;
      }
      case 'activityType': {
        const parsed = parseActivityType(text);
        if (parsed) values[column.field] = parsed;
        else fail(column, 'invalid_activity_type', text);
        break;
      }
      case 'phone': {
        // IMP-32: an optional column; a number that cannot be read is left out, not fatal
        const parsed = parsePhone(text);
        if (parsed) values[column.field] = parsed;
        else
          issues.push({
            column: column.header,
            code: 'invalid_phone',
            value: text,
            severity: 'warning',
          });
        break;
      }
      case 'list': {
        // IMP-7: case and spaces do not matter; the stored value is the list's own spelling
        const wanted = normalizeList(text);
        const parsed = column.list?.find(
          (item) => normalizeList(item) === wanted,
        );
        if (parsed) values[column.field] = parsed;
        else fail(column, 'invalid_list', text);
        break;
      }
      default:
        values[column.field] = text;
    }
  }

  const key = (values[keyField] as string | undefined) ?? '';
  return issues.some((issue) => issue.severity === 'error')
    ? {
        data: null,
        key: key || asText(cells[fields.indexOf(keyField)]),
        issues,
      }
    : { data: values, key, issues };
}
