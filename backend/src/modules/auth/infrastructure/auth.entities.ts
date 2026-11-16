import { Column, Entity, PrimaryColumn } from 'typeorm';

/** USER-17: only the token hash is stored. */
@Entity('sessions')
export class Session {
  @PrimaryColumn({ type: 'uuid', default: () => 'uuidv7()' })
  id: string;

  @Column({ type: 'uuid' })
  userId: string;

  /** null for a Platform Admin */
  @Column({ type: 'uuid', nullable: true })
  tenantId: string | null;

  @Column({ type: 'text' })
  tokenHash: string;

  @Column({ type: 'timestamptz' })
  expiresAt: Date;

  /** Renewing never moves expiresAt past this. */
  @Column({ type: 'timestamptz' })
  absoluteExpiresAt: Date;

  /** USER-16: the password was right, the MFA code is still to come. */
  @Column({ type: 'boolean', default: false })
  mfaPending: boolean;

  @Column({ type: 'timestamptz', default: () => 'now()' })
  createdAt: Date;
}

/** USER-3 */
@Entity('invitations')
export class Invitation {
  @PrimaryColumn({ type: 'uuid', default: () => 'uuidv7()' })
  id: string;

  @Column({ type: 'uuid' })
  tenantId: string;

  @Column({ type: 'uuid' })
  userId: string;

  @Column({ type: 'text' })
  tokenHash: string;

  @Column({ type: 'timestamptz' })
  expiresAt: Date;

  @Column({ type: 'timestamptz', nullable: true })
  acceptedAt: Date | null;

  @Column({ type: 'uuid', nullable: true })
  createdBy: string | null;

  @Column({ type: 'timestamptz', default: () => 'now()' })
  createdAt: Date;
}

/** USER-16: a single-use reset link. */
@Entity('password_resets')
export class PasswordReset {
  @PrimaryColumn({ type: 'uuid', default: () => 'uuidv7()' })
  id: string;

  @Column({ type: 'uuid' })
  tenantId: string;

  @Column({ type: 'uuid' })
  userId: string;

  @Column({ type: 'text' })
  tokenHash: string;

  @Column({ type: 'timestamptz' })
  expiresAt: Date;

  @Column({ type: 'uuid' })
  createdBy: string;

  @Column({ type: 'timestamptz', default: () => 'now()' })
  createdAt: Date;
}

/** USER-16: sign-in counters and locks, keyed by hashes (see LoginGuardService). */
@Entity('login_attempts')
export class LoginAttempt {
  @PrimaryColumn({ type: 'text' })
  id: string;

  @Column({ type: 'integer', default: 0 })
  count: number;

  @Column({ type: 'timestamptz', nullable: true })
  lockedUntil: Date | null;

  @Column({ type: 'timestamptz' })
  expiresAt: Date;
}
