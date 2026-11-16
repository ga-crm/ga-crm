import { existsSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { parseEnv } from 'node:util';

const ROOT_ENV = resolve(import.meta.dirname, '../../../.env');

/**
 * Loads the root .env (shared with docker-compose) into process.env.
 * Values already in the environment win, and `${VAR}` expands against them first, so a test
 * can set PG_DB=ga_crm_test and every DATABASE_*_URL follows.
 */
export function loadRootEnv(path = ROOT_ENV): void {
  if (!existsSync(path)) return;
  const parsed = parseEnv(readFileSync(path, 'utf8')) as Record<string, string>;
  const lookup = (name: string, seen: Set<string>): string => {
    if (process.env[name] !== undefined) return process.env[name];
    const raw = parsed[name];
    if (raw === undefined || seen.has(name)) return '';
    return expand(raw, new Set(seen).add(name));
  };
  const expand = (value: string, seen: Set<string>): string =>
    value.replace(/\$\{(\w+)\}/g, (_, name: string) => lookup(name, seen));
  for (const [key, value] of Object.entries(parsed))
    if (process.env[key] === undefined)
      process.env[key] = expand(value, new Set([key]));
}
