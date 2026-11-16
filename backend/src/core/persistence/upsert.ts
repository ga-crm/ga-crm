import type { EntityManager, EntityTarget, ObjectLiteral } from 'typeorm';

const CHUNK = 500;

type Row = Record<string, unknown>;

function columns<T extends ObjectLiteral>(
  db: EntityManager,
  target: EntityTarget<T>,
) {
  const metadata = db.connection.getMetadata(target);
  const column = (property: string) => {
    const found = metadata.findColumnWithPropertyName(property);
    return found?.isInsert ? found : undefined;
  };
  return {
    table: metadata.tableName,
    column,
    /** Only the fields that are columns of the table. */
    known: (row: Row): Row =>
      Object.fromEntries(Object.entries(row).filter(([key]) => column(key))),
  };
}

/** Rows grouped by the fields they carry, since one statement needs one column list. */
function bySignature(rows: readonly Row[]): Row[][] {
  const groups = new Map<string, Row[]>();
  for (const row of rows) {
    const signature = Object.keys(row).sort().join(',');
    groups.set(signature, [...(groups.get(signature) ?? []), row]);
  }
  return [...groups.values()];
}

/** Inserts rows a chunk per statement. `ignoreExisting` skips rows whose unique key is taken. */
export async function insertRows<T extends ObjectLiteral>(
  db: EntityManager,
  target: EntityTarget<T>,
  rows: readonly Row[],
  options: { ignoreExisting?: boolean } = {},
): Promise<void> {
  const { known } = columns(db, target);
  for (const group of bySignature(rows.map(known)))
    for (let start = 0; start < group.length; start += CHUNK) {
      const insert = db
        .createQueryBuilder()
        .insert()
        .into(target)
        .values(group.slice(start, start + CHUNK) as never)
        .updateEntity(false);
      if (options.ignoreExisting) insert.orIgnore();
      await insert.execute();
    }
}

/**
 * Updates stored rows of one tenant by their natural key, a chunk per statement. Only the fields a
 * row carries are written, so a cell a file left blank never clears what is stored (IMP-5).
 */
export async function updateRows<T extends ObjectLiteral>(
  db: EntityManager,
  target: EntityTarget<T>,
  tenantId: string,
  key: keyof T & string,
  rows: readonly Row[],
): Promise<void> {
  const { table, column, known } = columns(db, target);
  const keyColumn = column(key)!;
  for (const group of bySignature(rows.map(known))) {
    const fields = Object.keys(group[0]).filter((field) => field !== key);
    if (fields.length === 0) continue;
    const definitions = [key, ...fields].map((field) => {
      const found = column(field)!;
      const type = String(found.type);
      return `"${found.databaseName}" ${type}${found.isArray ? '[]' : ''}`;
    });
    const assignments = fields.map((field) => {
      const name = column(field)!.databaseName;
      return `"${name}" = v."${name}"`;
    });
    for (let start = 0; start < group.length; start += CHUNK) {
      const chunk = group
        .slice(start, start + CHUNK)
        .map((row) =>
          Object.fromEntries(
            Object.entries(row).map(([field, value]) => [
              column(field)!.databaseName,
              value,
            ]),
          ),
        );
      await db.query(
        `UPDATE "${table}" t SET ${assignments.join(', ')}
           FROM jsonb_to_recordset($2::jsonb) AS v(${definitions.join(', ')})
          WHERE t.tenant_id = $1 AND t."${keyColumn.databaseName}" = v."${keyColumn.databaseName}"`,
        [tenantId, JSON.stringify(chunk)],
      );
    }
  }
}
