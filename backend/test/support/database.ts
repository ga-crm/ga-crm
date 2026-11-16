import { Client } from 'pg';
import { migrate } from '../../src/core/db/migrate.js';

/** Recreates the test database from the migrations, as the owner. */
export async function resetTestDatabase(): Promise<void> {
  const ownerUrl = new URL(process.env.DATABASE_OWNER_URL!);
  const name = ownerUrl.pathname.slice(1);
  if (!name.endsWith('_test'))
    throw new Error(`Refusing to reset "${name}": not a test database`);
  const admin = new Client({
    connectionString: Object.assign(new URL(ownerUrl), {
      pathname: '/postgres',
    }).toString(),
  });
  await admin.connect();
  try {
    await admin.query(`DROP DATABASE IF EXISTS "${name}" WITH (FORCE)`);
    await admin.query(`CREATE DATABASE "${name}"`);
  } finally {
    await admin.end();
  }
  await migrate(ownerUrl.toString());
}
