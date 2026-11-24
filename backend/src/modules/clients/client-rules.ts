import { normalizeName } from '../../common/normalize.js';
import type { PolicyProduct } from './infrastructure/client.entities.js';

/** CUS-2: the age bands Success uses. */
export function ageBandOf(dob: string, today: string): string {
  const [year, month, day] = dob.split('-').map(Number);
  const [nowYear, nowMonth, nowDay] = today.split('-').map(Number);
  const age =
    nowYear -
    year -
    (nowMonth < month || (nowMonth === month && nowDay < day) ? 1 : 0);
  if (age < 18) return '<18';
  if (age < 30) return '18-29';
  if (age < 40) return '30-39';
  if (age < 50) return '40-49';
  if (age < 60) return '50-59';
  return '60+';
}

/** MAN-2: `dd/mm` from `YYYY-MM-DD`. */
export const birthDayMonthOf = (dob: string): string =>
  `${dob.slice(8, 10)}/${dob.slice(5, 7)}`;

export interface ProgramRef {
  code: string;
  label: string;
  productRole: string;
  productCode?: string;
}

export interface ProductLineInput {
  insuredName?: string;
  insuredDob?: string;
  insuredGender?: string;
  programCode: string;
  sumAssuredVnd?: number;
  termYears?: number;
  status?: string;
  annualPremiumVnd?: number;
  productRole?: string;
  startDate?: string;
}

/**
 * POL-3 and PRD-1 to PRD-4: the product lines of a policy entered by hand. Returns the lines, or the
 * index of the first line that repeats a programme for the same insured person.
 */
export function buildProductLines(input: {
  lines: readonly ProductLineInput[];
  programs: ReadonlyMap<string, ProgramRef>;
  mainInsured: { clientId?: string; name: string };
}): { products: PolicyProduct[] } | { repeated: number } {
  const seen = new Set<string>();
  const products: PolicyProduct[] = [];
  for (const [index, line] of input.lines.entries()) {
    const program = input.programs.get(line.programCode)!;
    const name = line.insuredName?.trim() || input.mainInsured.name;
    // PRD-3: only the main insured is a client; a name alone never becomes a client link
    const isMain =
      normalizeName(name) === normalizeName(input.mainInsured.name);
    // PRD-6: the DLVN product code when the GA knows it, so a later 04 import matches this line
    const productCode = program.productCode || program.code;
    // PRD-4: one programme once per insured person
    const person = isMain
      ? `#${input.mainInsured.clientId ?? ''}`
      : normalizeName(name);
    const key = `${productCode}|${person}`;
    if (seen.has(key)) return { repeated: index };
    seen.add(key);
    products.push({
      productCode,
      ...(isMain &&
        input.mainInsured.clientId && {
          insuredClientId: input.mainInsured.clientId,
        }),
      productName: program.label,
      // PRG-7: the catalogue's role unless the line says otherwise
      productRole: line.productRole ?? program.productRole,
      programCode: program.code,
      insuredName: name,
      ...(line.insuredDob && { insuredDob: line.insuredDob }),
      ...(line.insuredGender && { insuredGender: line.insuredGender }),
      ...(line.sumAssuredVnd !== undefined && {
        sumAssuredVnd: line.sumAssuredVnd,
      }),
      ...(line.termYears !== undefined && { termYears: line.termYears }),
      ...(line.status && { status: line.status }),
      ...(line.annualPremiumVnd !== undefined && {
        annualPremiumVnd: line.annualPremiumVnd,
      }),
      ...(line.startDate && { startDate: line.startDate }),
    });
  }
  return { products };
}

/** POL-7 (open question 12b, decided 14/11/2026): how long a policy entered by hand can be deleted. */
export const POLICY_DELETE_DAYS = 7;

/**
 * POL-7: a policy entered by hand by mistake may be deleted while it is still only the GA's: entered
 * by hand, never written by a Success import (which would make it DLVN's record), and at most 7
 * days old.
 */
export function policyDeletable(
  policy: { origin: string; lastImportId: string | null; createdAt: Date },
  now: Date,
): boolean {
  return (
    policy.origin === 'MANUAL' &&
    !policy.lastImportId &&
    now.getTime() - policy.createdAt.getTime() <= POLICY_DELETE_DAYS * 86_400_000
  );
}
