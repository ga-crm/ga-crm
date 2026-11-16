import '../config/load-env.side-effect.js';
import { Client } from 'pg';
import { migrate } from '../core/db/migrate.js';

/**
 * `npm run seed:reset`: drops the database of DATABASE_OWNER_URL, creates it again and runs the
 * migrations. Everything in it is lost, so it refuses production. The seed runs next (package.json).
 */
if (process.env.NODE_ENV === 'production')
  throw new Error('seed:reset must not run in production.');
const ownerUrl = process.env.DATABASE_OWNER_URL;
if (!ownerUrl)
  throw new Error('DATABASE_OWNER_URL is not set (see .env.example).');
const name = new URL(ownerUrl).pathname.slice(1);
if (!/^[a-z0-9_]+$/.test(name))
  throw new Error(`Refusing to reset "${name}": unexpected database name.`);
const admin = new Client({
  connectionString: Object.assign(new URL(ownerUrl), {
    pathname: '/postgres',
  }).toString(),
});
await admin.connect();
try {
  // FORCE ends the connections of a running dev server; it reconnects on its next request
  await admin.query(`DROP DATABASE IF EXISTS "${name}" WITH (FORCE)`);
  await admin.query(`CREATE DATABASE "${name}"`);
} finally {
  await admin.end();
}
console.log(`Dropped and created database ${name}.`);
const applied = await migrate(ownerUrl);
console.log(`Applied ${applied.length} migrations.`);
