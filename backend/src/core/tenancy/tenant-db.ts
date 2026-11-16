import { Injectable } from '@nestjs/common';
import { InjectDataSource } from '@nestjs/typeorm';
import type { DataSource, EntityManager } from 'typeorm';
import { transactionWithCallbacks } from '../persistence/after-commit.js';
import type { Scope } from './scope.js';

/**
 * TEN-1: the only way business code reaches the database. Every unit of work runs in a
 * transaction that pins the tenant for row-level security; `set_config(..., true)` lasts until
 * the transaction ends, so a pooled connection never carries a tenant into the next request.
 */
@Injectable()
export class TenantDb {
  constructor(@InjectDataSource() private readonly source: DataSource) {}

  /**
   * Runs `work` in its own transaction, or inside `outer` when the caller already has one
   * (a service called from another's use case, or a platform transaction creating a tenant).
   */
  run<T>(
    scope: Scope,
    work: (db: EntityManager) => Promise<T>,
    outer?: EntityManager,
  ): Promise<T> {
    if (outer) return work(outer);
    return transactionWithCallbacks(this.source, async (db) => {
      await db.query(`SELECT set_config('app.tenant_id', $1, true)`, [
        scope.tenantId,
      ]);
      return work(db);
    });
  }
}
