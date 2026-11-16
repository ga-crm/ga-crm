import pg, { Pool } from 'pg';

/** `date` columns stay `YYYY-MM-DD` text, as the API reads them (DATA-2). */
const DATE_OID = 1082;
const types = {
  getTypeParser: ((oid: number, format?: 'text' | 'binary') =>
    oid === DATE_OID
      ? (value: string) => value
      : pg.types.getTypeParser(oid, format)) as typeof pg.types.getTypeParser,
};

let pool: Pool | undefined;

/** The test database as its owner, which row-level security does not bind: for assertions only. */
export const ownerDb = (): Pool =>
  (pool ??= new Pool({
    connectionString: process.env.DATABASE_OWNER_URL,
    max: 2,
    types,
  }));

export async function closeOwnerDb(): Promise<void> {
  await pool?.end();
  pool = undefined;
}
