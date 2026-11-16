import { Column, Entity, PrimaryColumn } from 'typeorm';
import type { NotificationType } from '../notification-rules.js';

/**
 * Section 18.7. `data` holds counts and ids, never a name or a phone (NTF-4): the text comes from
 * the app's catalogue, and names are looked up when the list is read.
 */
@Entity('notifications')
export class Notification {
  @PrimaryColumn({ type: 'uuid', default: () => 'uuidv7()' })
  id: string;

  @Column({ type: 'uuid' })
  tenantId: string;

  @Column({ type: 'uuid' })
  userId: string;

  @Column({ type: 'text' })
  type: NotificationType;

  @Column({ type: 'jsonb', default: () => `'{}'` })
  data: Record<string, string | number>;

  /** Where the app goes when the notification is opened. */
  @Column({ type: 'text' })
  link: string;

  @Column({ type: 'timestamptz', nullable: true })
  readAt: Date | null;

  @Column({ type: 'timestamptz', default: () => 'now()' })
  createdAt: Date;
}

/** A reminder the scheduler already sent, so it goes out once. */
@Entity('notice_keys')
export class NoticeKey {
  @PrimaryColumn({ type: 'uuid' })
  tenantId: string;

  @PrimaryColumn({ type: 'text' })
  key: string;

  @Column({ type: 'timestamptz', default: () => 'now()' })
  createdAt: Date;
}
