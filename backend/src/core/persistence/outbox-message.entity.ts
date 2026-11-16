import { Column, Entity, PrimaryGeneratedColumn } from 'typeorm';

/**
 * Transactional outbox: written in the same transaction as the change, relayed to the queue and
 * the realtime channel afterwards. The API may only insert; the relay reads it as crm_platform.
 */
@Entity('outbox')
export class OutboxMessage {
  @PrimaryGeneratedColumn('identity', {
    type: 'bigint',
    generatedIdentity: 'ALWAYS',
  })
  id: string;

  @Column({ type: 'uuid' })
  tenantId: string;

  @Column({ type: 'text' })
  topic: string;

  /** Ids only, never personal data (PDP). */
  @Column({ type: 'jsonb' })
  payload: Record<string, unknown>;

  @Column({ type: 'timestamptz', default: () => 'now()' })
  createdAt: Date;

  @Column({ type: 'timestamptz', nullable: true })
  publishedAt: Date | null;
}
