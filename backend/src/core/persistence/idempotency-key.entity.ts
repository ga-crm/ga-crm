import { Column, Entity, PrimaryColumn } from 'typeorm';

/** `Idempotency-Key` header: the first response is replayed for 24 hours. */
@Entity('idempotency_keys')
export class IdempotencyKey {
  @PrimaryColumn({ type: 'uuid' })
  tenantId: string;

  @PrimaryColumn({ type: 'text' })
  key: string;

  /** SHA-256 of method, path and body, so the same key with another request is refused. */
  @Column({ type: 'text' })
  requestHash: string;

  @Column({ type: 'integer', nullable: true })
  statusCode: number | null;

  @Column({ type: 'jsonb', nullable: true })
  response: unknown;

  @Column({ type: 'timestamptz', default: () => 'now()' })
  createdAt: Date;
}
