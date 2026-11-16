import '../../config/load-env.side-effect.js';
import { DataSource } from 'typeorm';
import { dataSourceOptions } from './data-source-options.js';

/** `npm run db:migrate`: runs pending migrations as the owner, each in its own transaction. */
export async function migrate(
  url = process.env.DATABASE_OWNER_URL,
): Promise<string[]> {
  if (!url)
    throw new Error('DATABASE_OWNER_URL is not set (see .env.example).');
  const source = new DataSource({
    ...dataSourceOptions(url, {
      poolSize: 1,
      applicationName: 'ga-crm-migrate',
    }),
    migrationsTransactionMode: 'each',
  });
  await source.initialize();
  try {
    const done = await source.runMigrations();
    return done.map((migration) => migration.name);
  } finally {
    await source.destroy();
  }
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const names = await migrate();
  console.log(
    names.length ? `Applied: ${names.join(', ')}` : 'Nothing to migrate.',
  );
}
