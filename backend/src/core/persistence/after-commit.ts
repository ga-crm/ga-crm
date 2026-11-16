import { Logger } from '@nestjs/common';
import type { DataSource, EntityManager } from 'typeorm';

type Callback = () => unknown;

// Callbacks queued by the transaction each EntityManager belongs to
const queued = new WeakMap<EntityManager, Callback[]>();
const logger = new Logger('AfterCommit');

/**
 * Runs `work` in a transaction and, once it has committed, the callbacks it queued with
 * `afterCommit`. A rolled-back transaction drops them. Used by TenantDb and PlatformDb only.
 */
export async function transactionWithCallbacks<T>(
  source: DataSource,
  work: (db: EntityManager) => Promise<T>,
): Promise<T> {
  const callbacks: Callback[] = [];
  const result = await source.transaction((db) => {
    queued.set(db, callbacks);
    return work(db);
  });
  for (const callback of callbacks) {
    // Side effects only (realtime pushes): a failure must not fail a request that has committed
    try {
      void Promise.resolve(callback()).catch((error: unknown) =>
        logger.warn(`After-commit callback failed: ${String(error)}`),
      );
    } catch (error) {
      logger.warn(`After-commit callback failed: ${String(error)}`);
    }
  }
  return result;
}

/**
 * Defers a side effect that must not happen for a change that rolls back, such as telling a
 * browser about a notification. Outside a TenantDb / PlatformDb transaction it runs at once.
 */
export function afterCommit(db: EntityManager, callback: Callback): void {
  const callbacks = queued.get(db);
  if (callbacks) callbacks.push(callback);
  else void Promise.resolve().then(callback).catch(() => undefined);
}
