import type { EntityManager } from 'typeorm';

/**
 * Rows of a raw query. TypeORM returns `[rows, rowCount]` for UPDATE and DELETE (with or without
 * RETURNING) and the rows themselves for everything else; this always gives the rows.
 */
export async function rowsOf<T>(
  db: EntityManager,
  query: string,
  params?: unknown[],
): Promise<T[]> {
  const result = (await db.query(query, params)) as unknown;
  if (
    Array.isArray(result) &&
    result.length === 2 &&
    Array.isArray(result[0]) &&
    typeof result[1] === 'number'
  )
    return result[0] as T[];
  return result as T[];
}
