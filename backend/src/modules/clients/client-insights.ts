import { normalizeName } from '../../common/normalize.js';
import { isActiveStatus } from './client-links.js';

/** COV-2 */
export const COVERAGE_GROUPS = [
  'LIFE',
  'HEALTH',
  'CI',
  'ACCIDENT',
  'MATERNITY',
  'OTHER',
] as const;
export type CoverageGroup = (typeof COVERAGE_GROUPS)[number];
/** COV-4: the groups whose absence is a gap. */
export const GAP_GROUPS: readonly CoverageGroup[] = [
  'HEALTH',
  'CI',
  'ACCIDENT',
];

/** COV-3: keywords, in the order they are tried. */
const GROUP_WORDS: [CoverageGroup, readonly string[]][] = [
  ['MATERNITY', ['THAI SAN', 'MATERNITY']],
  ['CI', ['UNG THU', 'CANCER', 'HIEM NGHEO', 'CRITICAL']],
  ['ACCIDENT', ['TAI NAN', 'ACCIDENT']],
  [
    'HEALTH',
    [
      'SUC KHOE',
      'HEALTH',
      'Y TE',
      'NOI TRU',
      'HOSPITAL',
      'MEDICAL',
      'VIEN PHI',
    ],
  ],
  [
    'LIFE',
    [
      'LIFE',
      'NHAN THO',
      'TU KY',
      'LIEN KET',
      'TRON DOI',
      'HUU TRI',
      'UNIVERSAL',
      'UNIT-LINKED',
      'UNIT LINKED',
      'ENDOWMENT',
    ],
  ],
];

/**
 * COV-3: the 11_Products category first, then the product name. No match: a main product is
 * life cover, a rider is "other".
 */
export function coverageGroup(product: {
  productName?: string | null;
  productRole?: string | null;
  category?: string | null;
}): CoverageGroup {
  for (const text of [product.category, product.productName]) {
    if (!text) continue;
    const normalized = normalizeName(text);
    for (const [group, words] of GROUP_WORDS) {
      if (words.some((word) => normalized.includes(word))) return group;
    }
  }
  return product.productRole === 'Chính' ? 'LIFE' : 'OTHER';
}

export interface InsightPolicy {
  policyNo: string;
  status: string | null;
  holderClientId?: string | null;
  insuredClientId?: string | null;
  insuredName: string | null;
  premiumDueDate?: string | null;
  maturityDate: string | null;
  unpaidPremiumVnd?: number | null;
  aplDebtVnd?: number | null;
  basePremiumVnd: number | null;
  clients: {
    clientId: string;
    role: string;
    /** Stored as JSON, so it reads back as ISO text. */
    endedAt?: Date | string | null;
  }[];
  products: {
    productCode: string;
    insuredClientId?: string | null;
    productName?: string | null;
    productRole: string;
    sumAssuredVnd?: number | null;
    status?: string | null;
    insuredName?: string | null;
  }[];
}

/** A person known by client id, or only by a name written on a policy (PRD-3, FAM-5). */
export const personKey = (
  clientId?: string | null,
  name?: string | null,
): string => (clientId ? clientId : `name:${normalizeName(name ?? '')}`);

/**
 * COV-1: who a product line insures. A client wins; a line naming someone other than the main
 * insured belongs to that name; otherwise it is the main insured.
 */
export function insuredOf(
  policy: InsightPolicy,
  product: InsightPolicy['products'][number],
): { key: string; name: string; clientId: string | null } {
  if (product.insuredClientId)
    return {
      key: product.insuredClientId,
      name: product.insuredName ?? '',
      clientId: product.insuredClientId,
    };
  const name = product.insuredName?.trim();
  if (name && normalizeName(name) !== normalizeName(policy.insuredName ?? ''))
    return { key: personKey(null, name), name, clientId: null };
  return {
    key: personKey(policy.insuredClientId, policy.insuredName),
    name: policy.insuredName ?? '',
    clientId: policy.insuredClientId ?? null,
  };
}

export interface CoverageRow {
  key: string;
  name: string;
  clientId: string | null;
  /** COV-5: sum assured per group, active products only. */
  groups: Partial<Record<CoverageGroup, number>>;
  /** COV-4: whether any product line names this person; without it gaps are unknown. */
  hasDetail: boolean;
  gaps: CoverageGroup[];
}

/** COV-1 to COV-5: people × groups, always worked out from the product lines (never stored). */
export function coverage(
  policies: readonly InsightPolicy[],
  people: readonly { key: string; name: string; clientId: string | null }[],
): CoverageRow[] {
  const rows = new Map<string, CoverageRow>(
    people.map((person) => [
      person.key,
      { ...person, groups: {}, hasDetail: false, gaps: [] },
    ]),
  );
  for (const policy of policies) {
    for (const product of policy.products) {
      const person = insuredOf(policy, product);
      const row = rows.get(person.key);
      if (!row) continue;
      row.hasDetail = true;
      // COV-1: the product and its policy must both be in force
      const inForce =
        isActiveStatus(policy.status) &&
        (!product.status || isActiveStatus(product.status));
      if (!inForce) continue;
      const group = coverageGroup(product);
      row.groups[group] =
        (row.groups[group] ?? 0) + (product.sumAssuredVnd ?? 0);
    }
  }
  for (const row of rows.values()) {
    if (row.hasDetail)
      row.gaps = GAP_GROUPS.filter((group) => row.groups[group] === undefined);
  }
  return [...rows.values()];
}

/** Section 10.11 */
export const SIGNAL_CODES = [
  'PREMIUM_DUE',
  'UNPAID',
  'APL',
  'MATURITY',
  'NOT_ACTIVE',
  'LAPSED',
  'BIRTHDAY',
  'GAP',
  'FAMILY_UNCOVERED',
  'NO_DCONNECT',
] as const;
export type SignalCode = (typeof SIGNAL_CODES)[number];

export interface Signal {
  code: SignalCode;
  /** The values the screen puts into its sentence. */
  values: Record<string, string | number>;
}

const addDays = (date: string, days: number) =>
  new Date(Date.parse(`${date}T00:00:00Z`) + days * 86_400_000)
    .toISOString()
    .slice(0, 10);
const addMonths = (date: string, months: number) => {
  const [year, month, day] = date.split('-').map(Number);
  const target = new Date(Date.UTC(year, month - 1 + months, day));
  return target.toISOString().slice(0, 10);
};

/** SIG-1: the date windows of the signals, from today in Vietnam (`YYYY-MM-DD`). */
export const signalWindows = (today: string) => ({
  dueUntil: addDays(today, 30),
  maturityUntil: addMonths(today, 12),
  month: Number(today.slice(5, 7)),
});

/** Section 10.11: a client's care opportunities. They are events, never product advice. */
export function signals(input: {
  client: {
    id: string;
    birthMonth?: number | null;
    birthDayMonth?: string | null;
    dob?: string | null;
    lapsedPolicies?: number | null;
    usesDconnect?: boolean | null;
  };
  policies: readonly InsightPolicy[];
  coverage: readonly CoverageRow[];
  /** The family rows, so FAMILY_UNCOVERED can name them. */
  family: readonly { key: string; name: string }[];
  today: string;
}): Signal[] {
  const { client, today } = input;
  const window = signalWindows(today);
  const result: Signal[] = [];
  const roles = (policy: InsightPolicy) =>
    policy.clients
      .filter((link) => link.clientId === client.id && !link.endedAt)
      .map((link) => link.role);
  let notActive = false;
  for (const policy of input.policies) {
    const mine = roles(policy);
    const holder = mine.includes('PO');
    const active = isActiveStatus(policy.status);
    if (
      holder &&
      active &&
      policy.premiumDueDate &&
      policy.premiumDueDate >= today &&
      policy.premiumDueDate <= window.dueUntil
    )
      result.push({
        code: 'PREMIUM_DUE',
        values: {
          policyNo: policy.policyNo,
          date: policy.premiumDueDate,
          amount: policy.basePremiumVnd ?? 0,
        },
      });
    if (holder && (policy.unpaidPremiumVnd ?? 0) > 0)
      result.push({
        code: 'UNPAID',
        values: { policyNo: policy.policyNo, amount: policy.unpaidPremiumVnd! },
      });
    if (holder && (policy.aplDebtVnd ?? 0) > 0)
      result.push({
        code: 'APL',
        values: { policyNo: policy.policyNo, amount: policy.aplDebtVnd! },
      });
    if (
      mine.length > 0 &&
      active &&
      !!policy.maturityDate &&
      policy.maturityDate >= today &&
      policy.maturityDate <= window.maturityUntil
    )
      result.push({
        code: 'MATURITY',
        values: { policyNo: policy.policyNo, date: policy.maturityDate! },
      });
    // A policy added with its number only has no status yet, so it is not called inactive
    if (mine.length > 0 && policy.status && !active) {
      notActive = true;
      result.push({
        code: 'NOT_ACTIVE',
        values: { policyNo: policy.policyNo, status: policy.status },
      });
    }
  }
  if (!notActive && (client.lapsedPolicies ?? 0) > 0)
    result.push({ code: 'LAPSED', values: { count: client.lapsedPolicies! } });
  // CUS-2: the month comes from `birthDayMonth`, or from the birth date when Success sends no day
  if (client.birthMonth === window.month)
    result.push({
      code: 'BIRTHDAY',
      values: {
        date:
          client.birthDayMonth ??
          (client.dob
            ? `${client.dob.slice(8, 10)}/${client.dob.slice(5, 7)}`
            : ''),
      },
    });
  for (const row of input.coverage) {
    if (row.gaps.length > 0)
      result.push({
        code: 'GAP',
        values: { name: row.name, groups: row.gaps.join(',') },
      });
  }
  for (const member of input.family) {
    const row = input.coverage.find((item) => item.key === member.key);
    const covered =
      !!row && Object.values(row.groups).some((value) => value !== undefined);
    if (!covered)
      result.push({ code: 'FAMILY_UNCOVERED', values: { name: member.name } });
  }
  if (client.usesDconnect === false)
    result.push({ code: 'NO_DCONNECT', values: {} });
  return result;
}

/** SIG-1: the signal tabs of the client list, and the signals each one gathers. */
export const LIST_SIGNALS = [
  'due',
  'debt',
  'maturity',
  'birthday',
  'lapsed',
] as const;
export type ListSignal = (typeof LIST_SIGNALS)[number];
const LIST_SIGNAL_CODES: Record<ListSignal, readonly SignalCode[]> = {
  due: ['PREMIUM_DUE'],
  debt: ['UNPAID', 'APL'],
  maturity: ['MATURITY'],
  birthday: ['BIRTHDAY'],
  lapsed: ['NOT_ACTIVE', 'LAPSED'],
};

/** SIG-1 + CUS-14: the signal labels of a list row, from the same rules as the client page. */
export function listFlags(
  list: readonly Signal[],
): Record<ListSignal, boolean> {
  const codes = new Set(list.map((signal) => signal.code));
  return Object.fromEntries(
    LIST_SIGNALS.map((tab) => [
      tab,
      LIST_SIGNAL_CODES[tab].some((code) => codes.has(code)),
    ]),
  ) as Record<ListSignal, boolean>;
}

/** FAM-2: the other side sees the relation the other way round. */
export const RELATIONS = [
  'SPOUSE',
  'CHILD',
  'PARENT',
  'SIBLING',
  'OTHER',
] as const;
export type Relation = (typeof RELATIONS)[number];
export const inverseRelation = (relation: Relation): Relation =>
  relation === 'CHILD' ? 'PARENT' : relation === 'PARENT' ? 'CHILD' : relation;

/** FAM-5: a name as Success writes it (often upper case), shown with capitals on each word. */
export const titleCase = (name: string): string =>
  name
    .toLocaleLowerCase('vi')
    .split(/\s+/)
    .filter(Boolean)
    .map((word) => word.charAt(0).toLocaleUpperCase('vi') + word.slice(1))
    .join(' ');
