import { Injectable } from '@nestjs/common';
import type { EntityManager } from 'typeorm';
import { PlatformDb } from './platform-db.js';
import { TenantDb } from './tenant-db.js';

/**
 * A person acting on their own account: a GA user inside their tenant, a Platform Admin (no
 * tenant) through the platform role. Never use it to reach another person's records.
 */
@Injectable()
export class ActorDb {
  constructor(
    private readonly tenantDb: TenantDb,
    private readonly platformDb: PlatformDb,
  ) {}

  run<T>(
    actor: { tenantId: string | null },
    work: (db: EntityManager) => Promise<T>,
  ): Promise<T> {
    return actor.tenantId
      ? this.tenantDb.run({ tenantId: actor.tenantId }, work)
      : this.platformDb.run('platform-console', work);
  }
}
