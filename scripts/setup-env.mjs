import { randomBytes } from 'node:crypto';
import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';

const root = resolve(import.meta.dirname, '..');
const envPath = resolve(root, '.env');

if (existsSync(envPath)) {
  console.log('.env already exists, leaving it untouched.');
  process.exit(0);
}

const content = readFileSync(resolve(root, '.env.example'), 'utf8').replace(
  /^(\w+)=__GENERATE__$/gm,
  (_, key) => `${key}=${randomBytes(key.endsWith('PASSWORD') ? 12 : 32).toString('hex')}`,
);

writeFileSync(envPath, content, { mode: 0o600 });
console.log('Created .env. Run npm run seed to create the demo data and accounts.');
