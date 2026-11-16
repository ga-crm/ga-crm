import type { DataSourceOptions } from 'typeorm';
import { MIGRATIONS } from '../../migrations/index.js';
import { ENTITIES } from './entities.js';
import { SnakeNamingStrategy } from './snake-naming.strategy.js';

/** Named connections. `app` is the default one, which Nest injects without a name. */
export const PLATFORM_CONNECTION = 'platform';

export function dataSourceOptions(
  url: string,
  options: { poolSize?: number; applicationName?: string } = {},
): DataSourceOptions {
  return {
    type: 'postgres',
    url,
    entities: ENTITIES,
    migrations: MIGRATIONS,
    namingStrategy: new SnakeNamingStrategy(),
    // Schema changes go through reviewed migrations only
    synchronize: false,
    migrationsRun: false,
    poolSize: options.poolSize ?? 10,
    applicationName: options.applicationName ?? 'ga-crm-api',
    extra: {
      // Fail fast rather than let requests pile up when the database is slow or away
      connectionTimeoutMillis: 5_000,
      idleTimeoutMillis: 30_000,
      statement_timeout: 30_000,
    },
  };
}
