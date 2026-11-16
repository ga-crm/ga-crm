import type { EntityManager, QueryDeepPartialEntity } from 'typeorm';
import { OutboxMessage } from './outbox-message.entity.js';

export interface OutboxEntry {
  tenantId: string;
  topic: string;
  /** Ids only, never personal data (PDP). */
  payload: Record<string, unknown>;
}

/**
 * Adds messages in the caller's transaction. Without RETURNING, because the API role may write
 * the outbox but not read it; only the relay reads it.
 */
export async function enqueue(
  db: EntityManager,
  ...entries: OutboxEntry[]
): Promise<void> {
  if (!entries.length) return;
  await db
    .createQueryBuilder()
    .insert()
    .into(OutboxMessage)
    // jsonb payloads are plain JSON; TypeORM's deep-partial type cannot express `unknown` values
    .values(entries as QueryDeepPartialEntity<OutboxMessage>[])
    .updateEntity(false)
    .execute();
}
