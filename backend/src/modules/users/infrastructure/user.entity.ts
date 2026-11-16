import {
  Column,
  CreateDateColumn,
  Entity,
  PrimaryColumn,
  UpdateDateColumn,
} from 'typeorm';

/** USER-8 */
export enum UserStatus {
  Invited = 'INVITED',
  Active = 'ACTIVE',
  Disabled = 'DISABLED',
  /** USER-9: left the GA; frees the agent code (USER-13). */
  Archived = 'ARCHIVED',
}

@Entity('users')
export class User {
  @PrimaryColumn({ type: 'uuid', default: () => 'uuidv7()' })
  id: string;

  /** null = Platform Admin */
  @Column({ type: 'uuid', nullable: true })
  tenantId: string | null;

  /** USER-2: unique across the whole system, lowercase. */
  @Column({ type: 'text' })
  email: string;

  @Column({ type: 'text' })
  name: string;

  @Column({ type: 'text', array: true })
  roles: string[];

  /** DATA-1: text, keeps leading zeros. */
  @Column({ type: 'text', nullable: true })
  agentCode: string | null;

  @Column({ type: 'text', default: UserStatus.Invited })
  status: UserStatus;

  @Column({ type: 'text', nullable: true, select: false })
  passwordHash: string | null;

  @Column({ type: 'timestamptz', nullable: true })
  lastLoginAt: Date | null;

  @Column({ type: 'timestamptz', nullable: true })
  archivedAt: Date | null;

  @Column({ type: 'uuid', nullable: true })
  archivedBy: string | null;

  @Column({ type: 'text', nullable: true })
  archiveReason: string | null;

  @Column({ type: 'jsonb', default: () => `'{}'` })
  appearance: Record<string, unknown>;

  /** USER-16: secrets are encrypted and never selected unless asked for. */
  @Column({ type: 'boolean', default: false })
  mfaEnabled: boolean;

  @Column({ type: 'text', nullable: true, select: false })
  mfaSecret: string | null;

  @Column({ type: 'text', nullable: true, select: false })
  mfaPendingSecret: string | null;

  @Column({ type: 'text', array: true, nullable: true, select: false })
  mfaRecoveryCodes: string[] | null;

  @Column({ type: 'bigint', nullable: true, select: false })
  mfaLastStep: string | null;

  @Column({ type: 'timestamptz', nullable: true })
  mfaEnabledAt: Date | null;

  @Column({ type: 'jsonb', nullable: true })
  notificationPrefs: Record<string, { inApp?: boolean }> | null;

  /** Raised on sign-out everywhere, role change, disable, archive, MFA reset: cached sessions drop. */
  @Column({ type: 'integer', default: 0 })
  authVersion: number;

  /** Optimistic concurrency for edits. */
  @Column({ type: 'integer', default: 0 })
  version: number;

  @CreateDateColumn({ type: 'timestamptz' })
  createdAt: Date;

  @UpdateDateColumn({ type: 'timestamptz' })
  updatedAt: Date;
}
