import { ownerDb } from './owner-db.js';

/**
 * Lets the e2e suites copied from backend/ keep their database assertions while they run against
 * PostgreSQL: `collection('auditEvents').countDocuments({ action: 'LOGIN' })` becomes a SQL query.
 * Only the small filter language those suites use is supported; anything else throws.
 * It works as the owner, below row-level security, because it checks what was stored.
 */
const TABLES: Record<string, string> = {
  auditEvents: 'audit_events',
  loginAttempts: 'login_attempts',
  passwordResets: 'password_resets',
  sessions: 'sessions',
  users: 'users',
  invitations: 'invitations',
  tenants: 'tenants',
  tenantSettings: 'tenant_settings',
  agents: 'agents',
  leads: 'leads',
  leadHistory: 'lead_history',
  interactions: 'interactions',
  comments: 'comments',
  tasks: 'tasks',
  campaigns: 'campaigns',
  campaignMembers: 'campaign_members',
  formHits: 'form_hits',
  leadOptions: 'lead_options',
  savedFilters: 'saved_filters',
  notifications: 'notifications',
  noticeKeys: 'notice_keys',
  clients: 'clients',
  policies: 'policies',
  applications: 'applications',
  familyLinks: 'family_links',
  insurancePrograms: 'insurance_programs',
  recordChanges: 'record_changes',
  imports: 'imports',
  importErrors: 'import_errors',
  importRows: 'import_rows',
  successActivities: 'success_activities',
  aiSettings: 'ai_settings',
  aiProviderKeys: 'ai_provider_keys',
  products: 'products',
};
const ARRAY_COLUMNS = new Set([
  'roles',
  'ancestors',
  'mfa_recovery_codes',
  'mentions',
  'visible_agent_codes',
  'owner_agent_codes',
  'current_agent_codes',
  'client_codes',
]);

const snake = (value: string) =>
  value === '_id'
    ? 'id'
    : value.replace(/([a-z0-9])([A-Z])/g, '$1_$2').toLowerCase();
const camel = (value: string) =>
  value.replace(/_([a-z])/g, (_, letter: string) => letter.toUpperCase());

type Row = Record<string, any>;
type Filter = Record<string, unknown>;
type Sort = Record<string, 1 | -1>;

function where(filter: Filter, params: unknown[]): string {
  const clauses = conditions(filter, params);
  return clauses.length ? `WHERE ${clauses.join(' AND ')}` : '';
}

function conditions(filter: Filter, params: unknown[]): string[] {
  return Object.entries(filter).map(([key, value]) => {
    const add = (item: unknown) => `$${params.push(item)}`;
    if (key === '$or')
      return `(${(value as Filter[])
        .map((part) => `(${conditions(part, params).join(' AND ') || 'true'})`)
        .join(' OR ')})`;
    const [head, ...path] = key.split('.');
    const column = path.length
      ? `${snake(head)} #>> '{${path.join(',')}}'`
      : snake(head);
    // A JSON path compares as text
    const scalar = (item: unknown) =>
      path.length && item !== null && typeof item !== 'string'
        ? String(item as string | number | boolean)
        : item;
    if (value === null) return `${column} IS NULL`;
    if (value instanceof RegExp) return `${column} ~ ${add(value.source)}`;
    if (value instanceof Date) return `${column} = ${add(value)}`;
    if (typeof value === 'object' && !Array.isArray(value)) {
      return Object.entries(value as Record<string, unknown>)
        .map(([operator, operand]) => {
          switch (operator) {
            case '$regex': {
              const flags = (value as { $options?: string }).$options ?? '';
              return `${column} ${flags.includes('i') ? '~*' : '~'} ${add(operand)}`;
            }
            case '$options':
              return 'true';
            case '$exists':
              return `${column} IS ${operand ? 'NOT ' : ''}NULL`;
            case '$ne':
              return `${column} IS DISTINCT FROM ${add(scalar(operand))}`;
            case '$in':
              return `${column} = ANY(${add((operand as unknown[]).map(scalar))})`;
            case '$gte':
              return `${column} >= ${add(operand)}`;
            case '$lte':
              return `${column} <= ${add(operand)}`;
            case '$gt':
              return `${column} > ${add(operand)}`;
            case '$lt':
              return `${column} < ${add(operand)}`;
            default:
              throw new Error(`collections shim: ${operator} is not supported`);
          }
        })
        .join(' AND ');
    }
    if (!path.length && ARRAY_COLUMNS.has(column))
      return `${add(value)} = ANY(${column})`;
    return `${column} = ${add(scalar(value))}`;
  });
}

/** camelCase keys, `_id` beside `id`, and no null fields, like a MongoDB document. */
function toDocument(row: Row): Row {
  const document: Row = Object.fromEntries(
    Object.entries(row)
      .filter(([, value]) => value !== null)
      .map(([key, value]) => [camel(key), value]),
  );
  if ('id' in document) document._id = document.id;
  return document;
}

const order = (sort?: Sort) =>
  sort
    ? `ORDER BY ${Object.entries(sort)
        .map(
          ([key, direction]) =>
            `${snake(key)} ${direction < 0 ? 'DESC' : 'ASC'}`,
        )
        .join(', ')}`
    : '';

function setClause(update: { $set: Row }, params: unknown[]): string {
  return Object.entries(update.$set)
    .map(([key, value]) => `${snake(key)} = $${params.push(value)}`)
    .join(', ');
}

export function collection(name: string) {
  const table = TABLES[name];
  if (!table) throw new Error(`collections shim: no table for ${name}`);
  const select = async (filter: Filter, sort?: Sort, limit?: number) => {
    const params: unknown[] = [];
    const { rows } = await ownerDb().query(
      `SELECT * FROM ${table} ${where(filter, params)} ${order(sort)} ${limit ? `LIMIT ${limit}` : ''}`,
      params,
    );
    return (rows as Row[]).map(toDocument);
  };
  const insert = async (documents: Row[]): Promise<string[]> => {
    const ids: string[] = [];
    for (const document of documents) {
      const { _id, id, ...rest } = document;
      const key = _id ?? id;
      const row: Row = { ...rest, ...(key && { id: key }) };
      const params: unknown[] = [];
      const columns = Object.keys(row).map(snake);
      const values = Object.values(row).map(
        (value) => `$${params.push(value)}`,
      );
      const { rows } = await ownerDb().query(
        `INSERT INTO ${table} (${columns.join(', ')}) VALUES (${values.join(', ')}) RETURNING id`,
        params,
      );
      ids.push((rows[0] as { id: string }).id);
    }
    return ids;
  };
  return {
    async insertOne(document: Row): Promise<{ insertedId: string }> {
      const [insertedId] = await insert([document]);
      return { insertedId };
    },
    async insertMany(documents: Row[]): Promise<{ insertedIds: string[] }> {
      return { insertedIds: await insert(documents) };
    },
    async countDocuments(filter: Filter = {}): Promise<number> {
      const params: unknown[] = [];
      const { rows } = await ownerDb().query(
        `SELECT count(*)::int AS n FROM ${table} ${where(filter, params)}`,
        params,
      );
      return (rows[0] as { n: number }).n;
    },
    async findOne(
      filter: Filter = {},
      options?: { sort?: Sort },
    ): Promise<Row | null> {
      return (await select(filter, options?.sort, 1))[0] ?? null;
    },
    find(filter: Filter = {}) {
      let sort: Sort | undefined;
      let limit: number | undefined;
      const cursor = {
        sort(value: Sort) {
          sort = value;
          return cursor;
        },
        limit(value: number) {
          limit = value;
          return cursor;
        },
        toArray: () => select(filter, sort, limit),
        map: <T>(each: (row: Row) => T) => ({
          toArray: async () => (await select(filter, sort, limit)).map(each),
        }),
        next: async () => (await select(filter, sort, 1))[0] ?? null,
      };
      return cursor;
    },
    async deleteMany(filter: Filter = {}): Promise<void> {
      const params: unknown[] = [];
      await ownerDb().query(
        `DELETE FROM ${table} ${where(filter, params)}`,
        params,
      );
    },
    async updateMany(filter: Filter, update: { $set: Row }): Promise<void> {
      const params: unknown[] = [];
      const set = setClause(update, params);
      await ownerDb().query(
        `UPDATE ${table} SET ${set} ${where(filter, params)}`,
        params,
      );
    },
    async updateOne(filter: Filter, update: { $set: Row }): Promise<void> {
      const params: unknown[] = [];
      const set = setClause(update, params);
      await ownerDb().query(
        `UPDATE ${table} SET ${set} WHERE id = (SELECT id FROM ${table} ${where(filter, params)} LIMIT 1)`,
        params,
      );
    },
  };
}

/** The `connection` object the copied suites use for their assertions. */
export const connection = { collection };
